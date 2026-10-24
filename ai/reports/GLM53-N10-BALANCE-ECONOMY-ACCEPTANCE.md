# GLM-5.3 N10 验收报告:经济系统统一、平衡 Gate 修复、存档安全与长周期稳定性

- 日期:2026-10-24
- 执行角色:GLM-5.3(第二轮,唯一执行 Agent)
- 起始 SHA:`40055b4f1efb8dca08eb614933bcb383b6e234fd`(分支 `gameplay-v2`)
- 最终 SHA:见 §18(提交后)

---

## 1. 起始状态核实

- 分支 `gameplay-v2`,远端 `https://github.com/shellFan/xiuxian.git`。
- 起始工作树含前会话遗留 6 个跟踪修改(`game-facade.ts`、`idle-efficiency-service.ts`、`package-lock.json`、`settings/v2/packages/information.json`、2 个 `.joycode` 文件)——**全程保留、未混入本轮提交**。
- 上一轮修复有效性:起始 `npm test` 152/152 PASS(日志 `tmp/n10-baseline-test.log`),EXE 技能冷却/离线幂等在本轮 Gate 中再次验证(§13)。

## 2. P0:测试存档安全隔离(PASS)

上一轮曾发生真实存档被烟测回写的事故。本轮落实三层防护(`tmp/n10-exe-smoke.cjs`、`tmp/n10-exe-gate.cjs`):

1. **启动前白名单断言**:`XIUXIAN_USER_DATA` 必须匹配 `F:\github\xiuxian\tmp\n10-userdata-*`;不满足则拒绝启动 EXE(BLOCKED)。
2. **启动后日志确认**:必须从主进程日志 `[storage] Data directory: …` 解析出隔离目录(Windows 路径归一化比较),否则立即终止 EXE 并 BLOCKED —— 本轮该断言曾实际拦截一次假警报(路径斜杠风格差异),证明断言在工作。
3. **退出后校验**:`save.json` 仅存在于隔离目录;真实玩家存档 mtime/size 前后一致(本轮全部门槛通过,证据 `tmp/n10-smoke-results.json`、`tmp/n10-gate-results.json`)。

真实玩家存档本轮**零读取、零复制、零覆盖**。

## 3. P0:平衡 Gate 10/30 根因分析(核心结论)

**回答"为什么 30 项只有 10 项通过":**

修复前 30 项 Gate(6 人格 × 5 周期,SELF_PRESERVING)失败矩阵:

| 人格 | 7d | 14d | 30d | 60d | 120d |
|---|---|---|---|---|---|
| COMPLIANT | PASS | FAIL consecZero 100min | FAIL consecZero 100min | FAIL 100~220min | FAIL 220min |
| ASSERTIVE | PASS | FAIL 100min | FAIL 160min | FAIL 160min | FAIL 220min |
| BALANCED | PASS | FAIL 160min | FAIL 140min | FAIL 220min | FAIL 220min |
| TECH_PERFECTIONIST | PASS | FAIL 100min | FAIL 100min | FAIL 220min | FAIL 220min |
| CAREER_CLIMBER | PASS | FAIL 100min | FAIL 160min | FAIL 220min | FAIL 220min |
| FISHING_MASTER | PASS ×5(全程 PASS) | | | | |

(种子:9101 + 13×场景序号;模式 SELF_PRESERVING;完整数值见修复前报告存档与本轮 `ai/reports/V58-BALANCE-SIM.md` 更新记录)

**归因判定(逐类):**

