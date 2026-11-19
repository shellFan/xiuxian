# V10.1 项目审计（PROJECT_AUDIT）

> 生成：2026-11-19 · 分支 `feature/v10-final-release` · 起点基于 V10 QA 收尾提交 `b792ad3`

## 1. 项目形态（以实际代码为准）

《牛马修仙传》（对外曾名《膨胀小队》）= 微信小游戏形态的**职场修仙放置游戏**：
职场皮肤 + 修仙数值 + 点击/自动战斗推关 + 卡牌 Boss 战 + 小队招募 + 装备收集 + 离线收益 + IAA 广告。

- 引擎：Cocos Creator 3.8.4（TypeScript），本机 CLI 构建（fresh 校验 + provenance 哈希链）
- 双前端：Cocos 场景层（assets/scripts/ui）+ 桌面/H5 DOM 渲染层（desktop/ui-*.js，生产路径）
- 架构：GameContext（服务容器）→ GameFacade（约 210 个公开方法）→ 双 UI 只读投影 + 命令转发
- 平台：H5（127.0.0.1:8633 静态服务）/ Electron PC（desktop）/ 微信小游戏适配器（wx/tt 广告在位）

## 2. 代码规模

| 区域 | 规模 |
|---|---|
| assets/scripts | core/facade/services/model/ui + 版本层 v2/v3/v5/v56/v57/v59/v59f/v59o/v63/v64 |
| services | 60+ 服务（career/kpi/promotion/cultivation/npc-weekend/achievement/…） |
| configs | 顶层 25+ 配置 + v2（141 事件/129 物品）/v3/v5/v57/v59o 版本子目录 |
| desktop 渲染层 | ui-overlay.js（主壳 4900+ 行）+ 8 个专项模块 |
| tests | 178 个 *.test.ts + 3 个契约 .cjs（180 文件全量回归基线） |

## 3. 健康度结论

- 全量回归 `npm test`：**180+ 文件 EXIT=0**（本轮两次复跑均绿）
- V10 QA（上一轮）：P0=0、P1 全修、P2 遗留 1（QA-BUG-013 广告入口，**本轮已接线修复**）
- 存档：SaveService v1（版本 15，fail-closed 写锁）为主路径；V2 备份能力未接线（遗留 L-1）
- 性能：57+ FPS / 41.9MB 堆 / DOM 回收正常（上轮实测）；本轮 soak 复测见 §报告
- 并行开发：本仓库存在**并行会话**（V10.2 卡组预设/日报），本批次经选择性 hunk 暂存规避混流

## 4. V10.1 本轮增量（详见 DEVELOPMENT_LOG）

| 项 | 状态 |
|---|---|
| 广告 UI 入口接线（QA-BUG-013） | ✅ 代码+探针 10/10 PASS |
| 一键推荐装备（遗留 #7） | ✅ 代码+单测 9/9+集成 3/3+浏览器 PASS |
| NPC 关系增益可视化 + NPC 记忆卡死代码修复 | ✅ 代码+单测 6/6+浏览器 PASS |
| gamedev-skills 技能接入（11 个） | ✅ commit 66797db |
| docs/V10.1 文档体系 | ✅ 本目录 11 文档 |

## 5. 风险登记

| 风险 | 等级 | 处置 |
|---|---|---|
| 并行会话同仓开发 | 中 | 选择性 hunk 暂存；提交前逐 hunk 甄别归属 |
| 广告真机未验证 | 中 | wx/tt 适配器在位但无开发者环境；Mock 层已验证，如实标注 |
| BGM 无真实音频资源 | 低 | WebAudio 合成音效兜底；audio-plan 25 条规划未落资源 |
| SaveServiceV2 fail-open 死代码 | 低 | 无生产消费者；接入前必须改 fail-closed（QA-BUG-012 口径） |
