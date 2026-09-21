import battleConfig from '../../configs/v3/battle-content.json';
import type { GameContext } from '../core/game-context';
import type { AssignedTaskState } from '../model/save-data';

// ── 内容定义 ─────────────────────────────────────────────────────────────────

export type MonsterTier = 'NORMAL' | 'ELITE' | 'BOSS';

export interface MonsterDef {
  readonly id: string;
  readonly name: string;
  readonly tier: MonsterTier;
  readonly hp: number;
  readonly attack: number;
  readonly intervalSec: number;
  readonly exp: number;
  readonly mechanic?: 'SLOW' | 'SUMMON' | 'SUMMON_SMALL' | 'RANDOM';
}

export interface SkillDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly damageMul?: number;
  readonly intervalMul?: number;
  readonly shieldBonus?: number;
  readonly healPerKill?: number;
  readonly critBonus?: number;
  readonly damageReduce?: number;
  readonly enemySlow?: number;
  readonly evolvesTo?: string | null;
}

export interface BuildDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly baseHp: number;
  readonly baseAttack: number;
  readonly intervalSec: number;
  readonly startSkill: string;
  readonly critChance: number;
  readonly lootBonus: number;
}

export const BATTLE_BUILDS: readonly BuildDef[] = (battleConfig as unknown as BattleBundle).builds;
export const MONSTER_MAP: ReadonlyMap<string, MonsterDef> = new Map(
  (battleConfig as unknown as BattleBundle).monsters.map((m) => [m.id, m]),
);
export const SKILL_MAP: ReadonlyMap<string, SkillDef> = new Map(
  (battleConfig as unknown as BattleBundle).skills.map((s) => [s.id, s]),
);
const WAVES = (battleConfig as unknown as BattleBundle).waves;
const LOOT_TABLE = (battleConfig as unknown as BattleBundle).lootTable;
const LOOT_MATERIALS: readonly string[] = (battleConfig as unknown as BattleBundle).lootMaterials;
const LOOT_EQUIPMENT: readonly string[] = (battleConfig as unknown as BattleBundle).lootEquipment;

interface BattleBundle {
  builds: BuildDef[];
  monsters: MonsterDef[];
  skills: SkillDef[];
  lootTable: Record<MonsterTier, { materialChance: number; equipmentChance: number; spiritStones: [number, number] }>;
  lootMaterials: string[];
  lootEquipment: string[];
  waves: { count: number; tiers: MonsterTier[] }[];
}

// ── 运行时状态 ───────────────────────────────────────────────────────────────

export interface BattleEnemyState {
  readonly uid: string;
  readonly defId: string;
  readonly name: string;
  readonly tier: MonsterTier;
  hp: number;
  readonly maxHp: number;
  readonly attack: number;
  /** 可被"需求冻结"等减速技能延长。 */
  intervalSec: number;
  attackTimer: number;
  readonly mechanic?: MonsterDef['mechanic'];
}

export interface BattleRunState {
  readonly runId: string;
  readonly source: 'PROJECT' | 'INCIDENT';
  readonly linkedTaskId: string | null;
  readonly linkedIncidentId: string | null;
  readonly buildId: string;
  readonly night: boolean;
  readonly dayIndex: number;
  /** 状态：战斗中 / 升级三选一挂起 / 胜利 / 败北。 */
  status: 'FIGHTING' | 'VICTORY' | 'DEFEAT';
  wave: number;
  waveTotal: number;
  playerHp: number;
  playerMaxHp: number;
  shield: number;
  attack: number;
  intervalSec: number;
  critChance: number;
  level: number;
  exp: number;
  expNext: number;
  skills: string[];
  /** 三选一挂起的候选（为空表示无需选择）。 */
  skillOffers: string[] | null;
  enemies: BattleEnemyState[];
  kills: number;
  loot: { materials: Record<string, number>; equipment: string[]; spiritStones: number; expGained: number };
  /** 奖励只发一次（§314 exactly once）。 */
  rewardsClaimed: boolean;
  /** 最近若干条战斗日志（伤害数字/事件），UI 展示用。 */
  log: string[];
}

