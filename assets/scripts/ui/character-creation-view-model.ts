import type { CharacterCreationView } from '../v59/character-creation-service';
import {
  ALLOCATION_POINT_BUDGET,
  ALLOCATION_INCREMENT,
  CHARACTER_ATTRIBUTE_MAX,
  CREATION_STEPS,
  STAT_KEYS,
  validateNickname,
  type CharacterCandidateId,
  type CreationStep,
  type StatKey,
} from '../v59/character-rules';

export interface CharacterCreationOptionViewModel {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly selected: boolean;
  readonly enabled: boolean;
}

export interface CharacterCandidateViewModel {
  readonly id: CharacterCandidateId;
  readonly title: string;
  readonly description: string;
  readonly selected: boolean;
}

export interface CharacterStatViewModel {
  readonly id: StatKey;
  readonly label: string;
  readonly baseValue: number;
  readonly allocated: number;
  readonly value: number;
  readonly canIncrease: boolean;
  readonly canDecrease: boolean;
  readonly increaseDisabledReason?: string;
  readonly decreaseDisabledReason?: string;
}

export interface CharacterCreationViewModel {
  readonly status: CharacterCreationView['status'];
  readonly visible: boolean;
  readonly isComplete: boolean;
  readonly isBackfill: boolean;
  readonly step?: CreationStep;
  readonly stepIndex: number;
  readonly totalSteps: number;
  readonly title: string;
  readonly description: string;
  readonly progressText: string;
  readonly errorText: string;
  readonly nickname: string;
  readonly options: readonly CharacterCreationOptionViewModel[];
  readonly avatarOptions: readonly CharacterCreationOptionViewModel[];
  readonly backgroundOptions: readonly CharacterCreationOptionViewModel[];
  readonly candidates: readonly CharacterCandidateViewModel[];
  readonly stats: readonly CharacterStatViewModel[];
  readonly remainingPoints: number;
  readonly rerollsRemaining: number;
  readonly canBack: boolean;
  readonly canContinue: boolean;
  readonly canReroll: boolean;
  readonly canFinalize: boolean;
  readonly canCompleteBackfill: boolean;
  readonly nextLabel: string;
  readonly confirmationLines: readonly string[];
}

const STEP_COPY: Record<CreationStep, { readonly title: string; readonly description: string }> = {
  INDUSTRY: { title: '选择行业', description: '互联网行业已开放，其他行业仍在招募中。' },
  DIRECTION: { title: '选择方向', description: '从技术研发开始你的职场修仙路。' },
  PROFESSION: { title: '选择职业', description: '职业决定初始技能、装备和天命属性倾向。' },
  IDENTITY: { title: '定义身份与出身', description: '输入昵称，选择本地角色形象和出身履历。' },
  DESTINY: { title: '选择天命', description: '三套天命只能选择一套，免费推演最多三次。' },
  ALLOCATION: { title: '分配潜力', description: '增加操作一次投入 5 点；已投入的点可逐点撤回。' },
  CONFIRM: { title: '确认降世', description: '检查角色资料，确认后正式入职。' },
};

const STAT_LABELS: Readonly<Record<StatKey, string>> = {
  insight: '悟性',
  constitution: '根骨',
  perception: '神识',
  fortune: '机缘',
  willpower: '心性',
};

const DESTINY_COPY = {
  LABOR_SAINT: {
    name: '天生牛马圣体',
    benefit: '疲劳增长降低 20%。',
    cost: '当前没有额外负面命格效果。',
    fit: '适合所有职业的稳健耐久路线。',
  },
  KING_OF_GRIND: {
    name: '绝世卷王',
    benefit: '职业技能成长提高 20%。',
    cost: '工作和修炼时的道心消耗提高 25%。',
    fit: '适合希望更快积累职业经验的路线。',
  },
  FISHING_IMMORTAL: {
    name: '摸鱼仙尊转世',
    benefit: '摸鱼奇遇权重效果尚未接入。',
    cost: '常规工作结算降低 10%。',
    fit: '偏向摸鱼玩法；本命格的正向效果仍待实现。',
  },
  SCAPEGOAT: {
    name: '天选背锅侠',
    benefit: '成功化解责任事件后，绩效成长提高 50%。',
    cost: '背锅事件的触发权重尚未接入。',
    fit: '适合通过责任事件处理来成长的职业路线。',
  },
  CODE_SPIRIT: {
    name: '代码通灵体',
    benefit: '技术任务进度提高 10%。',
    cost: '非技术事项没有额外加成。',
    fit: '契合互联网技术研发方向，不提供通用战斗加成。',
  },
  SOCIAL_FATE: {
    name: '社交天命者',
    benefit: 'NPC 协助提高 15%，正向关系成长提高 25%。',
    cost: '独处型任务进度降低 10%。',
    fit: '适合依赖 NPC 协作与关系成长的路线。',
  },
} as const;

