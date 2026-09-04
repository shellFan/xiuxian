# Phase 4 review fix report

分支：`phase4-ui-content`  
范围：仅按 `docs/PHASE4-REVIEW-FIX-BRIEF.md` 处理 R1–R6；未修改 Service、主线、源游戏配置或 root 报告；未 commit/push。

## 回归测试 RED

先新增 R3/R5/R6 回归测试，再执行：

```text
node --test docs/validation/phase4-content-check.test.cjs
```

实际结果：`EXIT_CODE=1`；20 tests，17 pass，3 fail。

- R3 别名测试：`Missing expected exception`，说明 FISH_30M 借用 `FIRST_MERGE` 且篡改 condition/reward/status 时原校验接受了它。
- R5 token 测试：`token reference validator must be exported`，说明校验函数不存在。
- R6 daily 测试：`Missing expected exception`，说明删除一个 variant 后 11 条仍被范围校验接受。

## 修复后 GREEN

执行同一 focused 回归检查：

```text
node --test docs/validation/phase4-content-check.test.cjs
```

实际结果：`EXIT_CODE=0`；20 tests，20 pass，0 fail，0 skipped。

第二个 focused 检查：

```text
node docs/validation/phase4-content-check.cjs
```

实际结果：`EXIT_CODE=0`；`status=PASS`，events=80，eggs=10，achievements=31，hidden=6，daily=12，documents=15，audioCues=25。

## R1–R6 disposition

- **R1：** `docs/UI-DESIGN-SYSTEM.md` 已改为完整 750×1334 设计视口坐标，明确 `L/R/T/B`、水平 band、快捷入口折叠、compact/scroll fallback 和 unsupported viewport。数值复核实际得到：无 inset `L=24/R=726`、usable=702、board `[63,687]`；左 inset80/右0 得 `L=80/R=726`、usable=646、board `[91,715]`；`T=16/B=1318` 得 `navY=1190`、`actionY=1056`、`boardY=400`。
- **R2：** `docs/UI-BINDING-CONTRACT.md` 已增加 `CLAIM_OFFLINE_NORMAL` 及普通/广告离线领取映射、settled dismiss 与 1x/2x 互斥说明。
- **R3：** 验证器现在按候选自身 `id` 是否属于 source IDs 分类；source 项强制 exact sourceId/condition/reward/status，非 source 项强制 `sourceId=null`、`NEEDS_SERVICE_CAPABILITY`、FISH_SECONDS1800 与 caps。别名回归测试已覆盖。
- **R4：** `EVENT_P4_049` 效果已改为 `{ salary: 40, mind: 13 }`，未改其他事件。
- **R5：** 组件表 token 已使用明确的 `token:<path>` 语法；新增 `validateTokenReferences(markdown, theme)`，按 theme 自有属性逐段验证，并纳入 `validateRepository`。覆盖有效路径及 `token:height.normal`、`token:colors.missing` 拒绝。
- **R6：** daily 校验已锁定 `daily.length === 12`；删除一条 variant 的回归测试已覆盖。

## 修改计数

- 修改 5 个 brief-owned 文件，新增 1 个报告文件。
- 新增回归测试 3 条；focused 检查 2 个，均已 GREEN/PASS。
- 候选包计数：events 80、eggs 10、achievements 31、hidden achievements 6、daily 12；仓库文档 15、音频 cue 25。

## Root follow-up

补充 R1 非基准屏计算定义：`H=viewportHeight/scale`，并明确通用 `navY/actionY/boardY` 公式；补充 R5 的显式 token 引用语法说明，示例均使用现有 JSON path。未修改代码、测试或其他文件。

补充后执行 checker：

```text
node docs/validation/phase4-content-check.cjs
```

实际结果：`EXIT_CODE=0`；`status=PASS`，events=80，eggs=10，achievements=31，hidden=6，daily=12，documents=15，audioCues=25。
