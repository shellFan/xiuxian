# V10 全量 QA 测试报告（《膨胀小队》/ 牛马修仙传 V10 Final Release）

> 报告生成：2026-11-19 · 本轮 QA 由自动化流水线 + 真实浏览器 CDP 试玩完成，所有结论均基于实测证据，未验证项如实标注。

## A. 测试环境

| 项 | 值 |
|---|---|
| 系统 | Windows 10.0.26200 x64（win32） |
| 浏览器 | Chrome（CDP 直连真实鼠标事件，每轮独立 profile，端口段隔离） |
| Node | v22.22.2（工作台运行时） |
| 游戏运行时 | Cocos Creator 3.8.4（本机 CLI 构建，fresh 校验 + provenance 哈希 PASS） |
| 项目版本 | 1.0.0-rc.1（`niuma-xiuxian-ai-infrastructure`） |
| Git 分支 | `feature/v10-final-release` |
| 起始 SHA | `b9ca2c7d1a4c344cbb86e13b823b3329579c477d` |
| 最终 SHA | 见 §G（提交后回填） |
| H5 服务 | `scripts/h5-server.cjs` → `desktop/build/web-desktop`（http://127.0.0.1:8633/） |
| 测试证据 | `ai/reports/v10-qa-final/`（JSONL/results）、`docs/QA/screenshots/` |
| QA 工具 | `scripts/v10-qa-final/`（deep-gameplay / profession-compare / ad-flow / perf / wizard-debug 五个探针） |

## B. 测试统计

| 套件 | 命令 | 数量 | 通过 | 失败 | 跳过 |
|---|---|---|---|---|---|
| 全量单测/集成（修复前基线） | `npm test`（tsc + run-all） | 179 文件 | 179 | 0 | 0 |
| 全量单测/集成（修复后最终回归） | `npm test` | **180 文件** | **180** | **0** | **0** |
| 内容完整性 | `npm run content:check` | 全量校验 | PASS | 0 | 0 |
| V2 内容+合并遗留 | `npm run gameplay-v2:check` | 全量校验 | PASS | 0 | 0 |
| Cocos 构建 ×1 + 拷贝 ×3 | `build-web.cjs` / `copy-web-build.cjs` | 4 | 全 PASS（fresh 校验+provenance） | 0 | 0 |
| H5 boot 门（9 项） | `cdp-runner.cjs --mode h5` | 9 | 9 | 0 | 0 |
| Gameplay 动作（12 项真实点击） | 同上 | 12 | 10 PASS / 2 NOT_AVAILABLE* | 0 | 0 |
| 深度玩法旅程（J1-J6） | `deep-gameplay-probe.cjs` | 6 | **6/6 PASS** | 0 | 0 |
| 四职业对比 | `profession-compare-probe.cjs` | 4 职业 | **4/4 PASS**（差异实测成立） | 0 | 0 |
| 移动端视口扫描 | `mobile-sweep.cjs` | 5 视口 | 5/5（boot 门全过、无横向溢出） | 0 | 0 |
| 广告 Mock/适配器 | `ad-flow-probe.cjs` | 5 阶段 | 5/5 PASS | 0 | 0 |
| 性能采样 | `perf-probe.cjs` | 3 窗口 | 见 §E | 0 | 0 |
| 30 分钟 soak | `cdp-runner --soak-minutes 30` | 1 | 见 §E | — | — |

\* `tasks-claim`（无可领取项）、`promotion`（未达晋升条件）为数据状态未达成，非缺陷；与上一轮 v10-ultimate 报告同类记录一致。

## C. BUG 统计

| 级别 | 发现 | 修复 | 遗留 |
|---|---|---|---|
| P0（阻断） | 0 | 0 | 0 |
| P1（严重） | 3 | 3 | 0 |
| P2（一般） | 6 | 5 | 1（孤立广告入口，待产品决策） |
| P3（优化） | 4 | 3 | 1（SaveServiceV2 死代码） |
| QA 工具自身 | 4 | 4 | 0 |

## C'. 缺陷清单（本轮发现并整改，全部经回归验证）

