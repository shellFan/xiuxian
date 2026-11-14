# V9.0 H5 验收报告（TASK-3.2/3.3/3.4/7 移动端）

## 1. 独立 H5 交付

| 项 | 值 |
|---|---|
| 构建产物 | `desktop/build/web-desktop/`（纯静态，可直接托管） |
| 本地启动 | `node scripts/h5-server.cjs` → `http://127.0.0.1:8630/` |
| 部署说明 | 任意静态托管均可（Nginx/GH Pages/OSS+CDN）；index.html 为入口 |
| 存档 | 浏览器 localStorage（`game-save` 键；bootstrap 无 electronAPI 时自动走 LocalStorageAdapter） |
| Electron 依赖 | 无（AI NPC 规则降级守卫；storage 走 LocalStorageAdapter） |

## 2. 纯浏览器上下文验收（390×844 移动视口，真实 Chromium）

验收方法：Electron 窗口【不挂 preload】= 无 electronAPI 的纯净 Chromium 渲染环境
（等价手机浏览器打开 H5），由 h5-server 静态服务。

| 检查 | 结果 | 证据 |
|---|---|---|
| 无 electronAPI 启动 | **PASS**（electronApiPresent=false, overlay=true） | v90-h5-probe.json checks.boot |
| 创建角色 → 洞府 | **PASS**（caveCard=true） | screenshots/mobile/h5-02-cave.png |
| 移动布局 | **PASS**（overflowX=false, nav 底部导航视口内） | checks.mobileLayout |
| 触摸攻击（TouchEvent 真实事件） | **PASS**（hp 41→19 + 击杀 +1） | checks.touch.progressed=true |
| localStorage 存档 | **PASS**（hasSave=true, name=V90H5） | checks.localStorageSave |
| H5 重启恢复 | **PASS**（刷新后洞府直达，无创建向导） | checks.restartRecovery |
| 综合判定 | **H5 PASS=true** | v90-h5-probe.json |

## 3. 移动宽度扫宽（真实 Chromium 逐宽实测）

| 宽度 | 横向溢出 | 底部导航 | 触摸目标 |
|---|---|---|---|
| 360×640 | 无 | 可达 | 4 个次级小按钮已加 CSS 下限修正 |
| 375×812 | 无 | 可达 | 同 |
| 414×896 | 无 | 可达 | 同 |
| 430×932 | 无 | 可达 | 同 |

证据：`v90-mobile-sweep.json` + `screenshots/mobile/mobile-*x*.png`

## 4. 触摸交互（TASK-3.3）

- 点击攻击：touchend 即时响应（`overlay.__touchWired` handler；preventDefault 防合成 click 双发）
- 技能按钮：移动断点下 min-height 62px、max-width 放开
- 关闭按钮/招募项：min-height 48px
- 不依赖 Hover：所有交互均为 click/touch 路径

## 5. H5 性能（TASK-3.4）

- 首屏：静态文件本地 HTTP，Cocos 引擎 boot ~4-9s（视口实测）
- 资源：sprite sheets 70 张（V6.6 集）+ ui-icons 10 张 + ui-slice 44 张
- 动画：战斗循环 rAF 正常（触摸推进实测）
- 弱网/断网：静态资源 + localStorage——单机玩法不依赖网络；AI NPC 走规则降级
- NOT_VERIFIED：真机弱网实测（无真机环境）

## 6. 与微信/抖音的复用路径（TASK-3.2 目标）

- 业务层（Cocos/TS 服务层）与渲染层（DOM overlay）已经分离
- overlay 不依赖 Electron API（本轮实测验证）
- 小游戏复用 = 静态构建 + 平台 StorageAdapter/AdsAdapter 替换（架构已就绪：
  `platform/rewarded-video-adapter.ts` 的 wx/tt 宿主 + `platform-service.ts` 的
  wechat/douyin PlatformService）
