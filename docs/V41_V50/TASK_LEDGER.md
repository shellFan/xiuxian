# V41–V50 任务台账（TASK_LEDGER）

> 格式：ID | 优先级 | 状态 | 任务 | 证据。
> 状态：DONE / IN_PROGRESS / BLOCKED / PENDING。

| ID | 优先级 | 状态 | 任务 | 证据 |
|---|---|---|---|---|
| W1 | P0 | DONE | 微信构建重做（platform=wechatgame CLI 修正：`wechat-mini-game` 触发 PluginManager TypeError） | build/wechatgame-current/v41-wechat + WECHAT_BUILD_REPORT |
| W2 | P0 | DONE | 主包体积实测审计（4.7MB 超限定位：引擎 wasm 0.9MB 零使用 + 大图 5MB） | WECHAT_BUILD_REPORT §1–2 |
| W3 | P0 | DONE | 微信优化三步路径（引擎裁剪/大图降分辨率/资产分包）+ 人工验收步骤 | WECHAT_BUILD_REPORT §2/§4 |
| H1 | P0 | DONE | H5 发布构建（web-mobile）+ 体积实测（14MB；首屏按需路径） | release/h5 + H5_BUILD_REPORT |
| H2 | P0 | DONE | H5 部署方案（Nginx 示例/HTTPS/缓存/入口回退） | H5_BUILD_REPORT §3 |
| H3 | P1 | DONE | 双平台约束核对（H5 无 wx.*；微信无 DOM；PlatformService 统一抽象核对） | H5_BUILD_REPORT §4 + SKILL_APPLICATION |
| S1 | P0 | DONE | RELEASE_CHECKLIST（RC 判定：差 2 项人工执行） | RELEASE_CHECKLIST |
| S2 | P1 | DONE | SKILL_APPLICATION/DESIGN_SYSTEM/BASELINE 文档 | docs/V41_V50/ |
| S3 | P1 | DONE | 全量验证复跑（194 测试 + tsc 双工程 + content:check + skills 59/59） | 本轮验证输出 |
| X1 | P1 | BLOCKED | 微信主包优化复测（编辑器三步操作后跑本报告体积命令） | WECHAT_BUILD_REPORT §2 |
| X2 | P1 | BLOCKED | 微信开发者工具导入/编译/真机预览 | 人工（AppID 已配置） |
| X3 | P1 | BLOCKED | H5 HTTPS 域名部署 + 三浏览器人工过检 | 域名/证书 |
| X4 | P2 | BLOCKED | IAA 真实广告位验证 | 广告凭证 |

## 继承（V11/V12/V31 未完成项）

见 docs/V31_V40/TASK_LEDGER.md 继承区与 docs/V12_V20/BACKLOG.md（B1'–B6 BLOCKED-WIP；N1 商店已由 T7 完成；N2 NPC 主线/N3 卡牌收集/N4 图集化/N9 模拟/N11 BUG-003 待续）。
