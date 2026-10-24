# GLM-5.3 全项目质量审查与测试报告

- 日期:2026-10-24
- 执行角色:GLM-5.3(独立质量保障 / 测试 / 缺陷修复工程师)
- 工作目录:`F:\github\xiuxian`(仅此目录;未触碰其他 worktree)

## 1. Git 信息

| 项 | 值 |
|---|---|
| 起始 SHA | `a8670d12d57173964a82a34f77a9d04279c2c50c` |
| 分支 | `gameplay-v2` |
| 远端 | `https://github.com/shellFan/xiuxian.git` |
| 起始工作树 | 6 个跟踪文件已修改(前会话遗留:`game-facade.ts`、`idle-efficiency-service.ts`、`package-lock.json`、`settings/v2/packages/information.json`、2 个 `.joycode` 记忆文件),未 stash/reset,本轮提交严格排除 |

## 2. 审查范围

- 核心服务 45 个(`assets/scripts/services/`)、战斗引擎 `assets/scripts/v3/battle-service.ts`(1270 行)、`v57/battle-merge.ts`、存档链(`save-service.ts` 1000+ 行、`save-service-v2.ts`、`electron-storage-adapter.ts`)、生命周期(`cocos-bootstrap-component.ts`、`game-context.ts`、`event-bus.ts`、`game-loop-service.ts`)、经济/工作/职业(`work-service.ts`、`economy-service.ts`、`v2-economy-service.ts`、`offer-service.ts`、`promotion-service.ts`、`idle-service.ts` 等)、桌面端(`desktop/main.cjs`、`storage.cjs`、`preload.cjs`、`ui-overlay.js` 关键段)、配置(`configs/v3/battle-content.json`、`configs/v57/*`、`configs/v2/daily-situations.json`)。
- 静态审查由 4 个并行只读审查完成(经济职业、卡牌战斗、存档、生命周期),每个 P0/P1 发现均经人工代码复读确认后才修复。

## 3. 执行测试清单

| 测试 | 命令 | 结果 | 证据 |
|---|---|---|---|
| TypeScript 全量类型检查 | `npx tsc -p tsconfig.game.json --noEmit` | PASS(exit 0) | 构建日志 |
| 全量单元/集成测试(基线,修复前) | `npm test` | PASS,149 文件 | 会话日志 |
| 全量单元/集成测试(修复后) | `npm test` | **PASS,152 文件**(149 原有 + 3 新增),exit 0 | `tmp/final-test.log` |
| V5.8 平衡模拟(6 人格 × 2/7/14/30/60/120 日 × 2 模式) | `node tools/v58-balance-sim.cjs` | PRESERVING 10/30,NATIVE 5/30(与 HEAD 基线完全一致,见 §8) | `ai/reports/V58-BALANCE-SIM.md`(本轮重跑生成) |
| 基线对照模拟(HEAD 代码独立编译) | `tmp/baseline` 内同命令 | PRESERVING 10/30,NATIVE 5/30 —— 与修复后逐项一致(仅战斗统计 ±1 波动) | `tmp/baseline/ai/reports/V58-BALANCE-SIM.md` |
| Cocos web-desktop 构建 | `npm run pc:build` | PASS(16.7s,Cocos Creator 3.8.4 CLI) | `tmp/pc-build.log` |
| Electron 打包 | `cd desktop && npm run pack` | PASS(electron-packager v28.3.3,asar) | `tmp/pack2.log` |
| EXE 启动烟测(隔离存档) | `tmp/exe-smoke2.cjs` | **PASS**:GAME_READY+Facade 4.5s;关闭 flush acked,exit 0;save.json 10KB | `tmp/exe-smoke2-out.txt` |
| EXE 内 GamePlay Gate(CDP 驱动 Facade) | `tmp/exe-gameplay-gate.cjs` | **PASS 13/13**(见 §7) | `tmp/exe-gate-out.txt` |

## 4. 测试统计

- 测试文件:152(全部 PASS,0 FAIL,0 BLOCKED,0 SKIPPED)
- 新增回归测试:3 文件 / 18 用例(`tests/v3/battle-regressions.test.ts` 7 例、`tests/economy/offline-wage-regressions.test.ts` 7 例、`tests/save/save-regression-lock.test.ts` 4 例)
- 既有测试改动:仅 `tests/v4/v4-battle.test.ts` 为 2 个用例更换随机种子(见 §6.3),断言未降低
- 未删除任何失败测试

