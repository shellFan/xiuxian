/**
 * V6.3 AutoBattleService — 咸鱼式自动推关引擎
 *
 * 首页常驻战斗：敌人血条 + 项目小队自动攻击 + 玩家点击攻击。
 * 状态机：IDLE → FIGHTING → VICTORY →（下一关 | BOSS_PENDING卡牌衔接）
 *                          → DEFEAT →（重生重试）
 *
 * 挂机友好：离线时间自动结算推关收益（不模拟逐tick，按DPS估算）。
 */

import type { GameContext } from '../core/game-context';
import {
  type AutoBattleStatus,
  type AutoBattleView,
  type EnemyDef,
  type SquadProfession,
  type TapAttackResult,
  type V63AutoBattleState,
  type V63EnemyState,
  type V63SquadMemberState,
  type V63SquadState,
  PROFESSIONS,
  professionDef,
} from './auto-battle-types';
import {
  CHAPTERS,
  TOTAL_STAGES,
  TOWER_TOTAL_FLOORS,
  CHEST_KILL_INTERVAL,
  chapterOfStage,
  chestRewardFor,
  enemyDefForStage,
  recommendedPowerFor,
  stageKind,
  towerEnemyDefFor,
} from './auto-battle-content';
import {
  type ActiveSkillId,
  type ActiveSkillResult,
  ACTIVE_SKILLS,
  activeSkillDef,
} from '../v64/active-skills';
import {
  type Rarity,
  RARITIES,
  rarityDef,
  rollRarity,
  MAX_STARS,
  starUpCost,
  starAtkBonus,
  activeSynergies,
  powerScore,
} from '../v64/squad-growth';
import {
  type BossTrait,
  bossTraitDef,
  bossTraitForStage,
  type EnemyType,
  enemyTypeDef,
  enemyTypeForStage,
  defeatAdviceFor,
} from '../v64/boss-traits';
import {
  type EquipSlot,
  type V64EquipInstance,
  type V64EquipmentState,
  EQUIP_DEFS,
  equipDef,
  equipStats,
  enhanceCost,
  dropEquipForStage,
  MAX_EQUIP_LEVEL,
} from '../v64/equipment';
import {
  type V64RetentionState,
  DAILY_GOALS,
  dailyGoalsFor,
  SEVEN_DAY_GOALS,
  V64_ACHIEVEMENTS,
} from '../v64/retention';

// ── 常量 ─────────────────────────────────────────────────────────────────────

const VICTORY_DELAY_SEC = 1.5;
const DEFEAT_DELAY_SEC = 3.0;
const CLICK_BASE_DAMAGE = 10;
const CLICK_CRIT_CHANCE = 0.15;
const CLICK_CRIT_MULT = 2.5;
const MEMBER_BASE_NAMES = ['实习生小陈', '测试仙子', '运维老哥', '前端小美', '后端老张', '算法小哥', '产品小王'];
const SQUAD_MAX_MEMBERS = 5; // 含队长(玩家)共5位置
const OFFLINE_MAX_SECONDS = 8 * 3600; // 离线最多结算8小时
const CHEST_MAX_PENDING = 9;

// ── 工具 ─────────────────────────────────────────────────────────────────────

function memberAttack(member: V63SquadMemberState): number {
  const def = professionDef(member.profession);
  const rarity = rarityDef((member.rarity ?? 0) as Rarity);
  const starBonus = starAtkBonus(member.stars ?? 1);
  return Math.round(def.baseAttack * member.level * (1 + (member.level - 1) * 0.12 + rarity.growthBonus) * rarity.atkMult * starBonus);
}

function clickDamageOf(clickLevel: number): number {
  return Math.round(CLICK_BASE_DAMAGE * clickLevel * (1 + (clickLevel - 1) * 0.15));
}

/** V6.4 装备总属性 */
function equipTotalStats(eqState: V64EquipmentState | null): { atk: number; hp: number; critRate: number; critMult: number } {
  if (!eqState) return { atk: 0, hp: 0, critRate: 0, critMult: 0 };
  let atk = 0, hp = 0, critRate = 0, critMult = 0;
  for (const slot of ['WEAPON', 'ARMOR', 'ACCESSORY', 'RELIC'] as EquipSlot[]) {
  const instId = eqState.equipped[slot];
  if (!instId) continue;
  const inst = eqState.bag.find(b => b.id === instId);
  if (!inst) continue;
  const s = equipStats(inst);
  atk += s.atk;
  hp += s.hp;
  critRate += s.critRate;
  critMult += s.critMult;
  }
  return { atk, hp, critRate, critMult };
}

function memberExpToNext(level: number): number {
  // V6.3平衡：40×1.13^(level-1) — 小队升级加速，DPS成长追上HP指数
  return Math.round(40 * Math.pow(1.13, level - 1));
}

function makeEnemyState(def: EnemyDef, stage: number): V63EnemyState {
  // V6.4 敌人类型与Boss特性
  const kind = stageKind(stage);
  const enemyType = enemyTypeForStage(stage);
  const typeDef = enemyTypeDef(enemyType);
  const bossTrait: BossTrait = def.isBoss ? bossTraitForStage(stage, def.isCardBoss) : 'NONE';
  const traitDef = bossTraitDef(bossTrait);
  // 应用类型HP/攻击倍率
  const hp = Math.round(def.hp * typeDef.hpMult);
  const atk = Math.round(def.attack * typeDef.atkMult * (traitDef.atkMult ?? 1));
  const intervalSec = bossTrait === 'BURST' ? def.intervalSec * 1.5 : def.intervalSec;
  // 护盾型Boss/护盾型敌人
  const shieldPct = traitDef.shieldPct ?? typeDef.shieldPct ?? 0;
  const enemyShield = shieldPct > 0 ? Math.round(hp * shieldPct) : 0;
  return {
    defId: def.defId,
    name: def.name,
    emoji: def.emoji,
    hp,
    maxHp: hp,
    attack: atk,
    intervalSec,
    attackTimer: intervalSec,
    isBoss: def.isBoss,
    isCardBoss: def.isCardBoss,
    enemyShield,
    bossTrait,
    enemyType,
    stunTimer: bossTrait === 'CONTROL' ? (traitDef.stunIntervalSec ?? 12) : 0,
    dotTimer: 0,
  };
}

// ── 服务 ─────────────────────────────────────────────────────────────────────

export class AutoBattleService {
  constructor(private readonly context: GameContext) {}

  // ── 状态访问 ───────────────────────────────────────────────────────────────

