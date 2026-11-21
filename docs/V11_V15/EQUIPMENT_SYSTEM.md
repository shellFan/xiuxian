# 装备/武器/法宝/炼丹系统报告（EQUIPMENT_SYSTEM）

> 以实际代码为准（2026-11-22 审计）。技能：`rpg`（词缀/稀有度）、`save-systems`。

## 1. 装备现状

| 项 | 实现 |
|---|---|
| 槽位 | `EQUIP_SLOTS = ['DESK','BADGE','ACCESSORY']`（v2-item-service.ts:147） |
| 稀有度 | COMMON/UNCOMMON/RARE/EPIC/LEGENDARY（v2-item-service.ts:88） |
| 内容 | `configs/v57/equipment-content.json` |
| 强化 | `v64/equipment.ts`（EQUIP_DEFS、MAX_EQUIP_LEVEL=10、enhanceCost、dropEquipForStage） |
| 佩戴 | v2EquipItem（slot, id）；卸下传 null（overlay equipUnequip 同链路） |
| 推荐装备 | V10.1 一键推荐（评分函数+边界测试） |
| 加成通路 | 装备走 modifiers → work-service `techniqueAggregates` 聚合 → 统一结算 |

## 2. 炼丹现状（V11-S2 深化后）

| 项 | 实现 |
|---|---|
| 配方 | `configs/craft.json` 9 配方（成功率 0.75–0.95；artifact_lingpai 自定义品质权重） |
| 成功率 | 失败消耗材料、无产出、`itemCraftFailed` 事件 |
| 品质 | 普通/良品/上品/极品 ×1/1.3/1.7/2.5（分段权重掷骰，即时结算） |
| 事务 | apply 失败回滚材料+产出登记（「要么全成要么无痕」） |
| 统计 | craftSuccessCount/craftFailCount/craftPerfectCount（lifetime，成就条件源） |
| UI | Cocos craft-page + overlay renderCraft 双面（成功率入卡+品质 toast） |
| 事件 | itemCrafted/itemCraftFailed → 音效（ui_success/ui_fail）+ HUD 刷新 |
| 成就 | CRAFT_FIRST/10/50/200 + 极品丹师 + 百炼成丹（6 个） |

## 3. 已知缺口（→BACKLOG）

| 缺口 | 任务书要求 | 说明 |
|---|---|---|
| 武器/防具分部位（7 槽位） | §7.1 | 现 3 槽（DESK/BADGE/ACCESSORY）；扩展需存档 schema 评估（B5） |
| 精炼/升星/镶嵌/重铸/套装 | §7.1 | 均未实现；强化(MAX10)已覆盖基础成长 |
| 丹药库存/使用 | §7.4 | 炼丹即时生效无丹药库存；「炼丹时间+库存」需存档字段（B3 BLOCKED-WIP） |
| 法宝境界联动 | §7.3 | artifact_lingpai 有 unlockCareerLevel 3 + max 1；境界联动待境界系统（B1） |
| 武器类型差异 | §7.2 | 现无武器分类；设计需先立 ADR |
| 装备图鉴 | §7.1 | codex 页（overlay）有装备条目；Cocos 侧无图鉴组件 |

## 4. 数值安全

- 炼丹 EV 校验：默认品质权重 × 乘子 = EV×1.204；修为→修为配方仍净负（100→60.2）——无资源放大回路
- 强化成本 enhanceCost 随等级递增（v64/equipment.ts）；V58 双闸门模拟覆盖工资/修为主链路，装备强化消耗已含
