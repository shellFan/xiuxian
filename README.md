# 牛马修仙传

微信小游戏;Cocos Creator 3.8 LTS;TypeScript;竖屏 2D;合成 + 挂机 + 职场修仙;IAA 激励广告。
PC 桌面版基于 Electron(`desktop/`),游戏逻辑与 UI 全部复用 Web 构建。

## 快速开始(clone-to-green)

```bash
npm install                 # 根依赖(TypeScript / tsx 等)
npm test                    # 全量测试(158 个测试文件)
```

`npm test` 的 `pretest` 钩子(`scripts/ensure-desktop-deps.cjs`)会在首次运行时
自动执行 `cd desktop && npm install` 补装 Electron 工具链(测试 v4 的 DOM 用例依赖它),
之后为 0ms 快速检查。

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm test` | TypeScript 全量编译 + 全部单元/集成测试 |
| `npm run content:check` | 事件/物品/成就内容完整性校验 |
| `npm run gameplay-v2:check` | V2 内容 + 合并遗留检查 |
| `npm run pc:build` / `pc:copy` / `pc:pack` | Cocos 构建 → 桌面资源 → Electron EXE(需本机 Cocos Creator 3.8.4) |
| `node tools/v58-balance-sim.cjs` | 平衡模拟 Gate(6 人格 × 5 周期 × 2 模式,SELF_PRESERVING 30/30) |
| `node tools/v59n11-profession-compare.cjs` | 四职业差异化对照(固定种子) |

## 自动化测试与存档隔离

- EXE 级烟测/GamePlay Gate 通过 `XIUXIAN_USER_DATA` 环境变量把存档重定向到
  `tmp/` 下的隔离目录,**绝不读写真实玩家存档**(见 `desktop/main.cjs`)。
- 验收报告见 `ai/reports/`(GLM53-QUALITY → GLM53-N10 → V59N11 系列)。

## CI

GitHub Actions(`.github/workflows/ci.yml`)在 push/PR 时运行:类型检查 + 全量测试 +
内容校验 + V2 静态检查。Cocos/Electron 打包需本机编辑器,不在 CI 范围。
