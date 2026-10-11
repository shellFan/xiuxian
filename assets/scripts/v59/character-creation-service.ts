import type { GameContext } from '../core/game-context';
import type { GameSaveData } from '../model/save-data';
import { PlayerData } from '../model/player-data';
import type { StorageAdapter } from '../services/storage-adapter';
import { hasMeaningfulCharacterProgress } from '../services/save-service';
import {
  ALLOCATION_POINT_BUDGET,
  BACKGROUND_IDS,
  CREATION_STEPS,
  DESTINY_IDS,
  PROFESSION_IDS,
  V59A_RULES_VERSION,
  applyAllocation,
  emptyAllocation,
  generateCandidateTriplet,
  mixRerollSeed,
  normalizeSeed,
  resetAllocation,
  serializeCandidateTriplet,
  validateNickname,
  type AllocationState,
  type CharacterBackground,
  type CharacterCandidate,
  type CharacterCandidateId,
  type CharacterCandidateTriplet,
  type CharacterStats,
  type CreationStep,
  type ProfessionId,
  type StatKey,
} from './character-rules';

export const CHARACTER_CREATION_DRAFT_KEY = 'v59a-character-creation-draft';
export const CHARACTER_AVATAR_IDS = ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4'] as const;
export type CharacterAvatarId = typeof CHARACTER_AVATAR_IDS[number];
export type CharacterDraftMode = 'CREATE' | 'BACKFILL';

export interface CharacterCreationDraft {
  readonly rulesVersion: typeof V59A_RULES_VERSION;
  readonly mode: CharacterDraftMode;
  readonly seed: number;
  readonly step: CreationStep;
  readonly industry?: 'INTERNET';
  readonly direction?: 'TECH_RND';
  readonly professionId: ProfessionId;
  readonly professionConfirmed: boolean;
  readonly nickname: string;
  readonly avatarId: CharacterAvatarId;
  readonly background?: CharacterBackground;
  readonly candidates: CharacterCandidateTriplet;
  readonly candidateHistory: readonly string[];
  readonly selectedCandidateId?: CharacterCandidateId;
  readonly rerollsUsed: number;
  readonly allocation: CharacterStats;
  readonly startedAt: number;
}

export interface CharacterCreationView {
  readonly status: 'CREATION_REQUIRED' | 'BACKFILL_REQUIRED' | 'COMPLETE';
  readonly isNewCharacterCreationRequired: boolean;
  readonly draft?: CharacterCreationDraft;
  readonly error?: string;
}

export interface CharacterCreationResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly draft?: CharacterCreationDraft;
  readonly allocation?: AllocationState;
}

export interface CharacterOnboardingView {
  readonly step: 'INTRO_1' | 'INTRO_2' | 'INTRO_3' | 'INTRO_4' | 'READY' | 'COMPLETE';
  readonly title: string;
  readonly body: string;
  readonly firstTaskTitle: string;
}

const ONBOARDING_PANELS = [
  { step: 'INTRO_1', title: '恭喜你通过牛马宗入门考核', body: '灵根已登记，工位结界正在为你开启。' },
  { step: 'INTRO_2', title: '工牌已发，今日起正式踏入工位修行', body: '你的职业、天命与先天属性会共同影响日常成长。' },
  { step: 'INTRO_3', title: '宗门规矩第一条', body: '需求可以改，工资不能问。保持道心，见招拆招。' },
] as const;

const FIRST_TASKS: Readonly<Record<ProfessionId, string>> = {
  JAVA_BACKEND: '第一张工单：排查接口异常',
  FRONTEND: '第一张工单：修复页面白屏',
  QA: '第一张工单：复现那个无法复现的 Bug',
  DEVOPS: '第一张工单：处理生产环境报警',
};

const BACKGROUND_STARTING_BONUS: Readonly<Record<CharacterBackground, StatKey>> = {
  ORDINARY_WORKER: 'constitution',
  CULTIVATION_GRAD: 'insight',
  CAREER_CHANGER: 'willpower',
};

const DEFAULT_NICKNAMES = ['青云牛马', '摸鱼道人', '加班散修', '工位剑仙'] as const;
const CREATE_RECEIPT_PREFIX = 'V59A_CREATE_V1';
const BACKFILL_RECEIPT_PREFIX = 'V59A_BACKFILL_V1';
let seedCounter = 0;

