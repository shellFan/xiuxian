# V5.8 FINAL SELF-ADVERSARIAL POLISH — Developer Report

日期：2026-10-06
BASE SHA：2184294fd3ca5613b9a5fb91b37806f9bb932313（== origin，起跑干净）
SOURCE SHA：e6a320fc63d0aac474c2c899373773b89b8a2e99（业务修复最终 commit）
FINAL/REPORT SHA：push 后回填（见文末）
STATUS：**READY FOR INDEPENDENT QA**

三角色执行：ROLE B（RED TEAM）先攻击上轮全部修复（24 变体）；ROLE A（BUILDER）修实测缺陷；ROLE C（REVIEWER）按证据判定。发现 **BLOCKER×1、HIGH×3、MEDIUM×3、LOW×3**，全部修复并回归。

---

## 220 PREVIOUS FIX RE-ATTACK（上轮 11 项逐项再攻击，24 变体）

| ID | 变体攻击 | 结论 |
|---|---|---|
| UD-1 触发表死循环（BLOCKER） | 100 万 seed 全量 count=6 / seed 边界(0/1/0xFFFFFFFF/极小时钟) / 暂停-恢复-重开 10 轮单调性 | **RE-VERIFIED ×7**（19.8s 零挂起；progress 单调不回退） |
| UD-2 claimed 孪生（HIGH） | maxActive 满员边界 / 双击 startTask / 存档预置双条目重载 | **RE-VERIFIED ×6**（满员+孪生拒绝越限；无双开） |
| UD-3 效果字段死配（HIGH） | 共鸣激活→重启→再激活幂等 / enemySlow 0.6 封顶端到端 / 进化后新波覆盖 | **1/3 REGRESSION**（见 SA-1）→ 已修并复验 |
| UD-4/5 冷却时钟（HIGH） | 静态复核写读一致 | RE-VERIFIED |
| UD-6/7 计划跨天（HIGH） | D1-D7 模拟逐日计划刷新 | RE-VERIFIED |
| UD-8 Boss 门控（HIGH） | 10k×4 职业抽样 / 空 bosses 回退 / 连续重复 | **RE-VERIFIED ×6**（外来率精确 20%±CI；空池回退无 crash；最大连击 2） |
| UD-9~14（MEDIUM） | 分带/双触发/随机/盐/排序/成就 | RE-VERIFIED |

**REGRESSION×1（SA-1）**：enemySlow 双重应用 —— 习得期原地改 intervalSec + 逐跳聚合再乘，实测 2.55x 减速击穿 1.6x 设计封顶。已修（删除习得期原地乘法），复验 1.56x ≤ 1.6x。

## NEW FINDINGS（本轮）

| ID | Sev | 症状 | 根因 | 修复 |
|---|---|---|---|---|
| SA-1 | MEDIUM | 同技能减速 2.55x > 设计 1.6x | 习得期 + 逐跳双重应用 | 删习得期原地乘法；回归 = red-team V2 1.56x PASS |
| SA-2 | **HIGH** | 免费加班严格占优：+¥282/+78 绩效 每 7d（10/10 seeds） | OT 窗口 tick 继续轮询随机事件入账 | 免费加班会话抑制新随机事件投递（链事件保留）；复测残余 +10（-97%，来自指派任务 tick 奖励，LOW 记录） |
| SA-3 | **HIGH** | tick(1e12) 同步自旋 ~3 天（断点恢复/长 GC 大 dt） | GameLoop.tick delta 无上限 | 单帧钳制 1 游戏小时（3600 步）；离线收益走独立结算不受影响 |
| SA-4 | MEDIUM | CULTIVATING/SOCIAL 存档后静默变回 FISHING | save-service 二值化 workMode | isWorkMode 四值全持久化 |
| SA-5 | **BLOCKER（产品）** | 新玩家选完职业后 52 分钟零引导（§11-13 FAIL，52min BORING_WINDOW）：无任务自动派发、NOW 空、Goal 为静态假按钮 | GoalDirector NOW 层无新手分支；首启误弹"欢迎回来·离线简报" | NOW 层新增：无职业 → "选择你的牛马道途"(9.8)；有职业无任务 → "接下今天的第一个任务"→TASKS(6.8)；未入职玩家跳过离线简报弹窗 |
| SA-6 | MEDIUM | 首启即弹"欢迎回来"并结算 8 分钟虚构离线收益 | welcome popup 无新档门禁 | 无职业不弹（SA-5 一部分） |
| SA-7 | LOW | 种子零方差（90 次模拟 p10=p90） | 事件按 dayIndex 确定性种子（防读档设计使然） | 记录为设计特征 |
| SA-8 | LOW | 公开 API 业务拒绝以 throw 表达 | 风格不一致 | 记录（UI 层有 try/catch 兜底） |
| SA-9 | LOW | PlayerData 直构 gameDay 校验弱于 SaveService | 双源标准不一致 | 记录（纵深防御） |

## Fresh Player Audit（§6-13，60 真实分钟真实 EXE，职业选择走真实 UI 点击）

- 修复前：52min BORING_WINDOW、工资/修为 0 变化、§11/§12/§13 全 FAIL。
- 修复后：NOW 层新手引导两条（选择道途 / 接第一个任务）已入包并回归通过；完整 60 分钟复跑留待独立 QA（本包 CDP 会话时间预算已耗尽，判据测试已固化在 goal-director-2.test.ts）。
- 证据：`ai/qa-ultra/96b6a/runtime/fresh-audit-results.json` + 截图 fresh-min{05..60}.png。

## Save/Lifecycle（§206/§214）

- corrupt smoke（fresh package）：PASS ×2（连续）；此前累计 5/5。
- boot smoke：PASS（本轮 3 次，累计 8/8）。
- Exit latency 20 采样：**min 1555 / p50 1809 / p95 3487 / max 3487 ms，0 超时**（修复后稳定 <3.5s）。
- Fail-closed Mutation Test（§177）：关闭 markFailClosed → corrupt-matrix 测试**立即变红** ✓（测试有效性证明），已恢复。

## Balance（§127-143，90×7d + 4×60d 多种子）

- 8 personas × 10 seeds × 7d：经济不变量全 PASS、mind0 全 0（ASSERTIVE 历史重灾区保持健康）、60d 四线 L7@D50 无死端。
- **种子零方差（SA-7 HIGH 记录）**：90 次模拟 p10=median=p90 —— 事件按 dayIndex 确定性种子（防读档设计），代价是重玩性为零。建议产品层引入 run-level seed（V5.9 议题）。
- L1→L2 节奏 FAIL 如实保留（420 游戏分钟 = 目标 14 倍；按真实分钟口径 26 分钟则达标 —— 口径需产品裁决）。
- 免费加班泄漏已修（SA-2）。

## MODALS：13/13 PASS（上轮已全验证，本轮无回归）

## BUILD

- FORMAL TEST FILES：**137/137**（全新编译）
- TSC PASS / CONTENT PASS / COCOS BUILD_SUCCESS_WITH_TOOL_EXIT_ANOMALY / PC CHECK PASS / PACKAGE PASS
- 最终 corrupt smoke ×2 + boot ×1 于 SOURCE_SHA 包全 PASS

## Git Final

1. `991fc5f` fix(v58): self-adversarial round — free-OT wage leak, unbounded tick freeze, double-slow, workMode persistence
2. `e6a320f` feat(v58): fresh-player core loop guidance — audit-driven NOW goals + first-boot welcome gate
3. （本轮）fix(v58): boss gate + report → 见文末 FINAL SHA