  private battle(): V63AutoBattleState {
    const p = this.context.player;
    if (!p.v63AutoBattle) {
      p.v63AutoBattle = {
        stage: 1,
        maxStage: 0,
        status: 'IDLE',
        enemy: null,
        autoEnabled: true,
        totalKills: 0,
        victoryTimer: 0,
        defeatTimer: 0,
        pendingOfflineSeconds: 0,
        lastTickAt: this.context.clockV2.realNow(),
        towerFloor: 0,
        towerBestFloor: 0,
        chestKillCounter: 0,
        pendingChests: 0,
        idleSalaryAccrued: 0,
        idleCultivationAccrued: 0,
        lastOfflineSettlementId: '',
        speedMultiplier: 1,
        squadStunTimer: 0,
        equipDropCounter: 0,
        todayKills: 0,
        todayStagesAdvanced: 0,
        todayIndex: 0,
      };
    }
    // V6.4 默认值兼容旧存档
    if (p.v63AutoBattle.speedMultiplier === undefined) p.v63AutoBattle.speedMultiplier = 1;
    if (p.v63AutoBattle.squadStunTimer === undefined) p.v63AutoBattle.squadStunTimer = 0;
    if (p.v63AutoBattle.equipDropCounter === undefined) p.v63AutoBattle.equipDropCounter = 0;
    if (p.v63AutoBattle.todayKills === undefined) p.v63AutoBattle.todayKills = 0;
    if (p.v63AutoBattle.todayStagesAdvanced === undefined) p.v63AutoBattle.todayStagesAdvanced = 0;
    if (p.v63AutoBattle.todayIndex === undefined) p.v63AutoBattle.todayIndex = 0;
    return p.v63AutoBattle;
  }

  /** V6.4 装备状态 */
  private equipState(): V64EquipmentState {
    const p = this.context.player as any;
    if (!p.v64Equipment) {
      p.v64Equipment = {
        bag: [],
        equipped: { WEAPON: null, ARMOR: null, ACCESSORY: null, RELIC: null },
        fragments: 0,
      };
    }
    return p.v64Equipment as V64EquipmentState;
  }

  /** V6.4 留存状态 */
  private retention(): V64RetentionState {
    const p = this.context.player as any;
    if (!p.v64Retention) {
      p.v64Retention = {
        dailyGoalDay: -1,
        dailyGoals: [],
        sevenDayClaimed: [],
        v64AchievementsClaimed: [],
        totalSkillUses: 0,
        totalTapCount: 0,
        totalStarUps: 0,
        totalChestsOpened: 0,
      };
    }
    return p.v64Retention as V64RetentionState;
  }

  private squad(): V63SquadState {
    const p = this.context.player;
    if (!p.v63Squad) {
      p.v63Squad = {
        members: [this.makeLeader()],
        clickLevel: 1,
        shield: 0,
        weakSpotTimer: 0,
        activeSkillCooldowns: {},
      };
    }
    if (!p.v63Squad.activeSkillCooldowns) p.v63Squad.activeSkillCooldowns = {};
    // V6.4 兼容旧存档：为已有成员补充rarity/stars默认值
    for (const m of p.v63Squad.members) {
      if (m.rarity === undefined) m.rarity = m.id === 'leader' ? 1 : 0;
      if (m.stars === undefined) m.stars = 1;
      if (m.fragments === undefined) m.fragments = 0;
    }
    return p.v63Squad;
  }

  private makeLeader(): V63SquadMemberState {
    const prof: SquadProfession = (this.context.player.profession as SquadProfession) || 'JAVA_BACKEND';
    return {
      id: 'leader',
      name: this.context.player.characterName || '范大牛',
      profession: PROFESSIONS.some(p => p.id === prof) ? prof : 'JAVA_BACKEND',
      level: Math.max(1, this.context.player.careerLevel ?? 1),
      exp: 0,
      slot: 0,
      attackTimer: 0,
      skillTimer: 0,
      hiredAtDay: 0,
      rarity: 1, // 队长默认优秀
      stars: 1,
      fragments: 0,
    };
  }

  // ── 生命周期 ───────────────────────────────────────────────────────────────

  /**
   * V7.0 P0-1：角色尚未创建完成时冻结自动战斗。
   * 根因：场景加载即 facade.start() → ensureStarted()，创建向导仍在进行时
   * 战斗已在后台推进，新玩家完成创建后直接面对远超自身战力的 Boss 关。
   * 仅门控 CREATION_REQUIRED（全新角色）；BACKFILL_REQUIRED 的老玩家拥有
   * 既有进度，不冻结。lastTickAt 在 tick() 中照常更新，避免把创建时长
   * 结算成离线收益。
   */
  private isCreationGated(): boolean {
    try {
      return (this.context.player as { characterSetupStatus?: string }).characterSetupStatus === 'CREATION_REQUIRED';
    } catch {
      return false;
    }
  }

  /** 启动/恢复战斗（facade 初始化后调用）。 */
  public ensureStarted(): void {
    if (this.isCreationGated()) return;
    const b = this.battle();
    if (b.status === 'IDLE' || (b.status === 'FIGHTING' && !b.enemy)) {
      this.spawnEnemy();
      b.status = 'FIGHTING';
    }
  }

  /** 离线结算：根据离开时长估算推关收益。settlementId 防重复结算。 */
  public settleOffline(elapsedSeconds: number, settlementId?: string): { stagesCleared: number; salary: number; cultivation: number } {
    if (this.isCreationGated()) {
      return { stagesCleared: 0, salary: 0, cultivation: 0 };
    }
    const b = this.battle();
    if (settlementId && b.lastOfflineSettlementId === settlementId) {
      return { stagesCleared: 0, salary: 0, cultivation: 0 };
    }
    const capped = Math.min(Math.max(0, elapsedSeconds), OFFLINE_MAX_SECONDS);
    if (capped < 5) return { stagesCleared: 0, salary: 0, cultivation: 0 };
    const dps = this.totalDps();
    let stagesCleared = 0;
    let salary = 0;
    let cultivation = 0;
    let remaining = capped;
    let stage = b.stage;
    // 估算：每关耗时 = enemyHp / dps，最多模拟200关防止死循环
    for (let i = 0; i < 200 && remaining > 0; i++) {
      if (stage > TOTAL_STAGES) break;
      const def = enemyDefForStage(stage);
      // Boss 关离线不推（需要玩家在场处理卡牌衔接）
      if (def.isCardBoss) break;
      const timePerStage = Math.max(0.5, def.hp / Math.max(1, dps));
      if (remaining < timePerStage) break;
      remaining -= timePerStage;
      salary += def.rewardSalary;
      cultivation += def.rewardCultivation;
      stagesCleared++;
      stage++;
    }
    if (stagesCleared > 0) {
      b.stage = stage;
      b.maxStage = Math.max(b.maxStage, stage - 1);
      b.totalKills += stagesCleared;
      this.applyRewards(salary, cultivation, 0);
      this.spawnEnemy();
      b.status = 'FIGHTING';
    }
    if (settlementId) b.lastOfflineSettlementId = settlementId;
    return { stagesCleared, salary, cultivation };
  }

  // ── Tick（GameLoop 驱动） ──────────────────────────────────────────────────

