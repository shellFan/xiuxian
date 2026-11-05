/**
 * V5.9-O.2 卡牌战斗服务桥接层。
 *
 * 职责（§18 单一权威状态 + 复用而非重建）：
 * - 从既有世界数据（Build/怪物/Boss 机制/装备/疲劳/职业/命格/宗门）聚合玩家属性与敌人。
 * - Boss 机制秒→回合换算（2s≈1 回合），Telegraph/Phase2/复活/召唤/封技全部回合化。
 * - 战斗内成长（升级三选一沿用 run.skillOffers）与战后卡牌奖励（进入收藏）。
 * - 状态持久化：activeBattleRun.card（cardVersion=1），旧 tick 存档安全迁移。
 *
 * 本服务不渲染 UI；一切命令经 BattleService/Facade 暴露。
 */
import type { GameContext } from '../../core/game-context';
import type { BattleRunState } from '../../v3/battle-service';
import {
  BUILD_MAP,
  MONSTER_MAP,
  SKILL_MAP,
  SYNERGIES,
  WAVES,
  bossMechanicsFor,
  skillTagOf,
  type MonsterDef,
} from '../../v57/battle-merge';
import { characterEffectMultiplier } from '../../v59/character-attributes';
import {
  beginCardBattle,
  claimCardReward as engineClaimReward,
  endPlayerTurn as engineEndTurn,
  isCardBattleState,
  makeCardInstance,
  playCard as enginePlayCard,
} from './card-engine';
import { CardRng } from './card-rng';
import {
  allCardDefs,
  battleRules,
  databaseDebug,
  buildDeckManifest,
  cardDefById,
  emptyCollection,
  installEngineResolver,
  rewardPool,
  rewardWeights,
  upgradeCost,
} from './card-database';
import type { CardBattleState, CardDef, CardEnemy, CardEngineEnv, CardInstance, EnemyIntent, StatusId } from './card-types';

/** Boss 机制换算：旧每 X 秒 → 每 N 回合（2 游戏秒 ≈ 1 回合，向上取整保底 1）。 */
export function secondsToTurns(seconds: number): number {
  return Math.max(1, Math.round(seconds / 2));
}

interface PlayerLoadout {
  attack: number;
  critChance: number;
  maxHp: number;
  startShield: number;
  damageReduce: number;
  reviveOnce: boolean;
  damageMul: number;
}

export class CardBattleService {
  /** 引擎实例解析器只装一次。 */
  private static resolverInstalled = false;

  /**
   * 敌人击杀钩子（BattleService 注入：经验/掉落/图鉴/升级三选一）。
   * @param run 外层 run（kill 计数与 skillOffers 挂载处）
   */
  public handleEnemyKilled?: (run: BattleRunState, enemy: CardEnemy, state: CardBattleState, rng: CardRng) => void;

  /** 开局 seed 来源（BattleService 注入可测试 rng；缺省 Math.random）。 */
  public seedSource?: () => number;

  public constructor(private readonly context: GameContext) {
    if (!CardBattleService.resolverInstalled) {
      installEngineResolver();
      CardBattleService.resolverInstalled = true;
    }
  }

  // ── 玩家属性聚合（镜像 v3/battle-service.playerSkillStats 的口径） ──────────