- **是否 V5.9 规则变化引入?否。** 决定性证据:用 V5.8 认证提交 `15ae5f2`("30/30 PASS" 的提交)的完整源码独立编译后运行同一模拟器,得到**与 HEAD 逐项一致的 10/30 失败**(COMPLIANT 9d consecZero 100min/¥0→576 完全相同)。V5.9 的配置(`configs/**`)与 V5.8 认证提交**零差异**(git diff 为空)。
- **是否模拟器不兼容?部分(A 类)。** 模拟器从未处理 V2 事件弹窗(`resolveV2Event`),事件长期 pending 属模拟失真;已适配(§4)。
- **是否真实数值缺陷?是(C 类,主因)。** 三个实现-设计偏离(全部有 V5.8/V2 设计文档背书):
  1. **恢复型工作模式(摸鱼/社交)的道心恢复只在标准工时(9-12/13-18)结算** —— `work.tick` 在 `standardSeconds===0`(午休+下班约 5h/日)直接返回,`FISHING mindPerHour +40/h` 形同虚设。85% 工作人格下午从 0 起步,连续归零 140-260min(实测解剖:`tmp/zero-day-anatomy.cjs`)。
  2. **结算道心恢复 +35 覆盖不了工作日消耗** —— 实测 85% 工作人格工作+局势流 ≈ -43/日,结算 +35 → 净 -8/日且白天贴 0;V5.8 §7.4 设计目标是"85% 工作人格净收支 +6/day(含事件 -25 后仍 ≥0)"。
  3. **心魔治疗螺旋失衡** —— 事件心魔注入实测 ≈ +5.7~+9.7/日,结算自然消退仅 -3/晚,30 日心魔冲到 82-100/100,触发 7~8 个心魔(含 `mindRecoveryDown` -25% 恢复惩罚)→ 恶性循环。且 V2 §26 明文列出的恢复途径"摸鱼"未实现。

- **是否阈值不合理?否(B 类为零)。** 未调整任何阈值(`consecZero>90min`、`mindZeroRatio`、`fatigue100` 等全部保持 V5.8 认证值)。

## 4. 修复内容(游戏数值 + 模拟器适配)

### 游戏数值(C 类修复,均有设计文档锚点)

| # | 修复 | 文件 | 设计依据 |
|---|---|---|---|
| 1 | 摸鱼/社交道心恢复全天有效(午休+下班照常恢复;工资/修为仍限工时) | `work-service.ts` tick 恢复分支 | 摸鱼=休息玩法,40/h 恢复率本就为此设计 |
| 2 | 结算道心恢复 +35 → **+50** | `v2-settlement-service.ts` | V5.8 §7.4 净 +6/day 目标;V5.7 §83/84 下班恢复 |
| 3 | 结算心魔消退 -3 → **-6/晚** | `v2-settlement-service.ts` | 治疗螺旋对冲事件注入 +5.7/日 |
| 4 | **摸鱼消心魔**(每半小时 -1,全天生效) | `work-service.ts` | V2 §26 明文恢复途径(此前未实现) |
| 5 | 离线收益统一为在线同效率(见 §5) | `idle-service.ts` | 任务 §6 在线/离线统一 |

### 模拟器适配(A 类,`tools/v58-balance-sim.cjs`)

- 新增 V2 事件弹窗处理:preserving(自我保护型玩家)选择**可见成功率最高的选项**(风险厌恶,使用 UI 可见信息,非作弊);native 选第一项;FLAVOR 事件(无选项)直接确认。
- 保留全部既有的人格参数、阈值、种子策略 —— 未放宽任何 Gate 标准。

### 修复前后对照(固定种子)

| 指标 | 修复前 | 修复后 |
|---|---|---|
| SELF_PRESERVING Gate | **10/30** | **30/30 PASS** |
| NATIVE(无自救参考) | 5/30 | 21/30 |
| COMPLIANT 30d MindAvg / Mind0% | 47 / 4.7% | 78 / 0.0% |
| COMPLIANT 30d 心魔终值 | 82(不可持续) | 稳定区间(报告 demons 列随种子 ~30-50) |
| COMPLIANT 115d 工资 | ¥0→5460(此前) | ¥0→20540(正常成长斜率) |
| FISHING_MASTER MindAvg | 91-100(特色) | 91-95(保持特色,未被拉平) |