  /** 每秒由 GameLoop 调用。 */
  public tick(seconds: number): void {
    const b = this.battle();
    const s = this.squad();
    b.lastTickAt = this.context.clockV2.realNow();

    // V7.0 P0-1：角色未创建完成时不推进任何战斗逻辑（lastTickAt 照常更新，
    // 创建时长不会被结算成离线收益）。
    if (this.isCreationGated()) return;

    // V6.4 倍速：战斗逻辑时间 = 真实时间 × 倍速
    const speed = b.speedMultiplier ?? 1;
    const effective = seconds * speed;

    // 计时器衰减（真实时间）
    if (s.weakSpotTimer > 0) s.weakSpotTimer = Math.max(0, s.weakSpotTimer - effective);
    if (b.squadStunTimer && b.squadStunTimer > 0) b.squadStunTimer = Math.max(0, b.squadStunTimer - effective);

    // V6.4 主动技能冷却衰减（真实时间，不受倍速影响）
    if (s.activeSkillCooldowns) {
      for (const key of Object.keys(s.activeSkillCooldowns)) {
        if (s.activeSkillCooldowns[key] > 0) {
          s.activeSkillCooldowns[key] = Math.max(0, s.activeSkillCooldowns[key] - seconds);
        }
      }
    }

    switch (b.status) {
      case 'IDLE':
        this.ensureStarted();
        return;
      case 'FIGHTING':
        this.tickFighting(b, s, effective);
        return;
      case 'VICTORY':
        b.victoryTimer -= effective;
        if (b.victoryTimer <= 0) this.advanceStage(b);
        return;
      case 'DEFEAT':
        b.defeatTimer -= effective;
        if (b.defeatTimer <= 0) this.respawn(b);
        return;
      case 'BOSS_PENDING':
        // 等待玩家进入卡牌战斗，不自动推进
        return;
    }
  }

  private tickFighting(b: V63AutoBattleState, s: V63SquadState, seconds: number): void {
    if (!b.enemy) { this.spawnEnemy(); return; }
    const enemy = b.enemy;
    const weakMult = s.weakSpotTimer > 0 ? 1.5 : 1;

    // V6.4 羁绊效果
    const professions = s.members.filter(m => m.slot >= 0).map(m => m.profession);
    const synergies = activeSynergies(professions);
    const synergyAtkMult = synergies.reduce((mul, syn) => mul * syn.atkMult, 1);
    const hasRegen = synergies.some(syn => syn.bonus === 'REGEN');
    const regenValue = synergies.find(syn => syn.bonus === 'REGEN')?.bonusValue ?? 0;
    const shieldBoost = synergies.find(syn => syn.bonus === 'SHIELD_BOOST')?.bonusValue ?? 0;
    const antiShield = synergies.find(syn => syn.bonus === 'ANTI_SHIELD')?.bonusValue ?? 0;

    // V6.4 装备攻击加成
    const eqStats = equipTotalStats(this.equipState());
    const eqAtkBonus = eqStats.atk;

    // V6.4 高可用羁绊：每秒恢复护盾
    if (hasRegen && s.shield < 200) {
      s.shield += Math.round(regenValue * seconds);
    }

    // V6.4 控制型Boss眩晕检查
    const isStunned = (b.squadStunTimer ?? 0) > 0;

    // 1. 小队自动攻击
    if (!isStunned) {
      for (const m of s.members) {
        const def = professionDef(m.profession);
        m.attackTimer += seconds;
        while (m.attackTimer >= def.intervalSec) {
          m.attackTimer -= def.intervalSec;
          // V6.4: 攻击 = 基础 × 羁绊 × 弱点 + 装备加成(队长)
          const baseDmg = memberAttack(m) * synergyAtkMult * weakMult;
          const dmg = Math.round(baseDmg + (m.slot === 0 ? eqAtkBonus : eqAtkBonus * 0.3));
          this.damageEnemy(b, dmg, false, antiShield);
          if (b.enemy && b.enemy.hp <= 0) return;
        }
        // 技能冷却
        if (m.skillTimer > 0) m.skillTimer = Math.max(0, m.skillTimer - seconds);
      }
    } else {
      // 眩晕中仍衰减技能冷却
      for (const m of s.members) {
        if (m.skillTimer > 0) m.skillTimer = Math.max(0, m.skillTimer - seconds);
      }
    }

    if (!b.enemy || b.enemy.hp <= 0) return;

    // V6.4 控制型Boss：眩晕触发
    if (enemy.bossTrait === 'CONTROL' && enemy.stunTimer !== undefined) {
      enemy.stunTimer -= seconds;
      if (enemy.stunTimer <= 0) {
        const traitDef = bossTraitDef('CONTROL');
        enemy.stunTimer = traitDef.stunIntervalSec ?? 12;
        b.squadStunTimer = traitDef.stunDurationSec ?? 2;
        this.context.events.emit('v63AiComment', { text: '🌀 Boss眩晕了全队！攻击暂停2秒', mood: 'warn', emoji: '🌀' });
      }
    }

    // V6.4 DOT型Boss：持续伤害（扣护盾）
    if (enemy.bossTrait === 'DOT' && enemy.dotTimer !== undefined) {
      enemy.dotTimer += seconds;
      if (enemy.dotTimer >= 3) {
        enemy.dotTimer = 0;
        const dotDmg = Math.round(enemy.attack * 0.3);
        if (s.shield > 0) s.shield = Math.max(0, s.shield - dotDmg);
      }
    }

    // 2. 敌人攻击（打全队护盾）
    enemy.attackTimer += seconds;
    while (enemy.attackTimer >= enemy.intervalSec) {
      enemy.attackTimer -= enemy.intervalSec;
      let dmg = enemy.attack;
      if (s.shield > 0) {
        const absorbed = Math.min(s.shield, dmg);
        s.shield -= absorbed;
        dmg -= absorbed;
      }
      // V6.3设计：自动战斗不死人——敌人攻击只消耗护盾
    }

    // 3. 自动施放技能（冷却好了就放）
    if (!isStunned) {
      for (const m of s.members) {
        if (m.skillTimer > 0) continue;
        const def = professionDef(m.profession);
        m.skillTimer = def.skill.cooldownSec;
        // V6.4: 护盾技能受稳定发布羁绊加成
        const skillPower = def.skill.kind === 'SHIELD' || def.skill.kind === 'HEAL'
          ? def.skill.power * (1 + shieldBoost)
          : def.skill.power;
        this.castSkill(b, s, m, def.skill.kind, skillPower, weakMult * synergyAtkMult);
        if (b.enemy && b.enemy.hp <= 0) return;
      }
    }
  }

  private castSkill(b: V63AutoBattleState, s: V63SquadState, m: V63SquadMemberState, kind: string, power: number, weakMult: number): void {
    switch (kind) {
      case 'CRIT_BURST': {
        const dmg = Math.round(memberAttack(m) * power * weakMult);
        this.damageEnemy(b, dmg, true);
        break;
      }
      case 'MULTI_HIT':
      case 'AOE': {
        const dmg = Math.round(memberAttack(m) * 1.5 * weakMult);
        this.damageEnemy(b, dmg, false);
        break;
      }
      case 'SHIELD': {
        s.shield += Math.round(power * m.level);
        break;
      }
      case 'HEAL': {
        s.shield += Math.round(power * m.level * 0.5);
        break;
      }
      case 'DEBUFF': {
        s.weakSpotTimer = 8;
        break;
      }
      case 'DOT': {
        const dmg = Math.round(memberAttack(m) * 0.8 * weakMult);
        this.damageEnemy(b, dmg, false);
        break;
      }
    }
  }