function option(
  id: string,
  title: string,
  description: string,
  selected: boolean,
  enabled = true,
): CharacterCreationOptionViewModel {
  return { id, title, description, selected, enabled };
}

export function buildCharacterCreationViewModel(source: CharacterCreationView): CharacterCreationViewModel {
  const draft = source.draft;
  const complete = source.status === 'COMPLETE';
  if (!draft) {
    return {
      status: source.status,
      visible: !complete,
      isComplete: complete,
      isBackfill: source.status === 'BACKFILL_REQUIRED',
      stepIndex: -1,
      totalSteps: CREATION_STEPS.length,
      title: complete ? '角色已创建' : '角色资料无法读取',
      description: complete ? '已完成牛马降世。' : '请稍后重试，现有存档不会被覆盖。',
      progressText: '',
      errorText: source.error ?? '',
      nickname: '',
      options: [],
      avatarOptions: [],
      backgroundOptions: [],
      candidates: [],
      stats: [],
      remainingPoints: ALLOCATION_POINT_BUDGET,
      rerollsRemaining: 0,
      canBack: false,
      canContinue: false,
      canReroll: false,
      canFinalize: false,
      canCompleteBackfill: false,
      nextLabel: '',
      confirmationLines: [],
    };
  }

  const isBackfill = draft.mode === 'BACKFILL';
  const stepIndex = CREATION_STEPS.indexOf(draft.step);
  const selectedCandidate = draft.selectedCandidateId
    ? draft.candidates.find((candidate) => candidate.id === draft.selectedCandidateId)
    : undefined;
  const spent = STAT_KEYS.reduce((sum, key) => sum + draft.allocation[key], 0);
  const remainingPoints = Math.max(0, ALLOCATION_POINT_BUDGET - spent);
  const candidates = draft.candidates.map((candidate) => {
    const destiny = DESTINY_COPY[candidate.destinyId];
    const attributes = STAT_KEYS.map((key) => `${STAT_LABELS[key]} ${candidate.attributes[key]}`).join(' · ');
    return {
      id: candidate.id,
      title: destiny.name,
      description: `优点：${destiny.benefit}\n代价：${destiny.cost}\n职业契合：${destiny.fit}\n${attributes}`,
      selected: draft.selectedCandidateId === candidate.id,
    };
  });
  const stats = selectedCandidate ? STAT_KEYS.map((key) => {
    const allocated = draft.allocation[key];
    const value = selectedCandidate.attributes[key] + allocated;
    const inAllocationStep = draft.step === 'ALLOCATION';
    const canIncrease = inAllocationStep
      && remainingPoints >= ALLOCATION_INCREMENT
      && value + ALLOCATION_INCREMENT <= CHARACTER_ATTRIBUTE_MAX;
    const canDecrease = inAllocationStep && allocated > 0;
    return {
      id: key,
      label: STAT_LABELS[key],
      baseValue: selectedCandidate.attributes[key],
      allocated,
      value,
      canIncrease,
      canDecrease,
      increaseDisabledReason: canIncrease ? undefined
        : !inAllocationStep ? '当前步骤不可分配潜力'
          : remainingPoints < ALLOCATION_INCREMENT ? `剩余潜力不足 ${ALLOCATION_INCREMENT} 点`
            : `增加 ${ALLOCATION_INCREMENT} 点将超过属性上限 ${CHARACTER_ATTRIBUTE_MAX}`,
      decreaseDisabledReason: canDecrease ? undefined
        : !inAllocationStep ? '当前步骤不可撤回潜力'
          : '尚未分配该属性，不能降低基础值',
    };
  }) : [];
  const options = buildOptions(draft.step, draft);
  const avatarOptions = buildAvatarOptions(draft);
  const backgroundOptions = buildBackgroundOptions(draft);
  const stepValid = isStepValid(draft.step, draft);
  const canFinalize = !isBackfill && draft.step === 'CONFIRM' && stepValid;
  const canCompleteBackfill = isBackfill && !!selectedCandidate;
  const copy = isBackfill
    ? { title: '补录天命', description: '保留现有进度，只为旧角色补录一套天命属性。' }
    : STEP_COPY[draft.step];

  return {
    status: source.status,
    visible: true,
    isComplete: false,
    isBackfill,
    step: draft.step,
    stepIndex,
    totalSteps: CREATION_STEPS.length,
    title: copy.title,
    description: copy.description,
    progressText: isBackfill ? '旧档补录' : `${stepIndex + 1}/${CREATION_STEPS.length}`,
    errorText: source.error ?? '',
    nickname: draft.nickname,
    options,
    avatarOptions,
    backgroundOptions,
    candidates,
    stats,
    remainingPoints,
    rerollsRemaining: isBackfill ? 0 : Math.max(0, 3 - draft.rerollsUsed),
    canBack: !isBackfill && stepIndex > 0,
    canContinue: isBackfill ? canCompleteBackfill : stepValid,
    canReroll: !isBackfill && draft.step === 'DESTINY' && draft.rerollsUsed < 3,
    canFinalize,
    canCompleteBackfill,
    nextLabel: isBackfill ? '确认补录' : (draft.step === 'CONFIRM' ? '确认入职' : '下一步'),
    confirmationLines: draft.step === 'CONFIRM' && selectedCandidate ? [
      `昵称：${draft.nickname}`,
      `职业：${professionName(draft.professionId)}`,
      `出身：${backgroundName(draft.background)}`,
      `天命：${DESTINY_COPY[selectedCandidate.destinyId].name}`,
      ...stats.map((stat) => `${stat.label}：${stat.value}`),
    ] : [],
  };
}