NATIVE 同步提升 5→21 证明是游戏本身变健康,而非自救逻辑放水;FISHING_MASTER 未被过度强化,不存在"所有人格轻松获胜"。

## 5. P0:在线/离线经济统一(PASS)

**统一前实测(同角色同职级):**

| 项 | 在线(每小时) | 离线(每小时) | 离线/在线 |
|---|---|---|---|
| 工资 | rate × 1.3 × 3600/7200 = **0.65×rate** ×职级×底薪乘数 | **1.0×rate** ×宗门×底薪乘数(无职级) | ≈ **1.54×** |
| 修为 | rate × 0.8 × 0.5 = **0.4×rate** | **1.0×rate** | ≈ **2.5×** |

**统一后**(`idle-service.ts`):离线复用在线效率常量(从 `MODE_RULES.WORK` 派生,避免公式漂移):

- 工资 = rate × elapsed/3600 × **0.65** × 宗门 offlineGain × 底薪乘数 × **职级 salaryMultiplier**(新增,此前离线不吃晋升加成)
- 修为 = rate × elapsed/3600 × **0.4** × 宗门 × 职级 cultivationMultiplier(新增)
- 灵石:离线专属,保持不变
- 宗门"离线收益 +20%"保留为离线增益(设计内)

**离线时薪上限(国企宗)1.2×0.65=0.78 < 在线 1.0 基准** —— 消除"AFK 严格占优"。分时段语义:离线窗口不区分工作日/周末(离线=整段挂机,按封顶 8h 计),跨周末/跨日场景由回归测试锁定(`跨周末离线窗口` 用例)。

**幂等性(任务 §6.3)**:多次 onShow(稳定结算 ID)、同 id 重复领取、重启后重放、无新增时间的新 id → 全部返回 0/抛错,测试覆盖(`跨日幂等`、`离线奖励弹窗重复入队防护` 用例 + EXE Gate `离线幂等` 场景)。

## 6. P1:谈薪与工资规则(结论)

- **ACCEPTED(接受 Offer)**:改写持久化 `player.wageMultiplier`(任意符号,UI 显示"时薪 ±X%")→ 同时作用于在线工资、`incomeRate`、离线结算;与宗门倍率、职级倍率、加班费**乘算叠加**;不影响一次性奖金与自由职业合同(合同为独立报酬)。
- **NEGOTIATED(谈薪 +8%)**:**保持现状** —— 代码与注释("一次性补偿")自洽:钱包 ×1.08 一次性补偿,不改底薪乘数。已用回归测试锁定该口径(`谈薪口径锁定` 用例)。
- **待产品确认项**:+8% 补偿按"当前结余 8%"计算,存钱越多补偿越多;若产品意图是"日薪的 8%"需另行调整。本轮不擅自修改(任务 §7 兼容优先)。

## 7. P1:长期玩家画像矩阵(PASS,覆盖说明)

复用 `v58-balance-sim` 6 人格 × 2/7/14/30/60/120 游戏日(≈30/100 日档):

| 任务要求画像 | 覆盖人格 | 30d | 100d+ |
|---|---|---|---|
| 普通打工人 | COMPLIANT(0.85 工作) | PASS | PASS(115d) |
| 高强度加班 | TECH_PERFECTIONIST(0.9)+ 战斗 | PASS | PASS(115d) |
| 自由职业 | FISHING_MASTER(0.25 工作,挂机修炼流) | PASS | PASS(115d) |
| 自我保护型 | preserving 模式(全部人格) | PASS ×6 | PASS ×6 |
| 高风险成长型 | CAREER_CLIMBER(0.95)+ 战斗 | PASS | PASS(115d) |
| 长期成长型 | 全部 120d 档 | — | PASS ×6 |

检查结论:无必然死亡(道心 0 不死档 + 结算恢复)、无无限资源(工资线性、负债封顶 100)、无永久失业、职业可成长(ProfLv 1→7)、无离线优于在线(§5 已消除)。 freedom-contract(自由职业合同)系统存在于 OFFER/兼职,模拟人格以 FISHING_MASTER 近似;专项合同人格未建(记录为后续项)。