function defaultSeed(): number {
  const cryptoProvider = (globalThis as unknown as {
    crypto?: { getRandomValues<T extends ArrayBufferView>(array: T): T };
  }).crypto;
  if (cryptoProvider?.getRandomValues) {
    try {
      const values = new Uint32Array(1);
      cryptoProvider.getRandomValues(values);
      return normalizeSeed(values[0]);
    } catch { /* some game runtimes expose crypto but deny entropy access */ }
  }
  const fallback = Math.imul(Date.now() >>> 0, 0x45d9f3b) ^ Math.imul(++seedCounter, 0x9e3779b1);
  return normalizeSeed(fallback);
}

function cloneDraft(draft: CharacterCreationDraft): CharacterCreationDraft {
  return JSON.parse(JSON.stringify(draft)) as CharacterCreationDraft;
}

function isProfessionId(value: unknown): value is ProfessionId {
  return typeof value === 'string' && (PROFESSION_IDS as readonly string[]).includes(value);
}

function isCandidateId(value: unknown): value is CharacterCandidateId {
  return value === 'A' || value === 'B' || value === 'C';
}

function isCharacterStats(value: unknown): value is CharacterStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const stats = value as Record<string, unknown>;
  const keys = ['insight', 'constitution', 'perception', 'fortune', 'willpower'];
  return keys.every((key) => Number.isSafeInteger(stats[key]) && (stats[key] as number) >= 0 && (stats[key] as number) <= 20);
}

function isCandidateTriplet(value: unknown): value is CharacterCandidateTriplet {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const ids = new Set<string>();
  const destinies = new Set<string>();
  for (const candidate of value as unknown[]) {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as Record<string, unknown>;
    if (!isCandidateId(item.id) || !isCharacterStats(item.attributes) || typeof item.destinyId !== 'string'
      || !(DESTINY_IDS as readonly string[]).includes(item.destinyId)) return false;
    const total = Object.values(item.attributes as CharacterStats).reduce((sum, stat) => sum + stat, 0);
    if (total !== 50 || Object.values(item.attributes as CharacterStats).some((stat) => stat < 6 || stat > 16)) return false;
    ids.add(item.id);
    destinies.add(item.destinyId);
  }
  return ids.size === 3 && destinies.size === 3;
}

function isDraft(value: unknown): value is CharacterCreationDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  const validStep = (CREATION_STEPS as readonly string[]).includes(String(draft.step));
  const validMode = draft.mode === 'CREATE' || draft.mode === 'BACKFILL';
  const validHistory = Array.isArray(draft.candidateHistory) && draft.candidateHistory.length <= 16
    && draft.candidateHistory.every((entry) => typeof entry === 'string' && entry.length <= 512);
  const validAllocation = isCharacterStats(draft.allocation)
    && Object.values(draft.allocation as CharacterStats).every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 5)
    && Object.values(draft.allocation as CharacterStats).reduce((sum, value) => sum + value, 0) <= ALLOCATION_POINT_BUDGET;
  return draft.rulesVersion === V59A_RULES_VERSION
    && validMode
    && Number.isSafeInteger(draft.seed)
    && isProfessionId(draft.professionId)
    && typeof draft.professionConfirmed === 'boolean'
    && validStep
    && typeof draft.nickname === 'string'
    && (CHARACTER_AVATAR_IDS as readonly string[]).includes(String(draft.avatarId))
    && (draft.background === undefined || (BACKGROUND_IDS as readonly string[]).includes(String(draft.background)))
    && isCandidateTriplet(draft.candidates)
    && validHistory
    && (draft.selectedCandidateId === undefined || isCandidateId(draft.selectedCandidateId))
    && Number.isSafeInteger(draft.rerollsUsed) && (draft.rerollsUsed as number) >= 0 && (draft.rerollsUsed as number) <= 3
    && validAllocation
    && Number.isFinite(draft.startedAt) && (draft.startedAt as number) >= 0
    && (draft.industry === undefined || draft.industry === 'INTERNET')
    && (draft.direction === undefined || draft.direction === 'TECH_RND')
    && (draft.mode !== 'BACKFILL' || draft.step === 'DESTINY');
}