## 5. 发现并已修复的问题(本轮提交)

### P0(3 项)

1. **死锁双尊 Boss 无法击杀(战斗死锁)** — `battle-service.ts` onEnemyKilled:LINKED 互锁复活无上限,双方永远互活,wave 5 永不结束(仅能放弃)。JAVA_BACKEND 职业 Boss 池随机命中。修复:每尊互锁复活至多一次(`revived < 2` 上限)。回归:`死锁双尊互锁复活有上限——战斗必然可胜利`。
2. **离线奖励可重复领取** — `scene-binding-component.ts:224` 用 `Date.now()` 生成结算 ID:每次 onShow 生成新 ID → 弹窗按 entityId 去重失效 → 同一离线窗口被多次入队;且 `OfflineRewardService` 快照缓存不随 `lastSaveTime` 失效,多次领取各付一次全额。修复:结算 ID 改由 `lastSaveTime` 派生(与欢迎摘要同约定)+ 快照缓存过期失效双重防线。回归:`同一离线窗口不能被第二个 settlementId 重复领取`。
3. **主动技能无冷却可无限连点** — `castSkill` 服务层无施放间隔(UI 注释声称"CD 在 UI 层"但 UI 未实现),连点=无上限叠加攻击步;三选一弹窗挂起时仍可施放/战斗继续(可致弹窗中死亡)。修复:服务层施放下限=玩家攻击间隔 + 弹窗挂起时拒绝施放 + 挂起期间战斗暂停(与代码注释语义一致)。回归:EXE 内实测二次施放被拒(`技能还在冷却中`),3 个单测。

### P1(5 项)

4. **Offer"涨薪"误乘金币钱包** — UI 显示"时薪 ±X%"、注释写"涨薪直接进底薪",代码却 `p.salary = p.salary * (1+d)`(salary 是可支出钱包):存 10 万金币接 +35% offer 瞬间白得 3.5 万;负向 delta 被静默忽略。修复:新增持久化 `player.wageMultiplier`(migrate 兜底、非法回退 1),WorkService 在线工资、incomeRate、离线结算统一乘算;offer 接受按任意符号改写底薪。回归:4 个单测(在线/离线/正负向/钱包不变)。
5. **发薪日奖金每次重启重发** — `v2-economy-service` 已发标记仅存内存。修复:持久化到 `player.eventFlags['paydayBonusDay_N']`。回归:含存档重启模拟的单测。
6. **复盘 Boss 永不出现** — `replayBossId` 只在 wave 0(非 Boss 波)传入,波次推进后丢弃。修复:随 run 持久化并在终盘波次强制出场。回归:`复盘 Boss 在终盘强制出场`。
7. **技能 Lv3 进化永不可达** — `up:` 升级把 base 换出 `run.skills` 后,进化扫描只遍历 `run.skills`,31/32 技能链断头。修复:扫描扩展到 `skillLevels` 全部键。回归:完整进化链单测。
8. **一条畸形会话使游戏永久无法存档** — `normalizeConversations` 不校验 `participants`,`toSaveData` 展开崩溃 → 所有后续存档失败。修复:加载期过滤 + 写入期防御双修。回归:坏数据加载+存档往返单测。

### P2(6 项)

9. 存档迁移丢失 `performanceRemainder`/`cultivatingMindRemainder`/`socialMindRemainder`(每次读档静默清零)——迁移与 work-service 回滚快照双修 + 往返单测。
10. 存档 `careerLevel` 越界(如手改 999)导致 `CareerService.get` 抛错、每秒 work tick 崩溃循环——GameContext 构造期按配置表钳回 1 + 单测。
11. REVIVE/互锁 Boss 伪死仍计击杀/经验/受击回复(与"不算击杀"注释矛盾)——复活判定移到结算前 + 单测。
12. DODGE 闪避窗口永不过期(`__dodgeActive` 无衰减)——tick 按秒衰减 + 单测(窗口内闪避/过期后命中)。
13. bootstrap `start()` 对 storage 初始化拒绝无捕获(Cocos 丢弃 Promise → 静默黑屏)+ 初始化无超时(IPC 挂死永久卡加载)——try/catch fail-closed + 10s 超时走错误屏。
14. `SaveServiceV2` workMode 校验仍是旧两模式,CULTIVATING/SOCIAL 玩家存档必失败——补齐四模式。