## 8. P1:存档兼容性专项(PASS)

新增 `tests/save/save-compat-e2e.test.ts`(4 用例,全部通过):

1. v13 老存档升级:进度字段保留、`wageMultiplier`=1、`eventFlags`={},版本号升级;
2. 老存档 → 离线结算 → 保存 → 重启 → 同 id 拒绝、新 id 零发放(端到端幂等);
3. 字段类型错误/极端值(NaN、careerLevel 999、畸形 dailyHistory)→ 消毒后可结算可保存,重启不死循环;
4. 损坏 JSON → fail-closed,原始文件不被覆盖。

既有数值口径测试按 §5 统一后公式更新断言(记录见 §10),未降低任何断言。

## 9. 新增回归测试(11 用例)

- `tests/economy/online-offline-parity.test.ts`(7):在线/离线同效率对照、职级乘数进离线、跨周末窗口、跨日幂等、弹窗重复入队防护、NEGOTIATED 口径锁定、wageMultiplier 端到端。
- `tests/save/save-compat-e2e.test.ts`(4):见 §8。
- 更新(口径同步,非放宽):`idle-service.test.ts`、`offline-boundary.test.ts`、`offline-exactly-once.test.ts`、`offline-reward-service.test.ts`、`phase2-stability.test.ts`、`offline-wage-regressions.test.ts`(floor 容差 ≤2)。

## 10. 测试与验收结果

| 项 | 命令 | 结果 |
|---|---|---|
| 基线(上轮修复验证) | `npm test` | 152/152 PASS,exit 0 |
| 类型检查 | `tsc -p tsconfig.game.json --noEmit` | PASS |
| 全量(本轮最终) | `npm test` | **154/154 文件 PASS,exit 0**(`tmp/n10-test-final.log`) |
| 平衡模拟 | `node tools/v58-balance-sim.cjs` | **PRESERVING 30/30 PASS**,NATIVE 21/30 |
| V5.8 认证基线对照 | 15ae5f2 独立编译 + 同模拟器 | 10/30(证明失败非 V5.9 引入) |
| Cocos 构建 | `npm run pc:build` / `pc:copy` | PASS(`tmp/n10-pcbuild.log`) |
| Electron 打包 | `desktop && npm run pack` | PASS |
| EXE Smoke(隔离版) | `tmp/n10-exe-smoke.cjs` | **8/8 PASS** |
| EXE GamePlay Gate | `tmp/n10-exe-gate.cjs` | **13/13 PASS** |
| 物理鼠标键盘 | — | **PHYSICAL_INPUT=NOT_VERIFIED** |

## 11. EXE 信息