| ID | 级别 | 位置 | 根因 | 修复 | 回归验证 |
|---|---|---|---|---|---|
| QA-BUG-001 | P1 | `v59o/card-battle/card-engine.ts` startPlayerTurn | REGEN（回气）只回复从不衰减，1 费卡可无限叠层永久回血（卡牌文案「获得 N 层回气」，层=应消耗） | 回复当前层数后每回合衰减一层（与 POISON 衰减同模式），maxHp 钳制保留 | 新增单测 6 断言（衰减序列 3→2→1→消失/钳制）；全量回归绿 |
| QA-BUG-002 | P1 | `v59/character-creation-service.ts` finalize + `v63/auto-battle-service.ts` squad() | 创建向导期间任何 `queryAutoBattle()` 查询都把战斗队长按默认职业 JAVA_BACKEND 持久化进存档且不再重算——四职业全变成同一角色（实测：四职业创建后 squad 全为 JAVA_BACKEND/代码暴击/atk15） | finalize 时把队长 profession 对齐玩家最终选择（同时修复已污染存档） | 修复后实测：四职业 squad 攻击 15/9/11/10、技能 代码暴击/渲染重构/弱点识别/一键回滚 全部差异成立；每职业 80 步真实卡牌会话；新增单测 |
| QA-BUG-015 | P1 | `desktop/ui-auto-battle.js` 招募/装备/目标三面板 | 面板容器 `onclick="event.stopPropagation()"` 拦截一切按钮冒泡——按钮点击永远到不了 overlay 委托路由器，**招募功能 UI 完全失效**（实测 93 次点击、灵石 109→182 充足、小队零增长零扣费）；装备穿戴/每日目标面板同样失效 | 仅面板空白处阻止冒泡：`if(!event.target.closest('[data-action]'))event.stopPropagation()` | 修复后实测：招募成功（小队 1→2、灵石精确 -50）、装备穿戴成功（见 QA-BUG-016 验证）；真实浏览器全链 |
| QA-BUG-003 | P2 | `card-engine.ts` beginCardBattle | 装备 `shieldBonus` 开局护盾授予后被 startPlayerTurn 无条件清零——死属性+假日志 | 第 1 回合不清空格挡（StS 口径：护盾存续到第 1 波敌人阶段，回合 2 开始清除） | 单测：护盾真实吸收首波 25 点攻击（hp 不变）、回合 2 清零 |
| QA-BUG-004 | P2 | `core/cocos-bootstrap-component.ts` | Electron 存档信号 `ipcRenderer.on` 监听器随场景重建累积（removeSaveListener API 存在但从未调用），旧回调持有已销毁组件重复触发保存 | `_saveSignalWired` 防重入 + onDestroy 移除监听 | tsc + 全量回归绿（EXE 专项） |
| QA-BUG-005 | P2 | `ui/floating-reward-component.ts` animateFloat | tween 作用于游离临时对象 `{y, opacity}`，池化飘字节点从不上升/淡出（静止 1.5s 后直接隐藏） | tween 直接驱动节点 position（Vec3）+ UIOpacity | tsc + 全量回归绿 |
| QA-BUG-006 | P2 | `core/cocos-bootstrap-component.ts` checkGameReady | 裸 setTimeout 重试链无清理：组件销毁后死循环每秒触发、重复发送 gameReady | 定时器句柄入字段，onDestroy clearTimeout | tsc + 全量回归绿 |
| QA-BUG-007 | P2 | `core/cocos-bootstrap-component.ts` onFacadeReady + 20 个 UI 组件 | facade 就绪前的延迟接线在组件销毁后仍被回调：重新订阅事件、复活已销毁单例（SceneBindingComponent._instance 指向已销毁组件） | onFacadeReady 增加 owner 参数，flush 跳过 `isValid===false` 的销毁组件；21 处调用点全部传入 owner | tsc + 全量回归绿 |
| QA-BUG-014 | P2 | `desktop/ui-battle-card.js` tutorialHtml | 读取不存在的 `f.queryPlayerFlags`（facade 只有单数 `queryPlayerFlag(key)`），短路 undefined 穿透 tryGet → 教程**永远渲染**；点「跳过引导」标记旗标后渲染器读不回——**首战引导永远无法关闭**（实测 60+ 次连续跳过点击无效），每场战斗都被遮挡 | 改调真实 API `queryPlayerFlag('v59o_battle_tutorial_done')`；API 缺失按已完成处理 | 修复后实测：教程只出现一次、跳过永久生效、战斗流程畅通；全量回归绿 |
| QA-BUG-013 | P2 遗留 | `desktop/ui-overlay.js` showOfflinePopup | 「看广告 ×2」离线收益弹窗为**孤立代码**（全项目无调用方），H5 当前无可达的广告 UI 入口——启动流程实际走「欢迎回来」摘要弹窗（无广告按钮）。广告服务/适配器/频控全部在位且有单测 | **不擅自接线**（改变启动弹窗产品行为需产品决策）；已实测验证服务层 Mock 语义完整（§D8） | 探针实测：showSync 成功发放、COOLDOWN_ACTIVE 冷却、重载后频控重置；遗留待产品接线 |
| QA-BUG-008 | P3 | `services/rewarded-ad-service.ts` cancel() | cancel 只翻转 watching，pending 完成定时器未清除——取消后奖励仍发放、canShow 提前放行可双发 | cancel 清除 pendingCompleteTimer；watch 入口记录句柄 | 全量回归绿（reward-ad-policy/reward-provider 套件） |
| QA-BUG-009 | P3 | `card-engine.ts` makeCardInstance | 战斗内生成卡 uid（`${defId}_${n}`）与牌库 uid 同空间同起点，可产生同 uid（如 card_vdom_1），playCard 按 uid 查找会误吃牌库升级副本 | 生成卡改用 `gen_` 前缀命名空间 | 单测断言前缀隔离 |
| QA-BUG-010 | P3 | `card-engine.ts` beginCardBattle | rng 快照在 spawnWave 消耗随机数之前采集，startPlayerTurn 重放 spawnWave 用过的随机段（破坏种子复现契约） | spawnWave 后回写 `state.rng = rng.toState()` | 单测断言快照计数器已推进 |
| QA-BUG-011 | P3 | `card-engine.ts` 波间喘息 | 波次转换 25% 回复无 `hp>0` 守卫：末敌死于中毒同回合玩家死亡时被复活，失败判定被绕过 | 与 endTurnHeal 同口径守卫 | 单测：hp=1 进波转换不被回复 |
| QA-BUG-012 | P3 遗留 L-1 | `services/save-service-v2.ts` | 死代码（无生产消费者）且 load 为 fail-open（双损坏时静默返回新档，违背 F01 fail-closed 口径）；有单测固化该行为 | **不改动**（避免破坏其文档化测试；无生产风险） | 需产品决策：接入时改 fail-closed 或直接删除 |
| QA-TOOL-001 | 工具 | `scripts/v10-final/cdp-runner.cjs` SNAPSHOT_JS | upgrade 验证盲区：projection 不含 clickDamage/spiritStones → 升级生效判 NOT_VERIFIED；equipment 字段读取 view 上不存在的 `battle.equipment`（死表达式）；弹窗选择器把 `[data-vevent-choice]` **按钮**匹配成弹窗层（`__auto` 事件永远无法处理）；教程 Next 优先导致无人值守死循环 | projection 增补 maxStage/squadAtk/clickDamage/spiritStones/pendingChests/equipBagN(queryEquipView)；选择器层优先；教程 Skip 优先 | 修复后 harness/探针动作验证全部真实生效 |
| QA-TOOL-002 | 工具 | 各探针随机 CDP 端口 | 三探针并行时随机端口区间重叠，Chrome 绑定失败后 CDP attach 到错误实例（数据交叉污染，一轮移动端扫描结果作废重跑） | 端口段隔离（21300/21500/21700/28800+），并行组合不再交叠 | 隔离后重跑，数据一致互不干扰 |
| QA-TOOL-003 | 工具 | 深度探针 J2 循环 | 事件/技能/结算/教程/奖励弹窗阻塞战斗入口无分派；Boss 入口未走「底部导航 PROJECT → projectEntry → build」已验证链路；弹窗分派后 `continue` 饿死升级/招募/装备检查（单轮 1442 次分派）；Boss 战后停在项目页导致战斗页按钮不存在 | 全类型弹窗清理链 + 分派后贯通 + Boss 入口导航链 + 动作前回战斗页 | 最终轮 6/6 全 PASS |

