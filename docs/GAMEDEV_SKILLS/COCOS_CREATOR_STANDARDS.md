# Cocos Creator 专属适配规范

> 通用技能 ≠ Cocos Creator 文档。本文件是项目唯一的 Cocos 技术基准，所有由技能生成的代码必须先过本文件检查。
> 现状基线全部来自代码实测（2026-11-21），不是教程式通用建议。

## 1. 版本基线（锁定，禁改）

| 项 | 值 | 来源 |
|---|---|---|
| Cocos Creator | **3.8.4** | package.json `"creator.version"`；构建需本机编辑器 |
| TypeScript | **5.6.3**（devDependencies） | package.json |
| Node（仅工具链） | ≥20；本地验证可用 HBuilderX 内置 v22.22.2 | CI 为准 |
| 测试运行器 | 自研 `tests/run-all.cjs`（spawn 断言进程，无 jest/vitest） | package.json scripts |
| Schema | ai/schemas×3 为 draft-2020-12；docs/schema×5 为 draft-07 | 实测 `$schema` 字段 |
| 场景 | **单场景** `assets/scenes/Main.scene`（无其他生产场景） | git ls-files |
| Prefab | **0 个已跟踪 .prefab**；`docs/COCOS-PREFAB-ARCHITECTURE.md` 为规格先行 | git ls-files + 文档 |
| 设计分辨率基准 | 750×1334（逻辑像素），长屏加空间不拉伸 | docs/UI-DESIGN-SYSTEM.md |

**禁止**：升级引擎版本；引入 Phaser/PixiJS/Three.js 语法或其技能示例 API（web-engines 技能未安装且不适用）；手写 prefab 序列化 JSON。

## 2. 架构惯例（生成代码必须遵守）

1. **组合根唯一**：`core/game-context.ts` 手动实例化全部 40+ 服务（构造注入），无全局单例、无字符串服务名。新服务必须：构造函数注入 `GameContext`、在 game-context.ts 注册 `public readonly xxxService`、禁止在组件里 `new` 业务服务。
2. **类型化事件总线**：`core/event-bus.ts`（`EventBus<Events>`，on/off/emit/clear）+ `core/game-events.ts` 事件载荷接口（约 40 种）。新事件必须先在 `GameEvents` 增加类型化载荷接口，禁止 `emit('string', any)`。
3. **表现层隔离**：UI 只经 `facade/game-facade.ts` 的 `snapshot()/commands/onUiEvent()` 访问数据；View 不得 import `PlayerData`、不得持有可变领域对象、不得自行数值加减（docs/UI-BINDING-CONTRACT.md）。
4. **数值配置静态导入**：配置在 `assets/configs/*.json`（50 个），经 tsconfig `resolveJsonModule` 静态 import（`core/game-context.ts:18-37`），由 `services/config-service.ts` + config-validator 校验。**代码库不使用 `resources.load`/`assetManager` 动态加载**（git grep 实测为 0）；新增配置照此模式，不要引入动态 bundle 加载。
5. **平台隔离**：`wx.*`/`tt.*` 只允许出现在 5 个文件：`core/cocos-bootstrap-component.ts`、`services/platform/platform-service.ts`（PlatformKind: mock|web|desktop|wechat|douyin）、`services/platform/rewarded-video-adapter.ts`（运行时探测 `wx`/`tt`）、`services/reward/wechat-reward-provider-v2.ts`、`services/safe-area-service.ts`。新平台能力先扩 `PlatformService` 接口，业务层只依赖接口。
6. **生命周期**：组件遵循 onEnable 订阅 / onDisable 解绑对称原则；平台 show/hide 用 `onShow()/onHide()` 返回的 unsubscribe 函数注销（platform-service.ts 契约）。离开面板/回池时停止 tween 并复原 scale/opacity/position（docs/ANIMATION-GUIDE.md「减少动态」节）。
7. **时间与时钟**：业务时间一律用 `core/clock.ts` / Clock 注入，离线计算有时钟回拨检测（idle-service.ts clockAnomaly）。测试用注入 Clock，不读真实时间。

## 3. UI 与 Prefab 政策

- Prefab **规格先行**：需要新 Prefab 时按 `docs/COCOS-PREFAB-ARCHITECTURE.md` 建 binding 规格表（必需子节点 / 输入 binding / 输出 intent），文件名 snake_case 放 `assets/prefabs/ui/` 或 `assets/prefabs/game/`，由 Editor 从真实节点提取，**不手写序列化文件冒充**。
- 布局尺寸一律读 `assets/configs/ui-theme.json` token（`token:colors.primary` 语法，schema 见 `docs/schema/ui-theme.schema.json`），色值禁止散落脚本。
- 层级：office → board → hud/navigation → mask → modal → tutorial → toast；拖拽浮层在 board 内最上，不得越过 Modal（UI-DESIGN-SYSTEM.md）。
- 安全区：`services/safe-area-service.ts` + UI-DESIGN-SYSTEM 的 `L/R/T/B` 公式；胶囊区域禁放按钮。

## 4. 微信小游戏限制清单

| 限制 | 项目对策 |
|---|---|
| 包体积 / 分包 | 资源预算见 docs/ASSET-BUDGET.md；图集规划见 docs/SPRITE-ATLAS-PLAN.md；构建产物核对走 pc/build 脚本 |
| 触摸/胶囊 | 避让微信胶囊区域；触摸热区 ≥88（UI-DESIGN-SYSTEM） |
| 激励广告 | 仅经 rewarded-video-adapter（wx/tt 双探测）→ wechat-reward-provider-v2；IAA 位与上限按 docs/IAA-DESIGN.md（未接线的位不得声称可用） |
| 生命周期 | 后台暂停音频与动效，前台由用户交互恢复（AUDIO-GUIDE 平台限制由 Platform Owner 确认） |
| 无 DOM | 测试中 DOM 用例仅桌面 Electron 链路（desktop/），小游戏代码不得引用 DOM API |
| 存档 | `sys.localStorage` 经 StorageAdapter 封装，fail-closed（storage-adapter.ts 写锁） |

## 5. 技能代码兼容性检查单（Reviewer 用）

生成代码合入前逐条确认：

- [ ] 无 Unity（`GetComponent<>()` 泛型习惯除外需改写）、Godot（`Node2D`/`signal`）、Phaser/Pixi/Three API 残留
- [ ] 新服务已注册进 game-context.ts，未绕过组合根
- [ ] 新事件已进 `game-events.ts` 类型表
- [ ] UI 走 facade，未直接读 PlayerData
- [ ] 配置走 configs/*.json 静态导入 + config-validator 校验
- [ ] 订阅/解绑成对，tween 有停止与复原路径
- [ ] 未使用未接线的 IAA 位 / 未接线的 SaveServiceV2 而宣称功能可用
- [ ] `tsc -p tsconfig.game.json --noEmit` 通过；相关 `tests/` 目录有新用例
