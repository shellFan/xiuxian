import type { FateEventDefinition, FateEventOption, FateEventOutcome } from './fate-event-schema';

export interface SectCareerFateChain {
  readonly sectId: string;
  readonly chainId: string;
  readonly stages: readonly {
    readonly title: string;
    readonly description: string;
    readonly first: string;
    readonly second: string;
    readonly npc: string;
  }[];
}

const stage = (title: string, description: string, first: string, second: string, npc: string) => ({ title, description, first, second, npc });

export const SECT_CAREER_FATE_CHAINS: readonly SectCareerFateChain[] = Object.freeze([
  {
    sectId: 'BIG_TECH', chainId: 'sect_big_tech', stages: [
      stage('大厂晋升竞争：名额传闻', '季度复盘前，团队传出只剩一个高级岗位名额。项目结果、协作口碑和评审材料将一起影响最终排序。', '梳理可量化的核心项目成果', '先与同事确认协作分工与贡献边界', 'BOSS'),
      stage('大厂晋升竞争：核心项目争夺', '技术委员会将重点项目交给候选人竞标，抢到项目能积累影响力，也会挤占准备答辩的时间。', '承担核心模块并写下交付里程碑', '与同组候选人拆分范围共同交付', 'VETERAN'),
      stage('大厂晋升竞争：同事关系考验', '评审人发现关键模块有多人参与，团队要决定是否共享功劳和风险。', '公开列明每位同事的实际贡献', '独自承担汇报并争取推荐', 'JUNIOR'),
      stage('大厂晋升竞争：技术评审', '答辩材料进入技术委员会复核，评委要求解释高并发方案的取舍和事故预案。', '用压测数据解释架构取舍', '复盘一次故障并展示回滚方案', 'BOSS'),
      stage('大厂晋升竞争：岗位定级', '岗位名额即将锁定，委员会综合项目结果、团队关系和评审记录做出决定。', '提交团队交付复盘并申请晋升面谈', '接受本季结果并协商下一季目标', 'HR'),
    ],
  },
  {
    sectId: 'OUTSOURCING', chainId: 'sect_outsourcing', stages: [
      stage('甲方转正机会：客户认可', '甲方负责人认可你的驻场交付，提出参加内部岗位评估的可能，但需要正式招聘流程。', '整理客户验收记录作为推荐材料', '先与客户谈清岗位范围和驻场交接', 'CLIENT'),
      stage('甲方转正机会：交付考核', '客户邀请你解决一个延期风险，结果会进入推荐意见，但不得跳过招聘审批。', '先修复阻塞并提交可复现证据', '协调外包团队共同完成验收', 'CLIENT'),
      stage('甲方转正机会：推荐选择', '客户可以提交技术推荐或团队协作意见，HR仍会独立安排招聘面试。', '争取技术负责人出具交付推荐', '补齐跨团队协作与知识移交材料', 'HR'),
      stage('甲方转正机会：面试准备', '客户招聘组发来内部岗位链接，邀你走正常的申请、面试和合同流程。', '通过宗门招聘页申请客户岗位', '先完成当前合同交接再提交申请', 'HR'),
      stage('甲方转正机会：招聘结果', '客户已记录推荐链路。你需要在宗门招聘页继续真实面试；本事件不会直接改写雇主合同。', '打开招聘页提交甲方岗位申请', '保留当前合同并等待下一轮岗位', 'HR'),
    ],
  },
  {
    sectId: 'IN_HOUSE', chainId: 'sect_in_house', stages: [
      stage('跨部门协作：责任争议', '交付延期后，产品与研发对需求变更时间各执一词，项目群等待一份可核对的记录。', '整理需求变更和验收时间线', '召集双方先确认可交付范围', 'PRODUCT'),
      stage('跨部门协作：证据复核', '会议纪要显示接口在验收前变更，团队需要决定如何划分剩余工作。', '提交接口差异与联调记录', '拆成两张任务单并约定回归时间', 'TESTER'),
      stage('跨部门协作：领导协调', '双方负责人都要求你支持自己的方案，过度站队可能损害长期合作。', '向直属领导请求中立仲裁', '让双方共同确认变更责任', 'BOSS'),
      stage('跨部门协作：联合交付', '新排期已确定，跨部门小组开始联调，接口回归和沟通成本都可见。', '带头完成端到端验收', '辅导新同事补齐回归用例', 'JUNIOR'),
      stage('跨部门协作：复盘定责', '项目完成后，管理层将复盘材料用于绩效评价和下一次跨部门项目推荐。', '提交无责备的改进复盘', '争取领导记录协作贡献', 'BOSS'),
    ],
  },
  {
    sectId: 'FREELANCE', chainId: 'sect_freelance', stages: [
      stage('长期客户：合作邀约', '老客户希望签订长期合作，但报价较低、需求范围尚未明确，信誉和现金流需要平衡。', '接受稳定报价并写清工作范围', '争取更高单价与阶段验收', 'CLIENT'),
      stage('长期客户：范围谈判', '客户追加了两项需求，合同没有覆盖新增工作，是否先做再议由你决定。', '先确认追加需求和对应报价', '提供限时试做并约定停止条件', 'CLIENT'),
      stage('长期客户：风险项目', '客户提出高报价急单，但验收标准模糊，延期会影响后续合作。', '拒绝不清晰条款并补齐验收清单', '接受高风险项目争取额外报酬', 'CLIENT'),
      stage('长期客户：信誉评估', '交付记录将决定客户是否把你列入长期供应商名单，返工和沟通成本同时结算。', '主动演示成果并邀请验收', '先解决遗留问题再谈续约', 'HR'),
      stage('长期客户：续约落定', '客户确定下一阶段合作级别，稳定收益、议价空间和信誉变化都写入项目记录。', '签署有明确验收节点的长期约定', '保留短约并继续争取议价空间', 'CLIENT'),
    ],
  },
  {
    sectId: 'STATE_OWNED', chainId: 'sect_state_owned', stages: [
      stage('年度评审：材料通知', '单位启动年度岗位评审，成果材料、协作评价和周期要求都必须满足。', '按规定准备项目与培训材料', '请导师核对材料缺漏', 'VETERAN'),
      stage('年度评审：项目验收', '评审项目进入验收阶段，流程完整和交付质量同样影响岗位评价。', '完成验收清单并保留签收记录', '协调跨部门补齐缺失附件', 'PRODUCT'),
      stage('年度评审：综合意见', '评审组收集同事和直属领导意见，你可以主动呈现贡献，也可以先修复弱项。', '提交客观贡献说明', '请同事提供协作评价', 'BOSS'),
      stage('年度评审：资格复核', '人事部门核验岗位年限和学习记录，缺项会延后晋升资格而非直接取消工资。', '补交培训与任职记录', '确认下一周期的可执行目标', 'HR'),
      stage('年度评审：结果沟通', '评审结果将决定晋升资格和福利档位，未通过者可获得下一周期的明确要求。', '申请记录评审反馈并规划晋升', '先巩固岗位成果再参加下轮评审', 'HR'),
    ],
  },
  {
    sectId: 'STARTUP', chainId: 'sect_startup', stages: [
      stage('资金危机：现金流告警', '创业团队的现金流预警亮起，关键项目尚未回款，管理层讨论交付和成本优先级。', '确认回款节点并缩减非关键范围', '投入冲刺争取提前验收', 'BOSS'),
      stage('资金危机：交付取舍', '客户要求增加功能但款项仍未到账，团队需要防止质量债务继续扩大。', '锁定最小可验收版本', '先做演示版换取客户确认', 'CLIENT'),
      stage('资金危机：资金谈判', '投资方要求看到可靠数据，项目负责人需要提供现金流、留存和交付证据。', '整理可审计的经营数据', '争取客户预付款并调整排期', 'PRODUCT'),
      stage('资金危机：岗位预警', '资金计划仍有缺口，管理层开始评估岗位与项目优先级，员工收到风险提示。', '用关键交付和成本节省争取保岗', '提前准备外部求职计划', 'HR'),
      stage('资金危机：去留决定', '董事会确认续资或收缩方案，项目成果与前期选择影响团队安置和后续求职记录。', '提交最终交付证明并申请留任', '接受调整方案并保留补偿记录', 'BOSS'),
    ],
  },
  {
    sectId: 'PRIVATE', chainId: 'sect_private', stages: [
      stage('一人多岗：岗位缺口', '小厂多个关键岗位同时缺人，主管希望你临时兼任，但现有项目仍需按期完成。', '确认职责边界后承担短期轮值', '拒绝新增范围并请求调整排期', 'BOSS'),
      stage('一人多岗：职责冲突', '临时职责和原有工作撞期，两个项目都要求你优先处理，健康与交付风险上升。', '与主管排定优先级与停止条件', '先完成客户影响最大的任务', 'CLIENT'),
      stage('一人多岗：加薪谈判', '你已连续承担多项职责，主管愿意讨论津贴或技能培训，但需要用结果支撑。', '提交职责清单争取津贴', '申请培训并限定兼岗周期', 'HR'),
      stage('一人多岗：技能成长', '团队开始补招，新同事需要交接文档，现有任务仍有积压。', '整理操作手册并辅导新人', '优先清理高风险遗留工作', 'JUNIOR'),
      stage('一人多岗：岗位复盘', '主管复核兼岗表现，决定转为正式职责、发放阶段奖励或恢复单岗安排。', '要求确认正式职责与对应薪酬', '结束轮值并恢复专注交付', 'BOSS'),
    ],
  },
  {
    sectId: 'FOREIGN', chainId: 'sect_foreign', stages: [
      stage('跨时区项目：紧急请求', '海外团队提出跨时区紧急协作，原有白天排期与夜间会议发生冲突。', '申请调整工作时段并安排白天休息', '先书面确认交付范围和响应窗口', 'OPS'),
      stage('跨时区项目：排期协调', '多个地区的负责人对最终时间有不同理解，团队需要一份可执行的里程碑表。', '按时区拆分里程碑和负责人', '争取一次联合评审减少返工', 'PRODUCT'),
      stage('跨时区项目：加班审批', '临时夜间支持需要提前审批，未获批准的时间不能计为计薪加班。', '向主管提交必要性与时长申请', '协商次日顺延并保护休息时间', 'BOSS'),
      stage('跨时区项目：交付风险', '海外依赖服务发生抖动，故障响应窗口与健康安排都需要纳入预案。', '建立告警升级和回滚方案', '与海外团队共享故障排查清单', 'OPS'),
      stage('跨时区项目：认可结算', '项目完成后，团队按交付、协作和工时记录结算专业认可与后续排期。', '提交复盘并争取专业认可', '确认后续时段安排再接受续约', 'HR'),
    ],
  },
]);