  private damageEnemy(b: V63AutoBattleState, damage: number, isCrit: boolean, antiShieldBonus = 0): void {
    if (!b.enemy || b.status !== 'FIGHTING') return;
    const enemy = b.enemy;
    // V6.4 敌人护盾：先扣护盾再扣血
    if (enemy.enemyShield && enemy.enemyShield > 0) {
      const shieldDmg = Math.round(damage * (1 + antiShieldBonus));
      const absorbed = Math.min(enemy.enemyShield, shieldDmg);
      enemy.enemyShield -= absorbed;
      const remaining = damage - absorbed;
      if (remaining > 0) enemy.hp = Math.max(0, enemy.hp - remaining);
    } else {
      // V6.4 ARMORED类型减伤
      const typeDef = enemy.enemyType ? enemyTypeDef(enemy.enemyType as EnemyType) : null;
      const reduction = typeDef?.damageReduction ?? 0;
      const finalDmg = Math.round(damage * (1 - reduction));
      enemy.hp = Math.max(0, enemy.hp - finalDmg);
    }
    if (enemy.hp <= 0) this.onEnemyDefeated(b);
  }

  // ── 击杀/胜利/败北 ─────────────────────────────────────────────────────────

  private currentEnemyDef(b: V63AutoBattleState): EnemyDef | null {
    if (!b.enemy) return null;
    return b.towerFloor > 0 ? towerEnemyDefFor(b.towerFloor) : enemyDefForStage(b.stage);
  }

