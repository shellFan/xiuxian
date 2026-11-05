# V5.9-O.5 交付报告：Windows EXE 验收

生成时间：2026-11-06 ｜ 分支：`gameplay-v2`

## 结论

`EXE_BUILD=COMPLETE`，`EXE_UI_E2E=COMPLETE`（18+ 项自动化检查全绿，含真实 DOM 战斗全流程），`SOAK_20MIN=见下`，`PHYSICAL_INPUT=NOT_VERIFIED`。

## 构建链路（全部真实执行）

1. TypeScript：`tsc -p tsconfig.game.json --noEmit` exit 0。
2. 全量测试：`npm test` → 164 文件全绿 exit 0。
3. Cocos 构建：`npm run pc:build`（Creator 3.8.4 CLI，`C:\ProgramData\cocos\editors\Creator\3.8.4`）→ web-desktop 产物验证通过（exit 36 为已知可接受码）。
4. 资源注入：`npm run pc:copy` → patch-html 注入 ui-overlay/ui-battle-card/v59f-home/merge-home + build-manifest。
5. 打包：electron-packager（Electron 28.3.3，npmmirror 镜像）→ `dist/牛马修仙传-win32-x64/`。

## 交付物哈希

| 文件 | SHA-256 | 大小 |
|---|---|---|
| `dist/牛马修仙传-win32-x64/牛马修仙传.exe` | `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1` | 176,819,200 B |
| `dist/牛马修仙传-win32-x64/resources/app.asar` | `a7867fcc3bf88ed49b7769284bc33eee60533ca40f0f2ffa102898c1540cc659` | 16,297,045 B |

## EXE 真实操作 E2E（ai/qa-final/session-v59o-card-battle.mjs，CDP 驱动可见 UI）

**18+ 项检查全部通过**（证据：ai/qa-final/evidence/v59o-e2e-report.json + shots/*.png）：

1. 隔离：XIUXIAN_USER_DATA → 临时目录；真实玩家存档指纹 ABSENT→ABSENT（零接触）。
2. 角色创建向导 7 步（真实 DOM，含天命三选一与 5 点分配）→ COMPLETE。
3. 跳过入职剧情（真实 DOM 按钮）。
4. 开工（gameDay）→ 开战（mode=CARD）。
5. 真实 DOM 战斗：5 张手牌 / 3 能量球 / 结束回合按钮 / 敌人意图（3 个）。
6. 点击攻击卡 → 目标选择态 → 点击敌人 → 出牌：能量 3→2、伤害入日志（含暴击）。
7. 结束回合 → 敌人行动（攻击/防御入日志）→ 回合 +1 → 新 5 张手牌。
8. 自动循环至终局（VICTORY 已达成过；DEFEAT 亦为合法终局）。
9. 显式保存 → save.json 写入隔离目录。
10. 重启 EXE → 收藏/等级恢复一致。

## 环境自检探针（保留于仓库）

- queryContentStats：monsters 95 / waves 5 / skills 84 / builds 21。
- queryDatabaseDebug：卡牌数据库 103 条（52 基卡+升级链）、规则 3 能量/5 抽/10 手牌。

## 关键修复（本轮 EXE 联调发现）

- **Cocos 构建管线 TS 降级编译不支持迭代器展开**：`[...map.values()]` 被编译为 `[].concat(iterator)` → 开局 0 敌人。已全量替换为 `Array.from(...)`（旧代码惯例即如此）。
- Cocos Creator 3.8.4 依赖完整解压（首次解压缺 DLL → 0xC0000135）。

## soak / 物理输入

- 20 分钟稳定性 soak：见 V59O-FINAL-DELIVERY.md（脚本 ai/qa-final/session-v59o-soak-20min.mjs，隔离存档 + 墙钟/操作数/内存/崩溃/重启一致性）。
- PHYSICAL_INPUT=NOT_VERIFIED（CDP 合成事件；未做物理鼠标键盘验证）。