## D. 游戏实测（真实浏览器，CDP 真实鼠标事件，非接口模拟）

### D1. 启动与首页
- 冷启动 → 加载进度 → 角色创建向导（行业/方向/职业/身份/命格/配点/确认 7 步，全真实点击）→ 首页。
- boot 9 门（electronReady/cocosReady/facadeReady/creationComplete/homeVisible/resourcesReady/heroSpriteReady/chapterValid/battleReady）**9/9 PASS**。
- 无黑屏/白屏/资源加载失败（images 全部 complete 且 naturalWidth>0）。

### D2. 战斗流程（深度旅程，最终轮 6/6 PASS）
- **关卡 1→55 连续推进**（章节 1 需求分析 → 2 概要设计 → 3 编码开发 → 4 联调测试），kills 55。
- 状态机验证：IDLE→FIGHTING→VICTORY→下一关 / BOSS_PENDING→卡牌 Boss 战→胜利→推关，与代码口径一致。
- 每关耗时随 HP 曲线（50×1.13^(n-1)）平滑上升（普通关 2.8-8.8s，小 Boss 关 10-23s，章节 Boss 卡牌战 82-238s），无突变卡点。
- 灵石经济与配置完全一致：小 Boss +2/关、宝箱 (stage×7+3)%4 决定类型、章节 Boss 战胜利 +40~66。
- 伤害飘字/金币入账/击杀结算/AI点评气泡全程观察正常。

