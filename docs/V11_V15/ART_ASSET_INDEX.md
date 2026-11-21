# 美术资产索引（ART_ASSET_INDEX）

> 规范源：docs/GAMEDEV_SKILLS/ART_ASSET_GUIDELINES.md + docs/ASSET-STRUCTURE.md + docs/ART-GENERATION-PROMPTS.md。
> 本文件是**当前实际资产台账**（2026-11-22 实测）。

## 1. 已入库资产（真实加载）

| 类别 | 路径 | 内容 |
|---|---|---|
| 角色卡 | `assets/textures/ui/character_cards/` | 十职业角色图（character_coffee_alchemist / keyboard_sword / kpi_master 等） |
| 首页 | `assets/textures/ui/home/` | home-character / home-office-background |
| 参考 | `assets/textures/ui/` | reference-avatar / reference-salary 等 |
| UI 图标（overlay） | `desktop/ui-icons/`（构建拷贝） | shortcut-task/project/social/bag 等 |
| 合成素材（overlay CSS 图） | ui-icons 内 | mat-herb-a / mat-crystal-a / mat-scroll-a / mat-flower-a / item-pill-* |

## 2. 生产台账

- `assets/configs/art-production-manifest.json`：assetKey 台账（P0 母版/P01 角色基准/P02–P11 十职业/P12 背景）
- `assets/configs/art-production-manifest` 状态字段：标 APPROVED 才可进场景

## 3. 缺口清单（按任务书§12 优先级）

| 优先 | 缺口 | 说明 |
|---|---|---|
| P0 | overlay Emoji 图标替换 | 更多菜单/成就/设置行图标（F4）——需 20+ 枚 48px 图标（国风职场风） |
| P1 | 炼丹 UI 正式图标 | 丹炉/火焰/药材/丹药品质角标（§7.4 UI 要求；现 overlay 用 CSS 图+emoji） |
| P1 | 境界突破特效素材 | 待 B1 境界系统落地后按 ANIMATION-GUIDE 登记动作表 |
| P2 | 场景背景扩展 | 茶水间/会议室/洞府/宗门（§9 场景系统）——现仅办公室一张背景 |
| P2 | 装备/法宝图标 | 现 v64 装备无独立图标（canvas 文本+overlay CSS 图） |

## 4. 生成规范（复述要点）

- 风格母版锁定：Q 版拟人牛 + 办公室修仙 + 暖纸底 #FFF5DF / 墨描边 / 青玉 #176F68 + 工资条金 #F3C45C
- 图标 256×256 源图；角色 1536×1024 → 512×512 透明 sprite；按钮 384×128 九宫格
- **禁止生成可读中文文字**；出图人工审稿标 APPROVED；禁止随机网络图片
- 命名：`<domain>_<subject>_<variant>_<state>_<frame>` snake_case；提交清单含 assetKey/尺寸/九宫格边距/授权记录