function hashLegacySeed(save: GameSaveData): number {
  const stable = [save.profession ?? '', save.careerLevel, save.cultivationExp, save.salary, save.workSeconds,
    save.fishingSeconds, save.cultivatingSeconds, save.socialSeconds, save.spiritStones].join('|');
  let hash = 0x811c9dc5;
  for (const char of stable) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return normalizeSeed(hash);
}

export class CharacterCreationService {
  private readonly storage: StorageAdapter;
  private readonly seedProvider: () => number;

  public constructor(
    private readonly context: GameContext,
    storage?: StorageAdapter,
    seedProvider: () => number = defaultSeed,
  ) {
    this.storage = storage ?? context.storage;
    this.seedProvider = seedProvider;
    if (!context.player.characterSetupStatus) {
      context.player.characterSetupStatus = hasMeaningfulCharacterProgress(
        context.player.toSaveData() as unknown as Record<string, unknown>,
      )
        ? 'BACKFILL_REQUIRED'
        : 'CREATION_REQUIRED';
    }
  }

  public isNewCharacterCreationRequired(): boolean {
    return this.context.player.characterSetupStatus === 'CREATION_REQUIRED';
  }

  public queryOnboarding(): CharacterOnboardingView {
    const step = this.context.player.characterOnboardingStep ?? 'COMPLETE';
    const panel = ONBOARDING_PANELS.find((item) => item.step === step);
    return {
      step,
      title: panel?.title ?? (step === 'INTRO_4' ? '你的第一张工单已经送达' : step === 'READY' ? '工位结界已开启' : '入职剧情已完成'),
      body: panel?.body ?? FIRST_TASKS[(this.context.player.profession as ProfessionId) ?? 'JAVA_BACKEND'],
      firstTaskTitle: FIRST_TASKS[(this.context.player.profession as ProfessionId) ?? 'JAVA_BACKEND'],
    };
  }

