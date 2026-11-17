# V10.1 战斗 UI（BATTLE-UI）

## 结构（desktop/ui-overlay.js battleHtml + ui-battle-card.js）
- 顶栏：章节/关卡/波次。
- 中部三列（桌面）：玩家列 / 敌人列（HP/意图/打断窗口/P2 标签/Debuff 标签）/ 战利品列。
- 底部：回合数 + 能量球 + 连击徽章 + 手牌（费用/类型/稀有度/目标提示）+ 结束回合。
- 移动端 ≤899px 单列堆叠（本轮修复），手牌区完整可见。

## 本轮新增元素
| 元素 | 位置 | 交互 |
|---|---|---|
| 连击徽章 🔥×N | 回合条右侧 | 实时 queryAutoBattle().comboCount；≥15 红热态 |
| 打断窗口进度 | 敌人意图行 | JUDGE 蓄力时显示 x/need（%），满额绿色"✦ 审判可打断！" |
| 流派倾向条 | 卡组页顶部 | ≥2 张同流派亮灯，附联动说明 |
| 净化按钮 | 卡组页每行 | data-action="battleRemoveCard"，显示递增费用 |
| 卡牌图鉴 | 卡组页底部 | 全部可获卡收集状态 + 进度 n/m |
| 费率上调显示 | 手牌费用角标 | turnCostDelta 直接反映（引擎权威） |

## 权威数据原则
一切数值来自 facade.queryBattleCard()（引擎状态），UI 只渲染 + 命令转发
（playBattleCard/endBattleTurn/claimBattleCardReward/removeBattleCard），无本地状态改写。