function outcome(text: string, nextEventId: string | undefined, flag: string, values: { performance: number; mind: number; relationship: number; npc: string }): FateEventOutcome {
  return {
    text,
    performance: values.performance,
    mind: values.mind,
    relationship: { [values.npc]: values.relationship },
    setFlags: [`${flag}:resolved`, ...(nextEventId ? [] : [`career:chain:${flag.split(':')[2]}:complete`])],
    ...(nextEventId ? { nextEventId } : {}),
  };
}

function makeOption(id: string, text: string, nextEventId: string | undefined, flag: string, npc: string, evidence: boolean): FateEventOption {
  const next = (values: { performance: number; mind: number; relationship: number }) => outcome(
    `${text}，阶段记录已保存并进入后续评估。`, nextEventId, flag, { ...values, npc },
  );
  const fail = (values: { performance: number; mind: number; relationship: number }) => outcome(
    `${text}遇到阻力，相关记录仍保留，后续阶段将继续处理。`, nextEventId, flag, { ...values, npc },
  );
  return {
    id, text, successChance: evidence ? 0.76 : 0.68,
    success: next(evidence ? { performance: 6, mind: -1, relationship: 2 } : { performance: 2, mind: 3, relationship: 4 }),
    failure: fail(evidence ? { performance: -2, mind: -3, relationship: -1 } : { performance: -1, mind: -2, relationship: -2 }),
  };
}

export const SECT_CAREER_FATE_EVENTS: readonly FateEventDefinition[] = Object.freeze(SECT_CAREER_FATE_CHAINS.flatMap((chain) =>
  chain.stages.map((content, index) => {
    const stageNumber = index + 1;
    const id = `${chain.chainId}_s${stageNumber}`;
    const nextEventId = stageNumber < chain.stages.length ? `${chain.chainId}_s${stageNumber + 1}` : undefined;
    const flag = `career:chain:${chain.sectId}:stage:${stageNumber}`;
    return Object.freeze({
      id,
      title: content.title,
      description: content.description,
      category: 'CHAIN' as const,
      weight: 1,
      trigger: stageNumber === 1
        ? { milestone: `career:sect-chain:${chain.sectId}` }
        : { chainId: chain.chainId, chainStage: stageNumber },
      chainId: chain.chainId,
      chainStage: stageNumber,
      options: [
        makeOption('DOCUMENT', content.first, nextEventId, flag, content.npc, true),
        makeOption('COORDINATE', content.second, nextEventId, flag, content.npc, false),
      ],
    });
  }),
));
