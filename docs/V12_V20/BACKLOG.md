# V12–V20 待办清单（BACKLOG）

> 继承 docs/V11_V15/BACKLOG.md 未完成项；已完成项随提交更新状态。

## BLOCKED-WIP（等用户提交 save/cultivation/daily）

| # | 项 | 解锁后动作 |
|---|---|---|
| B1' | 境界加成直连 cultivation-service 乘子（现走 buff 通路已生效） | 一行接线 + 乘子聚合测试 |
| B2 | 五路线天赋体系（职场精英/摸鱼大师/修仙奇才/社交达人/资源管理大师；每路线 10+ 节点/点数/等级/重置/互斥） | 需存档字段（talentState）→ v16 迁移 + 测试 |
| B3 | 炼丹二期（炼丹时间/队列/丹药库存/使用/离线完成/防重） | 需存档字段（pendingCrafts/pillInventory） |
| B4 | SaveServiceV2 接线（备份/校验） | 四条件见 V11_V15/SAVE_SYSTEM 引用 |
| B5 | 装备 7 槽位扩展（兼容映射 DESK/BADGE/ACCESSORY → 武器/防具/饰品）+ 精炼/升星/套装 | 需存档 schema 评估 |
| B6 | gameplay-v2 暴击 RNG 修复（78115a0）评估合入 | cultivation-service WIP 提交后 diff 比对 |

## 非阻塞待办

| # | 项 | 优先 |
|---|---|---|
| N1 | 统一商店（普通/灵石/装备/丹药/每日/限购/刷新） | P1 |
| N2 | NPC 主线三章 + 专属剧情线（StoryDirector 章节化） | P1 内容级 |
| N3 | 卡牌收集/升级/羁绊 + Boss 机制多样化 | P2 |
| N4 | 图集化落地（SPRITE-ATLAS-PLAN：首屏 PNG 2.76MB 最大单项） | P2 |
| N5 | 正式图标替换 Emoji（20+ 枚 UI 图标） | P2（需美术生成） |
| N6 | 周目标/每周任务 | P2（需周 key 存档） |
| N7 | 部门系统/工位视觉/工作项目 | P2 |
| N8 | 120 分钟浸泡（soak-60m.cjs 改 SOAK_MINUTES 即可） | P3 |
| N9 | 20 轮多画像 365 天模拟（v58 扩展） | P2 |
| N10 | 修仙/奇遇事件继续扩充（§10 目标 30-50） | P3 内容级 |
| N11 | BUG-003 深夜复现（01:00-03:30 UTC+8 窗口） | P2 专项 |

## 环境阻塞

微信真机/AppID/开发者工具（B-1）、BGM 素材采购、刘海屏真机。