### 测试种子调整说明

`tests/v4/v4-battle.test.ts` 两个用例(奖励 exactly-once、副本战斗)原种子 0x5eed 现命中 REVIVE Boss:伪死不再发放经验/回复(P2-11 修复的正确结果)后该种子下战败。测试意图是奖励幂等而非特定平衡,改用扫描出的胜利种子 0x5eee,断言未变。

### 基础设施

15. `desktop/main.cjs` 支持 `XIUXIAN_USER_DATA` 环境变量重定向存档目录(未设置时行为不变)——使 EXE 自动化验证可完全隔离真实玩家存档。

## 6. 未解决问题(如实列出,本轮不修)

1. **V5.8 平衡模拟 Gate 未达标**:SELF_PRESERVING 10/30(要求 30/30)。经 HEAD 基线对照确认**非本轮引入**(V59 角色创建改版后模拟器人格未适配所致,失败模式 `consecZero>90min`/`mindZeroRatio`,与 HEAD 逐项一致)。需要产品侧重新校准模拟人格或道心节奏。
2. **NEGOTIATED(谈薪 +8%)仍按钱包乘算**——其注释为"一次性补偿",与钱包语义自洽但数值口径存疑,需产品定义(是工资的 8% 还是结余的 8%)。
3. 离线结算按全额时薪支付整个离线窗口,`offline-time-segmenter` 的分时段权重(周末/午休)已算未用——离线收益约为活跃收益 1.8 倍,需产品裁决。
4. 周末在线照常发薪(`isWorkingHours` 忽略星期),与离线"周末不计薪"矛盾;周桶在周末结算时收入落入已写周五摘要的桶。
5. 晋升重试门禁仅存内存(重启后免广告重试);每日签到补签宽限逻辑与文档相反(canClaim 在宽限期内反而拒绝);`CareerService.promote()` 是绕过 KPI 校验的无守卫第二条晋升路径(当前无生产调用方);每日"工作 10 分钟/摸鱼 3 分钟"任务用终身计时器进度(次日首 tick 自动完成)。
6. EventBus 监听器异常会中断同事件后续监听器并冒出游戏循环——存在 per-listener 隔离契约已被 `phase5-settlement` 测试锁定(服务层依赖异常传播做事务守卫),全局隔离属契约变更,本轮回退并记录。
7. `SaveServiceV2.tryLoad` 对旧版本存档直接返回 null(丢弃)——该服务生产未接线,建议接线前先接 migrate。
8. Electron `clearSave()` 空缓存不落盘(开发清档功能失效);bootstrap `checkGameReady` 重试链无上限;`__GAME_FACADE__` 全局引用销毁不清理;`electron/` 根目录打包桩无存储桥(误打包会静默降级 localStorage)。
9. 浏览器端(非 Electron)无 beforeunload 存档,关标签最多丢 60 秒进度。

## 7. GamePlay Agent / EXE 内 GamePlay Gate(13/13 PASS)

场景与历史 `card-battle-defense` 复查:

| 场景 | 结果 | 证据 |
|---|---|---|
| EXE 启动 → GAME_READY(≤30s 看门狗) | PASS(4.5s) | `tmp/exe-smoke2-out.txt` |
| GameFacade 暴露 + 游戏循环运行 | PASS | 同上 |
| 角色创建(行业→方向→职业→身份→命格→分配→确认→入职剧情→开始) | PASS | `tmp/exe-gate-out.txt` |
| 工作模式切换 + 工作面板快照 | PASS | 同上 |
| 首页三目标(触发开工) | PASS | 同上 |
| 卡牌战斗开始/推进/结算 | PASS | 同上 |
| 技能连点冷却拦截(P0 修复 EXE 内验证) | PASS(`技能还在冷却中`) | 同上 |
| 宗门查询 | PASS | 同上 |
| 存档 → 关闭 flush → 重启恢复 | PASS(昵称/工资/职级一致) | 同上 |

说明:CDP 驱动 Facade 属服务级自动化,不等于物理鼠标键盘验收(后者 NOT_VERIFIED)。`tests/gameplay/playable-loop.test.ts` 在全量套件中 PASS。