### D3. 四职业（QA-BUG-002 修复验证）
| 职业 | 存档 professionId | 战斗小队队长 | 队长攻击 | 队长技能 | 卡牌会话 |
|---|---|---|---|---|---|
| JAVA_BACKEND | JAVA_BACKEND ✓ | JAVA_BACKEND ✓ | 15 | 代码暴击（暴击爆发） | 80 步 |
| FRONTEND | FRONTEND ✓ | FRONTEND ✓ | 9 | 渲染重构（护盾） | 80 步 |
| QA | QA ✓ | QA ✓ | 11 | 弱点识别（Debuff） | 80 步 |
| DEVOPS | DEVOPS ✓ | DEVOPS ✓ | 10 | 一键回滚（治疗） | 80 步 |

修复前四职业全部为 JAVA_BACKEND/代码暴击/atk15（见缺陷表）。差异实测成立。

### D4. 招募 / 点击升级 / 装备（全部真实生效验证）
- **点击升级（J3 PASS）**：先验证拒绝路径（灵石不足 → 数值零变化）；灵石充足后真实升级：clickDamage 10→23（升级 2 级），灵石精确 -20（20×lv² 公式）。多轮运行复现。
- **招募（J4 PASS）**：招募菜单 → 真实点击 → 新成员「测试仙子」入队（小队 1→2），灵石精确 -50（50×slot² 公式）。修复 QA-BUG-015 后生效。
- **装备（J5 PASS）**：击杀掉落（eq_weapon_2 静电容键盘）→ 装备面板 → 穿戴 → equipped:true，全队攻击随装备+等级成长（队长 atk 110→590 区间，随等级与装备叠加）。

### D5. Boss 卡牌战斗（三章 Boss 全部真实击败）
- 进入：BOSS_PENDING → 底部导航「项目」→「选择 Build 进入项目」→ Build 卡选择 → 5 波卡牌战斗（普通→精英→Boss）。
- 战斗循环：出牌（battlePlayCard，仅 is-usable 卡）→ 需目标卡点击敌人施放 → 结束回合 → 波次推进 → 奖励三选一，全链真实点击（单局 42-120 步）。
- 第 12/25/40 关三个章节 Boss 全部击败（章节 Boss 战胜利 +40~66 灵石），Boss 死亡后无继续攻击、血量归零正常进入结算、无血量归零不结束战斗问题。
- Boss 机制：意图展示、特殊技（能量吞噬等）随出牌轮转正常；BOSS_PENDING/bossDefeated/bossFailed 状态机与卡牌战斗衔接一致。

### D6. 失败/复活
- 引擎级：DEFEAT_SETTLED→灾备重生 reviveOnce→再次失败路径有单测与波间喘息守卫（QA-BUG-011）覆盖。
- 浏览器级：本轮 S1-S2 队伍战力下未自然触发全灭（敌人攻击频率低），失败/复活 UI 全流程标注**部分验证**，建议 EXE 环境补证（遗留 §H-4）。

### D7. 存档一致性（J6 PASS，多轮复现）
- 旅程中途 Page.reload：stage/maxStage/灵石/小队人数全部保留，无重复结算（stonesBefore==stonesAfter）。
- harness restart 动作：localStorageBefore==localStorageAfter（`game-save` + `nmx_merge_tutorial_v1`），PASS。
- 深度旅程 55 关 + 2 人小队 + 装备状态下重载，状态完整保留。