function buildOptions(
  step: CreationStep,
  draft: NonNullable<CharacterCreationView['draft']>,
): readonly CharacterCreationOptionViewModel[] {
  switch (step) {
    case 'INDUSTRY':
      return [
        option('INTERNET', '互联网', '已开放', draft.industry === 'INTERNET'),
        option('FINANCE', '金融', '暂未开放', false, false),
        option('MANUFACTURING', '制造业', '暂未开放', false, false),
      ];
    case 'DIRECTION':
      return [
        option('TECH_RND', '技术研发', '已开放', draft.direction === 'TECH_RND'),
        option('PRODUCT', '产品策划', '暂未开放', false, false),
        option('OPERATIONS', '业务运营', '暂未开放', false, false),
      ];
    case 'PROFESSION':
      return [
        option('JAVA_BACKEND', 'Java 后端', '稳健、耐久、擅长系统攻坚', draft.professionConfirmed && draft.professionId === 'JAVA_BACKEND'),
        option('FRONTEND', '前端开发', '灵活、敏锐、擅长体验塑造', draft.professionConfirmed && draft.professionId === 'FRONTEND'),
        option('QA', '测试工程师', '洞察风险，擅长发现破绽', draft.professionConfirmed && draft.professionId === 'QA'),
        option('DEVOPS', '运维工程师', '体魄强韧，擅长稳定局势', draft.professionConfirmed && draft.professionId === 'DEVOPS'),
      ];
    case 'IDENTITY':
    case 'DESTINY':
    case 'ALLOCATION':
    case 'CONFIRM':
      return [];
  }
}

function buildAvatarOptions(
  draft: NonNullable<CharacterCreationView['draft']>,
): readonly CharacterCreationOptionViewModel[] {
  if (draft.step !== 'IDENTITY') return [];
  return ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4'].map((id, index) =>
    option(id, `形象 ${index + 1}`, '本地角色形象', draft.avatarId === id));
}

function buildBackgroundOptions(
  draft: NonNullable<CharacterCreationView['draft']>,
): readonly CharacterCreationOptionViewModel[] {
  if (draft.step !== 'IDENTITY') return [];
  return [
    option('ORDINARY_WORKER', '普通牛马', '从最熟悉的工位开始修行', draft.background === 'ORDINARY_WORKER'),
    option('CULTIVATION_GRAD', '修仙科班', '带着理论基础进入职场', draft.background === 'CULTIVATION_GRAD'),
    option('CAREER_CHANGER', '转行散修', '过往经历让你更能适应变化', draft.background === 'CAREER_CHANGER'),
  ];
}

function isStepValid(step: CreationStep, draft: NonNullable<CharacterCreationView['draft']>): boolean {
  switch (step) {
    case 'INDUSTRY': return draft.industry === 'INTERNET';
    case 'DIRECTION': return draft.direction === 'TECH_RND';
    case 'PROFESSION': return draft.professionConfirmed;
    case 'IDENTITY': return validateNickname(draft.nickname).valid
      && /^avatar-[1-4]$/.test(draft.avatarId)
      && draft.background !== undefined;
    case 'DESTINY': return draft.selectedCandidateId !== undefined;
    case 'ALLOCATION': return draft.selectedCandidateId !== undefined
      && STAT_KEYS.reduce((sum, key) => sum + draft.allocation[key], 0) === ALLOCATION_POINT_BUDGET;
    case 'CONFIRM': return !!draft.industry
      && !!draft.direction
      && draft.professionConfirmed
      && validateNickname(draft.nickname).valid
      && !!draft.background
      && !!draft.selectedCandidateId
      && STAT_KEYS.reduce((sum, key) => sum + draft.allocation[key], 0) === ALLOCATION_POINT_BUDGET;
  }
}

function professionName(id: string): string {
  return ({ JAVA_BACKEND: 'Java 后端', FRONTEND: '前端开发', QA: '测试工程师', DEVOPS: '运维工程师' } as Record<string, string>)[id] ?? id;
}

function backgroundName(id: string | undefined): string {
  if (!id) return '未选择';
  return ({ ORDINARY_WORKER: '普通牛马', CULTIVATION_GRAD: '修仙科班', CAREER_CHANGER: '转行散修' } as Record<string, string>)[id] ?? id;
}