- 路径:`F:\github\xiuxian\dist\牛马修仙传-win32-x64\牛马修仙传.exe`
- EXE SHA-256:`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`(Electron 运行时,与上轮一致)
- **ASAR SHA-256:`92a398bdc4c196d35911f485d118379da5a516102ae1c78fce4a80be10d3d699`**(含本轮全部经济修复 + 日志时序修复)
- 构建时间:2026-10-24 20:46+08:00;Git SHA:40055b4(构建源)
- 启动耗时:GAME_READY ≈ 5s(看门狗 30s)
- 隔离存档路径:`F:\github\xiuxian\tmp\n10-userdata-*\xiuxian-save\`、`tmp\n10-gate-userdata-*\xiuxian-save\`

## 12. EXE 内验证清单(本轮经济变更进入 EXE 的证据)

| 场景 | 结果 | 证据 |
|---|---|---|
| 启动 → GameFacade | PASS | `tmp/n10-smoke-out.txt` |
| 角色创建 → 入职剧情 → 开工 | PASS | `tmp/n10-gate-results.json` |
| 卡牌战斗 + 技能冷却拦截(上轮 P0 回归) | PASS(`技能还在冷却中`) | 同上 |
| **离线结算统一口径(1h → 0.65×rate,整数)** | PASS(salary=5, cultivated=2) | 同上 |
| **离线幂等:同窗口二次领取被拒** | PASS(`already claimed`) | 同上 |
| 存档 → 重启恢复 | PASS(昵称/工资/职级一致) | 同上 |
| 隔离:真实存档 mtime/size 不变 | PASS | 同上 |

## 13. 附加修复:EXE 启动日志时序缺陷

验证中发现(并修复):`desktop/main.cjs` 的 `console-message`/`render-process-gone`/`did-fail-load` 监听器注册在 `loadURL` **之后** —— bundle 加载快时全部早期 `[BOOT]`/`GAME_READY` 渲染日志丢失(上轮烟测靠加载时序侥幸通过;本轮快速加载暴露此缺陷,曾导致自动化误判"启动失败")。已将三个诊断监听器移至 `loadURL` 之前(生产诊断同样受益)。此修复经本轮 8/8 Smoke + 13/13 Gate 验证。

## 14. P2 项处理说明

按任务优先级,P0/P1 完成后未再展开 P2(晋升重试门禁、签到补签、每日任务计时器、EventBus 异常契约)—— 保持上轮报告的已知问题记录,避免在窗口尾部引入未充分验证的变更。

## 15. 未解决问题(如实记录)

1. NATIVE 21/30:无自救人格仍有 9 项长周期失败(设计上 NATIVE 是参考组非 Gate,未达标符合"不能让所有人格轻松获胜"的约束方向)。
2. NEGOTIATED +8% 的补偿基数(结余 vs 日薪)待产品确认(§6)。
3. 自由职业合同(FREELANCER)专项模拟人格未建,当前以 FISHING_MASTER 近似覆盖。
4. 周末在线照常发薪 / 离线分时段权重未消费(上轮遗留 P2,本轮统一后离线已不劣于在线,平衡影响大幅降低)。
5. 晋升重试门禁持久化、签到补签、每日任务终身计时器(上轮遗留 P2)。
6. EventBus 监听器异常传播契约(既有测试锁定,未动)。

## 16. Git 提交与推送

- 提交信息:`fix: align V5.9 economy and balance simulation`
- 范围:4 个游戏修复文件 + 1 个模拟器适配 + 6 个测试口径更新 + 2 个新增测试 + 2 个报告(本报告 + 重跑的 V58-BALANCE-SIM.md)+ main.cjs 日志时序修复;**排除**前会话遗留改动与所有临时产物。
- 推送:`origin/gameplay-v2`(无 force push),结果见 §18。

## 17. 最终状态判定

| 条件 | 状态 |
|---|---|
| 测试存档隔离 PASS | ✅(前置白名单 + 日志确认 + 退出校验,真实存档零触碰) |
| 全量 npm test PASS | ✅ 154/154 |
| 平衡 Gate 符合 V5.9 标准 | ✅ SELF_PRESERVING 30/30(阈值未放宽,根因为真实数值缺陷修复) |
| 在线/离线收益一致性 PASS | ✅(同效率 + 回归测试锁定) |
| 经济幂等性 PASS | ✅(单测 + EXE Gate 双重验证) |
| 存档迁移 PASS | ✅(e2e 4 用例) |
| EXE Smoke PASS | ✅ 8/8 |
| EXE GamePlay Gate PASS | ✅ 13/13 |
| 无已知 P0/P1 阻断 | ✅ |

## 18. N10 判定

**N10 = COMPLETE**

- 最终 SHA:提交后见下方 Git 记录(本轮提交基于 `40055b4`)
- 推送:`origin/gameplay-v2` 推送结果与本地/远端 SHA 一致性核实见提交后小结
- `PHYSICAL_INPUT=NOT_VERIFIED`(未执行物理鼠标键盘验收,不伪造)
