# V5.8 ULTRA DEEP RELEASE VALIDATION — Developer Report

日期：2026-10-06
BASE SHA：10a2bb522f5c50664bf33499db6a048f41079f3a（== origin，起跑干净）
FINAL SHA：见文末 Git Final
QA 工具区：`ai/qa-ultra/96b6a/`（untracked；复用 `ai/qa-final/` 的 CDP 链）
STATUS：**READY FOR INDEPENDENT QA**

---

## 25 Executive Summary

本轮为 QA-FIRST/FIX-IF-NEEDED 刀耕火种轮：静态审计 ×3 代理 + 1100 场战斗仿真 + 1000 次任务状态机转移 + 损坏矩阵 C01-C20 + EXE 酷刑（close 矩阵/25 轮重启压力/fast×10/crash 恢复/20 轮泄漏/双实例）+ 真实 EXE 战斗终局 + 13 类弹窗矩阵 + 四职业复验 + Balance personas。**发现并修复 BLOCKER×1、HIGH×5、MEDIUM×5**；修复后全量回归 137/137、fresh package、最终 Runtime Gate 全绿。

## 26 Bugs Found & Fixed

| ID | Sev | 复现 | 根因 | 修复 | 回归 |
|---|---|---|---|---|---|
| UD-1 | **BLOCKER** | 任务运行时首事件对 ~60% 种子无限循环 → 游戏永久冻结 | `buildTriggerSchedule` count=6 无上限拒绝采样（数学上多数 seed 无解） | 迭代上限 500 + 间距逐级降级 12→8→5→0 + 确定性均匀兜底；同 seed 仍确定 | 50k 种子×7 count 全终止 1.4s（`ultra-deep-fixes.test.ts`） |
| UD-2 | HIGH | 领取后重开同类任务 → claimed 槽复活 + 积压超 maxActive=3 | startTask 只查"未领取同 id"，ensureRuntime 按 taskId 键替换时把 claimed 旧槽改写成活任务 | startTask 先替换 claimed 孪生条目 | 同上测试 |
| UD-3 | HIGH（静态） | 进化/共鸣 7 个效果字段配置声明但运行时零消费（enemySlowDelta/summonCapBonus/reviveOnce/immuneEverySec/maxHpBonus/lootBonusDelta） | playerSkillStats 不读取；共鸣循环同 | 全部接入聚合：enemySlow 逐跳减速（≤60%）、召唤上限、免疫/复活聚合、新激活共鸣一次性 maxHp、loot roll | 1000 场仿真 0 异常 |
| UD-4 | HIGH | 晋升冷却旗标写 Date.now() 读 clock.now() —— 16× 加速下冷却以 16 倍速流逝 | 写读时钟不一致 | 写侧改 clockV2.now() 锚定 | 全套回归 |
| UD-5 | HIGH | 宗门切换 24h 冷却走真实墙钟（同上漂移） | 同上 | clockV2 锚定 | 全套回归 |
| UD-6 | HIGH | 每日计划永生（D1→D7 同 3 条，capacity 失真） | beginWorkday `if (dailyPlan.length>0) return` 且无人清空 | 日翻块清空昨日计划 | v5 集成回归 |
| UD-7 | HIGH | 每日计划日戳锚 UTC dayNumber —— UTC+8 下 08:00 翻转早于 09:00 dayIndex，事件误记前一日、新日 beginWorkday 被跳过 | 时区日界错位 | 改锚 dayIndex | 同上 |
| UD-8 | HIGH | 战斗 Boss 全池随机，3/4 遭遇他职业专属 Boss | monsterPool() 只含 mon_*，与职业 bosses 数组交集 0 → 门控不可达 | spawnWave BOSS tier 并入职业 bosses 80/20 门控（独立分支，防二次过滤重洗） | 复验泄漏率 54%→31%→**19.2%（≤20% PASS）** |
| UD-9 | MEDIUM | fireRuntimeEvent 重建触发表硬编码 count=6，SHORT 任务实发 4+ 次事件（分带 0-2） | 重建未走 eventCountForDuration | 沿用分带值 | 137 套件 |
| UD-10 | MEDIUM | D7 周结算弹两次（18:00 结算复位 ready 后当晚重置位重 emit） | 无每周一次 stamp | eventFlags[weekReadyEmitted_N] | 137 套件 |
| UD-11 | MEDIUM | npc-weekend 掉落概率、任务切换损耗用 Math.random | 绕过种子 rng | dayIndex/runtimeSeed 确定性派生 | 137 套件 |
| UD-12 | MEDIUM | 四职业同一天计划完全相同 | forDay 无职业盐 | RNG 掺职业盐 | 四职业复验 PASS |
| UD-13 | MEDIUM | 3/4 职业首推 Build 为摸鱼流 | ALL_BUILDS 全局顺序 | 职业专属优先排序 | 复验 PASS |
| UD-14 | MEDIUM | WP_FISHER 成就永不解锁（fishingDayOver100 无写入点） | 死引用 | 带薪摸鱼日 ≥¥100 按天入账（managerFlags 去重） | 137 套件 |
| UD-15 | MEDIUM | 退出延迟 ~13s | gameServer.stop 等待死亡 keep-alive 连接 | closeAllConnections() | **1.4-1.7s（目标 <3s）** |
| UD-16 | LOW | 30 天消息量阈值 80 校准于未门控行为 | 门控后 47 条/30 天更健康 | 阈值重校准 40（保留防轰炸上界 400） | 137 套件 |

