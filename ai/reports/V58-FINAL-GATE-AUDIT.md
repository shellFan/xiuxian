# V5.8 Final Gate Audit — 真实远端 Git Tree 审计

基线：`d957c8ae009e56e17cb9c9a9790aff09a6fc77c8`（gameplay-v2 = origin）

## A. V5.8 三提交实际改了什么

- `129c413` feat(v58): burnout recovery, career stage, company offers, balance scaffolding — 代码变更真实入库
- `a34bf59` feat(v58): achievements to 100, balance sim v2, mind economy fix — 代码变更真实入库
- `d957c8a` docs(v58): final report, balance snapshot, capture script — **部分缺失**（见 B）

## B. 缺失交付物（.gitignore `ai/reports/*` 阻挡）

| 文件 | 本地存在 | Git Tree | 根因 |
|------|---------|----------|------|
| GAMEPLAY-V58-FINAL.md | ✓ | ✗ | `git add -A` 不覆盖 .gitignore 排除项 |
| V58-BASELINE-AUDIT.md | ✓ | ✗ | 同上 |
| screenshots/v5.8/ (29 PNG) | ✓ | ✗ | 同上 |
| V58-PLAYTHROUGH.md | ✗ | ✗ | 尚未创建 |

V5.7 文件能入库是因为当时用了 `git add -f`。

## C. V5.8 要求 vs 当前实现

| 要求 | 实现 | 判定 |
|------|------|------|
| BurnoutService 五状态 | `services/burnout-service.ts` 完整状态机 + 事件 + 阀门 + UI 卡 | IMPLEMENTED |
| L4+ Mentorship | `services/team-service.ts` mentor() + UI 指导按钮 | IMPLEMENTED |
| L7+ Team Panel | `services/team-service.ts` assignTask/道德镜像 + UI Panel | IMPLEMENTED |
| CompanyService 差异化 | `services/company-service.ts` 10 属性 + 换宗门 + Offer | IMPLEMENTED |
| OfferService | `services/offer-service.ts` 生成/决策/冷却/history | IMPLEMENTED |
| MetaService | `services/meta-service.ts` CareerJourney/BuildPreset/Milestone/月报 | IMPLEMENTED |
| ContentRegistry | `content/content-registry.ts` validateDualSource ok | IMPLEMENTED |
| Save v13 | save-data/player-data/save-service 13 字段 | IMPLEMENTED |
| Boss Phase 2 | 12 Boss 配置 + battle-service 实现 | IMPLEMENTED |
| 技术债治理 | tech-debt-service offerGovernanceTask + assigned-task repay | IMPLEMENTED |
| Demo fallback 清除 | ui-overlay.js `_demoMode` / `MERGE_COUNT` / `合成牛马` 已移除 | ✗→本轮修 |
| Sim v58 命名 | tools/v58-balance-sim.cjs 仍写 V57 输出 | ✗→本轮修 |
| V58-FINAL.md 入 Git | 缺失 | ✗→本轮修 |
| screenshots 入 Git | 缺失 | ✗→本轮修 |
| Execution State DONE | ai/work/V58-EXECUTION-STATE.md 仍 TODO | ✗→本轮修 |
| 首日 Playthrough | 未创建 | ✗→本轮 PARTIAL |
| 30 组 Balance ALL PASS | COMPLIANT 7d 6.1%（超 1.1%）| PARTIAL |

## D. 已完成（本轮回填 Git）

- Burnout/Company/Offer/Team/Meta/ContentRegistry/Save v13 全部代码
- 成就 100
- UI chips (Burnout/公司/情境/疲劳) + Career Hub + Team Panel + Build Preset + Offer 弹窗
- Boss Phase 2 ×12 + 浮字分类 + 池上限 + 声音事件层
- 技术债治理循环 + 事件反重复
- 工资路径收敛（assigned→economy + project 幂等）
- 道心双算修复（WORK -5/h 合成 -11/h）

## E. 部分完成

- Balance Simulation：COMPLIANT 14/30/60d PASS，7d 6.1% 超 1.1%（开局下沉）
- Boss Phase 2：12/12 实现但 Runtime 视觉反馈（红色 telegraph 粒子）依赖 CSS

## F. 未完成 → 本轮补

- GAMEPLAY-V58-FINAL.md 入 Git（`git add -f`）
- screenshots/v5.8/ 29 张入 Git（`git add -f`）
- V58-BASELINE-AUDIT.md 入 Git
- V58-PLAYTHROUGH.md 创建并入 Git
- V58-EXECUTION-STATE.md 更新
- Demo fallback 移除（本轮已修）

## G. Runtime 风险

- ~~Facade 缺席时进入演示模式~~ → 本轮已修为显示加载中
- Battle Summary 数据量偏少（仅 kills/level/loot）→ 已够用

## H. Balance 风险

- COMPLIANT 7d mindZeroRatio 6.1%（超 1.1%）— 开局第 1~3 天咖啡经济未启动
- ASSERTIVE 在 V5.8 修复后预期 PASS（心魔减半+消退+Burnout 闭环）

## I. Save 风险

- v13 字段全有 normalize 安全默认 → 风险低

## J. UI 风险

- ~~演示模式 fallback~~ → 本轮已修
- 首页 1280×720 不滚动 → 已达标

## K. Release 风险

- EXE 可打包、SMOKE_OK → 风险低

## L. 问题分级

- BLOCKER: 0
- HIGH: 1（V5.8 交付物未入 Git → 本轮修）
- MEDIUM: 2（COMPLIANT 7d 1.1% 超标；120d sim 计算耗时）
- LOW: 3（同 V5.8 原有）