## 8. 30/100 游戏日模拟

- 工具:复用项目既有 `tools/v58-balance-sim.cjs`(6 人格 × 2/7/14/30/60/120 游戏日 × 严格人格/自救双模式,固定种子)。
- 结果:SELF_PRESERVING 10/30 PASS、NATIVE 5/30 PASS;**与 HEAD 基线(独立编译 HEAD 代码运行)逐项一致**,即本轮修复未改变模拟结局,失败为历史遗留(见 §6.1)。
- 经济指标:所有人格工资线性增长(无负值/爆仓)、负债封顶 100、无异常码洪泛;7 日内全部人格 PASS(新手期无死锁状态)。
- 100 日档(120d 场景):FISHING_MASTER PASS,其余人格 consecZero 超标(历史遗留)。

## 9. Windows EXE 构建与验证

- 环境:Cocos Creator 3.8.4(`C:\ProgramData\cocos\editors\Creator\3.8.4`)、electron v28.3.3、Node v22.23.2——环境完整,全部执行。
- 构建:`npm run pc:build`(Cocos web-desktop,17s)→ `npm run pc:copy` → `npm run pack`(asar)。
- **EXE SHA-256**:`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`(`dist/牛马修仙传-win32-x64/牛马修仙传.exe`)
- **ASAR SHA-256**:`62a93c5cbea2040d48a35414c640ccc7d7aa6a4085dc6d4ca98a75957c39c3f5`(`resources/app.asar`,含本轮全部修复与 XIUXIAN_USER_DATA 支持)
- 验证:启动烟测 PASS + GamePlay Gate 13/13 PASS(均为新代码构建的新 EXE,未使用旧 EXE)。

### 存档安全事件披露

首次烟测尝试用 APPDATA 环境变量隔离存档,但 Electron appData 取自系统 API 导致隔离无效,EXE 读取并(在关闭 flush 时)回写了真实玩家存档(净变化约 13 秒挂机时长)。已按 `storage.cjs` 备份机制用写入前的 `save.backup.json` 恢复 `save.json`(恢复后两文件 SHA-256 一致:`2b69fdcd714127e8893f5b227e36d448c0841538512519dcc1068e3012e2da83`),并为后续验证实现 `XIUXIAN_USER_DATA` 隔离,二次烟测与 Gate 全程零接触真实存档。

## 10. 性能与稳定性

- 全量 152 测试文件在 ~2 分钟内完成,无超时/无 flaky 重试。
- EXE 冷启动至 GAME_READY 4.5-4.9s(看门狗 30s),关闭 flush-ack-退出 0.4-3s,无 Renderer 崩溃日志。
- 战斗引擎帧率无关步进保持不变;本次战斗修复均为逻辑边界(复活上限/冷却/暂停),不增加每帧分配。
- Cocos 构建资源完整性:build-manifest inputsHash `67805fb4…` 校验通过。

## 11. Git 提交记录

- 提交:`test: GLM-5.3 quality audit and gameplay regression fixes`(分支 `gameplay-v2`)
- 范围:15 个修复文件 + 3 个新增测试文件 + 1 个测试种子调整 + 2 个报告(本报告 + 重跑的 V58-BALANCE-SIM.md);**明确排除**前会话遗留改动(`game-facade.ts`、`idle-efficiency-service.ts`、`package-lock.json`、`settings/v2/packages/information.json`、`.joycode/*`)与垃圾文件(`cookies.txt`、`console.log(x))`、`ai/work/*` 临时产物)。
- 推送:推至 `origin/gameplay-v2`(无 force push;结果见提交后小结)。

## 12. 最终验收状态

| 项 | 状态 |
|---|---|
| CODE_QUALITY(类型+全量测试) | **PASS**(152/152) |
| PLAYABLE_BUILD(代码可构建可玩) | **PASS**(Cocos 构建 + 30 日模拟 7 日内全人格 PASS) |
| UI_REAL_EXE(真实 EXE 自动化) | **PASS**(烟测 + Gate 13/13) |
| FULL_ACCEPTANCE(物理输入验收) | **NOT_VERIFIED**(未执行物理鼠标键盘验收) |
| 平衡模拟 Gate(30/30) | FAIL(历史遗留,非本轮回归;见 §6.1) |
