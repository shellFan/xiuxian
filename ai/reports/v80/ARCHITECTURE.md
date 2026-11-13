# V8.0 架构决策记录（ARCHITECTURE.md）

## 1. 双层渲染架构（保持）

- **权威状态**：Cocos 服务层（assets/scripts/*.ts）→ Cocos CLI 构建 → build/web-desktop-current
- **玩家视觉**：DOM Overlay（desktop/ui-overlay*.js）→ patch-html 注入 → Electron BrowserWindow
- 桥接：`window.__GAME_FACADE__`（查询/命令）+ **V8.0 新增 `window.__UI_OVERLAY__`**（子模块 refresh/toast/closePopup）

## 2. V8.0 新增架构决策

| 决策 | 理由 | 影响面 |
|---|---|---|
| 战斗舞台签名保留 | 每秒全量重建导致 sprite 动画归零 + ≤1s 空窗；签名对比（关卡/敌人/阵容/状态）不变时保留节点 | ui-overlay.js refresh + ui-auto-battle battleSignature；hp/冷却/DPS 局部更新 |
| `window.__UI_OVERLAY__` 桥 | ui-battle-card 5 处 refresh 引用从未存在 → 选中态永不渲染（P0 根因） | 一行指向公共 API |
| 创建期战斗门控 | 场景加载即 facade.start()，创建向导期间战斗后台推进（新手开屏即 Boss） | auto-battle-service isCreationGated |
| 平台广告适配层 | RewardProvider 接口不变；wx/tt 宿主 + 频控策略 + 幂等；桌面本地授予 | rewarded-video-adapter.ts + 10 单测 |
| 抖音平台 | PlatformKind 扩展 + DouyinPlatformService（镜像微信） | platform-service.ts |
| 统一图标集 | canvas 生成 10 枚（墨玉描金）替换 Emoji 主视觉 | desktop/assets/ui-icons + v80-icon-gen.cjs |
| 推荐战力分段公式 | 旧公式恒高 40-60%（红色警告永久） | recommendedPowerFor（模拟数据拟合） |

## 3. 构建流水线

```text
npm run pc:build   # Cocos CLI → build/web-desktop-current/web-desktop（服务层）
npm run pc:copy    # → desktop/build/web-desktop + patch-html 注入 overlay/ui-icons + manifest
npm run pc:pack    # build:copy(含再次注入) → electron-packager --asar → dist EXE
平台构建           # ai/work/v80-platform-build.cjs（wechatgame / bytedance-mini-game）
```

注意：pc:pack 的 prepack 会从 build/web-desktop-current 重新复制并重新注入 ——
overlay 源文件（desktop/*.js|css）永远是唯一真实来源。
