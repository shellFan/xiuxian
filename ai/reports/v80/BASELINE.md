# V8.0 基线与架构报告

## 1. Git 基线（V8.0 起点）

| 项 | 值 |
|---|---|
| 分支 | `v61/gameplay-v2` |
| V8.0 起始 SHA | `3827a6d`（V7.0 最终交付） |
| V7.0 遗留复核 | 首页信息架构 / 卡牌目标点击间歇失手 / AI NPC 真实模型桥 / 音效听感 —— 本轮全部处理（见 §3） |
| 工作区 | 干净，origin 同步（0 差异提交） |

## 2. 运行时架构（复核确认）

```text
Cocos 场景（cocos-bootstrap-component.ts）
  └ GameFacade.start() → autoBattle.ensureStarted（V8.0: 创建期门控）
  └ GameLoop tick → Services（权威状态）
DOM Overlay（desktop/ui-overlay*.js，patch-html 注入 web-desktop 构建）
  └ window.__GAME_FACADE__ 桥接（V8.0 新增 window.__UI_OVERLAY__ 修复子模块 refresh 引用）
  └ refresh() 每秒重建：HOME 战斗舞台签名保留（V8.0 保留策略）、卡牌战斗屏实时重建
Electron main.cjs → 本地 HTTP → BrowserWindow（V8.0: backgroundThrottling:false）
平台层：platform-service（mock/web/desktop/wechat/douyin）+ rewarded-video-adapter（wx/tt）
```

## 3. V8.0 变更总览（按里程碑）

| 里程碑 | 变更 | 提交 |
|---|---|---|
| V7.1 | 首页真重构（主列 640→920、舞台 920×500 视觉中心、技能/小队适配、统一图标集 10 枚替换 Emoji 主视觉） | a32b7c0 |
| V7.2/V7.3 | 动画五态实测（idle 4 帧循环、tap 伤害 25+飘字+受击特效、技能图标、击败演出） | （探针证据） |
| V7.4 | 卡牌目标点击稳定：**修复 window.__UI_OVERLAY__ 缺失**（5 处 refresh 静默失效）、陈旧选择清理、敌卡点击必达、状态等待驱动 | ccd6e98 |
| V7.5 | 养成/经济回归（169+ 文件全绿多轮；招募价格/余额已入 UI） | （继承） |
| V7.6 | AI NPC 真实模型桥验证（mock MNN 端点 HTTP 全链路 PASS，mnnHits=1）；音效链路审计 | 75d91dd |
| V7.7 | 平台激励视频适配层（wx/tt 宿主 + PlatformAdProvider + 频控 + 幂等 + 10 项单测） | 0bf0fc5 |
| V7.8 | 抖音平台支持（DouyinPlatformService）+ **真实 Cocos 平台构建**（wechatgame 83s/12 文件成功；bytedance 420s 超时 PARTIAL） | 0bf0fc5 |
| V7.9 | 全量测试 + 120 分钟稳定性 + 截图/指标（见 TEST-MATRIX / EXE-ACCEPTANCE / PERFORMANCE） | （本阶段） |
| V8.0 | 发布候选（见 RELEASE-CHECKLIST / FINAL） | （本阶段） |

## 4. 环境事实（复用 V7.0 结论）

- Node v24.14.1（D:/hclaw/node）、Cocos Creator 3.8.4 CLI、Electron 28.3.3
- Electron 必须经 PowerShell `Start-Process` 启动（Bash 直接子进程无法启动 GUI 应用）
- 所有自动化使用 `XIUXIAN_USER_DATA` 隔离存档，绝不触碰真实玩家数据