const MAX_LOG = 12;
const SPIRIT_MAX = 9_999_999;

/**
 * V4 项目战斗竖切（§60~§90）。
 *
 * 定位：工作任务/事故即副本——"进入项目"开启一次 5 波推进（3 普通 → 精英 → Boss），
 * 自动攻击 + 升级三选一 + Build 差异 + 掉落。战斗在 GameLoop 中以秒推进，
 * 与工作日时间同源：工作时段刷本=上班，夜班/加班获得 Night Modifier（怪更强掉落略多，
 * §89），疲劳降低战斗效率（§90）。奖励 exactly once（§314）。
 */
export class BattleService {
  private readonly rng: () => number;

  public constructor(private readonly context: GameContext, rng?: () => number) {
    // 可注入种子化 rng（测试确定性）；运行时默认 Math.random。
    this.rng = rng ?? Math.random;
  }

  public current(): BattleRunState | null {
    const run = this.storedRun();
    return run && run.status === 'FIGHTING' ? run : null;
  }

  public finished(): BattleRunState | null {
    const run = this.storedRun();
    return run && run.status !== 'FIGHTING' ? run : null;
  }

  public buildOptions(): readonly BuildDef[] {
    return BATTLE_BUILDS;
  }

  /** 技能定义表（三选一 UI 展示用）。 */
  public skillDefs(): readonly SkillDef[] {
    return [...SKILL_MAP.values()];
  }

  /** 是否允许开本：工作日工作时段 / 加班会话 / 周末主动渡劫（随 gameDay 存在即可）。 */
  public canStart(): boolean {
    if (this.current()) return false;
    return !!this.context.player.gameDay;
  }

  public start(source: 'PROJECT' | 'INCIDENT', buildId: string, linkedTaskId: string | null = null, linkedIncidentId: string | null = null): BattleRunState {
    const build = BATTLE_BUILDS.find((b) => b.id === buildId);
    if (!build) throw new Error('未知的 Build');
    if (this.current()) throw new Error('已有进行中的战斗');
    const day = this.context.player.gameDay;
    if (!day) throw new Error('尚未开工');
    const hour = new Date(this.context.clockV2.now()).getHours();
    const overtimeActive = this.context.overtime.current()?.status === 'ACTIVE';
    const night = overtimeActive && (hour >= 20 || hour < 6);
    const fatigueMul = this.fatigueAttackMul();

    const run: BattleRunState = {
      runId: `run_${Date.now().toString(36)}_${Math.floor(this.rng() * 1e4).toString(36)}`,
      source,
      linkedTaskId,
      linkedIncidentId,
      buildId: build.id,
      night,
      dayIndex: day.dayIndex,
      status: 'FIGHTING',
      wave: 0,
      waveTotal: WAVES.length,
      playerHp: build.baseHp,
      playerMaxHp: build.baseHp,
      shield: 0,
      attack: Math.max(1, Math.floor(build.baseAttack * fatigueMul)),
      intervalSec: build.intervalSec,
      critChance: build.critChance,
      level: 1,
      exp: 0,
      expNext: 30,
      skills: [build.startSkill],
      skillOffers: null,
      enemies: [],
      kills: 0,
      loot: { materials: {}, equipment: [], spiritStones: 0, expGained: 0 },
      rewardsClaimed: false,
      log: [night ? '夜间加班：怪物更强，掉落更多。' : '你进入了项目。'],
    };
    this.context.player.activeBattleRun = run;
    this.spawnWave(run);
    this.context.events.emit('playerChanged', { reason: 'battleStarted', mode: this.context.player.workMode });
    return run;
  }