### D8. 广告（Mock/适配器层，5/5 PASS）
- **发现 QA-BUG-013**：「看广告 ×2」离线弹窗为孤立代码，H5 无可达广告入口（P2 遗留，待产品决策接线）。
- facade 级 Mock 语义实测（真实浏览器页面内）：showSync 成功发放（success=true + 历史入账）；同 placement 立即重放 → COOLDOWN_ACTIVE；跨 placement 冷却逐一生效；小时上限由 reward-ad-policy 单测覆盖（全量绿）；页面重载后频控历史重置（内存态，文档行为）。
- 幂等保护（代码级确认）：offline-reward-service 三重守卫（isSettled + claimedDoubleSettlementIds + claimingSettlementId），广告回调后二次校验；RewardService 生成计数 + callbackFired；平台适配器 wx/tt 运行时检测 + isEnded/isComplete 校验（真机未验，§H-2）。

## E. 性能报告（真实 rAF 采样 + performance.memory）

### E1. FPS（perf-probe 实测，430×932 移动视口）
| 场景 | 采样窗口 | 平均 FPS | 最低 FPS | P95 |
|---|---|---|---|---|
| 首页 | 8s | **57.6** | 57 | 59 |
| 战斗早期 | 10s | **57.4** | 57 | 58 |
| 持续战斗（45s 真实点击压力后） | 12s | **57.3** | 57 | 58 |

结论：全程稳定 57+ FPS（接近 60 垂直同步上限），远高于普通战斗 ≥55 目标；无长卡死。

### E2. 内存
- JS 堆：首页 35.3MB → 战斗早期 36.4MB → 持续战斗 41.9MB（+6.6MB 全程，无泄漏曲线）。
- DOM 节点：首页 371 → 战斗 133-143（场景切换正常回收，无节点累积）。

### E3. 资源加载（本地静态服务）
- DOMContentLoaded 264ms / load 821ms；63 个资源共 12.8MB；最慢资源 34ms（2.3MB 主视觉图）。
- 主 bundle（cc 引擎 3.36MB）16ms 加载。无失败/零字节资源。

### E4. 30 分钟 soak（harness soak-monitor，58 采样点，PASS）
- 心跳断流（>45s 无采样）：**0**；空白页：**0**；心跳失败：**0**。
- JS 堆：39.5 → 34 → 49.9MB（周期性 GC 有效，无单调泄漏曲线）。
- DOM 节点：374 → 374（30 分钟后逐节点一致，零泄漏）。
- 控制台错误/异常累计：**0 → 0**（全程无新增）。
- 采样期间真实点击注入（每 30s tapAttack）；boot 门 + 12 项 gameplay 动作在 soak 前全过（work/messenger/hire/tap/equipment/card-entry/card-session/chapter/restart PASS；upgrade NOT_VERIFIED=当时灵石不足被正确拒绝；tasks-claim/promotion 状态未达成）。
- 说明：soak 启动于最终构建拷贝前 9 分钟，其页面加载的是教程修复的等价版本（单数 API 渲染器，行为一致）；差异仅为 facade 上一个未被该页渲染器调用的方法。功能等价性已由最终构建的教程专项探针（PASS）与教程 DOM 单测（双绿）覆盖。

## F. 截图（docs/QA/screenshots/，均为真实运行截图）

| 场景 | 文件 |
|---|---|
| 首页（JAVA_BACKEND） | `java_backend-J1-home.png` |
| 四职业首页 | `prof-home-java_backend/frontend/qa/devops.png` |
| 战斗开场 | `P2-battle-start.png` |
| 小 Boss（第 5/10 关） | `java_backend-J2-stage5-miniboss.png`、`java_backend-J2-stage10-miniboss.png` |
| 升级后 | `P3-after-upgrade.png` |
| 装备面板 | `P5-equipment-panel.png` |
| 旅程结束/存档重载 | `java_backend-J2-journey-final.png`、`java_backend-J6-after-reload.png` |
| 移动端 5 视口 | `ai/reports/v10-ultimate/screenshots/mobile/mobile-*.png`（本轮刷新） |
| 广告 Mock | `A4-facade-mock-ad.png` |
| 性能战斗 | `perf-battle.png` |

## G. 最终 Git

