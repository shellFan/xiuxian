import type { GameContext } from '../core/game-context';
import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import { calculateBattleDamage } from '../v3/battle-damage';

export const HOME_STAGES = Object.freeze([
  { name: '实习生的第一个 Bug', enemy: '空指针小虫', count: 16, hp: 30 },
  { name: '产品经理改需求', enemy: '需求变异体', count: 24, hp: 60 },
  { name: '祖传代码', enemy: '递归幽灵', count: 26, hp: 100 },
  { name: '测试说还有 Bug', enemy: '回归测试蜂群', count: 28, hp: 150 },
  { name: '线上事故', enemy: '服务雪崩虫', count: 30, hp: 200 },
]);
export interface HomeArenaState {
  version: 1; stage: number; kills: number; hp: number; complete: boolean;
  clearedStages: boolean[]; rewardedEnemies: number[]; rngState: number;
  combo: number; lastClickAt: number; lastAttackAt: number; skillReadyAt: number;
  stageActiveMs: number; requests: string[];
  metrics: { attacks: number; crits: number; maxCombo: number; autoAttacks: number; skillUses: number; totalKills: number; stageTimesMs: number[] };
  rewards: { experience: number; materials: Record<string, number> };
  recentDrops: string[];
}
export interface HomeHit { enemyId: string; damage: number; critical: boolean; killed: boolean; stageCleared: number | null; kind: 'CLICK' | 'AUTO' | 'STORM'; reward: string[] }
export interface HomeAttackResult { ok: boolean; reason?: string; hit?: HomeHit; hits?: HomeHit[] }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const uint = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;

export function normalizeHomeArena(value: unknown): HomeArenaState | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as HomeArenaState;
  if (s.version !== 1 || !uint(s.stage, 5) || s.stage < 1 || !uint(s.kills, HOME_STAGES[s.stage - 1].count) || !uint(s.hp, 1000)
    || typeof s.complete !== 'boolean' || !uint(s.rngState, 0xffffffff) || !uint(s.combo, 20)
    || !['lastClickAt', 'lastAttackAt', 'skillReadyAt', 'stageActiveMs'].every(k => uint(s[k as keyof HomeArenaState]))
    || !Array.isArray(s.clearedStages) || s.clearedStages.length !== 5 || !s.clearedStages.every(v => typeof v === 'boolean')
    || !Array.isArray(s.rewardedEnemies) || s.rewardedEnemies.length !== 5 || !s.rewardedEnemies.every((v, i) => uint(v, HOME_STAGES[i].count))
    || !Array.isArray(s.requests) || s.requests.length > 64 || !s.requests.every(v => typeof v === 'string' && v.length <= 100)
    || !s.metrics || !['attacks', 'crits', 'maxCombo', 'autoAttacks', 'skillUses', 'totalKills'].every(k => uint(s.metrics[k as keyof typeof s.metrics]))
    || !Array.isArray(s.metrics.stageTimesMs) || s.metrics.stageTimesMs.length > 5 || !s.metrics.stageTimesMs.every(v => uint(v))
    || !s.rewards || !uint(s.rewards.experience) || !s.rewards.materials || typeof s.rewards.materials !== 'object'
    || !Object.entries(s.rewards.materials).every(([k, v]) => ['mat_code_fragment', 'mat_page', 'mat_bug_crystal'].includes(k) && uint(v, 100000))
    || !Array.isArray(s.recentDrops) || s.recentDrops.length > 8 || !s.recentDrops.every(v => typeof v === 'string' && v.length <= 120)) return null;
  const expectedHp = s.stage === 5 && s.kills === 29 ? 1000 : HOME_STAGES[s.stage - 1].hp;
  if (s.hp > expectedHp || (!s.complete && (s.kills >= HOME_STAGES[s.stage - 1].count || s.hp <= 0)) || (s.complete && (s.stage !== 5 || !s.clearedStages.every(Boolean)))) return null;
  return clone(s);
}

function initialState(seed: number): HomeArenaState {
  return { version: 1, stage: 1, kills: 0, hp: 30, complete: false, clearedStages: [false, false, false, false, false], rewardedEnemies: [0, 0, 0, 0, 0], rngState: seed >>> 0 || 5911,
    combo: 0, lastClickAt: 0, lastAttackAt: 0, skillReadyAt: 0, stageActiveMs: 0, requests: [],
    metrics: { attacks: 0, crits: 0, maxCombo: 0, autoAttacks: 0, skillUses: 0, totalKills: 0, stageTimesMs: [] },
    rewards: { experience: 0, materials: {} }, recentDrops: [] };
}

