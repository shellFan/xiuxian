# V41–V50 开发日志（DEVELOPMENT_LOG）

> 基线：feature/v10-final-release @ `47a37e6`（V31 图标/移动QA/商店之上）。

## 2026-11-23 · V41/V42 双平台发布构建（任务书§6/§7/§15）

- 技能：`performance-optimization`（体积审计）、`game-architecture`（双平台统一核对）、`game-docs`（发布文档）
- **关键修正**：CLI 微信构建平台 ID 必须为 `wechatgame`（builder.json 实证；`wechat-mini-game` 触发 PluginManager TypeError）——构建成功 65s
- **主包实测 ≈4.7MB 超 4MB 限制**：cocos-js 4001KB（引擎 _virtual_cc 3.1MB + spine/bullet wasm 0.9MB 零使用）+ src 613KB + assets/main 7000KB（大图 5MB + index.js 1004KB）
- 三步优化路径（编辑器操作）：引擎模块裁剪 → 大图降分辨率/转 JPEG（home-character 1382×1138 2.7MB / home-office-background 1672×941 2.3MB）→ assets 分包；预期 ≤2MB
- **H5 发布构建成功**（web-mobile，70s，release/h5 14MB）；Nginx 部署示例（HTTPS/缓存/回退）；平台约束核对（H5 无 wx.*；微信无 DOM）
- **AppID 事实修正**：project.config.json 已配置 appid=wx6ac3f5090a6b99c5——真机验证从「无 AppID」改为「BLOCKED(需开发者工具+人工)」
- 产物：release/wechat/ + release/h5/（不入库，路径记录于本日志与报告）

## 2026-11-23 · V50 发布候选清单（RELEASE_CHECKLIST）

- RC 判定：**代码/配置/产物/文档/测试全就绪；差 2 项人工执行**（微信主包优化复测 + 工具/真机/浏览器人工过检）
- 遗留 BLOCKED：微信人工验收、HTTPS 部署、IAA 真机广告——全部如实标注

## 涉及文件

docs/V41_V50/（BASELINE/SKILL_APPLICATION/WECHAT_BUILD_REPORT/H5_BUILD_REPORT/RELEASE_CHECKLIST/TASK_LEDGER/DEVELOPMENT_LOG）+ release/wechat + release/h5（构建产物，不入库路径记录）