- 修改文件：26 个（游戏修复 5 + UI 组件 21）；新增文件：QA 探针 6 + 回归测试 2 + 报告 1 + 截图 15；另有 mobile-sweep 证据刷新 6。
- 分模块提交（基于 `b677ac4`，即上一轮 v10-ultimate 遗留工具改动已被并行会话提交并推送）：
  - `4bed861` fix(v10-qa): card battle engine — REGEN 衰减/开局护盾/gen_ uid/rng 快照/波间喘息守卫 + 回归测试
  - `567e3fd` fix(v10-qa): professions really differ — finalize 对齐队长职业 + facade queryPlayerFlags + 教程可关闭 + 单测
  - `ed12e33` fix(v10-qa): hire/equip/goals 面板冒泡拦截 + UI 生命周期泄漏 + 广告 cancel 双发
  - `ca34bf8` test(v10-qa): QA 覆盖（六探针）+ harness 观测修复 + 全量 QA 报告 + 截图（本提交）
- 最终 SHA：`ca34bf8`（test(v10-qa) 报告提交；其中三枚 fix 提交 SHA 稳定不变）
- Push 状态：见下（提交后推送结果回填）
- 远程分支：`origin/feature/v10-final-release`
- 测试报告位置：`docs/QA/V10_FULL_QA_REPORT.md`
- 排除项：根目录 `pnpm-lock.yaml`/`pnpm-workspace.yaml`（历史会话意外产物，未纳入）

## H. 遗留问题（如实）

1. **L-1（P3）SaveServiceV2 死代码 fail-open**：无生产消费者，不构成风险；接入前必须改 fail-closed（QA-BUG-012）。
2. **广告平台真机验证**：微信/抖音激励视频适配器代码在位（wx/tt 运行时检测 + isEnded/isComplete 校验 + 幂等），本环境无小游戏开发者环境，**未做真机验证**，不得宣称正式兼容；H5 Mock 层已验证（§D8）。
3. **广告 UI 入口未接线（QA-BUG-013）**：「看广告 ×2」离线弹窗孤立代码，需产品决策接线方式后补 UI 级广告流测试。
4. **失败/复活 UI 全流程**：浏览器级部分验证（§D6），建议 EXE 环境触发一次全灭补证。
5. **音效听感**：14 事件合成音映射在位（v10-ultimate 报告），人工听感未验证。
6. **BGM**：无真实音乐资源，开关记录偏好（遗留，同 v10-ultimate）。
7. **一键推荐装备**：未实现（遗留，同 v10-ultimate）。
8. **未跟踪杂项**：根目录 `pnpm-lock.yaml`/`pnpm-workspace.yaml` 为历史会话意外产物（workspace.yaml 内容为无效占位符），与本轮无关，**未纳入提交**；建议后续清理。

## 验收对照（任务书 §16）

| # | 标准 | 结果 |
|---|---|---|
| 1 | 游戏能正常启动 | ✅ boot 9/9 |
| 2 | 核心战斗流程正常 | ✅ 自动战斗+点击+卡牌战斗全链 |
| 3 | 前五关完整运行 | ✅ 实测连续推进至 55 关（4 章） |
| 4 | Boss 战斗和结算正常 | ✅ 小 Boss×2 + 三章节 Boss 卡牌战真实击败 |
| 5 | 士兵升级正常 | ✅ 招募真实生效（-50 灵石/新成员入队） |
| 6 | 武器升级正常 | ✅ 点击伤害升级（拒绝+生效双路径，-20 灵石精确） |
| 7 | 四职业实际可用 | ✅ 修复 QA-BUG-002 后存档/技能/攻击差异实测成立 |
| 8 | 装备系统正常 | ✅ 掉落→穿戴→equipped:true→属性成长 |
| 9 | 技能选择正常 | ✅ 卡牌奖励三选一 + 技能三选一真实点击 |
| 10 | 存档正常 | ✅ 多轮重载一致性（55关/2人小队/装备状态保留） |
| 11 | 无未解决 P0 | ✅ |
| 12 | 无未解决 P1 | ✅ 3 项 P1 全部修复+实测验证 |
| 13 | 全量测试重新通过 | ✅ 180 文件 EXIT=0（含新增回归测试） |
| 14 | 实际浏览器试玩通过 | ✅ CDP 真实事件流（单局 42-120 步真实卡牌操作） |
| 15 | 性能与长时间测试有真实记录 | ✅ §E（FPS 57+/内存/加载/soak 回填） |
| 16 | 构建成功 | ✅ Cocos fresh 校验 + provenance ×4 |
| 17 | Git 提交成功 | 见 §G |
| 18 | 推送成功或记录阻塞 | 见 §G |
