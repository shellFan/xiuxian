# 发布候选清单（RELEASE_CHECKLIST）

> 判定：RELEASE CANDIDATE（未完成微信审核/线上部署，不宣称正式上架）。
> 标记：✅ PASS / ⚠️ CONDITION（有条件通过）/ ❌ FAIL / 🔒 BLOCKED / ⏳ NOT_RUN。

## A. 微信小游戏（release/wechat/）

| 项 | 状态 | 说明 |
|---|---|---|
| CLI 构建成功（platform=wechatgame） | ✅ | 65s，产物结构完整（game.js/game.json/project.config.json） |
| game.json 正确性（portrait/超时配置） | ✅ | 实读核对 |
| project.config.json（appid/compileType=game） | ✅ | appid=wx6ac3f5090a6b99c5 |
| **主包 ≤4MB** | ❌ | 实测 ≈4.7MB（cocos-js 4.0 + src 0.6）；三步优化路径见 WECHAT_BUILD_REPORT §2 |
| 引擎模块裁剪 | ⏳ | 编辑器构建面板操作（去 bullet/spine 预期 -0.9MB） |
| 大图降分辨率/转 JPEG | ⏳ | home-character 2.7MB + home-office-background 2.3MB |
| assets 分包（subpackages） | ⏳ | game.json 无声明，编辑器操作 |
| 开发者工具导入+编译预览 | 🔒 | 需人工（AppID 已配置） |
| 真机预览（安全区/触摸/性能） | 🔒 | 需真机扫码 |
| 微信审核/上架 | 🔒 | 需主体资质+审核流程 |

## B. H5 手机版（release/h5/）

| 项 | 状态 | 说明 |
|---|---|---|
| 生产构建成功 | ✅ | 19.7s，结构完整（index.html/assets/cocos-js/src） |
| 无微信专有 API | ✅ | 平台隔离 5 文件核对（H5 链路 web fallback） |
| 移动视口适配 | ✅ | 6 视口 × 6 页 36/36 PASS、0 溢出（V31 mobile-sweep） |
| 本地存档 | ✅ | localStorage fail-closed（V11–V31 探针全程真实存读） |
| 静态服务器运行 | ✅ | 探针全程跑在 release 产物上（127.0.0.1:8640） |
| HTTPS 域名部署 | 🔒 | 需真实域名/证书（Nginx 配置示例已给） |
| 三浏览器人工过检 | 🔒 | iOS Safari/Android Chrome/微信内置（需设备） |
| 首屏体积 <5MB 目标 | ⚠️ | 引擎+代码 ~4.4MB（gzip 后 ~1.5MB）+两大 PNG 5MB——大图处理后可达标 |

## C. 游戏本体（双平台共享核心）

| 项 | 状态 | 证据 |
|---|---|---|
| tsc 双工程 0 错误 | ✅ | 每切片实测 |
| 全量测试 194 文件 | ✅ exit 0（shop/realm/talent/craft 队列/F5 事件全绿） |
| content:check | ✅ | 成就 120/事件 42 |
| 核心流探针 13 阶段 | ✅ 13/13（向导→炼丹队列→成就→设置→境界→天赋→商店） |
| 移动扫描 36 页 | ✅ 6 视口 |
| 60 分钟浸泡 | ✅（120 分钟基建就绪） |
| 存档兼容 | ✅ V15 fail-closed；V11–V31 零 schema 变更；迁移测试在位 |
| 经济安全 | ✅ 炼丹净负 EV+限购+exactly-once+双闸门模拟（L10→L11 决策 OPEN） |
| P0/严重 P1 | ✅ =0 |

## D. 上线阻塞清单（按优先级）

1. ❌ 微信主包超限 → 编辑器三步优化（§A）后复测；
2. 🔒 微信开发者工具/真机人工验收；
3. 🔒 H5 HTTPS 域名部署 + 三浏览器人工过检；
4. 🔒 IAA 真实广告位凭证 + 真机广告验证；
5. ⚠️ BUG-003（P2 深夜复现）与 BUG-ECO-1（P3 数值决策）不阻塞 RC。

## 结论

**RELEASE CANDIDATE 达成条件差 2 项人工执行项**（微信主包优化复测 + 人工工具/真机/浏览器过检）。代码/配置/产物/文档/测试全就绪；所有 BLOCKED 项均需人工或外部环境，无虚报。