  /** GameLoop 每 tick 调用（§ 核心自动战斗）。 */
  public tick(seconds: number): void {
    const run = this.current();
    if (!run || run.status !== 'FIGHTING') return;
    if (!Number.isFinite(seconds) || seconds <= 0) return;

    const player = this.playerSkillStats(run);
    let remaining = seconds;
    // 以玩家攻击间隔为步长推进，保证帧率无关且确定性可测。
    while (remaining > 0 && run.status === 'FIGHTING') {
      const step = Math.min(remaining, Math.max(0.2, player.intervalSec));
      remaining -= step;
      this.stepOnce(run, player, step);
      if (run.skillOffers) break; // 升级三选一挂起，等待玩家选择
    }
    this.persist(run);
  }

  private stepOnce(run: BattleRunState, player: { attack: number; intervalSec: number; critChance: number; damageReduce: number; healPerKill: number }, dt: number): void {
    // 玩家攻击（累计步长按间隔触发一次）
    const enemies = run.enemies.filter((e) => e.hp > 0);
    if (enemies.length > 0) {
      const target = enemies[0];
      const crit = this.rng() < player.critChance;
      const damage = Math.max(1, Math.floor(player.attack * (crit ? 1.8 : 1)));
      target.hp = Math.max(0, target.hp - damage);
      run.log.push(`${crit ? '暴击！' : ''}你对${target.name}造成 ${damage} 伤害`);
      if (target.hp <= 0) this.onEnemyKilled(run, target, player);
    }
    // 敌人行动
    for (const enemy of run.enemies.filter((e) => e.hp > 0)) {
      enemy.attackTimer += dt;
      if (enemy.attackTimer >= enemy.intervalSec) {
        enemy.attackTimer = 0;
        const raw = enemy.attack;
        const damage = Math.max(1, Math.floor(raw * (1 - player.damageReduce)));
        this.takeDamage(run, damage, enemy.name);
        if (run.status !== 'FIGHTING') return;
      }
      // 精英/Boss 机制：召唤小怪（有上限，防止爆炸）
      if (enemy.tier !== 'NORMAL' && (enemy.mechanic === 'SUMMON' || enemy.mechanic === 'SUMMON_SMALL')) {
        const cap = enemy.mechanic === 'SUMMON' ? 4 : 2;
        if (run.enemies.filter((e) => e.hp > 0).length < cap + 1 && this.rng() < 0.02 * dt) {
          this.addEnemy(run, 'mon_req_change');
          run.log.push(`${enemy.name} 召唤了需求变更魔！`);
        }
      }
    }
    if (run.enemies.every((e) => e.hp <= 0)) {
      this.advanceWave(run);
    }
  }

  private takeDamage(run: BattleRunState, damage: number, sourceName: string): void {
    let rest = damage;
    if (run.shield > 0) {
      const absorbed = Math.min(run.shield, rest);
      run.shield -= absorbed;
      rest -= absorbed;
    }
    run.playerHp = Math.max(0, run.playerHp - rest);
    if (rest > 0) run.log.push(`${sourceName} 对你造成 ${rest} 伤害`);
    if (run.playerHp <= 0) {
      run.status = 'DEFEAT';
      run.log.push('你被需求淹没了……下次记得先升满 Build。');
      this.claimRewards(run, true);
    }
  }

  private onEnemyKilled(run: BattleRunState, enemy: BattleEnemyState, player: { healPerKill: number }): void {
    run.kills += 1;
    const def = MONSTER_MAP.get(enemy.defId);
    const exp = def?.exp ?? 10;
    run.exp += exp;
    run.loot.expGained += exp;
    if (player.healPerKill > 0) {
      run.playerHp = Math.min(run.playerMaxHp, run.playerHp + player.healPerKill);
    }
    this.rollLoot(run, enemy.tier);
    run.log.push(`击杀 ${enemy.name}（+${exp} 修为）`);
    // 升级检测（可能连升）
    while (run.exp >= run.expNext) {
      run.exp -= run.expNext;
      run.level += 1;
      run.expNext = Math.floor(run.expNext * 1.5);
      run.attack += 2;
      run.playerHp = Math.min(run.playerMaxHp, run.playerHp + 10);
      if (!run.skillOffers) run.skillOffers = this.rollSkillOffers(run);
      run.log.push(`升级！Lv${run.level}（选择新技能）`);
    }
  }

