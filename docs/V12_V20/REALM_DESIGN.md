# 境界系统设计（REALM_DESIGN）

> 技能：`rpg`（境界 pacing/突破风险设计）、`save-systems`（零迁移约束下的状态设计）。

## 1. 架构决策：派生式状态（ADR）

**决策**：境界层状态 = `f(cultivationExp, lifetimeStats)` 纯派生，不新增存档字段。

理由：
1. 用户 WIP 占用 save-service.ts/cultivation-service.ts——派生式零迁移、零冲突
2. 挂机游戏惯例：修为本身即境界进度，避免「修为进度条」与「境界值」双头状态
3. 突破标记走 lifetimeStats 开放键值（sanitizeLifetime 白名单已接受任意有限数值键）

**代价与边界**：跨会话的失败补偿计数同样持久（lifetimeStats）；存档回滚到旧点会连带回滚境界标记（与修为一致，语义正确）。

## 2. 层级表（configs/realm.json，30 层）

10 大境界 × 初期/中期/圆满。阈值（修为）：凡人 0/500/1000 → 炼气 2000/3500/5000 → 筑基 10000/17500/25000 → 金丹 40000/55000/70000 → 元婴 100000/150000/200000 → 化神 300000/400000/500000 → 炼虚 700000/900000/1100000 → 合体 1400000/1700000/2000000 → 大乘 2500000/3000000/3500000 → 渡劫 4200000/4600000/5000000。

每大境界首层 = **渡劫门**（gate）：灵石成本 50→8000、基础成功率 0.85→0.62、一次性奖励 salary 100→120000、修炼加成 buff +4%→+10%。

## 3. 渡劫突破规则

- 前提：修为 ≥ gate 阈值 + 灵石足够
- 消耗：灵石（失败不返还）
- 成功率：基础 + **每失败 +5%**（越挫越勇，钳 5%–95%）——失败不是纯负反馈（任务书要求）
- 失败：不损失修为；计失败次数
- 成功：gate 标记 + `realmHighestReached` 更新 + salary 奖励 + **WORK_CULTIVATION_BOOST buff**（1+bonus，超长时效）——加成走既有 buff 聚合（work-service 修为收益），真实生效
- 事务化：save 失败回滚全部（lifetimeStats/灵石/buff）
- 事件：realmAdvanced / realmBreakthroughFailed → 音效 + HUD 刷新 + 成就

## 4. 交付面

| 面 | 内容 |
|---|---|
| Service | RealmService（getState/canBreakthrough/breakthrough + 构造期校验） |
| 事件 | GameEvents realmAdvanced/realmBreakthroughFailed + PHASE2 刷新表 |
| Facade | queryRealmState / breakthroughRealm |
| UI | overlay 修仙页境界卡（进度条/待渡劫/渡劫按钮/失败补偿展示）+ MORE「修仙」入口（修复孤儿页） |
| 成就 | REALM 系列 5 个（踏入炼气→渡劫飞升，115→120） |
| 音效 | realmAdvanced→ui_success / failed→ui_fail（dispatcher+map 双源） |
| 测试 | tests/realm 8/8（推导/gate 阻挡/成功/失败补偿/灵石不足/二级门/坏配置/生产配置装载） |
| 运行证据 | 探针 A8：卡片渲染+真实点击渡劫成功（toast「渡劫成功！晋入 炼气初期·修炼效率+4%」）+ 截图 09/10 |

## 5. 待接线（WIP 解锁后）

- cultivation-service 修炼效率直接读 realm 加成（现经 buff 通路已生效，双保险留待合并）
- 卡牌战斗数值联动（v59o 伤害公式接 realmHighestReached）
- B1 完整版：若未来需要「突破材料道具化」，再评估存档 v16