  private onEnemyDefeated(b: V63AutoBattleState): void {
    const def = this.currentEnemyDef(b);
    if (!def) { this.spawnEnemy(); return; }
    b.totalKills++;
    b.todayKills = (b.todayKills ?? 0) + 1;
    this.trackDailyGoal('kill_10', 1);
    this.applyRewards(def.rewardSalary, def.rewardCultivation, def.rewardSpiritStones);
    this.grantSquadExp(def.rewardCultivation);

    // 宝箱计数
    b.chestKillCounter++;
    if (b.chestKillCounter >= CHEST_KILL_INTERVAL) {
      b.chestKillCounter = 0;
      if (b.pendingChests < CHEST_MAX_PENDING) b.pendingChests++;
    }

    // V6.4 装备掉落
    b.equipDropCounter = (b.equipDropCounter ?? 0) + 1;
    const dropDef = dropEquipForStage(b.stage, b.equipDropCounter);
    if (dropDef) {
      const eqState = this.equipState();
      const inst: V64EquipInstance = {
        id: `eq_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        defId: dropDef.id,
        level: 1,
      };
      eqState.bag.push(inst);
      // 自动装备空槽位
      if (!eqState.equipped[dropDef.slot]) {
        eqState.equipped[dropDef.slot] = inst.id;
      }
      this.context.events.emit('v63AiComment', { text: `⚔️ 获得装备：${dropDef.emoji} ${dropDef.name}！`, mood: 'cheer', emoji: '⚔️' });
    }

    // 卡牌Boss → 卡牌战斗衔接
    if (def.isCardBoss) {
      b.status = 'BOSS_PENDING';
      b.maxStage = Math.max(b.maxStage, b.stage);
      this.context.events.emit('v63BossPending', { stage: b.stage, bossName: def.name });
      return;
    }

    b.maxStage = Math.max(b.maxStage, b.stage);
    b.status = 'VICTORY';
    b.victoryTimer = VICTORY_DELAY_SEC;
    this.context.events.emit('v63Victory', { stage: b.stage, rewards: { salary: def.rewardSalary, cultivation: def.rewardCultivation } });
  }

  private advanceStage(b: V63AutoBattleState): void {
    // 通天塔模式：推进塔层
    if (b.towerFloor > 0) {
      this.onTowerFloorCleared(b);
      return;
    }
    if (b.stage >= TOTAL_STAGES) {
      // 通关100关后循环刷（已通关最高关）
      b.stage = Math.max(1, b.maxStage > 0 ? b.maxStage : TOTAL_STAGES);
    } else {
      b.stage++;
      // V6.4 每日目标：推进关卡
      b.todayStagesAdvanced = (b.todayStagesAdvanced ?? 0) + 1;
      this.trackDailyGoal('stage_3', 1);
    }
    this.spawnEnemy();
    b.status = 'FIGHTING';
    this.context.events.emit('v63StageAdvanced', { stage: b.stage });
  }

  private respawn(b: V63AutoBattleState): void {
    this.spawnEnemy();
    b.status = 'FIGHTING';
  }

  private spawnEnemy(): void {
    const b = this.battle();
    const inTower = b.towerFloor > 0;
    const def = inTower ? towerEnemyDefFor(b.towerFloor) : enemyDefForStage(b.stage);
    // 通天塔敌人不应用stage类型（用stage=1的普通类型）
    if (inTower) {
      b.enemy = {
        ...makeEnemyState(def, 1),
        name: def.name,
        emoji: def.emoji,
        hp: def.hp,
        maxHp: def.hp,
        attack: def.attack,
        enemyShield: 0,
        bossTrait: 'NONE',
        enemyType: 'NORMAL',
      };
    } else {
      b.enemy = makeEnemyState(def, b.stage);
    }
  }

  // ── 点击攻击 ───────────────────────────────────────────────────────────────

  public tapAttack(): TapAttackResult {
    const b = this.battle();
    if (b.status !== 'FIGHTING' || !b.enemy) {
      return { ok: false, damage: 0, isCrit: false, enemyHpAfter: 0, enemyDefeated: false, stageCleared: false, rewards: null, reason: b.status === 'BOSS_PENDING' ? 'BOSS_PENDING' : 'NOT_FIGHTING' };
    }
    const s = this.squad();
    // V6.4 留存统计
    this.retention().totalTapCount++;
    // V6.4 装备暴击加成
    const eqStats = equipTotalStats(this.equipState());
    const critChance = Math.min(0.8, CLICK_CRIT_CHANCE + eqStats.critRate);
    const critMult = CLICK_CRIT_MULT + eqStats.critMult;
    const baseDmg = clickDamageOf(s.clickLevel) + eqStats.atk;
    const isCrit = Math.random() < critChance;
    const weakMult = s.weakSpotTimer > 0 ? 1.5 : 1;
    const damage = Math.round(baseDmg * (isCrit ? critMult : 1) * weakMult);
    // V6.4 敌人护盾/减伤
    const enemy = b.enemy;
    if (enemy.enemyShield && enemy.enemyShield > 0) {
      const absorbed = Math.min(enemy.enemyShield, damage);
      enemy.enemyShield -= absorbed;
      const remaining = damage - absorbed;
      if (remaining > 0) enemy.hp = Math.max(0, enemy.hp - remaining);
    } else {
      const typeDef = enemy.enemyType ? enemyTypeDef(enemy.enemyType as EnemyType) : null;
      const reduction = typeDef?.damageReduction ?? 0;
      enemy.hp = Math.max(0, enemy.hp - Math.round(damage * (1 - reduction)));
    }
    const defeated = enemy.hp <= 0;
    if (defeated) this.onEnemyDefeated(b);
    return {
      ok: true,
      damage,
      isCrit,
      enemyHpAfter: b.enemy?.hp ?? 0,
      enemyDefeated: defeated,
      stageCleared: defeated && (b.status as AutoBattleStatus) === 'VICTORY',
      rewards: defeated ? this.lastRewards : null,
    };
  }

  private lastRewards: { salary: number; cultivation: number; spiritStones: number } | null = null;

  private applyRewards(salary: number, cultivation: number, spiritStones: number): void {
    const p = this.context.player;
    p.salary += salary;
    p.cultivationExp += cultivation;
    if (spiritStones > 0) p.spiritStones += spiritStones;
    this.lastRewards = { salary, cultivation, spiritStones };
    this.context.events.emit('playerChanged', { reason: 'v63Battle' });
  }

  private grantSquadExp(exp: number): void {
    const s = this.squad();
    for (const m of s.members) {
      if (m.slot < 0) continue;
      m.exp += exp;
      const need = memberExpToNext(m.level);
      while (m.exp >= need && m.level < 99) {
        m.exp -= need;
        m.level++;
      }
    }
  }

  // ── 小队操作 ───────────────────────────────────────────────────────────────

  public hireMember(profession: SquadProfession): { ok: boolean; member?: V63SquadMemberState; reason?: string } {
    const s = this.squad();
    if (s.members.filter(m => m.slot >= 0).length >= SQUAD_MAX_MEMBERS) {
      return { ok: false, reason: '小队已满（5人）' };
    }
    const slot = s.members.filter(m => m.slot >= 0).length;
    const cost = 50 * slot * slot; // 招募费用（灵石）
    const p = this.context.player;
    if (p.spiritStones < cost) return { ok: false, reason: `灵石不足（需要${cost}）` };
    p.spiritStones -= cost;
    const nameIdx = s.members.length % MEMBER_BASE_NAMES.length;
    // V6.4 品质随机
    const rarity = rollRarity();
    const member: V63SquadMemberState = {
      id: `member_${Date.now()}`,
      name: MEMBER_BASE_NAMES[nameIdx],
      profession,
      level: 1,
      exp: 0,
      slot,
      attackTimer: 0,
      skillTimer: 0,
      hiredAtDay: this.context.player.gameDay?.dayIndex ?? 1,
      rarity,
      stars: 1,
      fragments: 0,
    };
    s.members.push(member);
    // V6.4 传说品质特殊提示
    if (rarity >= 3) {
      const rd = rarityDef(rarity as Rarity);
      this.context.events.emit('v63AiComment', { text: `${rd.emoji} 招募到${rd.label}品质队员！欧皇附体！`, mood: 'cheer', emoji: rd.emoji });
    }
    this.context.events.emit('v63MemberHired', { name: member.name, profession, rarity });
    return { ok: true, member };
  }

  public upgradeClick(): { ok: boolean; newLevel: number; cost: number; reason?: string } {
    const s = this.squad();
    const cost = 20 * s.clickLevel * s.clickLevel;
    const p = this.context.player;
    if (p.spiritStones < cost) return { ok: false, newLevel: s.clickLevel, cost, reason: `灵石不足（需要${cost}）` };
    p.spiritStones -= cost;
    s.clickLevel++;
    return { ok: true, newLevel: s.clickLevel, cost };
  }

  public toggleAuto(): boolean {
    const b = this.battle();
    b.autoEnabled = !b.autoEnabled;
    return b.autoEnabled;
  }

  /** 跳过当前关卡（扫荡已通关关卡用）。 */
  public skipStage(): { ok: boolean; reason?: string } {
    const b = this.battle();
    if (b.stage <= b.maxStage && b.stage < TOTAL_STAGES) {
      b.stage++;
      this.spawnEnemy();
      b.status = 'FIGHTING';
      return { ok: true };
    }
    return { ok: false, reason: '只能跳过已通关的关卡' };
  }

  // ── 卡牌Boss衔接 ───────────────────────────────────────────────────────────

  /** 卡牌战斗胜利后调用：标记Boss已击败，推进到下一章。 */
  public bossDefeated(): void {
    const b = this.battle();
    if (b.status !== 'BOSS_PENDING') return;
    if (b.stage < TOTAL_STAGES) b.stage++;
    this.spawnEnemy();
    b.status = 'FIGHTING';
    this.context.events.emit('v63StageAdvanced', { stage: b.stage });
  }

  /** 卡牌战斗失败：停留在Boss关，敌人满血重生。 */
  public bossFailed(): void {
    const b = this.battle();
    if (b.status !== 'BOSS_PENDING') return;
    this.spawnEnemy();
    b.status = 'FIGHTING';
  }

  // ── 996通天塔 ──────────────────────────────────────────────────────────────

  public enterTower(): { ok: boolean; floor: number; reason?: string } {
    const b = this.battle();
    if (b.towerFloor > 0) return { ok: false, floor: b.towerFloor, reason: '已在通天塔中' };
    b.towerFloor = 1;
    this.spawnEnemy();
    b.status = 'FIGHTING';
    this.context.events.emit('v63TowerEntered', { floor: 1 });
    return { ok: true, floor: 1 };
  }

  public exitTower(): void {
    const b = this.battle();
    b.towerFloor = 0;
    this.spawnEnemy();
    b.status = 'FIGHTING';
  }

  private onTowerFloorCleared(b: V63AutoBattleState): void {
    b.towerBestFloor = Math.max(b.towerBestFloor, b.towerFloor);
    if (b.towerFloor < TOWER_TOTAL_FLOORS) {
      b.towerFloor++;
      this.spawnEnemy();
      b.status = 'FIGHTING';
      this.context.events.emit('v63TowerAdvanced', { floor: b.towerFloor });
    } else {
      // 通天塔登顶
      this.context.events.emit('v63TowerCleared', { floor: b.towerFloor });
      b.towerFloor = 0;
      this.spawnEnemy();
      b.status = 'FIGHTING';
    }
  }

  // ── 宝箱 ───────────────────────────────────────────────────────────────────

  public openChest(): { ok: boolean; reward: { label: string; amount: number } | null } {
    const b = this.battle();
    if (b.pendingChests <= 0) return { ok: false, reward: null };
    b.pendingChests--;
    this.retention().totalChestsOpened++;
    const cr = chestRewardFor(b.stage);
    const p = this.context.player;
    if (cr.kind === 'SALARY') p.salary += cr.amount;
    else if (cr.kind === 'CULTIVATION') p.cultivationExp += cr.amount;
    else if (cr.kind === 'SPIRIT_STONES') p.spiritStones += cr.amount;
    else this.grantSquadExp(cr.amount);
    // V6.4 宝箱额外掉落装备碎片
    this.equipState().fragments += 1 + Math.floor(b.stage / 20);
    this.context.events.emit('playerChanged', { reason: 'v63Chest' });
    return { ok: true, reward: { label: cr.label, amount: cr.amount } };
  }

  // ── V6.4 主动技能 ──────────────────────────────────────────────────────────

  public useActiveSkill(skillId: ActiveSkillId): ActiveSkillResult {
    const b = this.battle();
    const s = this.squad();
    const def = activeSkillDef(skillId);
    const cooldowns = s.activeSkillCooldowns ?? (s.activeSkillCooldowns = {});
    const cd = cooldowns[skillId] ?? 0;

    // 检查解锁
    if (b.maxStage < def.unlockStage && b.stage < def.unlockStage) {
      return { ok: false, skillId, totalDamage: 0, shieldGained: 0, enemyDefeated: false, cooldownRemaining: cd, reason: `需要通过第${def.unlockStage}关解锁` };
    }
    // 检查冷却
    if (cd > 0) {
      return { ok: false, skillId, totalDamage: 0, shieldGained: 0, enemyDefeated: false, cooldownRemaining: cd, reason: `冷却中（${Math.ceil(cd)}秒）` };
    }
    // 检查战斗状态
    if (b.status !== 'FIGHTING' || !b.enemy) {
      return { ok: false, skillId, totalDamage: 0, shieldGained: 0, enemyDefeated: false, cooldownRemaining: 0, reason: '非战斗状态' };
    }

    // 设置冷却
    cooldowns[skillId] = def.cooldownSec;
    this.retention().totalSkillUses++;

    const enemy = b.enemy;
    const eqStats = equipTotalStats(this.equipState());
    let totalDamage = 0;
    let shieldGained = 0;

    switch (def.kind) {
      case 'MULTI_TAP': {
        const perHit = Math.round((clickDamageOf(s.clickLevel) + eqStats.atk) * def.power);
        totalDamage = perHit * (def.hits ?? 1);
        break;
      }
      case 'AOE_DPS': {
        totalDamage = Math.round(this.totalDps() * def.power);
        break;
      }
      case 'BOSS_BURST': {
        const base = Math.round((clickDamageOf(s.clickLevel) + eqStats.atk) * def.power);
        totalDamage = enemy.isBoss ? base : Math.round(base * 0.5);
        break;
      }
      case 'DEFENSE': {
        shieldGained = Math.round(def.power * Math.max(1, s.members[0]?.level ?? 1));
        s.shield += shieldGained;
        s.weakSpotTimer = 0; // 清除Debuff
        break;
      }
    }

    // 应用伤害
    let enemyDefeated = false;
    if (totalDamage > 0) {
      this.damageEnemy(b, totalDamage, true);
      enemyDefeated = b.enemy ? b.enemy.hp <= 0 : true;
    }

    this.context.events.emit('v64SkillUsed', { skillId, totalDamage, shieldGained });
    return { ok: true, skillId, totalDamage, shieldGained, enemyDefeated, cooldownRemaining: def.cooldownSec };
  }

  // ── V6.4 战斗倍速 ──────────────────────────────────────────────────────────

  public toggleSpeed(): number {
    const b = this.battle();
    b.speedMultiplier = (b.speedMultiplier ?? 1) === 1 ? 2 : 1;
    return b.speedMultiplier;
  }

  // ── V6.4 员工升星 ──────────────────────────────────────────────────────────

  public starUp(memberId: string): { ok: boolean; newStars: number; reason?: string } {
    const s = this.squad();
    const m = s.members.find(mem => mem.id === memberId);
    if (!m) return { ok: false, newStars: 0, reason: '成员不存在' };
    const currentStars = m.stars ?? 1;
    if (currentStars >= MAX_STARS) return { ok: false, newStars: currentStars, reason: '已达最高星级' };
    const cost = starUpCost(currentStars);
    const p = this.context.player;
    const fragments = m.fragments ?? 0;
    if (fragments < cost.fragments) return { ok: false, newStars: currentStars, reason: `碎片不足（需要${cost.fragments}，当前${fragments}）` };
    if (p.spiritStones < cost.spiritStones) return { ok: false, newStars: currentStars, reason: `灵石不足（需要${cost.spiritStones}）` };
    m.fragments = fragments - cost.fragments;
    p.spiritStones -= cost.spiritStones;
    m.stars = currentStars + 1;
    this.retention().totalStarUps++;
    this.context.events.emit('v64MemberStarUp', { memberId, newStars: m.stars });
    this.context.events.emit('playerChanged', { reason: 'v64StarUp' });
    return { ok: true, newStars: m.stars };
  }

  /** 给队员添加碎片（宝箱/掉落） */
  public grantFragments(memberId: string, amount: number): void {
    const s = this.squad();
    const m = s.members.find(mem => mem.id === memberId);
    if (m) m.fragments = (m.fragments ?? 0) + amount;
  }

  // ── V6.4 装备操作 ──────────────────────────────────────────────────────────

  public equipItem(instanceId: string): { ok: boolean; reason?: string } {
    const eqState = this.equipState();
    const inst = eqState.bag.find(b => b.id === instanceId);
    if (!inst) return { ok: false, reason: '装备不存在' };
    const def = equipDef(inst.defId);
    if (!def) return { ok: false, reason: '装备定义不存在' };
    eqState.equipped[def.slot] = instanceId;
    this.context.events.emit('playerChanged', { reason: 'v64Equip' });
    return { ok: true };
  }

  public unequipItem(slot: EquipSlot): void {
    const eqState = this.equipState();
    eqState.equipped[slot] = null;
    this.context.events.emit('playerChanged', { reason: 'v64Unequip' });
  }

  public enhanceEquip(instanceId: string): { ok: boolean; newLevel: number; reason?: string } {
    const eqState = this.equipState();
    const inst = eqState.bag.find(b => b.id === instanceId);
    if (!inst) return { ok: false, newLevel: 0, reason: '装备不存在' };
    if (inst.level >= MAX_EQUIP_LEVEL) return { ok: false, newLevel: inst.level, reason: '已达最高强化等级' };
    const cost = enhanceCost(inst.level);
    const p = this.context.player;
    if (eqState.fragments < cost.fragments) return { ok: false, newLevel: inst.level, reason: `碎片不足（需要${cost.fragments}）` };
    if (p.spiritStones < cost.spiritStones) return { ok: false, newLevel: inst.level, reason: `灵石不足（需要${cost.spiritStones}）` };
    eqState.fragments -= cost.fragments;
    p.spiritStones -= cost.spiritStones;
    inst.level++;
    this.context.events.emit('playerChanged', { reason: 'v64Enhance' });
    return { ok: true, newLevel: inst.level };
  }

  /** V6.4 装备视图 */
  public equipView(): {
    bag: { id: string; defId: string; name: string; emoji: string; slot: string; rarity: string; level: number; atk: number; hp: number; equipped: boolean }[];
    equipped: Record<string, { id: string; name: string; emoji: string; level: number; atk: number; hp: number } | null>;
    fragments: number;
    totalAtk: number;
    totalHp: number;
  } {
    const eqState = this.equipState();
    const stats = equipTotalStats(eqState);
    const equippedIds = new Set(Object.values(eqState.equipped).filter((v): v is string => !!v));
    return {
      bag: eqState.bag.map(inst => {
        const def = equipDef(inst.defId);
        const s = equipStats(inst);
        return {
          id: inst.id, defId: inst.defId,
          name: def?.name ?? inst.defId, emoji: def?.emoji ?? '❓',
          slot: def?.slot ?? 'WEAPON', rarity: def?.rarity ?? 'COMMON',
          level: inst.level, atk: s.atk, hp: s.hp,
          equipped: equippedIds.has(inst.id),
        };
      }),
      equipped: {
        WEAPON: this.equippedSlotView(eqState, 'WEAPON'),
        ARMOR: this.equippedSlotView(eqState, 'ARMOR'),
        ACCESSORY: this.equippedSlotView(eqState, 'ACCESSORY'),
        RELIC: this.equippedSlotView(eqState, 'RELIC'),
      },
      fragments: eqState.fragments,
      totalAtk: stats.atk,
      totalHp: stats.hp,
    };
  }

  private equippedSlotView(eqState: V64EquipmentState, slot: EquipSlot): { id: string; name: string; emoji: string; level: number; atk: number; hp: number } | null {
    const instId = eqState.equipped[slot];
    if (!instId) return null;
    const inst = eqState.bag.find(b => b.id === instId);
    if (!inst) return null;
    const def = equipDef(inst.defId);
    const s = equipStats(inst);
    return { id: inst.id, name: def?.name ?? inst.defId, emoji: def?.emoji ?? '❓', level: inst.level, atk: s.atk, hp: s.hp };
  }

  // ── V6.4 留存系统 ──────────────────────────────────────────────────────────

  /** 刷新每日目标（跨天重置） */
  public refreshDailyGoals(dayIndex: number): void {
    const r = this.retention();
    if (r.dailyGoalDay !== dayIndex) {
      r.dailyGoalDay = dayIndex;
      r.dailyGoals = dailyGoalsFor(dayIndex).map(g => ({ goalId: g.id, progress: 0, claimed: false }));
    }
  }

  /** 记录每日目标进度 */
  public trackDailyGoal(goalId: string, amount: number): void {
    const r = this.retention();
    const goal = r.dailyGoals.find(g => g.goalId === goalId);
    if (goal && !goal.claimed) {
      goal.progress = Math.min(goal.progress + amount, DAILY_GOALS.find(d => d.id === goalId)?.target ?? 999);
    }
  }

  /** 领取每日目标奖励 */
  public claimDailyGoal(goalId: string): { ok: boolean; reward?: { spiritStones: number; salary: number }; reason?: string } {
    const r = this.retention();
    const goal = r.dailyGoals.find(g => g.goalId === goalId);
    if (!goal) return { ok: false, reason: '目标不存在' };
    if (goal.claimed) return { ok: false, reason: '已领取' };
    const def = DAILY_GOALS.find(d => d.id === goalId);
    if (!def) return { ok: false, reason: '目标定义不存在' };
    if (goal.progress < def.target) return { ok: false, reason: '未完成' };
    goal.claimed = true;
    const p = this.context.player;
    p.spiritStones += def.reward.spiritStones;
    p.salary += def.reward.salary;
    this.context.events.emit('playerChanged', { reason: 'v64DailyGoal' });
    return { ok: true, reward: def.reward };
  }

  /** 领取七日目标奖励 */
  public claimSevenDay(day: number): { ok: boolean; reward?: { spiritStones: number; label: string }; reason?: string } {
    const r = this.retention();
    if (r.sevenDayClaimed.includes(day)) return { ok: false, reason: '已领取' };
    const def = SEVEN_DAY_GOALS.find(g => g.day === day);
    if (!def) return { ok: false, reason: '目标不存在' };
    // 检查完成条件
    const stats = this.achievementStats();
    const value = (stats as any)[def.checkKey] ?? 0;
    if (value < def.target) return { ok: false, reason: '未完成' };
    r.sevenDayClaimed.push(day);
    const p = this.context.player;
    p.spiritStones += def.reward.spiritStones;
    if (day === 7) this.equipState().fragments += 5;
    this.context.events.emit('playerChanged', { reason: 'v64SevenDay' });
    return { ok: true, reward: def.reward };
  }

  /** 检查并领取V6.4成就 */
  public checkV64Achievements(): string[] {
    const r = this.retention();
    const stats = this.achievementStats();
    const newlyClaimed: string[] = [];
    for (const ach of V64_ACHIEVEMENTS) {
      if (r.v64AchievementsClaimed.includes(ach.id)) continue;
      const value = (stats as any)[ach.checkKey] ?? 0;
      if (value >= ach.target) {
        r.v64AchievementsClaimed.push(ach.id);
        const p = this.context.player;
        p.spiritStones += ach.reward.spiritStones;
        newlyClaimed.push(ach.id);
        this.context.events.emit('v64AchievementUnlocked', { id: ach.id, name: ach.name, emoji: ach.emoji });
      }
    }
    if (newlyClaimed.length > 0) {
      this.context.events.emit('playerChanged', { reason: 'v64Achievement' });
    }
    return newlyClaimed;
  }

  /** 成就/七日目标统计快照 */
  public achievementStats(): Record<string, number> {
    const b = this.battle();
    const s = this.squad();
    const r = this.retention();
    const eqState = this.equipState();
    const professions = s.members.filter(m => m.slot >= 0).map(m => m.profession);
    const synergies = activeSynergies(professions);
    const equippedIds = Object.values(eqState.equipped).filter((v): v is string => !!v);
    const equippedDefs = equippedIds.map(id => eqState.bag.find(b => b.id === id)).filter((v): v is V64EquipInstance => !!v).map(inst => equipDef(inst.defId)).filter((v): v is NonNullable<typeof v> => !!v);
    const maxStars = Math.max(0, ...s.members.map(m => m.stars ?? 1));
    const maxEnhanceLevel = Math.max(0, ...eqState.bag.map(b => b.level));
    return {
      totalKills: b.totalKills,
      maxStage: b.maxStage,
      towerBestFloor: b.towerBestFloor,
      totalSkillUses: r.totalSkillUses,
      totalTapCount: r.totalTapCount,
      totalStarUps: r.totalStarUps,
      totalChestsOpened: r.totalChestsOpened,
      squadSize: s.members.filter(m => m.slot >= 0).length,
      profCount: new Set(professions).size,
      legendaryCount: s.members.filter(m => (m.rarity ?? 0) >= 4).length,
      maxStars,
      synergyCount: synergies.length,
      fullstackActive: synergies.some(syn => syn.id === 'fullstack') ? 1 : 0,
      equippedCount: equippedIds.length,
      legendaryEquipped: equippedDefs.filter(d => d.rarity === 'LEGENDARY').length,
      maxEnhanceLevel,
    };
  }

  /** V6.4 每日目标视图 */
  public dailyGoalsView(dayIndex: number): { goalId: string; name: string; emoji: string; desc: string; progress: number; target: number; completed: boolean; claimed: boolean; reward: { spiritStones: number; salary: number } }[] {
    this.refreshDailyGoals(dayIndex);
    const r = this.retention();
    return r.dailyGoals.map(g => {
      const def = DAILY_GOALS.find(d => d.id === g.goalId);
      return {
        goalId: g.goalId,
        name: def?.name ?? g.goalId,
        emoji: def?.emoji ?? '📋',
        desc: def?.desc ?? '',
        progress: g.progress,
        target: def?.target ?? 1,
        completed: g.progress >= (def?.target ?? 1),
        claimed: g.claimed,
        reward: def?.reward ?? { spiritStones: 0, salary: 0 },
      };
    });
  }

  /** V6.4 七日目标视图 */
  public sevenDayView(): { day: number; name: string; emoji: string; desc: string; completed: boolean; claimed: boolean; reward: string }[] {
    const r = this.retention();
    const stats = this.achievementStats();
    return SEVEN_DAY_GOALS.map(g => {
      const value = (stats as any)[g.checkKey] ?? 0;
      return {
        day: g.day,
        name: g.name,
        emoji: g.emoji,
        desc: g.desc,
        completed: value >= g.target,
        claimed: r.sevenDayClaimed.includes(g.day),
        reward: g.reward.label,
      };
    });
  }

  /** V6.4 成就视图 */
  public achievementsView(): { id: string; name: string; emoji: string; desc: string; completed: boolean; claimed: boolean; reward: number }[] {
    const r = this.retention();
    const stats = this.achievementStats();
    return V64_ACHIEVEMENTS.map(a => {
      const value = (stats as any)[a.checkKey] ?? 0;
      return {
        id: a.id,
        name: a.name,
        emoji: a.emoji,
        desc: a.desc,
        completed: value >= a.target,
        claimed: r.v64AchievementsClaimed.includes(a.id),
        reward: a.reward.spiritStones,
      };
    });
  }

  /** V6.4 失败建议 */
  public defeatAdvice(): { reason: string; suggestions: readonly string[]; recommendedPower: number } | null {
    const b = this.battle();
    if (!b.enemy || !b.enemy.isBoss) return null;
    const trait = (b.enemy.bossTrait ?? 'NONE') as BossTrait;
    const currentPower = this.computePowerScore();
    return defeatAdviceFor(b.stage, currentPower, trait);
  }

  /** V6.4 战力计算 */
  public computePowerScore(): number {
    const s = this.squad();
    const b = this.battle();
    const professions = s.members.filter(m => m.slot >= 0).map(m => m.profession);
    const synergies = activeSynergies(professions);
    const eqStats = equipTotalStats(this.equipState());
    return powerScore({
      squadAttack: s.members.filter(m => m.slot >= 0).reduce((sum, m) => sum + memberAttack(m), 0),
      clickDamage: clickDamageOf(s.clickLevel),
      avgRarity: s.members.filter(m => m.slot >= 0).reduce((sum, m) => sum + (m.rarity ?? 0), 0) / Math.max(1, s.members.filter(m => m.slot >= 0).length),
      totalStars: s.members.filter(m => m.slot >= 0).reduce((sum, m) => sum + (m.stars ?? 1), 0),
      synergyCount: synergies.length,
      equipmentAttack: eqStats.atk,
    });
  }

  // ── DPS计算 ────────────────────────────────────────────────────────────────

  public totalDps(): number {
    const s = this.squad();
    // V6.4 羁绊攻击加成
    const professions = s.members.filter(m => m.slot >= 0).map(m => m.profession);
    const synergies = activeSynergies(professions);
    const synergyAtkMult = synergies.reduce((mul, syn) => mul * syn.atkMult, 1);
    // V6.4 装备攻击加成
    const eqStats = equipTotalStats(this.equipState());
    let dps = 0;
    for (const m of s.members) {
      if (m.slot < 0) continue;
      const def = professionDef(m.profession);
      dps += (memberAttack(m) * synergyAtkMult + (m.slot === 0 ? eqStats.atk : eqStats.atk * 0.3)) / def.intervalSec;
    }
    return Math.round(dps * 10) / 10;
  }

  // ── UI视图 ─────────────────────────────────────────────────────────────────

  public view(): AutoBattleView {
    const b = this.battle();
    const s = this.squad();
    const ch = chapterOfStage(b.stage);
    const enemy = b.enemy;
    const dps = this.totalDps();
    // V6.4 羁绊
    const professions = s.members.filter(m => m.slot >= 0).map(m => m.profession);
    const synergies = activeSynergies(professions);
    // V6.4 装备
    const eqState = this.equipState();
    const eqStats = equipTotalStats(eqState);
    const pendingEquipDrops = eqState.bag.filter(inst => {
      const def = equipDef(inst.defId);
      return def && !Object.values(eqState.equipped).includes(inst.id);
    }).length;
    // V6.4 主动技能
    const cooldowns = s.activeSkillCooldowns ?? {};
    const activeSkills = ACTIVE_SKILLS.map(sk => {
      const cd = cooldowns[sk.id] ?? 0;
      const unlocked = b.maxStage >= sk.unlockStage || b.stage >= sk.unlockStage;
      return {
        id: sk.id,
        name: sk.name,
        emoji: sk.emoji,
        desc: sk.desc,
        cooldownSec: sk.cooldownSec,
        cooldownRemaining: Math.ceil(cd),
        ready: cd <= 0 && unlocked,
        unlocked,
        unlockStage: sk.unlockStage,
      };
    });
    // V6.4 敌人类型/Boss特性标签
    const enemyTypeLabel = enemy?.enemyType ? enemyTypeDef(enemy.enemyType as EnemyType).label : '';
    const bossTraitLabel = enemy?.bossTrait && enemy.bossTrait !== 'NONE' ? bossTraitDef(enemy.bossTrait as BossTrait).label : '';
    // V6.4 推荐战力
    const recommendedPower = recommendedPowerFor(b.stage);
    // V6.4 队员详情
    const squadDetail = s.members.filter(m => m.slot >= 0).map(m => {
      const stars = m.stars ?? 1;
      const cost = stars < 5 ? starUpCost(stars) : null;
      return {
        id: m.id,
        rarity: m.rarity ?? 0,
        rarityLabel: rarityDef((m.rarity ?? 0) as Rarity).label,
        rarityEmoji: rarityDef((m.rarity ?? 0) as Rarity).emoji,
        stars,
        fragments: m.fragments ?? 0,
        starUpCost: cost,
      };
    });
    return {
      stage: b.stage,
      maxStage: b.maxStage,
      status: b.status,
      autoEnabled: b.autoEnabled,
      chapterTitle: ch.title,
      chapterEmoji: ch.emoji,
      stageProgress: `${ch.startStage}~${ch.endStage}关`,
      enemy: enemy ? {
        name: enemy.name,
        emoji: enemy.emoji,
        hp: Math.round(enemy.hp),
        maxHp: enemy.maxHp,
        hpPct: enemy.maxHp > 0 ? Math.round((enemy.hp / enemy.maxHp) * 100) : 0,
        isBoss: enemy.isBoss,
        isCardBoss: enemy.isCardBoss,
      } : null,
      squad: s.members.filter(m => m.slot >= 0).map(m => {
        const def = professionDef(m.profession);
        return {
          id: m.id,
          name: m.name,
          profession: m.profession,
          professionLabel: def.label,
          professionEmoji: def.emoji,
          level: m.level,
          slot: m.slot,
          attack: memberAttack(m),
          skillName: def.skill.name,
          skillReady: m.skillTimer <= 0,
          skillCooldownPct: def.skill.cooldownSec > 0 ? Math.round((1 - Math.max(0, m.skillTimer) / def.skill.cooldownSec) * 100) : 100,
        };
      }),
      clickDamage: clickDamageOf(s.clickLevel) + eqStats.atk,
      totalKills: b.totalKills,
      spiritStones: this.context.player.spiritStones,
      victoryTimer: Math.max(0, b.victoryTimer),
      defeatTimer: Math.max(0, b.defeatTimer),
      towerFloor: b.towerFloor,
      towerBestFloor: b.towerBestFloor,
      pendingChests: b.pendingChests,
      dps,
      // V6.4
      speedMultiplier: b.speedMultiplier ?? 1,
      activeSkills,
      synergies: synergies.map(syn => ({ id: syn.id, name: syn.name, emoji: syn.emoji, desc: syn.desc })),
      powerScore: this.computePowerScore(),
      enemyTypeLabel,
      bossTraitLabel,
      recommendedPower,
      squadDetail,
      pendingEquipDrops,
    };
  }
}