  public advanceOnboarding(): CharacterCreationResult {
    const player = this.context.player;
    const steps = ['INTRO_1', 'INTRO_2', 'INTRO_3', 'INTRO_4', 'READY'] as const;
    const current = player.characterOnboardingStep;
    if (!current || current === 'COMPLETE') return this.failure('入职剧情已完成');
    if (current === 'READY') return this.failure('请开始修炼进入工位');
    const index = steps.indexOf(current);
    const next = steps[index + 1];
    const before = player.toSaveData();
    try {
      player.characterOnboardingStep = next;
      this.context.saveService.save(player);
      return { success: true };
    } catch (error) {
      this.restorePlayer(player, before);
      return this.failure(`入职剧情保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public skipOnboarding(): CharacterCreationResult {
    return this.startOnboardingGame();
  }

  public startOnboardingGame(): CharacterCreationResult {
    const player = this.context.player;
    if (player.characterOnboardingStep === 'COMPLETE' && player.characterOnboardingTaskReceipt) return { success: true };
    if (player.characterSetupStatus !== 'COMPLETE' || !player.characterCreationReceipt) {
      return this.failure('请先完成角色创建');
    }
    if (!player.characterOnboardingStep || player.characterOnboardingStep === 'COMPLETE') {
      return this.failure('入职剧情状态无效');
    }
    const before = player.toSaveData();
    try {
      const professionId = isProfessionId(player.profession) ? player.profession : 'JAVA_BACKEND';
      const receipt = `V59A_ONBOARDING_TASK_V1:${player.characterCreationReceipt}`;
      const taskTitle = FIRST_TASKS[professionId];
      this.context.assignedTasks.assign({
        title: taskTitle,
        detail: '这是你的第一份可执行差事。完成后可领取工资、绩效與修为。',
        priority: 'P2',
        source: 'SYSTEM',
        rewardSalary: 60,
        rewardPerformance: 5,
        rewardCultivation: 20,
        rewardMind: 0,
      });
      player.characterOnboardingTaskReceipt = receipt;
      player.characterOnboardingStep = 'COMPLETE';
      this.context.saveService.save(player);
      return { success: true };
    } catch (error) {
      this.restorePlayer(player, before);
      return this.failure(`入职任务保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public query(): CharacterCreationView {
    const status = this.context.player.characterSetupStatus ?? 'CREATION_REQUIRED';
    if (status === 'COMPLETE') return { status, isNewCharacterCreationRequired: false };
    try {
      const draft = this.loadOrCreateDraft(status);
      return { status, isNewCharacterCreationRequired: status === 'CREATION_REQUIRED', draft: cloneDraft(draft) };
    } catch (error) {
      return {
        status,
        isNewCharacterCreationRequired: status === 'CREATION_REQUIRED',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public selectIndustry(industry: string): CharacterCreationResult {
    if (industry !== 'INTERNET') return this.failure('该行业尚未开放');
    return this.updateDraft((draft) => draft.mode === 'CREATE' && draft.step === 'INDUSTRY'
      ? { ...draft, industry: 'INTERNET' }
      : draft, '当前步骤不能修改行业');
  }

  public selectDirection(direction: string): CharacterCreationResult {
    if (direction !== 'TECH_RND') return this.failure('该方向尚未开放');
    return this.updateDraft((draft) => draft.mode === 'CREATE' && draft.step === 'DIRECTION'
      ? { ...draft, direction: 'TECH_RND' }
      : draft, '当前步骤不能修改方向');
  }

  public selectProfession(professionId: string): CharacterCreationResult {
    if (!isProfessionId(professionId)) return this.failure('该职业尚未开放');
    return this.updateDraft((draft) => {
      if (draft.mode !== 'CREATE' || draft.step !== 'PROFESSION') return draft;
      const candidates = generateCandidateTriplet(draft.seed, professionId);
      const history = [...draft.candidateHistory, serializeCandidateTriplet(professionId, candidates)];
      return {
        ...draft,
        professionId,
        professionConfirmed: true,
        candidates,
        candidateHistory: history,
        selectedCandidateId: undefined,
        allocation: emptyAllocation(),
      };
    }, '当前步骤不能修改职业');
  }

  public setIdentity(nickname: string, avatarId: string): CharacterCreationResult {
    const validated = validateNickname(nickname);
    if (!validated.valid) return this.failure(validated.error === 'EMPTY' ? '昵称不能为空' : validated.error === 'TOO_LONG' ? '昵称不能超过 12 个可见字符' : '昵称包含不可用字符');
    if (!(CHARACTER_AVATAR_IDS as readonly string[]).includes(avatarId)) return this.failure('请选择一个可用形象');
    return this.updateDraft((draft) => draft.mode === 'CREATE' && draft.step === 'IDENTITY'
      ? { ...draft, nickname: validated.value, avatarId: avatarId as CharacterAvatarId }
      : draft, '当前步骤不能修改角色形象');
  }

  public setBackground(background: string): CharacterCreationResult {
    if (!(BACKGROUND_IDS as readonly string[]).includes(background)) return this.failure('请选择一个可用出身');
    return this.updateDraft((draft) => draft.mode === 'CREATE' && draft.step === 'IDENTITY'
      ? { ...draft, background: background as CharacterBackground }
      : draft, '请在创建身份步骤选择出身');
  }

  public selectCandidate(candidateId: string): CharacterCreationResult {
    if (!isCandidateId(candidateId)) return this.failure('天命候选不存在');
    return this.updateDraft((draft) => (draft.mode === 'BACKFILL' || draft.step === 'DESTINY')
      ? { ...draft, selectedCandidateId: candidateId, allocation: emptyAllocation() }
      : draft, '当前步骤不能选择天命');
  }

  public reroll(): CharacterCreationResult {
    const current = this.readDraft();
    if (!current.ok) return this.failure(current.reason);
    const draft = current.draft;
    if (draft.mode !== 'CREATE' || draft.step !== 'DESTINY') return this.failure('当前步骤不能重新推演');
    if (draft.rerollsUsed >= 3) return this.failure('免费推演次数已用完');
    const rerollsUsed = draft.rerollsUsed + 1;
    let candidates = generateCandidateTriplet(mixRerollSeed(draft.seed, rerollsUsed), draft.professionId);
    let canonical = serializeCandidateTriplet(draft.professionId, candidates);
    let attempt = 0;
    while (draft.candidateHistory.includes(canonical) && attempt < 64) {
      attempt += 1;
      const seed = mixRerollSeed(mixRerollSeed(draft.seed, rerollsUsed), attempt + 1);
      candidates = generateCandidateTriplet(seed, draft.professionId);
      canonical = serializeCandidateTriplet(draft.professionId, candidates);
    }
    if (draft.candidateHistory.includes(canonical)) return this.failure('推演结果冲突，请重试');
    return this.persist({
      ...draft,
      candidates,
      candidateHistory: [...draft.candidateHistory, canonical],
      selectedCandidateId: undefined,
      allocation: emptyAllocation(),
      rerollsUsed,
    });
  }

  public allocate(stat: StatKey, delta: number): CharacterCreationResult {
    const current = this.readDraft();
    if (!current.ok) return this.failure(current.reason);
    if (current.draft.mode !== 'CREATE' || current.draft.step !== 'ALLOCATION') return this.failure('当前步骤不能分配潜力点');
    const selected = this.findCandidate(current.draft);
    if (!selected) return this.failure('请先选择一套天命');
    try {
      const result = applyAllocation(selected.attributes, current.draft.allocation, stat, delta);
      if (!result.ok) return this.failure(result.error);
      const persisted = this.persist({ ...current.draft, allocation: result.allocation });
      return { ...persisted, allocation: result };
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : String(error));
    }
  }

  public resetAllocation(): CharacterCreationResult {
    const current = this.readDraft();
    if (!current.ok) return this.failure(current.reason);
    if (current.draft.mode !== 'CREATE' || current.draft.step !== 'ALLOCATION') return this.failure('当前步骤不能重置潜力点');
    return this.updateDraft((draft) => ({ ...draft, allocation: emptyAllocation() }));
  }

  public advance(): CharacterCreationResult {
    const current = this.readDraft();
    if (!current.ok) return this.failure(current.reason);
    const draft = current.draft;
    if (draft.mode === 'BACKFILL') return this.failure('请直接确认补录天命');
    const index = CREATION_STEPS.indexOf(draft.step);
    if (index < 0 || index >= CREATION_STEPS.length - 1) return this.failure('已到创建最后一步，请确认入职');
    const reason = this.validateStep(draft);
    if (reason) return this.failure(reason);
    return this.persist({ ...draft, step: CREATION_STEPS[index + 1] });
  }

  public back(): CharacterCreationResult {
    const current = this.readDraft();
    if (!current.ok) return this.failure(current.reason);
    if (current.draft.mode === 'BACKFILL') return this.failure('补录天命没有前序步骤');
    const index = CREATION_STEPS.indexOf(current.draft.step);
    if (index <= 0) return this.failure('已经是第一步');
    return this.persist({ ...current.draft, step: CREATION_STEPS[index - 1] });
  }

  public finalize(): CharacterCreationResult {
    if (this.context.player.characterSetupStatus === 'COMPLETE'
      && this.context.player.characterCreationReceipt?.startsWith(`${CREATE_RECEIPT_PREFIX}:`)) return { success: true };
    const current = this.readDraft();
    if (!current.ok) return this.failure(current.reason);
    const draft = current.draft;
    if (draft.mode !== 'CREATE' || draft.step !== 'CONFIRM') return this.failure('尚未到确认入职步骤');
    const reason = this.validateCompleteDraft(draft);
    if (reason) return this.failure(reason);
    const candidate = this.findCandidate(draft)!;
    const allocation = applyAllocation(candidate.attributes, draft.allocation, 'insight', 0);
    if (!allocation.ok) return this.failure(allocation.error);
    const backgroundBonus = BACKGROUND_STARTING_BONUS[draft.background!];
    const earnedAttributes = { ...emptyAllocation(), [backgroundBonus]: 1 };
    const player = this.context.player;
    const before = player.toSaveData();
    try {
      player.profession = draft.professionId;
      player.characterSetupStatus = 'COMPLETE';
      player.characterName = draft.nickname;
      player.characterAvatarId = draft.avatarId;
      player.characterIndustry = 'INTERNET';
      player.characterDirection = 'TECH_RND';
      player.characterBackground = draft.background;
      player.destinyId = candidate.destinyId;
      player.innateAttributes = { ...allocation.attributes };
      player.earnedAttributeDelta = earnedAttributes;
      player.unspentPotential = allocation.remainingPoints;
      player.characterCreationReceipt = `${CREATE_RECEIPT_PREFIX}:${draft.seed}:${candidate.id}`;
      player.characterOnboardingStep = 'INTRO_1';
      player.characterOnboardingTaskReceipt = undefined;
      const starterKit = this.context.profession.grantStarterKit(draft.professionId);
      if (!starterKit.success) throw new Error(starterKit.reason ?? '入职物品发放失败');
      this.context.saveService.save(player);
      this.removeDraftSafely();
      return { success: true };
    } catch (error) {
      this.restorePlayer(player, before);
      return this.failure(`入职保存失败，草稿已保留：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public completeBackfill(): CharacterCreationResult {
    const current = this.readDraft();
    if (!current.ok) return this.failure(current.reason);
    const draft = current.draft;
    if (draft.mode !== 'BACKFILL' || !draft.selectedCandidateId) return this.failure('请先选择一套天命');
    const candidate = this.findCandidate(draft);
    if (!candidate) return this.failure('所选天命已失效');
    const player = this.context.player;
    const before = player.toSaveData();
    try {
      player.destinyId = candidate.destinyId;
      player.innateAttributes = { ...candidate.attributes };
      player.earnedAttributeDelta = { insight: 0, constitution: 0, perception: 0, fortune: 0, willpower: 0 };
      player.unspentPotential = 0;
      player.characterSetupStatus = 'COMPLETE';
      player.characterBackfillReceipt = `${BACKFILL_RECEIPT_PREFIX}:${draft.seed}:${candidate.id}`;
      this.context.saveService.save(player);
      this.removeDraftSafely();
      return { success: true };
    } catch (error) {
      this.restorePlayer(player, before);
      return this.failure(`补录保存失败，原角色已保留：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private loadOrCreateDraft(status: 'CREATION_REQUIRED' | 'BACKFILL_REQUIRED'): CharacterCreationDraft {
    const raw = this.storage.getItem(CHARACTER_CREATION_DRAFT_KEY);
    if (raw !== null) {
      let parsed: unknown;
      try { parsed = JSON.parse(raw) as unknown; } catch { throw new Error('角色草稿损坏，已保护当前存档'); }
      if (!isDraft(parsed) || (status === 'CREATION_REQUIRED' && parsed.mode !== 'CREATE')
        || (status === 'BACKFILL_REQUIRED' && parsed.mode !== 'BACKFILL')) {
        throw new Error('角色草稿版本或内容无效，已保护当前存档');
      }
      return parsed;
    }
    const draft = status === 'CREATION_REQUIRED' ? this.createNewDraft() : this.createBackfillDraft();
    this.writeDraft(draft);
    return draft;
  }

  private createNewDraft(): CharacterCreationDraft {
    const seed = normalizeSeed(this.seedProvider());
    const nicknameRngSeed = mixRerollSeed(seed, 1);
    const nickname = DEFAULT_NICKNAMES[nicknameRngSeed % DEFAULT_NICKNAMES.length];
    const professionId: ProfessionId = 'JAVA_BACKEND';
    const candidates = generateCandidateTriplet(seed, professionId);
    return {
      rulesVersion: V59A_RULES_VERSION,
      mode: 'CREATE',
      seed,
      step: 'INDUSTRY',
      professionId,
      professionConfirmed: false,
      nickname,
      avatarId: CHARACTER_AVATAR_IDS[nicknameRngSeed % CHARACTER_AVATAR_IDS.length],
      candidates,
      candidateHistory: [serializeCandidateTriplet(professionId, candidates)],
      rerollsUsed: 0,
      allocation: emptyAllocation(),
      startedAt: this.now(),
    };
  }

  private createBackfillDraft(): CharacterCreationDraft {
    const player = this.context.player;
    const save = player.toSaveData();
    const seed = hashLegacySeed(save);
    const professionId = isProfessionId(player.profession) ? player.profession : 'JAVA_BACKEND';
    const candidates = generateCandidateTriplet(seed, professionId);
    return {
      rulesVersion: V59A_RULES_VERSION,
      mode: 'BACKFILL',
      seed,
      step: 'DESTINY',
      professionId,
      professionConfirmed: true,
      nickname: player.characterName ?? '',
      avatarId: CHARACTER_AVATAR_IDS[0],
      candidates,
      candidateHistory: [serializeCandidateTriplet(professionId, candidates)],
      rerollsUsed: 0,
      allocation: emptyAllocation(),
      startedAt: this.now(),
    };
  }

  private updateDraft(
    update: (draft: CharacterCreationDraft) => CharacterCreationDraft,
    invalidStepReason = '当前步骤不能修改此项',
  ): CharacterCreationResult {
    const current = this.readDraft();
    if (!current.ok) return this.failure(current.reason);
    const next = update(current.draft);
    if (next === current.draft) return this.failure(invalidStepReason);
    return this.persist(next);
  }

  private persist(draft: CharacterCreationDraft): CharacterCreationResult {
    try {
      this.writeDraft(draft);
      return { success: true, draft: cloneDraft(draft) };
    } catch (error) {
      return this.failure(`草稿保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private writeDraft(draft: CharacterCreationDraft): void {
    this.storage.setItem(CHARACTER_CREATION_DRAFT_KEY, JSON.stringify(draft));
  }

  private readDraft(): { readonly ok: true; readonly draft: CharacterCreationDraft } | { readonly ok: false; readonly reason: string } {
    try {
      const status = this.context.player.characterSetupStatus;
      if (status === 'COMPLETE') return { ok: false, reason: '角色创建或补录已完成' };
      return { ok: true, draft: this.loadOrCreateDraft(status ?? 'CREATION_REQUIRED') };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private validateStep(draft: CharacterCreationDraft): string | undefined {
    switch (draft.step) {
      case 'INDUSTRY': return draft.industry ? undefined : '请选择行业';
      case 'DIRECTION': return draft.direction ? undefined : '请选择技术研发方向';
      case 'PROFESSION': return draft.professionConfirmed && isProfessionId(draft.professionId) ? undefined : '请选择已开放职业';
      case 'IDENTITY': return validateNickname(draft.nickname).valid && CHARACTER_AVATAR_IDS.includes(draft.avatarId) && draft.background ? undefined : '请填写合法昵称、选择形象和出身';
      case 'DESTINY': return draft.selectedCandidateId ? undefined : '请选择一套天命';
      case 'ALLOCATION': return draft.selectedCandidateId ? undefined : '请先选择一套天命';
      case 'CONFIRM': return this.validateCompleteDraft(draft);
    }
  }

  private validateCompleteDraft(draft: CharacterCreationDraft): string | undefined {
    if (!draft.industry || !draft.direction || !draft.professionConfirmed || !isProfessionId(draft.professionId)) return '行业、方向或职业选择不完整';
    if (!validateNickname(draft.nickname).valid || !CHARACTER_AVATAR_IDS.includes(draft.avatarId)) return '角色名称或形象无效';
    if (!draft.background || !BACKGROUND_IDS.includes(draft.background)) return '出身背景无效';
    if (!draft.selectedCandidateId || !this.findCandidate(draft)) return '请先选择一套完整天命';
    const candidate = this.findCandidate(draft)!;
    try { applyAllocation(candidate.attributes, draft.allocation, 'insight', 0); }
    catch { return '潜力点分配数据无效'; }
    return undefined;
  }

  private findCandidate(draft: CharacterCreationDraft): CharacterCandidate | undefined {
    return draft.selectedCandidateId ? draft.candidates.find((candidate) => candidate.id === draft.selectedCandidateId) : undefined;
  }

  private restorePlayer(player: PlayerData, snapshot: GameSaveData): void {
    Object.assign(player, new PlayerData(snapshot));
  }

  private removeDraftSafely(): void {
    try { this.storage.removeItem(CHARACTER_CREATION_DRAFT_KEY); } catch { /* a completed save is authoritative */ }
  }

  private failure(reason: string): CharacterCreationResult {
    return { success: false, reason };
  }

  private now(): number {
    const value = this.context.clockV2.now();
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
}