  private rollSkillOffers(run: BattleRunState): string[] {
    const pool = [...(battleConfig as unknown as BattleBundle).skills];
    const owned = new Set(run.skills);
    // 优先：已拥有技能的进化；其次：未拥有的基础技能
    const evolutionOptions = run.skills
      .map((id) => SKILL_MAP.get(id)?.evolvesTo)
      .filter((id): id is string => !!id && !owned.has(id));
    const freshOptions = pool
      .filter((s) => !owned.has(s.id) && !run.skills.some((ownedId) => SKILL_MAP.get(ownedId)?.evolvesTo === s.id))
      .map((s) => s.id);
    const picks: string[] = [];
    for (const evo of evolutionOptions) {
      if (picks.length < 3) picks.push(evo);
    }
    for (const fresh of freshOptions) {
      if (picks.length < 3) picks.push(fresh);
    }
    // 候选不足时以"攻击强化"占位（id 不在技能表，选择时视为 +3 攻击）
    while (picks.length < 3) picks.push('skill_plus_attack');
    return picks;
  }

  /** 升级三选一：选择技能或强化攻击（§78）。 */
  public chooseSkill(skillId: string | null): BattleRunState {
    const run = this.current();
    if (!run || run.status !== 'FIGHTING') throw new Error('没有进行中的战斗');
    if (!run.skillOffers) throw new Error('当前没有待选择的技能');
    if (skillId !== null && !run.skillOffers.includes(skillId)) throw new Error('无效的技能选择');
    if (skillId === 'skill_plus_attack' || skillId === null) {
      run.attack += 3;
      run.log.push('你选择强化攻击（+3）。');
    } else {
      const def = SKILL_MAP.get(skillId);
      if (!def) throw new Error('无效的技能选择');
      run.skills.push(skillId);
      // 护盾与敌方减速在习得时一次性生效（不随 tick 叠加）。
      if (def.shieldBonus) run.shield += def.shieldBonus;
      if (def.enemySlow) {
        run.enemies.forEach((enemy) => {
          enemy.intervalSec = Math.min(6, enemy.intervalSec * (1 + def.enemySlow!));
        });
      }
      run.log.push(`习得【${def.name}】`);
    }
    run.skillOffers = null;
    this.persist(run);
    return run;
  }

  /** 主动放弃（不拿 Boss 奖励）。 */
  public abandon(): void {
    const run = this.current();
    if (!run) return;
    run.status = 'DEFEAT';
    run.log.push('你退出了项目。');
    this.claimRewards(run, true);
    this.persist(run);
  }

  /** 清除已结束的战斗（UI 展示结算弹窗后调用）。 */
  public dismissFinished(): void {
    const run = this.context.player.activeBattleRun as BattleRunState | null | undefined;
    if (run && run.status !== 'FIGHTING') this.context.player.activeBattleRun = null;
  }

  private fatigueAttackMul(): number {
    const fatigue = this.context.player.overtimeFatigue;
    if (fatigue === 'EXHAUSTED') return 0.75;
    if (fatigue === 'TIRED') return 0.9;
    return 1;
  }

  private spawnWave(run: BattleRunState): void {
    if (run.wave >= run.waveTotal) return;
    const wave = WAVES[run.wave];
    run.enemies = [];
    for (let i = 0; i < wave.count; i += 1) {
      const tier = wave.tiers[Math.min(i, wave.tiers.length - 1)];
      const candidates = [...MONSTER_MAP.values()].filter((m) => m.tier === tier);
      const def = candidates[Math.floor(this.rng() * candidates.length)];
      if (def) this.addEnemy(run, def.id);
    }
    run.log.push(`第 ${run.wave + 1}/${run.waveTotal} 波：${run.enemies.map((e) => e.name).join('、')}`);
    const boss = run.enemies.find((e) => e.tier === 'BOSS');
    if (boss) run.log.push('⚠️ Boss 出现！');
  }