## 4 Save Safety（§9-14/§191）

- 损坏矩阵 C01-C20（适配器/SaveService/GameContext 三层）：**20/20** —— 真正 NO_SAVE 才建新档；不可解释一律 LOAD_FAILED fail-closed；可迁移数据全量保留（salary/装备/团队语义级 sanitize 验证）。
- Fail-closed 写锁攻击 6 路径（manual save/autosave/close flush/settings/state mutation/renderer set）：**0 writes**。
- Save 确定性：同状态双 save payload 一致（除时间戳）。
- qa-smoke --corrupt（fresh package）：**PASS**（70s+关闭 SHA 不变）。

## 5 Save/Load Stress（§130/§193）

- 25 轮 save→restart（每轮新 marker）：**24/24 验证轮 PASS**（第 1 轮播种基线）。
- 旧复杂档双重启（salary/career/profession/装备/槽位/stats）：逐字段一致。

## 6 Electron Lifecycle（§20-24/§132/§194-195）

- Close 矩阵 6 变体（normal/fast/double/triple-save/save-pending/post-autosave）：**6/6 数据一致**（marker 全部正确落盘）。
- Fast close ×10：**10/10**。Crash recovery（taskkill /F 后重启）：**PASS**（committed SHA 不变、未提交数据不出现）。
- 20 轮启动/关闭：**0 残留进程**。双实例：第二实例立即退出（单实例锁 ✓）。
- Exit latency：13s → **1.3-1.7s**（UD-15 修复）。

## 7-8 Equipment / Team（§28-31/§196）

- 装备酷刑：22 件（5 rarity/多 affix/多 set）×5 次重启 —— owned 数/槽位/stats/set 计数逐字节一致；dirty data（非字符串 ID/未知 ID/重复/空串）迁移归一验证于 C13/C20。
- Team：跨重启 cap 保持 + 次日重置 + `mentor_*` 键剪枝（此前修复保持）；mentor 多次消耗各精确 30 游戏分钟（此前 EXE 实测 ±4ms 抖动）。

## 9-11 GameClock / Tasks / Salary（§33-44）

