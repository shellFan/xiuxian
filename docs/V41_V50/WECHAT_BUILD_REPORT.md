# 微信小游戏构建报告（WECHAT_BUILD_REPORT）

> 2026-11-23 · Cocos Creator 3.8.4 CLI 构建（platform=wechatgame，65s） · 产物 `build/wechatgame-current/v41-wechat/`（已同步 release/wechat/）

## 1. 构建产物清单（真实文件）

| 文件/目录 | 体积 | 说明 |
|---|---|---|
| game.js / game.json | 4KB / 1KB | 微信入口与配置（portrait、网络超时） |
| project.config.json | 1KB | **appid=wx6ac3f5090a6b99c5**、compileType=game |
| cocos-js/ | **4001KB** | 引擎：_virtual_cc 3.1MB + spine/bullet wasm 0.9MB |
| src/chunks/bundle.js | 580KB+ | 业务编译产物（assets/main/index.js 另 1004KB） |
| web-adapter/engine-adapter/first-screen | 128KB | 平台适配层 |
| assets/main/ | **7000KB** | native 5260KB（大图×2 共 5MB）+ index.js 1004KB + import 88KB |
| **主包合计** | **≈4.7MB（超 4MB 限制）** | |

## 2. 主包优化路径（按收益排序，均为编辑器内可执行操作）

1. **引擎模块裁剪**（预期 -0.9MB）：构建面板「参与构建的引擎模块」取消 3D 物理（bullet wasm 460KB+js）、spine（344KB+js）、dragon-bones、VR/视频等未用模块——本项目为纯 2D UI+cardbattle，零使用；
2. **大图降分辨率**（预期 -3.7MB）：home-character 1382×1138→690×570（2.7MB→~0.7MB）、home-office-background 1672×941→750×840 并转 JPEG（2.3MB→~0.3MB）；
3. **assets 分包**：Cocos「构建分包」把非首屏 bundle 配置为微信 subpackage（game.json 增 subpackages 声明由引擎生成）。

三步合计预期主包 ≤2MB（<4MB 红线）。以上均为**编辑器构建面板操作**（CLI 不暴露模块选择），每步后重跑本报告的体积命令复核。

## 3. 平台适配现状（代码层）

- 微信 API 全部收敛于 5 文件（COCOS_CREATOR_STANDARDS §2.5）：platform-service（getSystemInfoSync/onShow/onHide/vibrateShort）、rewarded-video-adapter（wx/tt 双探测）、wechat-reward-provider-v2、safe-area-service、cocos-bootstrap
- 存档：wx 存储 → StorageAdapter 封装，fail-closed
- 广告：IAA-DESIGN 七位设计，rewarded-video-adapter 已有 wx 实现；真机验证 BLOCKED(需开发者工具+人工)
- 登录/分享：**未实现**（设计上无强制登录；分享能力 wx.shareAppMessage 调用点缺失）→ 发布前需产品确认是否必须

## 4. 导入微信开发者工具的验收步骤（人工执行）

1. 微信开发者工具 → 导入项目 → 目录选 `release/wechat/` → AppID 自动读取 project.config.json；
2. 编译预览：确认首屏加载、角色创建、修炼/炼丹/商店核心流；
3. 「代码分析」页核对主包体积（预期当前 4.7MB 超限 → 按 §2 三步优化后复测）；
4. 真机预览扫码：安全区/触摸/性能三查；
5. 结果回填 RELEASE_CHECKLIST。

## 5. 判定

- 构建产物：**有效**（结构完整可导入）
- 主包体积：**超限 0.7MB**（3 步优化路径已给，编辑器操作属人工项）
- 真机验收：**BLOCKED(需人工)**——不虚报
