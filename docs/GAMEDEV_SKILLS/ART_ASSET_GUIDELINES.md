# 美术资产规范

> 路由：美术资产任务 → `create-game-assets` 技能 + 本文件。
> 深度专题：`docs/ASSET-STRUCTURE.md`（目录/命名）、`docs/ART-GENERATION-PROMPTS.md`（AI 生图 prompt 包）、`docs/ASSET-BUDGET.md`（预算）、`docs/SPRITE-ATLAS-PLAN.md`（图集规划）、`docs/ART-PRODUCTION-PRIORITY.md`。冲突时以本文件 + 上述专题为准。

## 1. 现状基线（2026-11-21 实测）

| 项 | 现状 |
|---|---|
| 已跟踪图片 | `assets/textures/ui/`（20 文件，约 12MB）：`character_cards/`、`home/` 两个子目录 |
| 图集 | **0 个 .plist**，全部散图 png |
| 命名现状 | 混用：snake_case（`character_coffee_alchemist.png`）与 kebab_case（`home-office-background.png`、`reference-salary.png`）并存 |
| 生产清单 | `assets/configs/art-production-manifest.json`（assetKey 台账） |
| Prefab | 0 个（见 COCOS_CREATOR_STANDARDS §3） |

## 2. 命名规范（新资产硬性）

`<domain>_<subject>_<variant>_<state>_<frame>`，全 snake_case（`ASSET-STRUCTURE.md` 要求；kebab 旧文件允许保留，重命名必须同步改所有引用与 .meta UUID 关联）。

例：`icon_gongfa_qingyu_normal.png`、`character_coffee_alchemist_talk_frame2.png`。
禁止：中文文件名、空格、大写、`final/final2/new` 式命名。

## 3. 目录规范

| 资产类型 | 目录 |
|---|---|
| UI 纹理（现有） | `assets/textures/ui/`（子目录按域：character_cards/、home/） |
| 后续 resources 运行时资产 | `assets/resources/ui/`（按 ASSET-STRUCTURE 规划树，建目录时以文档为准，不得标记"已存在"） |
| Prefab | `assets/prefabs/ui/`、`assets/prefabs/game/`（规格先行，见 COCOS_CREATOR_STANDARDS §3） |

## 4. 规格标准

| 资产 | 规格 |
|---|---|
| 图标 | 源图 256×256，UI 内展示尺寸读 ui-theme.json `iconSize`（inline 32 / normal 48 / navigation 56 / hero 88） |
| 角色 | 源图 1536×1024 三视图 → 输出 512×512 透明 sprite，同锚点 |
| 场景背景 | 750×1667，保护中央 750×1334 安全区裁切 |
| 按钮 | 384×128，预留九宫格边距（9-slice），提交时注明边距值 |
| 格式 | png（透明区域真透明，禁止白底冒充透明）；后续图集按 SPRITE-ATLAS-PLAN 分组 core_ui/worker/office/events |

## 5. AI 生图流程（create-game-assets 技能落地）

1. **风格母版锁定**：P0 共用母版（Q 版拟人牛、办公室修仙、暖纸底 `#FFF5DF`/墨描边/青玉 `#176F68`+工资条金 `#F3C45C`），任何新 prompt 必须继承母版，禁止另起风格；
2. 出图 → 人工审稿 → 在 manifest 标记 `APPROVED` 才可进场景；
3. **禁止生成可读中文文字**（字体渲染交给 Label，不烘进图）；
4. 授权与出处记录：外部素材必须记录来源与许可（create-game-assets 技能 provenance 要求）；**禁止随机网络图片冒充正式素材**；
5. 提交清单必须含：assetKey、尺寸、九宫格边距（如有）、状态字段、授权记录——与 `art-production-manifest.json` 对齐。

## 6. 接入验收（禁止"只出素材不进场景"）

- [ ] 资产已放入 §3 目录并生成 .meta（.meta 必须提交，见 .gitignore 注释）
- [ ] 引用路径经场景/代码实际加载验证（截图验收，见 QA_GUIDELINES）
- [ ] 尺寸/命名/预算核对通过（首屏纹理预算 ≤32MiB，单图集 ≤2048）
- [ ] manifest 台账更新
