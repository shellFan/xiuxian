import type { GameContext } from '../core/game-context';
import type { AssignedTaskState } from '../model/save-data';
import {
  ALL_BUILDS,
  ALL_SKILLS,
  BUILD_MAP,
  EVOLUTIONS,
  LOOT_EQUIPMENT,
  LOOT_MATERIALS,
  LOOT_TABLE,
  MONSTER_MAP,
  SKILL_MAP,
  SYNERGIES,
  WAVES,
  evolutionForBase,
  bossMechanicsFor,
  type BuildDef,
  type EvolutionOption,
  type MonsterDef,
  type MonsterTier,
  type SkillDef,
  type BossMechanic,
} from '../v57/battle-merge';
import { fishBuildId } from '../v57/profession-content-service';

// ── 运行时状态 ───────────────────────────────────────────────────────────────

export interface BattleEnemyState {
  readonly uid: string;
  readonly defId: string;
  name: string;
  readonly tier: MonsterTier;
  hp: number;
  readonly maxHp: number;
  attack: number;
  /** 可被"需求冻结"等减速技能延长。 */
  intervalSec: number;
  attackTimer: number;
  readonly mechanic?: MonsterDef['mechanic'];
  /** V5.7 Boss 机制计时（uid → kind → 已累计秒）。 */
  timers?: Record<string, number>;
  /** V5.7 Telegraph 已预警标记（uid → kind）。 */
  telegraphed?: Record<string, boolean>;
  /** 死锁双尊 link 组。 */
  linkGroup?: string;
  /** 已复活次数（REVIVE）。 */
  revived?: number;
  /** Boss 已进入 ENRAGE。 */
  enraged?: boolean;
  /** V5.8 Boss Phase 2（HP 阈值触发，行为真实改变）。 */
  phase2Active?: boolean;
}

export interface BossDropRecord {
  readonly equipmentId: string;
  readonly viaPity: boolean;
  readonly bossName: string;
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
  /** 技能等级（base=1 → v2=2 → 进化=3）。 */
  skillLevels?: Record<string, number>;
  /** 本次运行内已选的进化 option id。 */
  evolvedSkills?: string[];
  /** 已激活的道法共鸣（synergy id）。 */
  synergies?: string[];
  /** 三选一挂起的候选（为空表示无需选择）。 */
  skillOffers: string[] | null;
  /** 挂起候选类型：'skill'（新技能/升级）| 'evolution'（Lv3 二选一）。 */
  skillOfferKind?: 'skill' | 'evolution' | null;
  enemies: BattleEnemyState[];
  kills: number;
  loot: { materials: Record<string, number>; equipment: string[]; spiritStones: number; expGained: number };
  /** Boss 专属掉落（掉落卡片展示用）。 */
  bossDrops?: BossDropRecord[];
  /** LOCK_SKILL：被禁用的技能与剩余秒。 */
  lockedSkill?: string | null;
  lockedSeconds?: number;
  /** BLIND：失明剩余秒（攻击 miss）。 */
  blindSeconds?: number;
  /** ATTACK_SPEED_DEBUFF：减速剩余秒与幅度。 */
  slowedSeconds?: number;
  slowedMul?: number;
  /** 战斗累计秒（Boss 机制计时基准）。 */
  runSeconds?: number;
  /** 免疫窗口就绪时间点（缓存结界/监控流：每 X 秒挡一次 Boss 重击）。 */
  immuneReadyAt?: number;
  /** 灾备重生（reviveOnce）是否已用。 */
  usedRevive?: boolean;
  /** 奖励只发一次（§314 exactly once）。 */
  rewardsClaimed: boolean;
  /** 复盘重刷（历史 Boss 回忆，不掉历史结局）。 */
  replayOf?: string | null;
  /** 最近若干条战斗日志（伤害数字/事件），UI 展示用。 */
  log: string[];
}

const MAX_LOG = 12;
const SPIRIT_MAX = 9_999_999;

