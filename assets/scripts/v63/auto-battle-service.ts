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
  stageKind,
  towerEnemyDefFor,
} from './auto-battle-content';

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
  return Math.round(def.baseAttack * member.level * (1 + (member.level - 1) * 0.12));
}

function clickDamageOf(clickLevel: number): number {
  return Math.round(CLICK_BASE_DAMAGE * clickLevel * (1 + (clickLevel - 1) * 0.15));
}

function memberExpToNext(level: number): number {
  return Math.round(50 * Math.pow(1.15, level - 1));
}

function makeEnemyState(def: EnemyDef): V63EnemyState {
  return {
    defId: def.defId,
    name: def.name,
    emoji: def.emoji,
    hp: def.hp,
    maxHp: def.hp,
    attack: def.attack,
    intervalSec: def.intervalSec,
    attackTimer: def.intervalSec, // 首次攻击等一个完整间隔
    isBoss: def.isBoss,
    isCardBoss: def.isCardBoss,
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
        lastTickAt: Date.now(),
        towerFloor: 0,
        towerBestFloor: 0,
        chestKillCounter: 0,
        pendingChests: 0,
        idleSalaryAccrued: 0,
        idleCultivationAccrued: 0,
      };
    }
    return p.v63AutoBattle;
  }

  private squad(): V63SquadState {
    const p = this.context.player;
    if (!p.v63Squad) {
      p.v63Squad = {
        members: [this.makeLeader()],
        clickLevel: 1,
        shield: 0,
        weakSpotTimer: 0,
      };
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
    };
  }

  // ── 生命周期 ───────────────────────────────────────────────────────────────

  /** 启动/恢复战斗（facade 初始化后调用）。 */
  public ensureStarted(): void {
    const b = this.battle();
    if (b.status === 'IDLE' || (b.status === 'FIGHTING' && !b.enemy)) {
      this.spawnEnemy();
      b.status = 'FIGHTING';
    }
  }

  /** 离线结算：根据离开时长估算推关收益。 */
  public settleOffline(elapsedSeconds: number): { stagesCleared: number; salary: number; cultivation: number } {
    const b = this.battle();
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
    return { stagesCleared, salary, cultivation };
  }

  // ── Tick（GameLoop 驱动） ──────────────────────────────────────────────────

  /** 每秒由 GameLoop 调用。 */
  public tick(seconds: number): void {
    const b = this.battle();
    const s = this.squad();
    b.lastTickAt = Date.now();

    // 计时器衰减
    if (s.weakSpotTimer > 0) s.weakSpotTimer = Math.max(0, s.weakSpotTimer - seconds);

    switch (b.status) {
      case 'IDLE':
        this.ensureStarted();
        return;
      case 'FIGHTING':
        this.tickFighting(b, s, seconds);
        return;
      case 'VICTORY':
        b.victoryTimer -= seconds;
        if (b.victoryTimer <= 0) this.advanceStage(b);
        return;
      case 'DEFEAT':
        b.defeatTimer -= seconds;
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

    // 1. 小队自动攻击
    for (const m of s.members) {
      const def = professionDef(m.profession);
      m.attackTimer += seconds;
      while (m.attackTimer >= def.intervalSec) {
        m.attackTimer -= def.intervalSec;
        const dmg = Math.round(memberAttack(m) * weakMult);
        this.damageEnemy(b, dmg, false);
        if (b.enemy && b.enemy.hp <= 0) return; // 敌人死亡，后续tick处理
      }
      // 技能冷却
      if (m.skillTimer > 0) m.skillTimer = Math.max(0, m.skillTimer - seconds);
    }

    if (!b.enemy || b.enemy.hp <= 0) return;

    // 2. 敌人攻击（打队长/全队护盾）
    enemy.attackTimer += seconds;
    while (enemy.attackTimer >= enemy.intervalSec) {
      enemy.attackTimer -= enemy.intervalSec;
      let dmg = enemy.attack;
      if (s.shield > 0) {
        const absorbed = Math.min(s.shield, dmg);
        s.shield -= absorbed;
        dmg -= absorbed;
      }
      if (dmg > 0) {
        // 伤害打到队长（玩家），道心扣减（轻量：不影响核心道心系统，仅战斗内表现）
        // V6.3设计：自动战斗不死人——敌人攻击只减速推关（增加击杀耗时），不导致DEFEAT
        // DEFEAT仅在敌人攻击>全队DPS×10倍时触发（数值严重不足卡关）
      }
    }

    // 3. 自动施放技能（冷却好了就放）
    for (const m of s.members) {
      if (m.skillTimer > 0) continue;
      const def = professionDef(m.profession);
      m.skillTimer = def.skill.cooldownSec;
      this.castSkill(b, s, m, def.skill.kind, def.skill.power, weakMult);
      if (b.enemy && b.enemy.hp <= 0) return;
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

  private damageEnemy(b: V63AutoBattleState, damage: number, isCrit: boolean): void {
    if (!b.enemy || b.status !== 'FIGHTING') return;
    b.enemy.hp = Math.max(0, b.enemy.hp - damage);
    if (b.enemy.hp <= 0) this.onEnemyDefeated(b);
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
    this.applyRewards(def.rewardSalary, def.rewardCultivation, def.rewardSpiritStones);
    this.grantSquadExp(def.rewardCultivation);

    // 宝箱计数
    b.chestKillCounter++;
    if (b.chestKillCounter >= CHEST_KILL_INTERVAL) {
      b.chestKillCounter = 0;
      if (b.pendingChests < CHEST_MAX_PENDING) b.pendingChests++;
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
    b.enemy = makeEnemyState(def);
  }

  // ── 点击攻击 ───────────────────────────────────────────────────────────────

  public tapAttack(): TapAttackResult {
    const b = this.battle();
    if (b.status !== 'FIGHTING' || !b.enemy) {
      return { ok: false, damage: 0, isCrit: false, enemyHpAfter: 0, enemyDefeated: false, stageCleared: false, rewards: null, reason: b.status === 'BOSS_PENDING' ? 'BOSS_PENDING' : 'NOT_FIGHTING' };
    }
    const s = this.squad();
    const baseDmg = clickDamageOf(s.clickLevel);
    const isCrit = Math.random() < CLICK_CRIT_CHANCE;
    const weakMult = s.weakSpotTimer > 0 ? 1.5 : 1;
    const damage = Math.round(baseDmg * (isCrit ? CLICK_CRIT_MULT : 1) * weakMult);
    b.enemy.hp = Math.max(0, b.enemy.hp - damage);
    const defeated = b.enemy.hp <= 0;
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
    };
    s.members.push(member);
    this.context.events.emit('v63MemberHired', { name: member.name, profession });
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
    const cr = chestRewardFor(b.stage);
    const p = this.context.player;
    if (cr.kind === 'SALARY') p.salary += cr.amount;
    else if (cr.kind === 'CULTIVATION') p.cultivationExp += cr.amount;
    else if (cr.kind === 'SPIRIT_STONES') p.spiritStones += cr.amount;
    else this.grantSquadExp(cr.amount);
    this.context.events.emit('playerChanged', { reason: 'v63Chest' });
    return { ok: true, reward: { label: cr.label, amount: cr.amount } };
  }

  // ── DPS计算 ────────────────────────────────────────────────────────────────

  public totalDps(): number {
    const s = this.squad();
    let dps = 0;
    for (const m of s.members) {
      if (m.slot < 0) continue;
      const def = professionDef(m.profession);
      dps += memberAttack(m) / def.intervalSec;
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
      clickDamage: clickDamageOf(s.clickLevel),
      totalKills: b.totalKills,
      victoryTimer: Math.max(0, b.victoryTimer),
      defeatTimer: Math.max(0, b.defeatTimer),
      towerFloor: b.towerFloor,
      towerBestFloor: b.towerBestFloor,
      pendingChests: b.pendingChests,
      dps,
    };
  }
}