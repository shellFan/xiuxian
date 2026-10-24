# V5.9-N.11 实施状态地图(内部工作文档)

> 用途:避免重复造轮子。基于 2026-10-24 HEAD `9466c22` 的代码侦察(两轮并行只读审查)。

## 1. 系统现状速览

| 系统 | 当前实现 | 玩家入口 | 权威数据源 | 测试 | 已知缺陷/机会 | 本轮动作 |
|---|---|---|---|---|---|---|
| 角色创建 | V5.9 全流程(行业→职业→命格→分配→入职) | EXE 启动强制 | character-creation-service | v59/* 8 文件 | 无重大缺陷 | 不动 |
| 四职业 | 6 定义(4 激活:JAVA/FRONTEND/QA/DEVOPS)+26 任务+104 职业事件(task-runtime 消费)+perk 10 级+职业怪池/Boss 池 | chooseProfession | profession-content.json | profession-* | 专属**行动**缺失;specialty tag 数组未消费 | **加职业专属每日行动×4** |
| 宗门(4 个,非 8) | PRIVATE/FOREIGN/STATE/BIG_TECH,8 个 modifier 中 **3 个死配置**(cultivation/mind/performanceMultiplier 无消费者) | changeSect(24h 冷却,免费) | sect.json | sect-* 少量 | 无宗门专属事件;贡献系统不存在 | **接通死 modifier + 宗门事件链** |
| 公司(平行系统) | COMP_* 4 家,Offer 切换,公司 11 字段 runtime 表 | offer 决策 | week-content.json | offer tests | 与 sectId 无同步(设计如此) | 不动 |
| 卡牌战斗 | tick 制自动战斗+主动技 castSkill(攻击步+冷却)+进化+共鸣+18 Boss 机制(LINKED/REVIVE/DODGE/BLIND/SUMMON/RAGE/ENRAGE/LOCK/DRAIN/PROMOTE/AS_DEBUFF/RANDOM) | queryBattle/startBattleRun | battle-content+extension | v4-battle 等 | **telegraphed 只进日志不上 UI**;castSkill 无技能特异行为;**dodgeBonus 死属性**;无能量系统 | **意图 UI 化 + castSkill 特异行为 + dodgeBonus 接通** |
| Fate 事件 | 129 随机事件+70 加班事件,链 10 条,效果键 20+(salary/buff/incident/techDebt/assignTask/openCase/startOvertime/material/evidence/relationship...) | 事件弹窗 | events.json | event tests | 无 sectId 条件;宗门事件缺失 | **加 sectId requirement + 12+ 新事件** |
| NPC 关系 | relationships{npc:±100},事件/NPC 周末活动影响 | 事件/周末 | player-data | messenger tests | 现状可玩 | 不动 |
| 工资/工时 | 4 工作模式+窗口门控+wageMultiplier(N.10)+离线统一(N.10) | 主界面 | work/idle service | wage-window 等 | N.10 已修 | 回归保护 |
| 加班审批 | offer/accept/voluntary(paid 1.5×/2.0×)+免费加班抑制事件 | 加班弹窗 | overtime-service | overtime-* | 可玩 | 不动 |
| 生活消费 | HOME_LIFE_DEFS 5 项(次数限制)+消耗品 10 种+周末活动 4 选 1+burnout 请假 | home 面板 | home/item service | home tests | 行动框架完整;低成本活动缺失 | 小增(可选) |
| 心情/道心/健康 | mind/innerDemon/fatigue 三资源,N.10 平衡后健康 | HUD | mind/burnout service | balance sim 30/30 | N.10 已修 | 回归保护 |
| 晋升 | promotion-service(概率+选项)+career 10 级 | 晋升弹窗 | promotion.json | promotion tests | retry 门禁仅内存(P2 遗留) | 不动 |
| 裁员/再就业 | layoff 事件链(layoff_s0-s3)+Offer 再就业 | 事件链 | events.json | 30-day stress | 闭环存在 | 不动 |
| 死亡/重生 | **不存在转世系统**;destinyId=命格(6 选 1,hook 乘数);战斗灾备重生 | 创建时 | character-rules | v59 tests | 任务提到的"死亡重生"实为命格+战斗复活 | 不动(不做转世) |
| 离线奖励 | 统一口径(N.10)+幂等 | 欢迎弹窗 | idle/offline service | parity tests | N.10 已修 | 回归保护 |
| 存档 | v14 schema-on-read+原子写+备份+fail-closed | 自动 | save-service | save tests | 稳健 | 不动 |
| PC UI | DOM overlay(WebV1PanelRenderer)+ui-overlay.js 4000 行 | 全部 | — | overlay tests | 战斗意图/防御反馈缺展示 | **战斗 UI 增强** |
| GamePlay Agent | EXE CDP Gate(13 场景)+playable-loop 单测 | tmp 脚本 | facade API | gate json | 需扩新玩法场景 | **扩展 Gate** |

## 2. 本轮范围(P0 优先,可验证闭环)

1. **卡牌策略深化**:敌人意图上 UI(telegraphed 渲染 + 即将到来的机制种类)、castSkill 按技能类型产生特异即时效果(防御技=加盾、控制技=减速/闪避、攻击技=攻击步)、dodgeBonus 接通(玩家闪避率)。保留回合制,不恢复点敌扣血。
2. **职业专属行动×4**:新 `profession-action-service`(每职业 1 个每日行动:重构代码/调优界面/回归排查/线上巡检),产出走现有权威状态(material/performance/evidence/techDebt+工资/修为),次数/冷却/成本约束,overlay 按钮+反馈。
3. **宗门经营差异**:接通 3 个死 modifier(cultivation→修为结算、mind→道心恢复、performance→绩效增益)+ 事件 `requires.sectId` 支持 + 每宗门 2 个专属事件链(共 8 个),选择有代价。
4. **Fate 事件扩容**:新事件 ≥12(宗门 8 + 稀有命运 2 + 取舍型 2),全部走现有 schema/链/flag,含测试。
5. **每日行动建议**:home `nextAction` 纳入职业行动/宗门事件/战斗目标;主页突出 3 件最值得做的事。
6. 全量测试/模拟回归(30/30 保持)/EXE/20 分钟 soak。

## 3. 明确不做

- 不新增宗门/公司/职业;不做转世系统;不做宗门贡献大系统;不改 N.10 经济公式;不恢复点敌扣血;不引入能量系统(冷却+意图已够策略深度)。

## 4. 事实修正记录

- 任务书所称"八宗门"实际为 4 宗门(+4 公司平行系统);按"以当前实现为准"原则处理 4 宗门。
- "死亡重生"实为命格(destinyId)+ 战斗内灾备重生;无转世系统。
- 职业事件已存在 104 个(task-runtime 消费、不进随机池),不重复建设。