  private addEnemy(run: BattleRunState, defId: string): void {
    const def = MONSTER_MAP.get(defId);
    if (!def) return;
    const nightMul = run.night ? 1.25 : 1;
    run.enemies.push({
      uid: `${def.id}_${Math.floor(this.rng() * 1e6).toString(36)}`,
      defId: def.id,
      name: def.name,
      tier: def.tier,
      hp: Math.floor(def.hp * nightMul),
      maxHp: Math.floor(def.hp * nightMul),
      attack: Math.max(1, Math.floor(def.attack * nightMul)),
      intervalSec: def.intervalSec,
      attackTimer: 0,
      mechanic: def.mechanic,
    });
  }

  private advanceWave(run: BattleRunState): void {
    run.wave += 1;
    if (run.wave >= run.waveTotal) {
      run.status = 'VICTORY';
      run.log.push('项目交付！Boss 已被超度。');
      this.claimRewards(run, false);
      return;
    }
    // 波间喘息：回复 25% 最大生命，让长线推进成为可能。
    run.playerHp = Math.min(run.playerMaxHp, run.playerHp + Math.floor(run.playerMaxHp * 0.25));
    this.spawnWave(run);
  }

  private rollLoot(run: BattleRunState, tier: MonsterTier): void {
    const table = LOOT_TABLE[tier];
    const bonus = BATTLE_BUILDS.find((b) => b.id === run.buildId)?.lootBonus ?? 0;
    const nightBonus = run.night ? 0.1 : 0;
    if (this.rng() < table.materialChance) {
      const mat = LOOT_MATERIALS[Math.floor(this.rng() * LOOT_MATERIALS.length)];
      const count = 1 + (this.rng() < bonus + nightBonus ? 1 : 0);
      run.loot.materials[mat] = (run.loot.materials[mat] ?? 0) + count;
    }
    if (this.rng() < table.equipmentChance + nightBonus) {
      const eq = LOOT_EQUIPMENT[Math.floor(this.rng() * LOOT_EQUIPMENT.length)];
      if (!run.loot.equipment.includes(eq)) run.loot.equipment.push(eq);
    }
    const [min, max] = table.spiritStones;
    run.loot.spiritStones += min + Math.floor(this.rng() * (max - min + 1));
  }

  /** 结算奖励：胜利全拿 + 完成关联任务/事故；败北/放弃只有已拾取掉落的 30%。 */
  private claimRewards(run: BattleRunState, defeated: boolean): void {
    if (run.rewardsClaimed) return;
    run.rewardsClaimed = true;
    const player = this.context.player;
    const scale = defeated ? 0.3 : 1;
    for (const [mat, count] of Object.entries(run.loot.materials)) {
      const n = Math.max(1, Math.floor(count * scale));
      this.context.v2Items.addMaterial(mat, n);
      this.context.gameDay.addMaterialsGained(n);
    }
    for (const eq of run.loot.equipment) {
      if (!player.ownedEquipment.includes(eq)) player.ownedEquipment.push(eq);
    }
    if (run.loot.spiritStones > 0) {
      const stones = Math.max(1, Math.floor(run.loot.spiritStones * scale));
      player.spiritStones = Math.min(SPIRIT_MAX, player.spiritStones + stones);
      run.loot.spiritStones = stones;
    }
    // Boss 胜利 → 完成关联指派任务（§87）
    if (!defeated && run.linkedTaskId) {
      const task = player.assignedTasks.find((t: AssignedTaskState) => t.id === run.linkedTaskId && t.status === 'OPEN');
      if (task) this.context.assignedTasks.complete(task.id);
    }
    // 事故副本胜利 → 直接恢复（副本修复=处置时长，§88）
    if (!defeated && run.linkedIncidentId) {
      const incident = this.context.incidents.active();
      if (incident && incident.id === run.linkedIncidentId) {
        try {
          const required = this.context.incidents.requiredMitigationSeconds(incident);
          this.context.incidents.mitigate(incident.id, Math.max(0, required - incident.mitigationSeconds));
          this.context.incidents.recover(incident.id, '项目副本修复完成');
        } catch { /* 事故已恢复则忽略 */ }
      }
    }
    this.context.player.lifetimeStats = {
      ...this.context.player.lifetimeStats,
      battleRunsDone: (this.context.player.lifetimeStats.battleRunsDone ?? 0) + 1,
      bossKills: (this.context.player.lifetimeStats.bossKills ?? 0) + (run.kills > 0 && !defeated ? 1 : 0),
    };
    this.persist(run);
    // Persist the reward marker with the terminal state, before the UI can
    // acknowledge the result. This makes a restart observe the same run.
    this.context.saveService.save(this.context.player);
  }