/**
 * V4 项目战斗竖切（§60~§90）+ V5.7 深化。
 *
 * V5.7 新增：职业 Build 分家（buildOptions 只出本职业+摸鱼）、Boss 机制引擎
 * （SUMMON/RAGE/ENRAGE/LINKED/REVIVE/LOCK_SKILL/ATTACK_SPEED_DEBUFF/HP_DRAIN/
 * PROMOTE_MINION/DODGE/BLIND + Telegraph 预警）、技能 Lv3 进化二选一（行为分叉，
 * 持久化 skillEvolutions）、道法共鸣 Synergy runtime、装备 Affix/套装战斗聚合、
 * Boss 专属掉落 + 轻量保底 Pity。
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

  /** V5.7 职业分家：Build 选项 = 本职业 Build + 摸鱼流。 */
  public buildOptions(): readonly BuildDef[] {
    const allowed = new Set(this.context.professionContent?.buildIds() ?? [fishBuildId()]);
    const options = ALL_BUILDS.filter((b) => allowed.has(b.id));
    return options.length > 0 ? options : ALL_BUILDS;
  }

  /** 技能定义表（三选一 UI 展示用）。 */
  public skillDefs(): readonly SkillDef[] {
    return ALL_SKILLS;
  }

  /** 职业页：道法共鸣视图（含激活态）。 */
  public synergyViews(): { id: string; name: string; desc: string; active: boolean }[] {
    const active = new Set([...(this.current()?.synergies ?? []), ...this.permanentSynergies()]);
    const prof = this.context.profession?.currentId();
    return SYNERGIES.filter((s) => !prof || s.profession === prof)
      .map((s) => ({ id: s.id, name: s.name, desc: s.desc, active: active.has(s.id) }));
  }

  /** 跨 run 永久共鸣（存档 synergyDiscovered）。 */
  public permanentSynergies(): string[] {
    return [...(this.context.player.synergyDiscovered ?? [])];
  }

  /** 是否允许开本：工作日工作时段 / 加班会话 / 周末主动渡劫（随 gameDay 存在即可）。 */
  public canStart(): boolean {
    if (this.current()) return false;
    return !!this.context.player.gameDay;
  }

  public start(source: 'PROJECT' | 'INCIDENT', buildId: string, linkedTaskId: string | null = null, linkedIncidentId: string | null = null, options: { replayBossId?: string; replayOf?: string } = {}): BattleRunState {
    this.equipmentCache = null;
    const build = BUILD_MAP.get(buildId) ?? ALL_BUILDS.find((b) => b.id === buildId);
    if (!build) throw new Error('未知的 Build');
    if (this.current()) throw new Error('已有进行中的战斗');
    const day = this.context.player.gameDay;
    if (!day) throw new Error('尚未开工');
    const hour = new Date(this.context.clockV2.now()).getHours();
    const overtimeActive = this.context.overtime.current()?.status === 'ACTIVE';
    const night = overtimeActive && (hour >= 20 || hour < 6);
    const fatigueMul = this.fatigueAttackMul();
    const eq = this.equipmentStats();
    const maxHp = build.baseHp + eq.maxHpBonus;

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
      playerHp: maxHp,
      playerMaxHp: maxHp,
      shield: Math.max(0, Math.round(eq.shieldBonus)),
      attack: Math.max(1, Math.floor(build.baseAttack * fatigueMul)),
      intervalSec: build.intervalSec,
      critChance: build.critChance,
      level: 1,
      exp: 0,
      expNext: 30,
      skills: [build.startSkill],
      skillLevels: { [build.startSkill]: 1 },
      evolvedSkills: [],
      synergies: [],
      skillOffers: null,
      skillOfferKind: null,
      enemies: [],
      kills: 0,
      loot: { materials: {}, equipment: [], spiritStones: 0, expGained: 0 },
      bossDrops: [],
      lockedSkill: null,
      lockedSeconds: 0,
      blindSeconds: 0,
      slowedSeconds: 0,
      slowedMul: 1,
      runSeconds: 0,
      immuneReadyAt: 0,
      usedRevive: false,
      rewardsClaimed: false,
      replayOf: options.replayOf ?? null,
      log: [night ? '夜间加班：怪物更强，掉落更多。' : '你进入了项目。'],
    };
    // 职业等级 perk：被动/技能免费领悟
    const perks = this.context.professionContent?.perkAggregate();
    if (perks) {
      for (const passiveId of perks.unlockedPassives) {
        if (!run.skills.includes(passiveId) && SKILL_MAP.has(passiveId)) {
          run.skills.push(passiveId);
          run.skillLevels![passiveId] = 1;
          run.log.push(`职业被动【${SKILL_MAP.get(passiveId)?.name ?? passiveId}】生效`);
        }
      }
      for (const skillId of perks.unlockedSkills) {
        if (!run.skills.includes(skillId) && SKILL_MAP.has(skillId)) {
          run.skills.push(skillId);
          run.skillLevels![skillId] = 1;
        }
      }
    }
    this.context.player.activeBattleRun = run;
    this.spawnWave(run, options.replayBossId);
    this.evaluateSynergies(run);
    this.context.events.emit('playerChanged', { reason: 'battleStarted', mode: this.context.player.workMode });
    return run;
  }

  /** V5.5 §20：主动释放技能——立即结算一次攻击步，并触发技能（若有定义行为）。 */
  public castSkill(skillId: string): void {
    const run = this.current();
    if (!run) throw new Error('没有进行中的战斗');
    if (!run.skills.includes(skillId)) throw new Error('尚未领悟该技能');
    if (run.lockedSkill === skillId) throw new Error('该技能被 Boss 禁用了！');
    const player = this.playerSkillStats(run);
    this.stepOnce(run, player, player.intervalSec);
    run.log.push('你主动发动【' + (SKILL_MAP.get(skillId)?.name ?? skillId) + '】');
    this.persist(run);
  }

  /** GameLoop 每 tick 调用（§ 核心自动战斗）。 */
  public tick(seconds: number): void {
    const run = this.current();
    if (!run || run.status !== 'FIGHTING') return;
    if (!Number.isFinite(seconds) || seconds <= 0) return;

    run.runSeconds = (run.runSeconds ?? 0) + seconds;
    if (run.lockedSeconds && run.lockedSeconds > 0) {
      run.lockedSeconds = Math.max(0, run.lockedSeconds - seconds);
      if (run.lockedSeconds === 0) {
        run.log.push('技能解禁。');
        run.lockedSkill = null;
      }
    }
    if (run.blindSeconds && run.blindSeconds > 0) run.blindSeconds = Math.max(0, run.blindSeconds - seconds);
    if (run.slowedSeconds && run.slowedSeconds > 0) {
      run.slowedSeconds = Math.max(0, run.slowedSeconds - seconds);
      if (run.slowedSeconds === 0) run.slowedMul = 1;
    }

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

  private stepOnce(run: BattleRunState, player: PlayerStats, dt: number): void {
    // 玩家攻击（累计步长按间隔触发一次）
    const enemies = run.enemies.filter((e) => e.hp > 0);
    if (enemies.length > 0) {
      const blind = (run.blindSeconds ?? 0) > 0 && this.rng() < 0.5;
      if (blind) {
        run.log.push('眼前一片白，这一击落空了……');
      } else {
        const targets = player.aoe ? enemies : [enemies[0]];
        for (const target of targets) {
          const crit = this.rng() < player.critChance;
          const specialtyMul = this.context.profession?.specialtyMultiplier(target.defId) ?? 1;
          let damage = Math.max(1, Math.floor(player.attack * specialtyMul * (crit ? 1.8 : 1)));
          // 执行加成（覆盖索引/极限审判）：Boss 残血伤害翻倍
          if (player.executePct > 0 && target.maxHp > 0 && target.hp / target.maxHp <= player.executePct) {
            damage = Math.floor(damage * 2);
            run.log.push(`${target.name} 露出破绽！伤害翻倍！`);
          }
          // Boss 闪避（DODGE 机制）
          if (target.tier === 'BOSS' && (target.timers?.['__dodgeActive'] ?? 0) > 0) {
            target.timers!['__dodgeActive'] = 0;
            run.log.push(`${target.name} 消失了，攻击落空！`);
            continue;
          }
          target.hp = Math.max(0, target.hp - damage);
          run.log.push(`${crit ? '暴击！' : ''}你对${target.name}造成 ${damage} 伤害`);
          if (target.hp <= 0) this.onEnemyKilled(run, target, player);
          if (run.status !== 'FIGHTING') return;
        }
      }
    }
    // 敌人行动 + Boss 机制引擎
    for (const enemy of run.enemies.filter((e) => e.hp > 0)) {
      this.runEnemyMechanics(run, enemy, player, dt);
      if (run.status !== 'FIGHTING') return;
      enemy.attackTimer += dt;
      if (enemy.attackTimer >= enemy.intervalSec) {
        enemy.attackTimer = 0;
        const raw = enemy.attack;
        // 免疫窗口（缓存结界/永不宕机）：周期性免疫 Boss 重击
        const immuneEvery = player.immuneEverySec;
        if (enemy.tier === 'BOSS' && immuneEvery > 0 && (run.runSeconds ?? 0) >= (run.immuneReadyAt ?? 0)) {
          run.immuneReadyAt = (run.runSeconds ?? 0) + immuneEvery;
          run.log.push('【道法共鸣】结界挡下了这一击！');
        } else {
          const damage = Math.max(1, Math.floor(raw * (1 - player.damageReduce)));
          this.takeDamage(run, damage, enemy.name, player);
        }
        if (run.status !== 'FIGHTING') return;
      }
      // V5.6 兼容：普通 SUMMON 机制（有上限，防止爆炸）
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

  /** V5.7 Boss 机制引擎：Telegraph 预警 → 触发。 */
  private runEnemyMechanics(run: BattleRunState, enemy: BattleEnemyState, player: PlayerStats, dt: number): void {
    const mechDef = bossMechanicsFor(enemy.defId);
    if (!mechDef || enemy.tier !== 'BOSS') return;
    enemy.timers = enemy.timers ?? {};
    enemy.telegraphed = enemy.telegraphed ?? {};
    // ── V5.8 §14.2：Boss Phase 2（HP 阈值，一次性触发，行为真实改变） ──
    if (!enemy.phase2Active && mechDef.phase2 && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= mechDef.phase2.atHpPct) {
      enemy.phase2Active = true;
      const phase = mechDef.phase2;
      enemy.attack = Math.floor(enemy.attack * (phase.attackMul ?? 1));
      if (phase.intervalMul && phase.intervalMul > 0 && phase.intervalMul < 1) enemy.intervalSec = Math.max(0.8, enemy.intervalSec * phase.intervalMul);
      run.log.push(`⛔ Phase 2 —— ${phase.name}！`);
      run.log.push(phase.telegraph);
      this.context.events.emit('bossPhase2', { bossId: enemy.defId, name: enemy.name, phase: phase.name });
    }
    if (enemy.phase2Active && mechDef.phase2) this.runPhase2Continuous(run, enemy, player, dt, mechDef.phase2);
    for (const mechanic of mechDef.mechanics) {
      if (mechanic.kind === 'LINKED' || mechanic.kind === 'REVIVE') continue; // 死亡时处理
      const every = mechanic.everySec ?? 10;
      const acc = (enemy.timers[mechanic.kind] ?? 0) + dt;
      // 预警（1~3 游戏秒）
      if (!enemy.telegraphed[mechanic.kind] && acc >= every - 2) {
        enemy.telegraphed[mechanic.kind] = true;
        run.log.push(`⚠️ ${mechDef.telegraph}`);
      }
      if (acc < every) {
        enemy.timers[mechanic.kind] = acc;
        continue;
      }
      enemy.timers[mechanic.kind] = 0;
      enemy.telegraphed[mechanic.kind] = false;
      this.fireMechanic(run, enemy, mechanic, player, mechDef.telegraph);
      if (run.status !== 'FIGHTING') return;
    }
  }

  /** V5.8 §14.2：Phase 2 持续机制（everySec 简化触发）。 */
  private runPhase2Continuous(run: BattleRunState, enemy: BattleEnemyState, player: PlayerStats, dt: number, phase: import('../v57/battle-merge').BossPhase2Def): void {
    enemy.timers = enemy.timers ?? {};
    if (phase.summonEverySec) {
      const acc = (enemy.timers['P2_SUMMON'] ?? 0) + dt;
      if (acc >= phase.summonEverySec) {
        enemy.timers['P2_SUMMON'] = 0;
        const cap = 4 + (phase.capBonus ?? 0) + player.summonCapBonus;
        if (run.enemies.filter((e) => e.hp > 0).length < cap + 1) {
          const minion = bossMechanicsFor(enemy.defId)?.mechanics.find((m) => m.kind === 'SUMMON')?.minion ?? 'mon_req_change';
          this.addEnemy(run, minion);
          run.log.push(`${enemy.name} 在 ${phase.name} 中召唤了增援！`);
        }
      } else enemy.timers['P2_SUMMON'] = acc;
    }
    if (phase.blindEverySec) {
      const acc = (enemy.timers['P2_BLIND'] ?? 0) + dt;
      if (acc >= phase.blindEverySec) { enemy.timers['P2_BLIND'] = 0; run.blindSeconds = 3; run.log.push(`⛔ ${phase.name}：你看不清战场了！`); }
      else enemy.timers['P2_BLIND'] = acc;
    }
    if (phase.dodgeEverySec) {
      const acc = (enemy.timers['P2_DODGE'] ?? 0) + dt;
      if (acc >= phase.dodgeEverySec) { enemy.timers['P2_DODGE'] = 0; enemy.timers['__dodgeActive'] = 2; }
      else enemy.timers['P2_DODGE'] = acc;
    }
    if (phase.lockSkillEverySec) {
      const acc = (enemy.timers['P2_LOCK'] ?? 0) + dt;
      if (acc >= phase.lockSkillEverySec) {
        enemy.timers['P2_LOCK'] = 0;
        const castable = run.skills.filter((s) => s !== run.lockedSkill);
        if (castable.length > 0) { run.lockedSkill = castable[Math.floor(this.rng() * castable.length)]; run.lockedSeconds = 3; run.log.push(`⛔ ${phase.name}：${SKILL_MAP.get(run.lockedSkill)?.name ?? '技能'}连接中断！`); }
      } else enemy.timers['P2_LOCK'] = acc;
    }
    if (phase.hpDrainEverySec) {
      const acc = (enemy.timers['P2_DRAIN'] ?? 0) + dt;
      if (acc >= phase.hpDrainEverySec) { enemy.timers['P2_DRAIN'] = 0; run.playerMaxHp = Math.max(30, run.playerMaxHp - 5); run.playerHp = Math.min(run.playerHp, run.playerMaxHp); run.log.push(`⛔ ${phase.name}：你的最大生命被吞噬！`); }
      else enemy.timers['P2_DRAIN'] = acc;
    }
    if (phase.promoteEverySec) {
      const acc = (enemy.timers['P2_PROMOTE'] ?? 0) + dt;
      if (acc >= phase.promoteEverySec) {
        enemy.timers['P2_PROMOTE'] = 0;
        const minion = run.enemies.find((e) => e.hp > 0 && e.tier === 'NORMAL' && !e.enraged);
        if (minion) { minion.enraged = true; minion.attack = Math.floor(minion.attack * 1.6); minion.name = `P0·${minion.name}`; run.log.push(`⛔ ${phase.name}：小怪被升级成 P0！`); }
      } else enemy.timers['P2_PROMOTE'] = acc;
    }
    if (phase.debuffPlayerInterval && (!run.slowedSeconds || run.slowedSeconds <= 0)) {
      run.slowedSeconds = 1.5;
      run.slowedMul = 1 + phase.debuffPlayerInterval;
    }
  }

  private fireMechanic(run: BattleRunState, enemy: BattleEnemyState, mechanic: BossMechanic, player: PlayerStats, telegraph: string): void {
    switch (mechanic.kind) {
      case 'SUMMON': {
        const cap = (mechanic.cap ?? 2) + player.summonCapBonus;
        const alive = run.enemies.filter((e) => e.hp > 0).length;
        if (alive < cap + 1 && mechanic.minion) {
          this.addEnemy(run, mechanic.minion);
          run.log.push(`${enemy.name} 召唤了 ${MONSTER_MAP.get(mechanic.minion)?.name ?? mechanic.minion}！`);
        }
        break;
      }
      case 'RAGE': {
        enemy.attack = Math.floor(enemy.attack * (1 + (mechanic.mulPerTick ?? 0.08)));
        run.log.push(`${enemy.name} 越战越怒（攻击提升）！`);
        break;
      }
      case 'ENRAGE': {
        if (!enemy.enraged && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= (mechanic.hpPct ?? 0.3)) {
          enemy.enraged = true;
          enemy.attack = Math.floor(enemy.attack * (mechanic.mul ?? 1.8));
          run.log.push(`${enemy.name} 狂暴了！！`);
        } else {
          enemy.timers![mechanic.kind] = (mechanic.everySec ?? 10) - 0.1; // 未到血线不消耗
        }
        break;
      }
      case 'LOCK_SKILL': {
        const castable = run.skills.filter((s) => s !== run.lockedSkill);
        if (castable.length > 0) {
          run.lockedSkill = castable[Math.floor(this.rng() * castable.length)];
          run.lockedSeconds = mechanic.durationSec ?? 4;
          run.log.push(`【${SKILL_MAP.get(run.lockedSkill)?.name ?? run.lockedSkill}】被切断了连接！`);
        }
        break;
      }
      case 'ATTACK_SPEED_DEBUFF': {
        run.slowedSeconds = mechanic.durationSec ?? 5;
        run.slowedMul = 1 + (mechanic.mul ?? 0.25);
        run.log.push(`${enemy.name} 降低了你的出手速度！`);
        break;
      }
      case 'HP_DRAIN': {
        // 场上有小怪时抽最大生命
        const minions = run.enemies.filter((e) => e.hp > 0 && e.tier === 'NORMAL').length;
        if (minions > 0) {
          run.playerMaxHp = Math.max(30, run.playerMaxHp - (mechanic.amount ?? 8));
          run.playerHp = Math.min(run.playerHp, run.playerMaxHp);
          run.log.push(`${enemy.name} 吞噬内存，你的最大生命下降！（场上小怪在滋养它）`);
        }
        break;
      }
      case 'PROMOTE_MINION': {
        const minion = run.enemies.find((e) => e.hp > 0 && e.tier === 'NORMAL' && !e.enraged);
        if (minion) {
          minion.enraged = true;
          minion.attack = Math.floor(minion.attack * 1.6);
          minion.name = `P0·${minion.name}`;
          run.log.push(`${enemy.name} 把 ${minion.name} 升级成了 P0！`);
        }
        break;
      }
      case 'DODGE': {
        enemy.timers!['__dodgeActive'] = 3;
        run.log.push(`${enemy.name} 的身影变得模糊……`);
        break;
      }
      case 'BLIND': {
        run.blindSeconds = mechanic.durationSec ?? 4;
        run.log.push(`${telegraph} 你暂时看不清战场了！`);
        break;
      }
      case 'RANDOM': {
        const roll = this.rng();
        if (roll < 0.34) this.fireMechanic(run, enemy, { kind: 'RAGE', mulPerTick: 0.1 }, player, telegraph);
        else if (roll < 0.67) this.fireMechanic(run, enemy, { kind: 'BLIND', durationSec: 3 }, player, telegraph);
        else this.fireMechanic(run, enemy, { kind: 'ATTACK_SPEED_DEBUFF', mul: 0.2, durationSec: 4 }, player, telegraph);
        break;
      }
      default:
        break;
    }
  }

  private takeDamage(run: BattleRunState, damage: number, sourceName: string, player: PlayerStats): void {
    let rest = damage;
    if (run.shield > 0) {
      const absorbed = Math.min(run.shield, rest);
      run.shield -= absorbed;
      rest -= absorbed;
    }
    run.playerHp = Math.max(0, run.playerHp - rest);
    if (rest > 0) run.log.push(`${sourceName} 对你造成 ${rest} 伤害`);
    if (run.playerHp <= 0) {
      // 灾备重生（K8s自愈流/永不宕机套）
      if (player.reviveOnce && !run.usedRevive) {
        run.usedRevive = true;
        run.playerHp = Math.max(1, Math.floor(run.playerMaxHp * 0.5));
        run.log.push('【道法共鸣·灾备重生】副本切换，你原地满血复活（50%）！');
        return;
      }
      run.status = 'DEFEAT';
      run.log.push('你被需求淹没了……下次记得先升满 Build。');
      this.claimRewards(run, true);
    }
  }

  private onEnemyKilled(run: BattleRunState, enemy: BattleEnemyState, player: PlayerStats): void {
    run.kills += 1;
    const def = MONSTER_MAP.get(enemy.defId);
    const exp = def?.exp ?? 10;
    run.exp += exp;
    run.loot.expGained += exp;
    if (player.healPerKill > 0) {
      run.playerHp = Math.min(run.playerMaxHp, run.playerHp + player.healPerKill);
    }
    // 死锁双尊 / 回归复活兽：LINKED & REVIVE
    if (enemy.tier === 'BOSS') {
      const mechDef = bossMechanicsFor(enemy.defId);
      const revive = mechDef?.mechanics.find((m) => m.kind === 'REVIVE' || m.kind === 'LINKED');
      if (revive) {
        const revivePct = revive.reviveHpPct ?? 0.5;
        if ((enemy.revived ?? 0) < 1) {
          enemy.revived = (enemy.revived ?? 0) + 1;
          enemy.hp = Math.max(1, Math.floor(enemy.maxHp * revivePct));
          run.log.push(`${enemy.name} 重新连接上了！它又活了！`);
          return; // 不算击杀
        }
        // 死锁双尊：若另一尊还活着，恢复它
        const twins = run.enemies.filter((e) => e.hp > 0 && e.linkGroup === enemy.linkGroup && e.uid !== enemy.uid);
        if (twins.length > 0 && (enemy.revived ?? 0) >= 1) {
          enemy.revived = 2;
          enemy.hp = Math.max(1, Math.floor(enemy.maxHp * revivePct));
          run.log.push(`${twins[0].name} 死死锁住资源：${enemy.name} 被复活了！`);
          return;
        }
      }
      // Boss 专属掉落（Pity）
      this.rollBossExclusiveDrop(run, enemy.defId);
    }
    this.rollLoot(run, enemy.tier);
    this.context.codex.discoverMonster(enemy.defId);
    run.log.push(`击杀 ${enemy.name}（+${exp} 修为）`);
    // 升级检测（可能连升）
    while (run.exp >= run.expNext) {
      run.exp -= run.expNext;
      run.level += 1;
      run.expNext = Math.floor(run.expNext * 1.5);
      run.attack += 2;
      run.playerHp = Math.min(run.playerMaxHp, run.playerHp + 10);
      if (!run.skillOffers) this.prepareSkillOffers(run);
      run.log.push(`升级！Lv${run.level}（选择新技能）`);
    }
  }

  private rollBossExclusiveDrop(run: BattleRunState, bossDefId: string): void {
    try {
      const drop = this.context.loot.rollBossDrop(bossDefId, this.rng);
      if (drop && !(run.loot.equipment.includes(drop.equipmentId))) {
        run.loot.equipment.push(drop.equipmentId);
        run.bossDrops = [...(run.bossDrops ?? []), {
          equipmentId: drop.equipmentId,
          viaPity: drop.viaPity,
          bossName: MONSTER_MAP.get(bossDefId)?.name ?? bossDefId,
        }];
        run.log.push(`✦ ${drop.viaPity ? '保底触发！' : ''}${drop.equipmentId} 从 ${MONSTER_MAP.get(bossDefId)?.name ?? bossDefId} 身上掉落！`);
        this.context.events.emit('bossExclusiveDrop', { bossId: bossDefId, equipmentId: drop.equipmentId, viaPity: drop.viaPity });
      }
    } catch { /* 掉落失败不阻塞战斗 */ }
  }

  /** 升级三选一候选准备：优先进化（Lv2→Lv3 二选一），其次新技能/升级。 */
  private prepareSkillOffers(run: BattleRunState): void {
    // 1) 已达 Lv2 且有进化定义 → 二选一（行为分叉）
    for (const id of run.skills) {
      const level = run.skillLevels?.[id] ?? 1;
      const evo = evolutionForBase(id);
      if (level >= 2 && evo && !(run.evolvedSkills ?? []).some((evoId) => evo.options.some((o) => o.id === evoId))) {
        const already = (this.context.player.skillEvolutions ?? {})[id];
        const options = evo.options.filter((o) => o.id !== already);
        if (options.length >= 2) {
          run.skillOffers = [options[0].id, options[1].id];
          run.skillOfferKind = 'evolution';
          return;
        }
      }
    }
    run.skillOffers = this.rollSkillOffers(run);
    run.skillOfferKind = 'skill';
  }

  private rollSkillOffers(run: BattleRunState): string[] {
    const owned = new Set(run.skills);
    const picks: string[] = [];
    // A) 已拥有技能的升级（Lv1 → v2）
    for (const id of run.skills) {
      const level = run.skillLevels?.[id] ?? 1;
      const evo = SKILL_MAP.get(id)?.evolvesTo;
      if (level === 1 && evo && !owned.has(evo) && picks.length < 2) picks.push(`up:${id}`);
    }
    // B) 职业技能池优先（70% 职业），通用兜底
    const profPool = this.professionSkillPool();
    const freshOptions = profPool
      .concat(ALL_SKILLS.filter((s) => !s.profession).map((s) => s.id))
      .filter((id) => !owned.has(id) && !run.skills.some((ownedId) => SKILL_MAP.get(ownedId)?.evolvesTo === id) && !picks.some((p) => p === `up:${id}`));
    const seen = new Set<string>();
    for (const id of freshOptions) {
      if (picks.length >= 3) break;
      if (seen.has(id)) continue;
      seen.add(id);
      picks.push(id);
    }
    // 候选不足时以"攻击强化"占位（id 不在技能表，选择时视为 +3 攻击）
    while (picks.length < 3) picks.push('skill_plus_attack');
    return picks.slice(0, 3);
  }

  private professionSkillPool(): string[] {
    const content = this.context.professionContent;
    if (!content) return ALL_SKILLS.filter((s) => s.kind !== 'PASSIVE').map((s) => s.id);
    const active = [...content.activeSkills()];
    const passives = content.passiveSkills();
    // 70% 主动 + 30% 被动混排
    const pool: string[] = [];
    for (const id of active) if (SKILL_MAP.has(id)) pool.push(id);
    for (const id of passives) if (SKILL_MAP.has(id) && this.rng() < 0.34) pool.push(id);
    return pool;
  }

  /** 升级三选一：选择技能/升级/进化（§78 + V5.7 §21）。 */
  public chooseSkill(skillId: string | null): BattleRunState {
    const run = this.current();
    if (!run || run.status !== 'FIGHTING') throw new Error('没有进行中的战斗');
    if (!run.skillOffers) throw new Error('当前没有待选择的技能');
    if (skillId !== null && !run.skillOffers.includes(skillId)) throw new Error('无效的技能选择');

    if (run.skillOfferKind === 'evolution' && skillId !== null) {
      // Lv3 进化二选一：行为分叉 + 持久化
      const option = this.evolutionOptionById(skillId);
      if (!option) throw new Error('无效的进化选择');
      const baseId = this.baseOfEvolutionOption(skillId);
      run.evolvedSkills = [...(run.evolvedSkills ?? []), option.id];
      run.skillLevels = { ...(run.skillLevels ?? {}), [baseId]: 3 };
      const saved = { ...(this.context.player.skillEvolutions ?? {}) };
      saved[baseId] = option.id;
      this.context.player.skillEvolutions = saved;
      run.log.push(`✦ 技能进化：${SKILL_MAP.get(baseId)?.name ?? baseId} → 【${option.name}】${option.desc}`);
      // 永久共鸣检查
      this.evaluateSynergies(run);
      run.skillOffers = null;
      run.skillOfferKind = null;
      this.persist(run);
      this.context.saveService.save(this.context.player);
      return run;
    }

    if (skillId === 'skill_plus_attack' || skillId === null) {
      run.attack += 3;
      run.log.push('你选择强化攻击（+3）。');
    } else if (skillId.startsWith('up:')) {
      // 升级：base → v2（若此前已选定进化，则自动生效至 Lv3）
      const baseId = skillId.slice(3);
      const evo = SKILL_MAP.get(baseId)?.evolvesTo;
      if (evo && SKILL_MAP.has(evo)) {
        run.skills = run.skills.filter((s) => s !== baseId).concat(evo);
        run.skillLevels = { ...(run.skillLevels ?? {}), [baseId]: 2, [evo]: 2 };
        run.log.push(`技能升级：${SKILL_MAP.get(baseId)?.name} → ${SKILL_MAP.get(evo)?.name}（Lv2）`);
        const savedEvo = (this.context.player.skillEvolutions ?? {})[baseId];
        if (savedEvo && !(run.evolvedSkills ?? []).includes(savedEvo)) {
          run.evolvedSkills = [...(run.evolvedSkills ?? []), savedEvo];
          run.skillLevels![baseId] = 3;
          const option = this.evolutionOptionById(savedEvo);
          if (option) run.log.push(`✦ 沿用上次进化【${option.name}】`);
          this.evaluateSynergies(run);
        }
      }
    } else {
      const def = SKILL_MAP.get(skillId);
      if (!def) throw new Error('无效的技能选择');
      run.skills.push(skillId);
      run.skillLevels = { ...(run.skillLevels ?? {}), [skillId]: 1 };
      // 护盾与敌方减速在习得时一次性生效（不随 tick 叠加）。
      if (def.shieldBonus) run.shield += def.shieldBonus;
      if (def.enemySlow) {
        run.enemies.forEach((enemy) => {
          enemy.intervalSec = Math.min(6, enemy.intervalSec * (1 + def.enemySlow!));
        });
      }
      run.log.push(`习得【${def.name}】`);
      this.evaluateSynergies(run);
    }
    run.skillOffers = null;
    run.skillOfferKind = null;
    this.persist(run);
    return run;
  }

  private evolutionOptionById(optionId: string): EvolutionOption | undefined {
    for (const evo of EVOLUTIONS) {
      const hit = evo.options.find((o) => o.id === optionId);
      if (hit) return hit;
    }
    return undefined;
  }

  private baseOfEvolutionOption(optionId: string): string {
    for (const evo of EVOLUTIONS) {
      if (evo.options.some((o) => o.id === optionId)) return evo.baseSkillId;
    }
    return '';
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
    // V5.7 fatigue（0-100）叠加
    let mul = 1;
    try {
      mul *= this.context.fatigue.battleAttackMul();
    } catch { /* fatigue 未接线时按 1 */ }
    return mul;
  }

  /** V5.7 职业怪物池 + 历史回归 Boss（复盘）。 */
  private spawnWave(run: BattleRunState, replayBossId?: string): void {
    if (run.wave >= run.waveTotal) return;
    run.enemies = [];
    if (replayBossId && run.wave === run.waveTotal - 1) {
      this.addEnemy(run, replayBossId);
      run.log.push(`【复盘回忆】你再次面对 ${MONSTER_MAP.get(replayBossId)?.name ?? replayBossId}。`);
    } else {
      const wave = WAVES[run.wave];
      const professionPool = this.context.professionContent?.monsterPool() ?? this.context.profession?.def().monsters ?? [];
      for (let i = 0; i < wave.count; i += 1) {
        const tier = wave.tiers[Math.min(i, wave.tiers.length - 1)];
        let candidates = Array.from(MONSTER_MAP.values()).filter((m) => m.tier === tier);
        // V5.7 职业怪池优先：本职业相关怪物 70% 概率优先出（独有比例 ≥70%）。
        const specialty = professionPool.length > 0 ? candidates.filter((m) => professionPool.includes(m.id)) : [];
        if (specialty.length > 0 && this.rng() < 0.7) candidates = specialty;
        const def = candidates[Math.floor(this.rng() * candidates.length)];
        if (def) this.addEnemy(run, def.id);
      }
    }
    run.log.push(`第 ${run.wave + 1}/${run.waveTotal} 波：${run.enemies.map((e) => e.name).join('、')}`);
    const boss = run.enemies.find((e) => e.tier === 'BOSS');
    if (boss) {
      run.log.push('⚠️ Boss 出现！');
      const mechDef = bossMechanicsFor(boss.defId);
      if (mechDef) run.log.push(`⚠️ ${mechDef.telegraph}`);
    }
  }

  private addEnemy(run: BattleRunState, defId: string): void {
    const def = MONSTER_MAP.get(defId);
    if (!def) return;
    const nightMul = run.night ? 1.25 : 1;
    const uid = `${def.id}_${Math.floor(this.rng() * 1e6).toString(36)}`;
    const enemy: BattleEnemyState = {
      uid,
      defId: def.id,
      name: def.name,
      tier: def.tier,
      hp: Math.floor(def.hp * nightMul),
      maxHp: Math.floor(def.hp * nightMul),
      attack: Math.max(1, Math.floor(def.attack * nightMul)),
      intervalSec: def.intervalSec,
      attackTimer: 0,
      mechanic: def.mechanic,
      timers: {},
      telegraphed: {},
      revived: 0,
    };
    // 死锁双尊：成对出现
    if (def.twin) {
      enemy.linkGroup = `twin_${run.runId}`;
      run.enemies.push(enemy);
      run.enemies.push({
        ...enemy,
        uid: `${uid}_b`,
        name: `${def.name}·另一尊`,
        timers: {},
        telegraphed: {},
        revived: 0,
      });
      return;
    }
    run.enemies.push(enemy);
  }

  private advanceWave(run: BattleRunState): void {
    run.wave += 1;
    if (run.wave >= run.waveTotal) {
      run.status = 'VICTORY';
      run.log.push('项目交付！Boss 已被超度。');
      this.claimRewards(run, false);
      return;
    }
    // 波间喘息：回复 25% 最大生命 + 被动护盾，让长线推进成为可能。
    run.playerHp = Math.min(run.playerMaxHp, run.playerHp + Math.floor(run.playerMaxHp * 0.25));
    const player = this.playerSkillStats(run);
    if (player.shieldPerWave > 0) run.shield += player.shieldPerWave;
    this.spawnWave(run);
    this.evaluateSynergies(run);
  }

  private rollLoot(run: BattleRunState, tier: MonsterTier): void {
    const table = LOOT_TABLE[tier];
    const build = BUILD_MAP.get(run.buildId);
    const bonus = (build?.lootBonus ?? 0) + this.equipmentStats().lootBonus;
    const nightBonus = run.night ? 0.1 : 0;
    if (this.rng() < table.materialChance) {
      const mat = LOOT_MATERIALS[Math.floor(this.rng() * LOOT_MATERIALS.length)];
      const count = 1 + (this.rng() < bonus + nightBonus ? 1 : 0);
      run.loot.materials[mat] = (run.loot.materials[mat] ?? 0) + count;
    }
    if (this.rng() < table.equipmentChance + nightBonus) {
      const eq = this.rollEquipmentId();
      if (eq && !run.loot.equipment.includes(eq)) run.loot.equipment.push(eq);
    }
    const [min, max] = table.spiritStones;
    run.loot.spiritStones += min + Math.floor(this.rng() * (max - min + 1));
  }

  /** 掉落池：通用池 + 本职业专属池（职业概率 60%）。 */
  private rollEquipmentId(): string | null {
    const profEquipment = this.context.professionContent?.def().equipment ?? [];
    const useProfession = profEquipment.length > 0 && this.rng() < 0.6;
    const pool = useProfession ? profEquipment : LOOT_EQUIPMENT;
    if (pool.length === 0) return null;
    return pool[Math.floor(this.rng() * pool.length)];
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
    let epicLoot = 0;
    for (const eq of run.loot.equipment) {
      if (defeated && this.rng() > scale) continue;
      if (!player.ownedEquipment.includes(eq)) {
        player.ownedEquipment.push(eq);
        this.context.events.emit('equipmentAcquired', { equipmentId: eq });
        this.context.codex.discoverEquipment(eq);
        if (eq.includes('legendary') || eq.startsWith('eq_heap') || eq.startsWith('eq_sourmap') || eq.startsWith('eq_lighthouse') || eq.startsWith('eq_p0') || eq.startsWith('eq_selfheal') || eq.startsWith('eq_exec') || eq.startsWith('eq_deadlock') || eq.startsWith('eq_postmortem') || eq.startsWith('eq_req_freeze')) {
          epicLoot += 1;
        }
      }
    }
    if (run.loot.spiritStones > 0) {
      const stones = Math.max(1, Math.floor(run.loot.spiritStones * scale));
      player.spiritStones = Math.min(SPIRIT_MAX, player.spiritStones + stones);
      run.loot.spiritStones = stones;
    }
    // 战斗疲劳成本（V5.7 §80）
    try { this.context.fatigue.add('BOSS_FIGHT'); } catch { /* ignore */ }
    // 周目标计数（V5.7）
    try {
      if (!defeated) this.context.week.recordProgress('BOSS_KILL', (run.enemies.some((e) => e.tier === 'BOSS') || run.wave >= run.waveTotal) ? 1 : 0);
      this.context.week.recordProgress('LOOT_COUNT', run.loot.equipment.length);
    } catch { /* ignore */ }
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
    const killedBoss = !defeated && (run.wave >= run.waveTotal || (run.bossDrops ?? []).length > 0);
    // V5.7：职业 Boss 讨伐 → 职业经验（§14：经验来源含职业 Boss）
    if (killedBoss) {
      try { this.context.profession.grantExp(25); } catch { /* best-effort */ }
    }
    this.context.player.lifetimeStats = {
      ...this.context.player.lifetimeStats,
      battleRunsDone: (this.context.player.lifetimeStats.battleRunsDone ?? 0) + 1,
      bossKills: (this.context.player.lifetimeStats.bossKills ?? 0) + (killedBoss ? 1 : 0),
      epicLoot: (this.context.player.lifetimeStats.epicLoot ?? 0) + epicLoot,
    };
    this.persist(run);
    // Persist the reward marker with the terminal state, before the UI can
    // acknowledge the result. This makes a restart observe the same run.
    this.context.saveService.save(this.context.player);
  }

  /** 装备战斗聚合（开局缓存于聚合函数，避免每 tick 重算）。 */
  private equipmentCache: { atkMul: number; aspdMul: number; critBonus: number; maxHpBonus: number; shieldBonus: number; dodgeBonus: number; lootBonus: number; damageReduce: number; intervalMulDelta: number; executePct: number; aoe: boolean; reviveOnce: boolean; immuneEverySec: number; healPerKill: number; summonCapBonus: number } | null = null;

  private equipmentStats() {
    if (this.equipmentCache) return this.equipmentCache;
    try {
      const stats = this.context.loot.battleStats();
      this.equipmentCache = stats;
      return stats;
    } catch {
      const empty = { atkMul: 0, aspdMul: 0, critBonus: 0, maxHpBonus: 0, shieldBonus: 0, dodgeBonus: 0, lootBonus: 0, damageReduce: 0, intervalMulDelta: 0, executePct: 0, aoe: false, reviveOnce: false, immuneEverySec: 0, healPerKill: 0, summonCapBonus: 0 };
      this.equipmentCache = empty;
      return empty;
    }
  }

  /** 道法共鸣判定：技能+技能 / 技能+Build / 技能+装备Tag → 激活并持久发现。 */
  private evaluateSynergies(run: BattleRunState): void {
    const active: string[] = [];
    const skills = new Set(run.skills);
    const buildId = run.buildId;
    let ownedTags: Set<string> | null = null;
    const discovered = new Set(this.context.player.synergyDiscovered ?? []);
    const prof = this.context.profession?.currentId();
    for (const synergy of SYNERGIES.filter((s) => !prof || s.profession === prof)) {
      const req = synergy.requires;
      let ok = true;
      if (req.skills) for (const s of req.skills) if (!skills.has(s)) ok = false;
      if (ok && req.buildIds) ok = req.buildIds.includes(buildId);
      if (ok && req.equipmentTags) {
        if (!ownedTags) ownedTags = this.context.loot.ownedTags();
        for (const tag of req.equipmentTags) if (!ownedTags.has(tag)) ok = false;
      }
      if (ok) {
        active.push(synergy.id);
        if (!discovered.has(synergy.id)) {
          discovered.add(synergy.id);
          run.log.push(`✦ 道法共鸣激活：【${synergy.name}】${synergy.desc}`);
          this.context.events.emit('synergyActivated', { synergyId: synergy.id, name: synergy.name });
        }
      }
    }
    run.synergies = active;
    this.context.player.synergyDiscovered = Array.from(discovered);
  }

  /** 全量玩家战斗属性聚合：技能 + 进化 + 共鸣 + 装备。 */
  private playerSkillStats(run: BattleRunState): PlayerStats {
    let damageMul = 0;
    let intervalMul = 0;
    let critBonus = 0;
    let damageReduce = 0;
    let healPerKill = 0;
    let executePct = 0;
    let dodgeBonus = 0;
    let shieldPerWave = 0;
    let aoe = false;
    let enemySlow = 0;
    for (const id of run.skills) {
      const skill = SKILL_MAP.get(id);
      if (!skill) continue;
      damageMul += skill.damageMul ?? 0;
      intervalMul += skill.intervalMul ?? 0;
      critBonus += skill.critBonus ?? 0;
      damageReduce += skill.damageReduce ?? 0;
      healPerKill += skill.healPerKill ?? 0;
      dodgeBonus += skill.dodgeBonus ?? 0;
      shieldPerWave += skill.shieldPerWave ?? 0;
      aoe = aoe || skill.aoe === true;
      enemySlow += skill.enemySlow ?? 0;
    }
    // 已选进化效果
    for (const optionId of run.evolvedSkills ?? []) {
      const option = this.evolutionOptionById(optionId);
      if (!option) continue;
      const e = option.effects;
      damageMul += e.damageMulDelta ?? 0;
      intervalMul += e.intervalMulDelta ?? 0;
      critBonus += e.critBonus ?? 0;
      damageReduce += e.damageReduceDelta ?? 0;
      healPerKill += e.healPerKill ?? 0;
      executePct = Math.max(executePct, e.executePct ?? 0);
      dodgeBonus += e.dodgeBonus ?? 0;
      shieldPerWave += e.shieldPerWave ?? 0;
      aoe = aoe || e.aoe === true || e.aoeKeep === true;
    }
    // 已激活共鸣效果
    const profNow = this.context.profession?.currentId();
    for (const synergyId of run.synergies ?? []) {
      const synergy = SYNERGIES.filter((s) => !profNow || s.profession === profNow).find((s) => s.id === synergyId);
      if (!synergy) continue;
      const e = synergy.effects;
      damageMul += e.damageMulDelta ?? 0;
      intervalMul += e.intervalMulDelta ?? 0;
      critBonus += e.critBonus ?? 0;
      damageReduce += e.damageReduceDelta ?? 0;
      healPerKill += e.healPerKill ?? 0;
      executePct = Math.max(executePct, e.executePct ?? 0);
      dodgeBonus += e.dodgeBonus ?? 0;
      shieldPerWave += e.shieldPerWave ?? 0;
      aoe = aoe || e.aoe === true || e.aoeKeep === true;
    }
    // 装备/套装聚合
    const eq = this.equipmentStats();
    damageMul += eq.atkMul;
    intervalMul += eq.intervalMulDelta;
    critBonus += eq.critBonus;
    damageReduce += eq.damageReduce;
    healPerKill += eq.healPerKill;
    executePct = Math.max(executePct, eq.executePct);
    dodgeBonus += eq.dodgeBonus;
    aoe = aoe || eq.aoe;
    // 职业等级 perk
    const perks = this.context.professionContent?.perkAggregate();
    if (perks) {
      damageMul += perks.atkMul;
      this.perkEvidenceBonusCache = perks.evidenceBonus;
    }
    return {
      attack: run.attack * (1 + damageMul),
      intervalSec: Math.max(0.3, run.intervalSec * (1 + Math.max(-0.7, intervalMul)) * (run.slowedMul ?? 1) * (1 - eq.aspdMul)),
      critChance: Math.min(0.8, run.critChance + critBonus),
      damageReduce: Math.min(0.6, damageReduce),
      healPerKill,
      executePct,
      dodgeBonus,
      shieldPerWave,
      aoe,
      reviveOnce: eq.reviveOnce,
      immuneEverySec: eq.immuneEverySec,
      summonCapBonus: eq.summonCapBonus,
    };
  }

  private perkEvidenceBonusCache = 0;

  /** 职业等级证据加成（evidence-service 消费）。 */
  public professionEvidenceBonus(): number {
    this.perkEvidenceBonusCache = this.context.professionContent?.perkAggregate().evidenceBonus ?? 0;
    let bonus = this.perkEvidenceBonusCache;
    try {
      bonus += this.context.loot.workStats().evidenceBonus;
    } catch { /* ignore */ }
    return bonus;
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

interface PlayerStats {
  attack: number;
  intervalSec: number;
  critChance: number;
  damageReduce: number;
  healPerKill: number;
  executePct: number;
  dodgeBonus: number;
  shieldPerWave: number;
  aoe: boolean;
  reviveOnce: boolean;
  immuneEverySec: number;
  summonCapBonus: number;
}

// 延迟绑定已上移至文件头（EVOLUTIONS / SYNERGIES 顶部导入）。

function isBattleRunState(value: unknown): value is BattleRunState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  if (typeof run.runId !== 'string' || run.runId.length === 0) return false;
  if (run.source !== 'PROJECT' && run.source !== 'INCIDENT') return false;
  if (run.status !== 'FIGHTING' && run.status !== 'VICTORY' && run.status !== 'DEFEAT') return false;
  if (typeof run.buildId !== 'string' || !BUILD_MAP.has(run.buildId)) return false;
  if (!Number.isSafeInteger(run.wave) || !Number.isSafeInteger(run.waveTotal) || !Number.isSafeInteger(run.level)) return false;
  if (!Array.isArray(run.skills) || !run.skills.every((skill) => typeof skill === 'string')) return false;
  if (!Array.isArray(run.enemies) || !Array.isArray(run.log) || !run.log.every((entry) => typeof entry === 'string')) return false;
  if (!run.loot || typeof run.loot !== 'object' || Array.isArray(run.loot)) return false;
  const loot = run.loot as Record<string, unknown>;
  return typeof loot.materials === 'object' && loot.materials !== null && Array.isArray(loot.equipment) && typeof loot.spiritStones === 'number' && typeof loot.expGained === 'number';
}
