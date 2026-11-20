# Game Feel 动画与反馈规范（入口）

> 路由：动效/打击感/奖励反馈任务 → `game-feel` 技能 + 本文件。
> **权威动作表在 docs/ANIMATION-GUIDE.md**（每动作的 duration/easing/优先级/触发/取消），本文件是执行规则与 Cocos 映射。

## 1. 全局预算（硬性）

| 预算 | 值 | 来源 |
|---|---|---|
| 全局并发特效 | ≤3 | ANIMATION-GUIDE + ui-theme `motion.maxConcurrentEffects` |
| 单次粒子 | ≤12 | `motion.maxParticlesPerBurst` |
| 数值变化动画 | 每秒最多 1 次，连续变化合并到最终值 | ANIMATION-GUIDE |
| 音效限流 | salary 每秒 1 次；同帧多奖励合一声；全局 ≤4 路 SFX + 1 路 BGM | docs/AUDIO-GUIDE.md |
| 按钮按下反馈 | 80/120ms，scale 1→0.96→1，热区不变（`motion.pressedScale`） | ANIMATION-GUIDE |

## 2. 优先级与取消规则

- P0 事务结果 > P1 直接输入 > P2 奖励信息 > P3 氛围；高优先可取消低优先**视觉**，但**任何动画不得取消或重复业务交易**（晋升渡劫 900ms 可跳过，跳过不重触发晋升）。
- 同一业务事件由 Presenter 分发**一遍**（ui/animation-dispatcher.ts 是唯一分发点），禁止 View 与 Modal 各播一套金币。
- UI 离开/后台/节点回池：停止 tween、解除监听、复原 scale/opacity/position；前台恢复读权威状态，不补播后台累计动效（减少动态模式：`motion.reducedScale`）。

## 3. Cocos 映射（game-feel 技能术语 → 本项目实现）

| 技能概念 | 项目实现 |
|---|---|
| eased tween / squash-stretch | `tween()` 系统缓动（easeOutQuad/Cubic/Back ≤1.06），禁止自写插值循环 |
| hit-stop / screen shake | 当前**未使用**；引入需新 ADR + 更新 ANIMATION-GUIDE 动作表，不得散写 |
| 特效池 | 特效序列（merge_effect_frame_01–04）按 ASSET-BUDGET effects_01 组管理，回池释放 |
| 奖励反馈 | floating-reward-component.ts（工资/修为锚点飞行，共用池） |
| 结果盖章 | KPI/成就「打勾盖章」语义 = P0/P2 事务完成后才播，失败不播成功动效 |

## 4. 新动效交付检查单

- [ ] 已在 ANIMATION-GUIDE 动作表登记（duration/easing/优先级/取消路径），不私自改 token
- [ ] 并发≤3、粒子≤12、数值每秒 1 次遵守
- [ ] 可跳过且跳过不影响业务事务；后台/回池清理路径完整
- [ ] 广告奖励动效仅在「平台成功且服务发奖完成」后播放「已领取」章（IAA 生命周期）
- [ ] `tests/ui/` 新用例 + 截图对比（acceptance 基线 ai/reports/v10-ultimate/screenshots/）