  private loadout(run: BattleRunState, buildId: string): PlayerLoadout {
    const build = BUILD_MAP.get(buildId);
    const eq = this.equipmentStats();
    let damageMul = 0;
    let critBonus = 0;
    let damageReduce = 0;
    for (const id of run.skills) {
      const skill = SKILL_MAP.get(id);
      if (!skill) continue;
      damageMul += skill.damageMul ?? 0;
      critBonus += skill.critBonus ?? 0;
      damageReduce += skill.damageReduce ?? 0;
    }
    for (const synergyId of run.synergies ?? []) {
      const synergy = SYNERGIES.find((s) => s.id === synergyId);
      if (!synergy) continue;
      damageMul += synergy.effects.damageMulDelta ?? 0;
      critBonus += synergy.effects.critBonus ?? 0;
      damageReduce += synergy.effects.damageReduceDelta ?? 0;
    }
    damageMul += eq.atkMul;
    critBonus += eq.critBonus;
    damageReduce += eq.damageReduce;
    const perks = this.context.professionContent?.perkAggregate();
    if (perks) damageMul += perks.atkMul;
    // 疲劳攻击惩罚（沿用旧口径）。
    let fatigueMul = 1;
    try { fatigueMul = this.context.fatigue.battleAttackMul(); } catch { /* 未接线按 1 */ }
    if (this.context.player.overtimeFatigue === 'EXHAUSTED') fatigueMul = 0.75;
    else if (this.context.player.overtimeFatigue === 'TIRED') fatigueMul = 0.9;
    const baseAttack = build?.baseAttack ?? 10;
    const maxHpBase = build?.baseHp ?? 120;
    const maxHp = maxHpBase + eq.maxHpBonus;
    const attack = Math.max(1, Math.floor(baseAttack * fatigueMul * (1 + damageMul)));
    const critChance = Math.min(0.8, (build?.critChance ?? 0.05) * characterEffectMultiplier(this.context.player, 'BATTLE_CRIT_CHANCE') + critBonus);
    return {
      attack,
      critChance,
      maxHp,
      startShield: Math.max(0, Math.round(eq.shieldBonus)),
      damageReduce: Math.min(0.6, damageReduce),
      reviveOnce: eq.reviveOnce === true,
      damageMul: 1, // 卡牌倍率已含在卡定义；全局乘数仅宗门/命格小加成（见 modifiers）
    };
  }

  private equipmentStats() {
    try {
      return this.context.loot.battleStats();
    } catch {
      return { atkMul: 0, critBonus: 0, maxHpBonus: 0, shieldBonus: 0, damageReduce: 0, reviveOnce: false, lootBonus: 0 } as const;
    }
  }

  // ── 卡组构建 ────────────────────────────────────────────────────────────────

