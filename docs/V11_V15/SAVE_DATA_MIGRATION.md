# 存档迁移报告（SAVE_DATA_MIGRATION）

> 规范源：docs/GAMEDEV_SKILLS/SAVE_SYSTEM_GUIDELINES.md。本文件记录**当前版本契约与本轮迁移动作**。

## 1. 当前契约（生产态）

| 项 | 值 |
|---|---|
| 版本 | `CURRENT_SAVE_VERSION = 15`（model/save-data.ts:4） |
| 存储 key | `game-save`（单 key 全量 JSON，storage-adapter fail-closed 写锁） |
| 迁移 | `save-service.ts migrate()` 单函数逐版本归一化 + 白名单字段（isNonNegativeSafeInteger 系列守卫） |
| 加载失败语义 | **fail-closed**：解析/迁移失败抛 SaveLoadError，绝不静默新建档覆盖（F01 BLOCKER） |
| 越界拒绝 | saveVersion > CURRENT → "Unsupported save data" |
| 备份/校验 | **未接线**（save-service-v2 设计在案，接线四条件见 SAVE_SYSTEM §4） |

## 2. V11 各轮迁移动作盘点

| 轮次 | 存档影响 | 迁移需求 |
|---|---|---|
| S1 排行榜 | 无新字段（NPC/榜单为运行时生成） | 无 |
| S2 炼丹 | 复用已有 craftedItemIds（字符串数组，白名单清洗已在位）+ lifetimeStats 开放键值（sanitizeLifetime 接受任意有限数值键） | 无 |
| S3 设置 | **独立存储 key `game-settings`**（非 GameSaveData）——旧档无此 key → 默认值；音量字段白名单加载（bgmVolume/sfxVolume clamp [0,1]） | 无（独立链路天然兼容） |
| F5/F6 事件/成就 | lifetimeStats 新键（craftSuccessCount 等）走 sanitizeLifetime 开放白名单；achievements.json 新条目对旧档透明（未解锁状态） | 无 |
| 事件资格 | requiresWorkMode 等元数据为代码侧 sidecar，不入档 | 无 |

**结论：V11 两轮全部零存档 schema 变更（CURRENT_SAVE_VERSION 保持 15）。**

## 3. 用户 WIP 中的修复（未提交，不属本轮）

- BUG-001：卡组预设 `[...new Set()]` → `Array.from`（Cocos 转译链数据丢失修复，P1）
- BUG-002：CULTIVATE_3 每日任务接线 + 回归测试

## 4. 下轮迁移预告（B1 境界系统前置）

按 SAVE_SYSTEM_GUIDELINES §2 流程，B1 落地时：

1. GameSaveData 增字段（realmState/breakthrough 材料）+ 版本分段注释 + `CURRENT_SAVE_VERSION = 16`
2. migrate() 白名单分支 + 默认值 + 数值守卫
3. tests/save/ 全量 + save-compat-e2e + regression-lock 扩展
4. save-regression-lock 字段集合变化在 PR 说明点名
