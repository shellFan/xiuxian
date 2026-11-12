# V7.0 打包 EXE 真实验收报告（TASK-068~075）

方法：`dist/牛马修仙传-win32-x64/牛马修仙传.exe` 真实启动，PowerShell
`Start-Process`（本机 GUI 会话），`--remote-debugging-port=9224` 附着打包产物
渲染进程（CDP），`XIUXIAN_USER_DATA=tmp/v70-exe-userdata` 隔离存档。
全程独立窗口、真实 DOM 事件，无键鼠模拟、不触碰真实玩家存档。

## 1. 交付产物指纹

| 项 | 值 |
|---|---|
| EXE | `dist/牛马修仙传-win32-x64/牛马修仙传.exe` |
| EXE 大小 | 176,819,200 字节 |
| EXE SHA-256 | `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`（Electron 可执行体，与 V6.8 一致，符合预期） |
| app.asar 大小 | 56,128,103 字节（最终版） |
| app.asar SHA-256 | `899ca975643f97c7dad113b7b86563b9eefe93d6b38da42cb47d922d4d938550` |
| 打包命令 | `cd desktop && npm run pack`（prepack = build:copy → patch-html → build-manifest → electron-packager --asar），EXIT=0 |
| 打包内容 gitHead | `37ba8e6`（+ main.cjs 节流修复 3d0fbd1 在 main.cjs 中，asar 复验 `backgroundThrottling` 在位） |

ASAR 内容校验（`ai/work/v70-asar-verify.cjs` 真实读取，非文件名猜测）：
15 项 V7.0 内容标记全部命中——
`svc_creationGate / svc_powerCurve / svc_battleSkillKind / svc_deferNextEvent /
js_preserveBattle / js_battleSignature / js_notifyPopupClosed / js_battleSkillCandidate /
js_grace / js_hireCost / js_gotoUppercase / card_dbg_removed / css_toast_moved /
patch_html_has_sprite_copy / manifest_gitHead`。
sprite sheets 与 ui-slice 资源均在包内（desktop/assets 与 build/web-desktop 双路径）。

## 2. 首轮 EXE 试玩暴露的真实缺陷（非测试脚本问题）

| 缺陷 | 现象 | 修复 |
|---|---|---|
| 遮挡节流冻结 | 窗口被其他窗口覆盖后 Chromium 节流 rAF → GameLoop 停摆，战斗卡在第 5 关 5 分钟，截图挂起 15s 超时 | `backgroundThrottling:false`（3d0fbd1）+ 截图容错；重打包后实测推进恢复（第1关→第6关→第12关） |

## 3. 第二轮（最终版）EXE 试玩

证据：`v70-exe-cdp-final8.log`、`v70-exe-soak.json`、`screenshots/exe/*`。

| 检查 | 结果 |
|---|---|
| bootReady | true（GAME_READY） |
| 创建向导 | 真实 DOM 点击走通 → homeReached=true |
| 首屏可达 | 7/7 核心控件 |
| sprite 资源 | scene_office/javabackend_idle/bug_idle/kpiLord_idle 全部 200；sprite DOM 挂载 ✓ |
| 自动战斗 | 第 1 关起步自然推进至第 12 关（卡牌 Boss） |
| 卡牌战斗（自驱动） | BOSS_PENDING → startBattleRun（与 UI 同 API）→ 真实 DOM 出牌/目标/结束回合，turn 推进、敌人死亡、玩家受击（见 §4 采样） |
| 网络 | http4xx=0 全程；sprite 2xx 缓存稳定 |
| 异常 | exceptions=0 全程（见 §4） |
| 交互统计 | tapAttack/技能/倍速/面板/塔/弹窗应答计数见 JSON |

## 4. 60 分钟稳定性采样（实测，30 秒间隔 × 117 采样，60.00 分钟）

`v70-exe-soak.json` 实测数据：

| 指标 | 实测值 | 结论 |
|---|---|---|
| 时长 / 采样 | 60.00 分钟 / 117 采样 | 完成（EXIT=0） |
| JSHeapUsedSize | min 26.1 / avg 31.8 / max 37.1 MB | 无单调增长，无泄漏证据 |
| DOM 节点 | 首页 ~455 / 卡牌战斗 ~160-183 | 按页面稳定，无膨胀 |
| exceptions | **0** | 零未捕获异常 |
| consoleErrors | **0** | 零渲染层错误 |
| http4xx | **0** | 资源全命中 |
| rendererCrashed | **false** | 全程存活 |
| 关卡时间线 | 第1关(0s) → 第5关(31s) → 第7关(62s) → 第11关(93s) → 第12关卡牌 Boss（自驱动卡牌战斗至结束） | 挂机推关 + Boss 减速点符合设计 |
| 交互统计 | tapAttack 15 / 技能 5 / 面板 2 / 倍速 2 / 弹窗应答 2 + 每样本卡牌回合动作 | 战斗/技能/页面切换/弹窗全程穿插 ✓ |

## 5. 重启恢复（TASK-075）— 实测通过

流程：60 分钟 soak 结束 → taskkill（WM_CLOSE → F05 存档 flush，CLOSED_GRACEFULLY）
→ 重新启动（同一隔离存档，CDP 9225）→ `v70-exe-restart.cjs` 复检。

重启前存档（save.json 实测解析）：
`name=V70EXE, setup=COMPLETE, v63{stage=12, maxStage=12, kills=13, status=BOSS_PENDING}, salary=603, cultivation=336, stones=29, squad=1人, totalSkillUses=1`

重启后（`v70-exe-restart.json`）：

| 检查 | 结果 |
|---|---|
| recovered | **true**（bootReady=true） |
| 首页 | home=true，无创建向导，DOM 448 节点 |
| 战斗进度 | **stage=第12关「产品VP·需求灭世者 卡牌Boss」、kills=13、status=BOSS_PENDING** —— 与关机前逐项一致 |
| 视觉证据 | `screenshots/exe/exe-04-restart.png` |
| 结论 | **PASS：角色/关卡/Boss 待战状态/击杀数完整恢复，重启后可继续游玩** |

## 6. 宿主环境限制（如实区分）

- EXE 窗口由 PowerShell Start-Process 在真实桌面会话启动；ZCode Bash 直接
  子进程无法启动 Electron（默认应用秒退），详见 V70-BASELINE.md §5。
- CDP 采样不覆盖 GPU 原生内存；FPS 无引擎内计数器（见 V70-PERFORMANCE §3）。