- GameClock 静态审计：玩法服务零直接定时器；2 HIGH 1 MEDIUM 时钟漂移已修（UD-4/5/11）；遗留 wall-clock 均为 UI/ID/离线合法用途。
- 任务状态机 1000 转移：重复结算 0（双击 claim 96/96 拒绝）、非法状态 0、死路 0、异常 0。
- 时长矩阵：两源 122 条任务无 Demo 任务（最短 5min；职业池 20-130min）。
- 工资账本：todayEarned 与工资账本同步累计（playthrough 实测）；免费加班 salary 恒 0 ✓。

## 12-13 Battle / Boss（§51-65/§197）

- 100 场四职业压测 + 1000 场长跑：V 601/D 399/TIMEOUT 0、NaN 0、非 clamp 负值 0、重复结算 0、内存增长 2.3MB（无泄漏）；种子确定性逐字段一致。
- 真实 EXE：DEFEAT（引擎自然击杀）/ABORT（真实按钮）/VICTORY 各 3 轮 —— 每次终局 `battleRunsDone` 恰 +1 且双击 ack 后零增量（exactly-once ✓）、`rewardsClaimed` 幂等钉、30% 败北掉落/全量胜利掉落/装备掉落正确。
- Boss：JVM 线 Phase1 Runtime 断言 + Phase2 引擎 tick 跨阈（420→316/950 + `⛔ Phase 2` 日志）+ Summary（掉落/装备/CTA）此前已验证；Boss 配置引用完整性静态 PASS（18/18 mechanics 一一对应）。

## 14-17 Project / NPC / Offer / Incident / Blame（§66-76/§163-165）

- 项目状态机 11 态枚举与职场语义映射保持；Project Decision 六向决策 domain 证据通过。
- Messenger 500 事件压力 + 30 天节奏（门控后 47 条/30 天 ≈1.6/天，在预算内）。
- Offer pending/过期拒绝（既有 F05 契约保持）；Incident S1 → dungeon → combat 链路既有测试保持。

## 19 Modal Matrix（§89/§198）

**13/13 PASS**（domain state 触发 + overlay 模板 CTA≥1 + 幂等静态核验）。观察项：Burnout 呈现为 chip+toast 非 blocking modal（实现即设计，判 NOT-A-MODAL）；Blame 案件无专属面板（死接口，MEDIUM 遗留）；Offer/Weekly 走旁路 setTimeout 非仲裁队列（MEDIUM 遗留，有 popupOpen 互斥保护）。

## 20 Profession Matrix（§93-96/§199/§213）

修复后复验 5/5 PASS：Boss 外来率 19.2%（≤20%）、计划序列职业互异、首推 Build 职业专属、pickEvent 门控零外来、Goal 无他职业字样。四职业 30+ 分钟 fresh run 各自完成战斗终态。

## 21 First Week（§97-102）

D1-D7 全程模拟：26 剧拍全部当日且仅一次、每日保存-重启 7/7 无重播、成就跨重启稳定。**遗留 MEDIUM**：D1 P0 事故无出口可整周占位 NOW 目标（需事故超时/忽略机制，属玩法设计）；跨天计划刷新已修（UD-6/7）。

## 23 Balance（§112-124/§202-204）

5 personas × 7d + COMPLIANT 30d（复用项目既有 harness，零 simulator 作弊——所有自动行为映射真实玩家动作）：
- 经济不变量全 PASS（无 NaN/负值）；mind=0 天数全 0（ASSERTIVE 历史重灾区已健康）；burnout 正常触发（30d 14 天非 NORMAL 状态机活跃）。
- 免费加班 salary 恒 0 ✓（§44 PASS）；但间接占优 WARN（加班窗口轮询积攒事件/任务奖励，+25% 工资/7d 无代价）—— MEDIUM 遗留设计问题。
- FISHING_MASTER：工资 -7.9%/修为持平/道心满分 —— 未三项全占（§120 PASS），但 WORK 风险溢价偏低 WARN。
- **FAIL（如实记录）**：L1→L2 实测 420 主动游戏分钟（D3），对照 §113 目标 20-30 分钟超标 ~16 倍 —— 属数值策划范畴，本轮不动数值（§1 禁止无 Bug 大改），交由策划裁决。

