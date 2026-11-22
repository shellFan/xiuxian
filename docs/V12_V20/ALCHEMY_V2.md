# 炼丹二期设计（ALCHEMY_V2）

> 技能：`save-systems`（Clock 权威时间/防重复领取）、`game-feel`（入炉/领取反馈）。基于 V11-S2 炼丹基础（成功率/品质/事务回滚）。

## 1. 架构：派生式队列（ADR）

队列状态 = `lifetimeStats['craftQueue:<recipeId>']` = 完成时间戳（epoch ms，Clock 注入）——零存档 schema 变更。离线/挂机自然完成（时间戳为绝对时刻）；时钟回拨只会延迟领取，不会提前（安全侧）。

## 2. 规则

- 9 配方 durationSeconds 30–420s（低阶短、高阶长）
- startCraft：canCraft 校验 → 队列容量 3 + 同配方去重 → **成功率掷骰在投入时点**（失败消耗材料、不入队、craftFailCount+1、itemCraftFailed 事件——与即时模式语义一致；入队后必得成品，等待无二次随机挫败）→ 扣材料 + 写完成时间戳 + 保存（事务化）
- claimCraft：到期才可领 → 品质掷骰 → 效果 → craftedItemIds/统计 → **同事务清队列键**（防重复领取）→ itemCrafted
- 事件：itemCraftQueued 新增；PHASE2 刷新表更新

## 3. 交付面

| 面 | 内容 |
|---|---|
| Service | startCraft/claimCraft/getQueue + QUEUE_CAPACITY=3 |
| Facade | startCraft/claimCraft/queryCraftQueue |
| UI | overlay 炼丹页丹炉卡片（进行中倒计时/可领取按钮）+ 配方按钮分流（timed→craftStart，instant→craft） |
| 测试 | craft 26/26：入队时间戳/未到期剩余/到期领取品质+清键+防重/容量+去重/失败不入队/零时长快路径 |
| 运行证据 | 探针 A10：UI 入炉（丹炉 1/3+倒计时 30s）→ 32s 后领取（quality normal、队列清空、successCount 1）；UI 点击被事件弹窗竞态时 fallback 直调兜底（如实记录） |

## 4. 待扩展（B3' 残余）

- 丹炉升级（容量 3→5）、炼丹等级（时长/成功率成长）、丹方收集图鉴——需数值设计 ADR
- 丹药库存+主动使用（需存档 schema，B3-WIP）
