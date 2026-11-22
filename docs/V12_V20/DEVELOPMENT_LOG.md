# V12–V20 开发日志（DEVELOPMENT_LOG）

> 持续追加。格式：日期 | 切片 | 技能 | 设计依据 | 修改 | 测试。
> 基线：feature/v10-final-release @ 8c026bb（V11 全部成果沉淀于 docs/V11_V15/）。

## 2026-11-22 · R1 独立修仙境界系统（派生式，任务书最高优先级 D）

- 技能：`rpg`（境界 pacing/突破风险）、`save-systems`（零迁移状态设计）、`game-feel`（渡劫反馈）、`game-ui-ux`（双境界同屏展示）
- **基线对账（§3）**：fetch 全远程——feature/v10-final-release @ 8c026bb 与远程同步为最新；用户 WIP（save/cultivation/daily）仍未提交 → 派生式架构绕开（决策记录 REALM_DESIGN §1）
- 审计发现：**修仙页（renderCultivation）是第二个孤儿页**（case 'CULTIVATION' 无导航入口）→ MORE 网格补「修仙」条目
- 实现：
  - `configs/realm.json`：30 层（10 境 × 3 小层），阈值 0→5,000,000 指数曲线；9 渡劫门（灵石 50→8000 / 成功率 0.85→0.62 / 奖励 salary 100→120000 / 修炼加成 +4%→+10%）
  - `services/realm-service.ts`（新）：getState 派生（exp+gate 标记）/ canBreakthrough / breakthrough（事务化+失败补偿+越挫越勇）/ 构造期校验
  - 持久化：lifetimeStats 键 `realmGatePassed:<n>` / `realmGateFails:<n>` / `realmHighestReached`（开放键值白名单，零 schema 变更）
  - 加成通路：突破成功 → BuffService addBuff('WORK_CULTIVATION_BOOST') → work-service 修为收益聚合（真实生效，非空壳）
  - game-context 注册 realm；facade queryRealmState/breakthroughRealm；game-events + PHASE2 刷新表
  - overlay 修仙页境界卡（进度/待渡劫/渡劫按钮/补偿展示）+ 渡劫结果 toast（成功触发 promotion 级特效）+ MORE「修仙」入口
  - 音效触发器 realmAdvanced/failed（dispatcher+map 双源）；REALM 成就 5 个（115→120，LIFETIME_STAT realmHighestReached）
- 测试：**realm 8/8**（推导/gate 阻挡/成功持久化/失败补偿/灵石不足/二级门/坏配置/生产配置）；全量 **192 文件 exit 0**；content:check PASSED
- 运行证据：探针 **10/10 PASS**（新增 A8：境界卡渲染「待渡劫」+ 真实点击渡劫成功 toast「渡劫成功！晋入 炼气初期·修炼效率+4%」+ lifetimeStats 一致性）；截图 09/10
- 过程修复：Cocos 编辑器构建挂死（僵尸进程）→ 清理后 17s 成功；探针周报弹窗遮蔽 → dismissModals DOM 兜底；A8 断言键位勘误（gate index=3 非 1）
- 涉及文件：realm.json(新)、realm-service.ts(新)、game-context/game-events/game-facade、ui-overlay.js、animation-dispatcher.ts、animation-trigger-map.json、achievements.json、achievement-service/config-types/config-service（REALM 类别）、tests/realm/(新)、tests/events/game-events-refresh、scripts/v11-qa/v11-acceptance-probe.cjs
