# V12–V20 开发日志（DEVELOPMENT_LOG）

## 2026-11-22 · R3 炼丹二期·队列化（派生式，任务书§7.4/第七部分）

- 技能：`save-systems`（Clock 权威时间/防重复领取）、`game-feel`（入炉/领取反馈）。详见 ALCHEMY_V2.md
- 架构：队列状态 = lifetimeStats 键 `craftQueue:<recipeId>` = 完成时间戳（epoch，Clock 注入）——离线/挂机自然完成；防重复领取 = 领取同事务清键；时钟回拨只会延迟领取（安全侧）
- 实现：craft.json 9 配方 durationSeconds 30-420s；startCraft（成功率掷骰在投入时点，失败不入队）/claimCraft（到期领取+品质+同事务清键）/getQueue+容量 3+去重；itemCraftQueued 事件；overlay 丹炉卡片（倒计时/领取）+按钮分流
- 测试：craft **26/26**（新增 6 用例）；全量 **193 文件 exit 0**
- 运行证据：探针 A10——UI 入炉（丹炉 1/3+倒计时）→ 32s 后领取（quality normal、队列清空、successCount 1）；UI 点击被事件弹窗竞态时 fallback 直调兜底（如实记录）
- 涉及文件：craft.json、craft-service.ts、game-events.ts、game-facade.ts、ui-overlay.js、tests/craft/、v11-acceptance-probe.cjs


> 持续追加。格式：日期 | 切片 | 技能 | 设计依据 | 修改 | 测试。
> 基线：feature/v10-final-release @ 8c026bb（V11 全部成果沉淀于 docs/V11_V15/）。

## 2026-11-22 · R2 五路线天赋系统（派生式，任务书§第六部分）

- 技能：`rpg`（点数经济/路线取舍）、`save-systems`（派生式重施）、`game-ui-ux`（五路线 tab 页）
- 架构（与境界同模式）：节点等级走 lifetimeStats 开放键 + buff 载体（boot 重施等价永久）——**审计发现 buff 不持久化**，若不做启动重施则天赋是空壳，故 applyAllActiveBuffs() 在 GameContext 构造时按节点等级重施
- 实现：
  - `configs/talent-tree.json`（新）：50 节点（5 路线 × 10），tier 1-5 链式前置、maxRank 3、整路线满级 165 点 vs 全期可得 ~56 点 → **单精通 vs 均衡真实取舍**
  - 7 个效果载体（3 个新增 BuffType）：WORK_SALARY/KPI_PROGRESS（职场）、FISHING_MIND（摸鱼）、WORK_CULTIVATION+CRAFT_SUCCESS（修仙奇才）、NPC_FAVOR_BOOST（社交，npc-weekend-service.change 好感乘子接线）、MERGE_REWARD+CRAFT_COST_REDUCTION（资源管理，craft-service 成功率乘子+成本折扣接线）
  - `services/talent-tree-service.ts`（新）：点数账本（careerLevel + 渡劫门×2）/升级（依赖+点数校验+buff 重施）/重置（50% 返还+移除 buff）/构造期校验
  - overlay MORE「天赋」页：五路线 tab、节点 rank 展示、升级/重置按钮、点数头部
- 测试：**talent 7/7**（点数派生/依赖/ledger/buff 授予与升级/重置返还/折扣载体/生产配置）；全量 **193 文件 exit 0**
- 运行证据：探针 A9（12/12 PASS）——真实 UI 升级 CAREER_N1 → rank1、spent 1、**WORK_SALARY_BOOST ×1.03 真实生效**；A3 随机出【良品】×1.3 再次实证品质结算
- 涉及文件：talent-tree.json(新)、talent-tree-service.ts(新)、buff-service.ts(BuffType+3)、npc-weekend-service.ts(好感乘子)、craft-service.ts(成功率/成本乘子+回滚修正)、game-context/game-facade、ui-overlay.js、tests/talent/(新)

## 2026-11-22 · R1 独立修仙境界系统（派生式，任务书最高优先级 D）

- 技能：`rpg`（境界 pacing/突破风险）、`save-systems`（零迁移状态设计）、`game-feel`（渡劫反馈）、`game-ui-ux`（双境界同屏展示）
- **基线对账（§3）**：fetch 全远程——feature/v10-final-release @ 8c026bb 与远程同步为最新；用户 WIP（save/cultivation/daily）仍未提交 → 派生式架构绕开（决策记录 REALM_DESIGN §1）
- 审计发现：**修仙页（renderCultivation）是第二个孤儿页**（case 'CULTIVATION' 无导航入口）→ MORE 网格补「修仙」条目
- 实现：
  - `configs/realm.json`：30 层（10 境 × 3 小层），阈值 0→5,000,000 指数曲线；9 渡劫门（灵石 50→8000 / 成功率 0.85→0.62 / 奖励 salary 100→120000 / 修炼加成 +4%→+10%）
  - `services/realm-service.ts`（新）：getState 派生（exp+gate 标记）/ canBreakthrough / breakthrough（事务化+失败补偿+越挫越勇）/ 构造期校验
  - 持久化：lifetimeStats 键 `realmGatePassed:<n>` / `realmGateFails:<n>` / `realmHighestReached`（开放键值白名单，零 schema 变更）
  - 加成通路：突破成功 → BuffService addBuff('WORK_CULTIVATION_BOOST') → work-service 修为收益聚合（真实生效，非空壳）
  - game-context 注册 realm；facade queryRealmState/breakthroughRealm；game-events + PHASE2 刷新表
  - overlay 修仙页境界卡（进度/待渡劫/渡劫按钮/补偿展示）+ 渡劫结果 toast（成功触发 promotion 级特效）+ MORE「修仙」入口
  - 音效触发器 realmAdvanced/failed（dispatcher+map 双源）；REALM 成就 5 个（115→120，LIFETIME_STAT realmHighestReached）
- 测试：**realm 8/8**（推导/gate 阻挡/成功持久化/失败补偿/灵石不足/二级门/坏配置/生产配置）；全量 **192 文件 exit 0**；content:check PASSED
- 运行证据：探针 **10/10 PASS**（新增 A8：境界卡渲染「待渡劫」+ 真实点击渡劫成功 toast「渡劫成功！晋入 炼气初期·修炼效率+4%」+ lifetimeStats 一致性）；截图 09/10
- 过程修复：Cocos 编辑器构建挂死（僵尸进程）→ 清理后 17s 成功；探针周报弹窗遮蔽 → dismissModals DOM 兜底；A8 断言键位勘误（gate index=3 非 1）
- 涉及文件：realm.json(新)、realm-service.ts(新)、game-context/game-events/game-facade、ui-overlay.js、animation-dispatcher.ts、animation-trigger-map.json、achievements.json、achievement-service/config-types/config-service（REALM 类别）、tests/realm/(新)、tests/events/game-events-refresh、scripts/v11-qa/v11-acceptance-probe.cjs