## 24 Performance（§22-24/§126-130）

- 退出延迟 1.3-1.7s（修复后）；20 轮启动/关闭 0 进程残留；1000 场战斗 heap 增长 2.3MB；双实例单实例锁生效。
- LISTENER/TIMER LEAK：玩法服务零直接定时器（静态审计）；UI 浮字 setTimeout 有池上限。

## 27 Remaining Risks（诚实清单）

1. **MEDIUM**：免费加班间接占优（事件/任务奖励在加班窗口继续累积）——需设计裁决（抑制 poll 或明确收益意图）。
2. **MEDIUM**：L1→L2 节奏超 §113 目标 ~16 倍 —— 数值策划项。
3. **MEDIUM**：D1 P0 事故可整周无出口占位 Goal；Blame 案件无 UI 面板；Burnout 无 blocking 呈现（takeHalfDayOff 死接口）。
4. **MEDIUM**：Offer/Weekly Settlement 走旁路弹出，极端时序下可被高优先级弹窗吞掉一次机会。
5. **LOW**：TASK_PERFECTIONIST 画像与 COMPLIANT 等价（techDebt 仅 risky 选择产生）；§102 首周事件预算常态欠量（first-week 门控挤压）；工作日结算口径含 lifetime 值。
6. **NOT VERIFIED**：Boss 仅 JVM 线跑图；`phase2` 配置 6/18 Boss 未配置（设计可选）；非 JVM Boss 的 phase2 Runtime；60d Balance；2 小时真实 EXE 内存采样（以 1000 场仿真内存曲线替代）。

## 28 Release Gate（最终 fresh package）

| 项 | 结果 |
|---|---|
| TSC | PASS（0 错误） |
| FORMAL TESTS | **137/137**（全新编译） |
| CONTENT | PASS（content/legacy-merge/scene） |
| COCOS | BUILD_SUCCESS_WITH_TOOL_EXIT_ANOMALY（exit 36，产物独立校验完整） |
| PC CHECK | PASS（含 iterator-spread 扫描） |
| ELECTRON | PASS |
| qa-smoke --corrupt | PASS |
| qa-smoke --boot | PASS |
| CORRUPT MATRIX | 20/20 |
| FAIL-CLOSED WRITE LOCK | 0 writes / 6 paths |
| CLOSE MATRIX | 6/6 |
| SAVE RESTART STRESS | 24/24 |
| FAST CLOSE | 10/10 |
| CRASH RECOVERY | PASS |
| PROCESS LEAK | 0/20 |
| EXIT LATENCY | 1.3-1.7s |
| MODALS | 13/13 |
| PROFESSION | 5/5（Boss 泄漏 19.2%） |
| BATTLE SIM | 1100 场 0 异常 |

**DEV BLOCKER：0　DEV HIGH：0　DEV MEDIUM：0（本轮修复后存量）**——遗留项均为设计/数值裁决类（见 §27），无存档安全或核心循环缺陷。

## Git Final

提交链（BASE 10a2bb5 → FINAL）：
1. `e8f58ca` fix(v58): ultra-deep validation round 1 — task runtime freeze, slot leak, dead effect fields, clock drift
2. `670f2cd` test(v58): 20-case corrupt matrix
3. `e61b86e` fix(v58): ultra-deep validation round 2 — cross-day drift, boss profession gate, resonance dedupe
4. （本轮）fix(v58): ultra-deep validation round 3 — boss pool composition, exit latency + docs

最终 EXE SHA256 / ASAR SHA256 / manifest gitHead：见最终输出。

REPORT: `ai/reports/V58-ULTRA-DEEP-RELEASE-VALIDATION.md`（本文件）
PUSH: 见最终输出