  private playerSkillStats(run: BattleRunState): { attack: number; intervalSec: number; critChance: number; damageReduce: number; healPerKill: number } {
    let damageMul = 0;
    let intervalMul = 0;
    let critBonus = 0;
    let damageReduce = 0;
    let healPerKill = 0;
    for (const id of run.skills) {
      const skill = SKILL_MAP.get(id);
      if (!skill) continue;
      damageMul += skill.damageMul ?? 0;
      intervalMul += skill.intervalMul ?? 0;
      critBonus += skill.critBonus ?? 0;
      damageReduce += skill.damageReduce ?? 0;
      healPerKill += skill.healPerKill ?? 0;
    }
    return {
      attack: run.attack * (1 + damageMul),
      intervalSec: Math.max(0.3, run.intervalSec * (1 + Math.max(-0.7, intervalMul))),
      critChance: Math.min(0.8, run.critChance + critBonus),
      damageReduce: Math.min(0.6, damageReduce),
      healPerKill,
    };
  }

  private persist(run: BattleRunState): void {
    this.context.player.activeBattleRun = { ...run, log: run.log.slice(-MAX_LOG) };
  }

  /** Old or corrupted saves must never become a fake active battle. */
  private storedRun(): BattleRunState | null {
    const candidate = this.context.player.activeBattleRun;
    if (isBattleRunState(candidate)) return candidate;
    if (candidate !== null && candidate !== undefined) this.context.player.activeBattleRun = null;
    return null;
  }
}

function isBattleRunState(value: unknown): value is BattleRunState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  if (typeof run.runId !== 'string' || run.runId.length === 0) return false;
  if (run.source !== 'PROJECT' && run.source !== 'INCIDENT') return false;
  if (run.status !== 'FIGHTING' && run.status !== 'VICTORY' && run.status !== 'DEFEAT') return false;
  if (typeof run.buildId !== 'string' || !BATTLE_BUILDS.some((build) => build.id === run.buildId)) return false;
  if (!Number.isSafeInteger(run.wave) || !Number.isSafeInteger(run.waveTotal) || !Number.isSafeInteger(run.level)) return false;
  if (!Array.isArray(run.skills) || !run.skills.every((skill) => typeof skill === 'string')) return false;
  if (!Array.isArray(run.enemies) || !Array.isArray(run.log) || !run.log.every((entry) => typeof entry === 'string')) return false;
  if (!run.loot || typeof run.loot !== 'object' || Array.isArray(run.loot)) return false;
  const loot = run.loot as Record<string, unknown>;
  return typeof loot.materials === 'object' && loot.materials !== null && Array.isArray(loot.equipment) && typeof loot.spiritStones === 'number' && typeof loot.expGained === 'number';
}