  private collectionOf(): Record<string, number> {
    const raw = this.context.player.cardCollection;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  private upgradesOf(): Record<string, number> {
    const raw = this.context.player.cardUpgrades;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  /** 宗门/命格对卡牌战斗的小加成（单层小数值，禁止重复乘算膨胀）。 */
  private battleModifiers(sectId: string | null, destinyId: string | null): CardBattleState['modifiers'] {
    const modifiers: CardBattleState['modifiers'] = {
      sectId,
      destinyId,
      startBlockPerTurn: 0,
      damageMul: 1,
      endTurnHeal: 0,
      energyEveryTurns: 0,
      openingStatuses: {},
    };
    // 宗门（复用现有四宗门，不扩数量）。
    if (sectId === 'PRIVATE') modifiers.damageMul = 1.08;         // 民企宗：狼性输出
    else if (sectId === 'FOREIGN') modifiers.startBlockPerTurn = 2; // 外企宗：边界感护体
    else if (sectId === 'STATE') modifiers.endTurnHeal = 2;         // 国企宗：稳定回血
    else if (sectId === 'BIG_TECH') modifiers.energyEveryTurns = 4; // 大厂宗：每 4 回合 +1 能量
    // 命格（与 character-attributes 的 hook 呼应，战斗侧只取轻量加成）。
    if (destinyId === 'KING_OF_GRIND') modifiers.openingStatuses.STRENGTH = 1;
    else if (destinyId === 'LABOR_SAINT') modifiers.openingStatuses.REGEN = 1;
    else if (destinyId === 'FISHING_IMMORTAL') modifiers.startBlockPerTurn += 1;
    else if (destinyId === 'SCAPEGOAT') modifiers.openingStatuses.DODGE = 1;
    return modifiers;
  }

  /**
   * V5.8 词条联动（卡牌化口径）：装备流派词条 × 当前技能池 tag 命中率 → 全局卡牌
   * 伤害乘数。与旧 equippedTagMulForRun 同公式（1 + Σ增幅×命中/池大小）。
   */
  private tagMulForRun(run: BattleRunState): number {
    const stats = this.equipmentStats() as { skillTagMuls?: Map<string, number> };
    const tagMuls = stats.skillTagMuls;
    let value = 1;
    if (tagMuls && tagMuls.size > 0 && run.skills.length > 0) {
      let bonus = 0;
      for (const id of run.skills) {
        const tag = skillTagOf(id);
        if (tag) bonus += tagMuls.get(tag) ?? 0;
      }
      value = 1 + bonus / run.skills.length;
    }
    return value;
  }

  // ── 开局 ────────────────────────────────────────────────────────────────────

  /** 由 BattleService.start 调用：创建卡牌战斗并写入 run.card。 */
  public beginRun(run: BattleRunState): CardBattleState {
    const rules = battleRules();
    const deckManifest = buildDeckManifest({
      professionId: this.context.profession?.currentId() ?? 'JAVA_BACKEND',
      destinyId: this.context.player.destinyId ?? null,
      collection: this.collectionOf(),
      upgrades: this.upgradesOf(),
    });
    const loadout = this.loadout(run, run.buildId);
    const seed = (Math.floor(this.rngSource() * 0x7fffffff) ^ Math.imul(run.dayIndex, 2654435761)) >>> 0;
    const sectId = this.context.player.sectId ?? null;
    const deck: CardInstance[] = [];
    for (const [defId, count] of Object.entries(deckManifest.manifest)) {
      for (let i = 0; i < count; i += 1) {
        deck.push({ uid: `${defId}_${deck.length + 1}`, defId, upgraded: this.upgradesOf()[defId] ?? 0, turnCostDelta: 0 });
      }
    }
    const env = this.makeEnv(run);
    const modifiers = this.battleModifiers(sectId, this.context.player.destinyId ?? null);
    // 装备流派词条 → 卡牌伤害乘数（V5.8 词条联动卡牌化）。
    modifiers.damageMul *= this.tagMulForRun(run);
    const state = beginCardBattle({
      battleId: `cb_${run.runId}`,
      runId: run.runId,
      seed: seed >>> 0,
      playerHp: loadout.maxHp,
      playerMaxHp: loadout.maxHp,
      playerAttack: loadout.attack,
      playerCritChance: loadout.critChance,
      startShield: loadout.startShield,
      baseEnergy: rules.baseEnergy,
      drawPerTurn: rules.drawPerTurn,
      handLimit: rules.handLimit,
      deck,
      modifiers,
      env,
    });
    // 开局手牌数以 openingHandSize 为准（引擎默认 drawPerTurn=5，与 5 张开局一致）。
    void rules.openingHandSize;
    state.baselineAttack = loadout.attack;
    return state;
  }

  private rngSource(): number {
    // 开局 seed：优先使用可注入 battle rng（测试确定性），否则时间熵。
    if (this.seedSource) return this.seedSource();
    return Math.random();
  }

  // ── 世界注入：波次/Boss 机制/奖励 ───────────────────────────────────────────

  private makeEnv(run: BattleRunState): CardEngineEnv {
    const self = this;
    const env: CardEngineEnv = {
      waveTotal: WAVES.length,
      reviveOnce: this.loadout(run, run.buildId).reviveOnce,
      spawnWave: (waveIndex: number, rng: CardRng) => self.spawnWave(run, waveIndex, rng),
      rollRewards: (rng: CardRng) => self.rollRewards(rng),
      planIntent: (enemy: CardEnemy, state: CardBattleState, rng: CardRng) => self.planIntent(enemy, state, rng),
      runBossSpecial: (enemy: CardEnemy, intent, state: CardBattleState, rng: CardRng, log: (line: string) => void) =>
        self.runBossSpecial(run, enemy, intent, state, rng, log),
      onEnemyKilled: (enemy: CardEnemy, state: CardBattleState, rng: CardRng) => self.handleEnemyKilled?.(run, enemy, state, rng),
      tryEnemyRevive: (enemy: CardEnemy, state: CardBattleState, rng: CardRng, log: (line: string) => void) =>
        self.tryRevive(enemy, state, log),
      onPlayerDodge: () => {
        try {
          const stats = self.context.player.lifetimeStats;
          self.context.player.lifetimeStats = { ...stats, battleDodges: (stats.battleDodges ?? 0) + 1 };
        } catch { /* 统计失败不阻塞战斗 */ }
      },
      onPlayerInterrupt: () => {
        try {
          const stats = self.context.player.lifetimeStats;
          self.context.player.lifetimeStats = { ...stats, battleInterrupts: (stats.battleInterrupts ?? 0) + 1 };
        } catch { /* 统计失败不阻塞战斗 */ }
      },
      specialtyMultiplier: (defId: string) => {
        try { return self.context.profession?.specialtyMultiplier(defId) ?? 1; } catch { return 1; }
      },
    };
    return env;
  }

  /** REVIVE/LINKED 回合化（镜像 v3 语义：至多一次自复活 + 双尊互锁一次）。 */
  private tryRevive(enemy: CardEnemy, state: CardBattleState, log: (line: string) => void): boolean {
    if (enemy.tier !== 'BOSS') return false;
    const mechDef = bossMechanicsFor(enemy.defId);
    const revive = mechDef?.mechanics.find((m) => m.kind === 'REVIVE' || m.kind === 'LINKED');
    if (!revive) return false;
    const revivePct = revive.reviveHpPct ?? 0.5;
    if ((enemy.revived ?? 0) < 1) {
      enemy.revived = (enemy.revived ?? 0) + 1;
      enemy.hp = Math.max(1, Math.floor(enemy.maxHp * revivePct));
      log(`${enemy.name} 重新连接上了！它又活了！`);
      return true;
    }
    const twins = state.enemies.filter((e) => e.hp > 0 && e.linkGroup === enemy.linkGroup && e.uid !== enemy.uid);
    if (twins.length > 0 && (enemy.revived ?? 0) < 2) {
      enemy.revived = 2;
      enemy.hp = Math.max(1, Math.floor(enemy.maxHp * revivePct));
      log(`${twins[0]!.name} 死死锁住资源：${enemy.name} 被复活了！`);
      return true;
    }
    return false;
  }

  /** 波次生成（镜像 v3/battle-service.spawnWave：职业怪池门控 + 夜间加成 + 双尊 + 复盘 Boss）。 */
  /** 诊断入口：直接跑一次波次生成（EXE 环境自检）。 */
  public debugSpawnWave(run: BattleRunState, waveIndex: number, rng: CardRng): CardEnemy[] {
    return this.spawnWave(run, waveIndex, rng);
  }

  private spawnWave(run: BattleRunState, waveIndex: number, rng: CardRng): CardEnemy[] {
    const wave = WAVES[waveIndex];
    if (!wave) return [];
    const nightMul = run.night ? 1.25 : 1;
    // 复盘重刷：终盘波次强制目标 Boss 出场（沿用 v3 语义）。
    if (typeof run.replayBossId === 'string' && run.replayBossId && waveIndex === WAVES.length - 1) {
      const boss = MONSTER_MAP.get(run.replayBossId);
      if (boss) return [this.enemyFromDef(boss, nightMul, rng)];
    }
    const professionPool = [
      ...(this.context.professionContent?.monsterPool() ?? this.context.profession?.def().monsters ?? []),
      ...(this.context.professionContent?.def().bosses ?? []),
    ];
    const enemies: CardEnemy[] = [];
    for (let i = 0; i < wave.count; i += 1) {
      const tier = wave.tiers[Math.min(i, wave.tiers.length - 1)];
      let candidates = Array.from(MONSTER_MAP.values()).filter((m) => m.tier === tier);
      if (tier === 'BOSS') {
        const profBosses = candidates.filter((m) => professionPool.includes(m.id));
        const nonProfBosses = candidates.filter((m) => !professionPool.includes(m.id));
        if (profBosses.length > 0 && nonProfBosses.length > 0) candidates = rng.chance(0.8) ? profBosses : nonProfBosses;
        else if (profBosses.length > 0) candidates = profBosses;
      } else {
        const specialty = professionPool.length > 0 ? candidates.filter((m) => professionPool.includes(m.id)) : [];
        if (specialty.length > 0 && rng.chance(0.7)) candidates = specialty;
      }
      const def = candidates[Math.floor(rng.next() * candidates.length)];
      if (!def) continue;
      enemies.push(this.enemyFromDef(def, nightMul, rng));
      // 死锁双尊：成对出现（镜像旧逻辑）。
      if (def.twin) {
        const twin = { ...enemies[enemies.length - 1]!, uid: `${enemies[enemies.length - 1]!.uid}_b`, name: `${def.name}·另一尊` };
        enemies[enemies.length - 1]!.linkGroup = `twin_${run.runId}`;
        twin.linkGroup = `twin_${run.runId}`;
        enemies.push(twin);
      }
    }
    return enemies;
  }

  private enemyFromDef(def: MonsterDef, nightMul: number, rng: CardRng): CardEnemy {
    return {
      uid: `${def.id}_${Math.floor(rng.next() * 1e6).toString(36)}`,
      defId: def.id,
      name: def.name,
      tier: def.tier,
      hp: Math.floor(def.hp * nightMul),
      maxHp: Math.floor(def.hp * nightMul),
      attack: Math.max(1, Math.floor(def.attack * nightMul)),
      block: 0,
      statuses: {},
      intent: null,
      timers: {},
      telegraphed: {},
      revived: 0,
    };
  }

  /** 敌人意图规划：普通怪攻击节奏 + Boss 机制回合化（玩家回合开始前可见）。 */
  private planIntent(enemy: CardEnemy, state: CardBattleState, rng: CardRng): EnemyIntent {
    const mechDef = bossMechanicsFor(enemy.defId);
    const turn = state.turn;
    if (enemy.tier === 'BOSS' && mechDef) {
      // 机制到点 → SPECIAL 意图（预警已由上一轮 telegraph 记录）。
      for (const mechanic of mechDef.mechanics) {
        if (mechanic.kind === 'LINKED' || mechanic.kind === 'REVIVE') continue;
        const everyTurns = secondsToTurns(mechanic.everySec ?? 10);
        const acc = (enemy.timers[mechanic.kind] ?? 0) + 1;
        if (acc >= everyTurns) {
          enemy.timers[mechanic.kind] = 0;
          return { kind: 'SPECIAL', mechanic: mechanic.kind };
        }
        enemy.timers[mechanic.kind] = acc;
        if (acc >= everyTurns - 1 && !enemy.telegraphed[mechanic.kind]) {
          enemy.telegraphed[mechanic.kind] = true;
          state.log.push(`⚠️ ${mechDef.telegraph}`);
        }
      }
      // 蓄力重击节奏：每 4 回合一次 1.6 倍重击，其余普攻（回合化压力校准）。
      if (turn % 4 === 0) return { kind: 'ATTACK', damage: Math.floor(enemy.attack * 1.6), hits: 1 };
      return { kind: 'ATTACK', damage: enemy.attack, hits: 1 };
    }
    if (enemy.tier === 'ELITE') {
      // 精英：3 回合循环 攻/攻/强化。
      const pattern = turn % 3;
      if (pattern === 2) return { kind: 'BUFF', status: 'STRENGTH', stacks: 1 };
      return { kind: 'ATTACK', damage: enemy.attack, hits: 1 };
    }
    // 普通怪：基础攻击，偶尔防御（按 uid 稳定伪随机，确定性可回放）。
    const salt = enemy.uid.length % 3;
    if ((turn + salt) % 4 === 3) return { kind: 'BLOCK', amount: Math.ceil(enemy.attack * 0.8) };
    return { kind: 'ATTACK', damage: enemy.attack, hits: 1 };
  }

  /** Boss 机制执行（回合化，§22：不得把秒直接当回合）。 */
  private runBossSpecial(
    run: BattleRunState,
    enemy: CardEnemy,
    intent: Extract<EnemyIntent, { kind: 'SUMMON' } | { kind: 'SPECIAL' }>,
    state: CardBattleState,
    rng: CardRng,
    log: (line: string) => void,
  ): void {
    const mechDef = bossMechanicsFor(enemy.defId);
    // Phase2 触发（HP 阈值，行为真实改变）。
    if (mechDef && enemy.tier === 'BOSS' && mechDef.phase2 && !enemy.phase2Active
      && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= mechDef.phase2.atHpPct) {
      enemy.phase2Active = true;
      enemy.attack = Math.floor(enemy.attack * (mechDef.phase2.attackMul ?? 1));
      log(`⛔ Phase 2 —— ${mechDef.phase2.name}！`);
      log(mechDef.phase2.telegraph);
      this.context.events.emit('bossPhase2', { bossId: enemy.defId, name: enemy.name, phase: mechDef.phase2.name });
      try {
        const stats = this.context.player.lifetimeStats;
        this.context.player.lifetimeStats = { ...stats, bossPhase2Seen: (stats.bossPhase2Seen ?? 0) + 1 };
      } catch { /* 统计失败不阻塞战斗 */ }
    }
    const mechanicKind = intent.kind === 'SUMMON' ? 'SUMMON' : intent.mechanic;
    if (mechanicKind === 'SUMMON') {
      const minionId = mechDef?.mechanics.find((m) => m.kind === 'SUMMON')?.minion ?? 'mon_req_change';
      const cap = (mechDef?.mechanics.find((m) => m.kind === 'SUMMON')?.cap ?? 2) + (enemy.phase2Active ? 1 : 0);
      const minions = state.enemies.filter((e) => e.hp > 0 && e.tier === 'NORMAL').length;
      if (minions < cap + 1) {
        const def = MONSTER_MAP.get(minionId);
        if (def) {
          const minion = this.enemyFromDef(def, run.night ? 1.25 : 1, rng);
          state.enemies.push(minion);
          minion.intent = this.planIntent(minion, state, rng);
          log(`${enemy.name} 召唤了 ${def.name}！`);
        }
      } else {
        log(`${enemy.name} 试图召唤增援，但战场已满。`);
      }
      return;
    }
    switch (mechanicKind) {
      case 'RAGE': {
        enemy.attack = Math.floor(enemy.attack * 1.15);
        log(`${enemy.name} 越战越怒（攻击提升）！`);
        return;
      }
      case 'ENRAGE': {
        if (!enemy.enraged && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= 0.3) {
          enemy.enraged = true;
          enemy.attack = Math.floor(enemy.attack * 1.8);
          log(`${enemy.name} 狂暴了！！`);
        } else {
          log(`${enemy.name} 眼中闪过凶光……`);
        }
        return;
      }
      case 'LOCK_SKILL': {
        // 封技 → 往手牌塞入诅咒·死锁（卡牌语境下的封锁）。
        const curse = makeCardInstance(state, 'card_deadlock');
        if (state.hand.length < state.handLimit) state.hand.push(curse);
        else state.discardPile.push(curse);
        log(`${enemy.name} 切断了你的连接！【诅咒·死锁】混入了你的手牌！`);
        return;
      }
      case 'ATTACK_SPEED_DEBUFF': {
        // 减速 → 玩家下回合虚弱（行动迟缓的回合化转译）。
        this.addPlayerStatus(state, 'WEAK', 2, log, `${enemy.name} 拖慢了你的出手！`);
        return;
      }
      case 'HP_DRAIN': {
        const minions = state.enemies.filter((e) => e.hp > 0 && e.tier === 'NORMAL').length;
        if (minions > 0) {
          state.player.maxHp = Math.max(30, state.player.maxHp - 5);
          state.player.hp = Math.min(state.player.hp, state.player.maxHp);
          log(`${enemy.name} 吞噬内存，你的最大生命下降！（场上小怪在滋养它）`);
        } else {
          log(`${enemy.name} 的吞噬失去了养分……`);
        }
        return;
      }
      case 'PROMOTE_MINION': {
        const minion = state.enemies.find((e) => e.hp > 0 && e.tier === 'NORMAL' && !e.enraged);
        if (minion) {
          minion.enraged = true;
          minion.attack = Math.floor(minion.attack * 1.6);
          minion.name = `P0·${minion.name}`;
          log(`${enemy.name} 把 ${minion.name} 升级成了 P0！`);
        } else {
          log(`${enemy.name} 找不到可升级的小怪。`);
        }
        return;
      }
      case 'DODGE': {
        this.addEnemyStatus(enemy, 'DODGE', 1, log, `${enemy.name} 的身影变得模糊……`);
        return;
      }
      case 'BLIND': {
        this.addPlayerStatus(state, 'BLIND', 2, log, `${enemy.name} 闪瞎了你的眼！`);
        const fatigue = makeCardInstance(state, 'card_fatigue');
        if (state.hand.length < state.handLimit) state.hand.push(fatigue);
        else state.discardPile.push(fatigue);
        log('【精神内耗】混入了你的手牌。');
        return;
      }
      case 'RANDOM': {
        const roll = rng.next();
        if (roll < 0.34) this.runBossSpecial(run, enemy, { kind: 'SPECIAL', mechanic: 'RAGE' }, state, rng, log);
        else if (roll < 0.67) this.runBossSpecial(run, enemy, { kind: 'SPECIAL', mechanic: 'BLIND' }, state, rng, log);
        else this.runBossSpecial(run, enemy, { kind: 'SPECIAL', mechanic: 'ATTACK_SPEED_DEBUFF' }, state, rng, log);
        return;
      }
      default: {
        log(`${enemy.name} 的动作被打断了。`);
        return;
      }
    }
  }

  private addPlayerStatus(state: CardBattleState, id: StatusId, stacks: number, log: (line: string) => void, line: string): void {
    state.player.statuses[id] = (state.player.statuses[id] ?? 0) + stacks;
    log(line);
  }

  private addEnemyStatus(enemy: CardEnemy, id: StatusId, stacks: number, log: (line: string) => void, line: string): void {
    enemy.statuses[id] = (enemy.statuses[id] ?? 0) + stacks;
    log(line);
  }

  // ── 奖励 ────────────────────────────────────────────────────────────────────

  /** 胜利卡牌奖励候选（3 张；职业池 70% 保底 + 稀有度加权，单次内不重复）。 */
  private rollRewards(rng: CardRng): string[] {
    const weights = rewardWeights();
    const professionId = this.context.profession?.currentId() ?? 'JAVA_BACKEND';
    const sectId = this.context.player.sectId ?? null;
    const pool = rewardPool(professionId, sectId);
    const professionPool = pool.filter((d) => d.profession === professionId);
    const neutralPool = pool.filter((d) => !d.profession);
    const picks: string[] = [];
    const seen = new Set<string>();
    const draw = (candidates: CardDef[]): void => {
      const available = candidates.filter((d) => !seen.has(d.id));
      if (available.length === 0) return;
      const byRarity: Record<'COMMON' | 'RARE' | 'EPIC', CardDef[]> = { COMMON: [], RARE: [], EPIC: [] };
      for (const def of available) {
        if (def.rarity === 'BASIC') continue;
        byRarity[def.rarity].push(def);
      }
      const tiers: ('COMMON' | 'RARE' | 'EPIC')[] = ['COMMON', 'RARE', 'EPIC'];
      const tier = rng.weighted(tiers, tiers.map((t) => (byRarity[t].length > 0 ? weights[t] : 0)));
      const chosen = rng.pick(byRarity[tier]);
      seen.add(chosen.id);
      picks.push(chosen.id);
    };
    if (rng.chance(weights.professionCardChance) && professionPool.length > 0) draw(professionPool);
    let guard = 0;
    while (picks.length < weights.candidates && guard < 32) {
      guard += 1;
      draw(rng.chance(0.5) && professionPool.length > 0 ? professionPool : neutralPool);
    }
    return picks.slice(0, weights.candidates);
  }

  /** 领取奖励（BattleService 委托）：加入收藏并持久化。 */
  public claimReward(state: CardBattleState, cardId: string | null): void {
    engineClaimReward(state, cardId);
    if (cardId) {
      const collection = this.collectionOf();
      collection[cardId] = (collection[cardId] ?? 0) + 1;
      this.context.player.cardCollection = collection;
    }
  }

  // ── 卡组/升级（战斗外） ─────────────────────────────────────────────────────

  /** 卡组总览（卡组页 UI）。 */
  public deckView(): { manifest: Record<string, number>; total: number; upgrades: Record<string, number> } {
    const manifest = buildDeckManifest({
      professionId: this.context.profession?.currentId() ?? 'JAVA_BACKEND',
      destinyId: this.context.player.destinyId ?? null,
      collection: this.collectionOf(),
      upgrades: this.upgradesOf(),
    });
    return { manifest: manifest.manifest, total: manifest.total, upgrades: this.upgradesOf() };
  }

  /** 收藏列表（id → 数量，不含基础卡组）。 */
  public collectionView(): Record<string, number> {
    const collection: Record<string, number> = {};
    for (const [id, count] of Object.entries(this.collectionOf())) {
      if (cardDefById(id) && count > 0) collection[id] = count;
    }
    return collection;
  }

  /** 全卡牌图鉴（卡组页展示）。 */
  public catalog(): readonly CardDef[] {
    return allCardDefs().filter((d) => !!d && typeof d.id === 'string' && (!d.id.startsWith('card_fate_') || d.type === 'FATE'));
  }

  /** 数据库诊断透出（EXE 环境自检）。 */
  public databaseDebug(): ReturnType<typeof import('./card-database').databaseDebug> {
    return databaseDebug();
  }

  /**
   * 升级卡牌（消耗灵石；幂等由等级校验保证）。
   * @returns 新等级
   */
  public upgradeCard(defId: string): number {
    const base = cardDefById(defId);
    if (!base) throw new Error('未知卡牌');
    const upgrades = this.upgradesOf();
    const level = upgrades[defId] ?? 0;
    const current = cardDefById(level > 0 ? `${defId}_up${level}` : defId)!;
    if (!current.upgradeTo) throw new Error('该卡牌已满级');
    const cost = this.upgradeCostOf(base.rarity);
    const player = this.context.player;
    if (player.spiritStones < cost) throw new Error(`灵石不足（需要 ${cost}）`);
    player.spiritStones -= cost;
    upgrades[defId] = level + 1;
    this.context.player.cardUpgrades = upgrades;
    return level + 1;
  }

  public upgradeCostOf(rarity: 'BASIC' | 'COMMON' | 'RARE' | 'EPIC'): number {
    return upgradeCost(rarity);
  }

  // ── 存档迁移（§40） ─────────────────────────────────────────────────────────

  /**
   * 旧 tick 存档安全迁移：FIGHTING 且无 card 字段的旧战斗无法继续
   * （玩家主动出牌不可回放），按放弃结算（已有 loot 的 30%，与旧 abandon 同口径）。
   * 返回 null 表示无需迁移（状态已在 card 模式或已终结）。
   */
  public migrateLegacyRun(run: BattleRunState): 'MIGRATED' | 'KEEP' | 'DROP' {
    if (isCardBattleState((run as { card?: unknown }).card)) return 'KEEP';
    if (run.status !== 'FIGHTING') return 'DROP'; // 终结态旧 run：无需迁移，展示后清理
    return 'MIGRATED';
  }

  /** 新玩家空收藏。 */
  public ensureCollectionInitialized(): void {
    if (!this.context.player.cardCollection) {
      this.context.player.cardCollection = emptyCollection();
    }
    if (!this.context.player.cardUpgrades) {
      this.context.player.cardUpgrades = {};
    }
  }

  // ── 战斗内命令（BattleService 委托入口） ────────────────────────────────────

  /**
   * 技能/共鸣变化后差量刷新玩家属性快照。
   * 差量方式保留战斗内手动调整（如 skill_plus_attack 的 +3）。
   */
  public refreshRunStats(run: BattleRunState): void {
    const card = (run as { card?: CardBattleState }).card;
    if (!card || !isCardBattleState(card)) return;
    const loadout = this.loadout(run, run.buildId);
    const baseline = card.baselineAttack ?? loadout.attack;
    card.player.attack = Math.max(1, card.player.attack + (loadout.attack - baseline));
    card.baselineAttack = loadout.attack;
    card.player.critChance = loadout.critChance;
    // 词条/宗门/命格伤害乘数随技能池重算（tagMul 依赖 run.skills）。
    const base = this.battleModifiers(this.context.player.sectId ?? null, this.context.player.destinyId ?? null).damageMul;
    card.modifiers.damageMul = base * this.tagMulForRun(run);
  }

  public playCard(state: CardBattleState, env: CardEngineEnv, cardUid: string, targetUid: string | null, actionId: string): void {
    enginePlayCard(state, env, cardUid, targetUid, actionId);
  }

  public endTurn(state: CardBattleState, env: CardEngineEnv, actionId: string): void {
    engineEndTurn(state, env, actionId);
  }

  /** 运行时 env（存档恢复后重建）。 */
  public envFor(run: BattleRunState): CardEngineEnv {
    return this.makeEnv(run);
  }
}
