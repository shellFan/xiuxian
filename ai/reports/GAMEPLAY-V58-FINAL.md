# GAMEPLAY V5.8 FINAL — Fun Polish & Meta Progression

- Branch: `gameplay-v2`
- START HEAD: `1451447`
- FINAL HEAD: 见文末 Git 节
- 日期：2026-10-03

## 1. 交付摘要

V5.8「爽感打磨 × 数值重构 × 晋升玩法进化 × 公司宗门 × 长期追求 × 系统收敛」P0 全部落地：Burnout 闭环、晋升=玩法进化（L4 Mentorship / L7 Team / 道德镜像）、公司差异化 runtime + Offer、Meta Progression（CareerJourney/BuildPreset/Milestone/月报）、ContentRegistry 双源合一、Save v13、成就 100、战斗爽感 2.0（Boss Phase 2 ×12/浮字分类+池上限/声音事件层）、技术债治理循环、Balance Gate 2.0。

## 2. V5.7 Issues BEFORE → AFTER

| Issue | BEFORE | AFTER |
|-------|--------|-------|
| ASSERTIVE mind0 ×3 | 心魔螺旋：mind<10 → demon+2/h → demon≥90 → 恢复×0.75 | 心魔自增强减半(+1/h) + 结算消退-3/晚 + demon≥95 阀门 + Burnout 请半天假 | 
| COMPLIANT mind0 19% | MODE 消耗 -10/h + 局势流 -6/h 双算 = -16/h | MODE 消耗 -5/h 合成 -11/h；欢迎咖啡×2；消耗品买pens 降为 salary≥30 |
| FISHING_MASTER 工资异常高 | 摸鱼 0.6× salaryMul 实为正常带薪；高工资因不买消耗品 | 验证无双算（salaryMul 单源）；差异源于消费习惯而非模型 bug |
| professions.json 双源 | 与 v57 profession-content.json 两个事实源 | ContentRegistry（content-registry.ts）为唯一派生源，validateDualSource() 断言一致 |
| 技术债无主动治理 | 只能靠事件偶然 -3 | 债≥90/域≥95 → 治理任务（完成 repay ~25/次）|
| Boss 无 Phase | 19 Boss 全单阶段 | 12 Boss 加 Phase 2（HP 阈值触发，攻击/召唤/致盲/禁技能/吞血/升P0）|
| 晋升无玩法变化 | 数值达 → 点晋升 → 属性提高 | L4+ 带新人（mentor growth+），L7+ Team Panel（分配/道德镜像/隐藏成就）|
| 公司 4 宗门是皮肤 | companyProfiles 仅文案 | CompanyService runtime（salaryMultiplier/overtimeCulture/incidentPressure/promotionSpeed 等 10 属性）+ Offer 换宗门 |
| 成就 84 | 低于目标 100 | 100 条（新增 Offer/管理/治理/burnout/Phase2/月度 等维度）|
| 浮字无上限 + 日志窗口 bug | DOM 无限增长；日志 12 条窗口致浮字永久停止 | MAX_FLOATING_TEXT=30 池 + 按内容追踪修复窗口轮转 |

## 3. Balance（Gate 2.0）

- **SELF_PRESERVING: 30/30 PASS**（6 人格 × 5 时间窗全部通过）
- **NATIVE: 30/30 PASS**（参考值——游戏无死亡螺旋，即使不懂系统的玩家也不会永久锁死）
- WORK mindPerHour: -5 → -3（合成局势流 -9/h，净收支 ≥0）
- 心魔自增强减半 + 结算消退 -3/晚 + demon≥95 阀门 + Burnout 请半天假
- 详见 V58-BALANCE-SIM.md

## 4. Tests

`npm test`：**130 文件全部 PASS**（含新增 tests/v58/systems.test.ts 9 个子系统测试）
`content:check`：**PASSED**（成就门禁 80→100）
`tsc --noEmit`：exit 0

## 5. Build / EXE

- Cocos web-desktop: exit 36（fresh accepted）
- Electron portable: exit 0
- EXE: `dist/牛马修仙传-win32-x64/牛马修仙传.exe` 168.6MB
- EXE SHA256: `4486DC32DB9B964BABF636EA93C47AFA1D8834D091576F59223B2B5E371B0C66`
- app.asar SHA256: `90F1B5671B4CBB9C830E2F2D6568398C5B066920B9D83FAD7B2304CB9AC49DFD` (48.0MB)
- 烟测: SMOKE_OK (pid=21928 mem=132MB)

## 6. Screenshots (29 张)

`ai/reports/screenshots/v5.8/`：01 首页主目标、02 工资实时、03 任务事件、04 技术债、05 Build Preset、06-07 Boss Phase 1→2、08 极品掉落、09 战斗结算、10 晋升就绪、12-13 L4 生涯+带人、14-15 Team locked/unlocked、16 管理层抉择、17 公司档案、18 Offer 抉择、19-20 Burnout 风险/恢复、21 下班、22 17:55、23 周报、24 月报、25 项目回归、26 NPC 记忆、27 生涯档案、28 图鉴 Boss、29 Build Preset、30 Day30 目标。

## 7. Issues

- BLOCKER: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 3
  1. cons_clear/cons_pure 商店日限 1 偏紧
  2. 图鉴隐藏事件无探索提示
  3. 周结算 salary 为累计而非周增量

## 8. Git

- START HEAD: `1451447`
- COMMITS:
  - feat(v58): burnout recovery, career stage, company offers and balance scaffolding
  - feat(v58): achievements to 100, balance sim v2, mind economy fix
  - docs(v58): final report + capture script + evidence
- FILES CHANGED: 30+
- REMOTE: origin/gameplay-v2 (push 后 HEAD 一致)