/** Persistent campaign; rewards use the existing cultivation/material services, never wages. */
export class HomeArenaService {
  private active = false;
  private autoSeconds = 0;
  private lastTickAt = 0;
  private pendingHits: HomeHit[] = [];
  public constructor(private readonly context: GameContext, private readonly clock: Clock = DEFAULT_CLOCK, seed = 5911) {
    context.player.homeArena = normalizeHomeArena(context.player.homeArena) ?? initialState(seed);
  }
  private get state(): HomeArenaState { return this.context.player.homeArena as HomeArenaState; }
  private ready(): boolean { return !this.context.characterCreation.isNewCharacterCreationRequired(); }
  public setActive(active: boolean): void {
    if (this.active !== active) { this.autoSeconds = 0; this.lastTickAt = this.clock.now(); }
    this.active = active && this.ready();
  }
  public view() {
    const s = this.state, def = HOME_STAGES[s.stage - 1], now = this.clock.now();
    const elite = s.stage === 5 && s.kills === 29;
    const profile = this.context.battle.homeAttackProfile(s.clearedStages.filter(Boolean).length);
    const combo = now - s.lastClickAt <= 2000 ? s.combo : 0;
    return Object.freeze({ ...clone(s), ready: this.ready(), active: this.active, stageName: def.name,
      enemy: { id: `${s.stage}:${s.kills}`, name: elite ? 'P0 · 线上雪崩核心' : def.enemy, hp: s.hp, maxHp: elite ? 1000 : def.hp, elite, level: s.stage },
      enemyTotal: def.count, attack: profile.attack, critChance: profile.critChance, combo, comboBonus: Math.min(0.2, Math.floor(combo / 5) * 0.05),
      autoUnlocked: s.stage >= 3 || s.clearedStages[1], skillUnlocked: s.stage >= 4 || s.clearedStages[2], autoIntervalSeconds: 2 * this.context.fateEvents.combatModifiers().autoIntervalMultiplier,
      skillRemainingMs: Math.max(0, s.skillReadyAt - now), skillDamage: profile.attack * 5,
      rewardPreview: s.stage === 5 ? '修为 +50 · Bug 晶核 ×3' : `修为 +${s.stage * 10} · 功法残页 ×${s.stage}`,
    });
  }
  public drainHits(): HomeHit[] { const hits = this.pendingHits; this.pendingHits = []; return hits; }
  public attack(enemyId: string, requestId: string): HomeAttackResult {
    if (!this.active || !this.ready()) return { ok: false, reason: '战场未激活' };
    if (this.state.complete) return { ok: false, reason: '已完成前五关' };
    if (enemyId !== this.view().enemy.id) return { ok: false, reason: '目标已更新' };
    if (!this.validRequest(requestId)) return { ok: false, reason: '重复或无效的攻击请求' };
    const now = this.clock.now();
    if (now - this.state.lastAttackAt < 50) return { ok: false, reason: '攻击过快' };
    return this.transaction(() => {
      const s = this.state;
      s.requests.push(requestId); s.requests = s.requests.slice(-64);
      s.combo = now - s.lastClickAt <= 2000 ? Math.min(20, s.combo + 1) : 1;
      s.lastClickAt = now; s.lastAttackAt = now;
      s.metrics.attacks++; s.metrics.maxCombo = Math.max(s.metrics.maxCombo, s.combo);
      const hit = this.hit('CLICK');
      return { ok: true, hit, hits: [hit] };
    });
  }
  public storm(requestId: string): HomeAttackResult {
    const view = this.view();
    if (!this.active || !this.ready() || view.complete || !view.skillUnlocked || view.skillRemainingMs > 0 || !this.validRequest(requestId)) return { ok: false, reason: '技能未解锁或仍在冷却' };
    return this.transaction(() => {
      this.state.requests.push(requestId); this.state.requests = this.state.requests.slice(-64);
      this.state.skillReadyAt = this.clock.now() + 30000 * this.context.fateEvents.combatModifiers().skillCooldownMultiplier; this.state.metrics.skillUses++;
      const hits: HomeHit[] = [];
      for (let i = 0; i < 5 && !this.state.complete; i++) hits.push(this.hit('STORM'));
      this.context.sound.play('CODE_STORM');
      return { ok: true, hit: hits[0], hits };
    });
  }
  public tick(seconds: number): void {
    if (!this.active || !this.ready() || this.state.complete || !Number.isFinite(seconds) || seconds <= 0) return;
    const now = this.clock.now();
    const dt = Math.max(0, Math.min(seconds, 1, (now - this.lastTickAt) / 1000));
    this.lastTickAt = now;
    if (dt <= 0) return;
    this.state.stageActiveMs += Math.round(dt * 1000);
    if (!this.view().autoUnlocked) return;
    this.autoSeconds += dt;
    const autoInterval = 2 * this.context.fateEvents.combatModifiers().autoIntervalMultiplier;
    if (this.autoSeconds < autoInterval) return;
    this.autoSeconds -= autoInterval;
    this.transaction(() => { this.state.metrics.autoAttacks++; const hit = this.hit('AUTO'); return { ok: true, hit, hits: [hit] }; });
  }
  public replay(): boolean {
    if (!this.state.complete) return false;
    this.transaction(() => {
      Object.assign(this.state, { stage: 1, kills: 0, hp: 30, complete: false, combo: 0, stageActiveMs: 0 });
      return { ok: true };
    });
    return true;
  }
  private validRequest(id: string): boolean { return typeof id === 'string' && id.length > 0 && id.length <= 100 && !this.state.requests.includes(id); }
  private random(): number { let x = this.state.rngState; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state.rngState = x >>> 0; return this.state.rngState / 4294967296; }
  private hit(kind: HomeHit['kind']): HomeHit {
    const s = this.state, view = this.view(), profile = this.context.battle.homeAttackProfile(s.clearedStages.filter(Boolean).length);
    const critical = kind === 'CLICK' && this.random() < profile.critChance;
    if (critical) s.metrics.crits++;
    const base = kind === 'AUTO' ? Math.max(6, Math.floor(profile.attack * 0.6)) : profile.attack;
    const damage = Math.min(s.hp, calculateBattleDamage(base * (kind === 'CLICK' ? 1 + view.comboBonus : 1), critical, 2));
    const result: HomeHit = { enemyId: view.enemy.id, damage, critical, killed: false, stageCleared: null, kind, reward: [] };
    s.hp -= damage;
    if (s.hp === 0) {
      result.killed = true; s.metrics.totalKills++;
      if (s.kills >= s.rewardedEnemies[s.stage - 1]) {
        s.rewardedEnemies[s.stage - 1] = s.kills + 1;
        this.grant(2, { mat_code_fragment: 1 }, result);
      }
      s.kills++;
      if (s.kills === HOME_STAGES[s.stage - 1].count) {
        result.stageCleared = s.stage;
        if (!s.clearedStages[s.stage - 1]) {
          this.grant(s.stage * 10, s.stage === 5 ? { mat_bug_crystal: 3 } : { mat_page: s.stage }, result);
          s.metrics.stageTimesMs[s.stage - 1] = s.stageActiveMs;
          s.clearedStages[s.stage - 1] = true;
        }
        s.recentDrops.unshift(`第${s.stage}关通关！${result.reward.join(' · ')}`);
        this.context.sound.play('HOME_VICTORY');
        if (s.stage === 5) s.complete = true;
        else { s.stage++; s.kills = 0; s.hp = HOME_STAGES[s.stage - 1].hp; s.stageActiveMs = 0; }
      } else s.hp = s.stage === 5 && s.kills === 29 ? 1000 : HOME_STAGES[s.stage - 1].hp;
      s.recentDrops = s.recentDrops.slice(0, 8);
    }
    this.context.sound.play(critical ? 'CRITICAL_HIT' : 'HOME_ATTACK');
    return result;
  }
  private grant(experience: number, materials: Record<string, number>, hit: HomeHit): void {
    const s = this.state;
    this.context.cultivation.applyIdleExperience(experience);
    s.rewards.experience += experience; hit.reward.push(`修为 +${experience}`);
    for (const [id, count] of Object.entries(materials)) {
      this.context.v2Items.addMaterial(id, count);
      s.rewards.materials[id] = (s.rewards.materials[id] ?? 0) + count;
      hit.reward.push(`${this.context.v2Items.materialName(id)} ×${count}`);
    }
  }
  private transaction(action: () => HomeAttackResult): HomeAttackResult {
    const before = this.context.player.toSaveData();
    try {
      const result = action();
      const killedHits = (result.hits ?? []).filter((hit) => hit.killed);
      if (killedHits.length > 0 && !this.context.player.fateRun && this.ready()) {
        this.context.fateEvents.initializeRun(this.state.rngState);
      }
      this.context.saveService.save(this.context.player);
      this.pendingHits.push(...(result.hits ?? [])); this.pendingHits = this.pendingHits.slice(-32);
      for (const hit of killedHits) {
        const [stage, zeroBasedKill] = hit.enemyId.split(':').map(Number);
        this.context.fateEvents.triggerMilestone(`arena:${stage}:${zeroBasedKill + 1}`);
      }
      return result;
    } catch (error) {
      this.context.player.homeArena = clone(before.homeArena);
      this.context.player.cultivationExp = before.cultivationExp;
      this.context.player.materials = { ...(before.materials ?? {}) };
      this.context.player.gameDay = before.gameDay ? clone(before.gameDay) : null;
      throw error;
    }
  }
}
