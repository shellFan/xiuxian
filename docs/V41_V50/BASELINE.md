# V41–V50 基线报告（BASELINE）

> 基线：feature/v10-final-release @ `47a37e6`（与远程同步，实测 2026-11-23）
> 承接 V11（功能+验收+浸泡）→ V12（境界/天赋/炼丹队列）→ V31（图标/移动QA/商店）。

## 构建能力实测（本轮核心发现）

| 平台 | 构建命令 | 结果 | 产物 |
|---|---|---|---|
| 微信小游戏 | `CocosCreator.exe --build "platform=wechatgame;..."`（CLI） | **成功（65s）** | `build/wechatgame-current/v41-wechat/`（game.json/game.js/project.config.json/cocos-js/assets/src） |
| H5 | `platform=web-mobile`（CLI） | **成功（70s）** | `release/h5/`（index.html/assets/cocos-js/src/style.css） |
| 注意 | 平台 ID 必须为 `wechatgame`（builder.json 实证）；`wechat-mini-game` 会触发 PluginManager TypeError | — | — |

## 微信构建体积实测（红线 4MB 主包）

| 部分 | 体积 | 说明 |
|---|---|---|
| cocos-js | **4001KB** | 引擎 _virtual_cc 3.1MB + spine/bullet wasm 0.9MB（**本项目零使用，可裁**） |
| src/chunks | 613KB | 业务代码 |
| 适配器 | 128KB | web-adapter/engine-adapter/first-screen |
| game.json 等 | ~10KB | **无 subpackages 声明** |
| assets/main | 7000KB | native 5260KB（**两张大图 5MB**：home-character 1382×1138 2.7MB / home-office-background 1672×941 2.3MB）+ index.js 1004KB |
| **主包合计** | **≈4.7MB 超限** | 需：①引擎模块裁剪（编辑器构建面板去 3D 物理/spine）②资产分包或纹理压缩 ③大图降分辨率 |

## 大图优化路径（实测定位）

| 文件 | 尺寸 | 体积 | 手机显示需求 | 建议 |
|---|---|---|---|---|
| home-character.png | 1382×1138 | 2.7MB | 720×1280 画布内 ~1/3 宽 | 降至 690×570（-75%）+ pngquant |
| home-office-background.png | 1672×941 | 2.3MB | 竖屏裁切 | 降至 750×840 + 转 JPEG（无透明需求） |

执行方式：编辑器内替换源图重导出（图像库缺位，人工/生成工具执行），或构建预设 textureCompress。

## 平台配置现状

- `project.config.json`：**appid=wx6ac3f5090a6b99c5 已配置**；compileType=game；libVersion=game
- `game.json`：portrait + 超时配置；**无 subpackages 分包声明**
- 真机验证：需微信开发者工具导入 + 扫码预览（人工）→ **BLOCKED(需人工操作)**

## 系统完成度

继承 V31 BASELINE_AUDIT 矩阵：✅17 / 🟡7 / ⬜4 / ⛔1；V11–V31 全部成果在 HEAD `47a37e6` 已验证（194 测试/探针 13 阶段/移动 36 页/浸泡 60 分钟）。
