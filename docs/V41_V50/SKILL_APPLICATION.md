# 技能应用记录（SKILL_APPLICATION）

> 技能库：gamedev-skills/awesome-gamedev-agent-skills @ c6ca6c4（11 个引擎无关技能已装，V11 接入验证）。
> 本表记录 **V41–V50 轮真实应用到文件级别的技能**（不含 V11–V31 历史应用，历史见 docs/V11_V15/SKILL_USAGE_LOG.md）。

| 技能 | 解决的问题 | 应用文件 | 产生的改进 | 验收方式 |
|---|---|---|---|---|
| `performance-optimization` | 微信主包超 4MB | 构建产物审计（build/wechatgame-current/v41-wechat） | 定位三大项：引擎 wasm 0.9MB 零使用、两大 PNG 5MB、主包合计 4.7MB；给出三步编辑器优化路径（预期 ≤2MB） | WECHAT_BUILD_REPORT 体积表（实测 du） |
| `performance-optimization` | 首屏加载大头 | assets/textures/ui/home/home-character.png 1382×1138 2.7MB / home-office-background 1672×941 2.3MB | 定位降分辨率/转 JPEG 建议（-3.7MB 预期） | BASELINE.md 大图表 |
| `save-systems` | 双平台存档一致性 | services/shop-service.ts（新） | 事务化购买（扣货币→限购键→发货→save 全回滚）；UTC 日限购键与 DailyTaskService 日界一致 | tests/shop 7/7 |
| `game-ui-ux` | 移动端布局验证 | scripts/v31-qa/mobile-sweep.cjs | 6 视口×6 页 36 截图 + 溢出扫描，36/36 PASS | UI_QA.md |
| `game-ui-ux` | 首页引导闭环 | ui-overlay.js homeHeroHtml | 独立境界徽章（待渡劫金色脉冲直达修仙页） | 探针 A8 依赖入口可达 + 截图 |
| `game-assets` | Emoji 占位替换 | ui-overlay.js UI_ICONS 22 枚内联 SVG + ui-overlay.css .ui-ico | MORE 菜单/设置行 Emoji 清零，墨描边线性风格统一 | mobile-sweep more.png/settings.png 实拍 |
| `game-economy` | 商店经济防漏 | shop-service 限购/双货币/坏配置校验 | 无限刷/负数/重复购买路径全封（事务+限购键+校验） | tests/shop 边界用例 |
| `game-docs` | 发布文档体系 | docs/V41_V40→V41_V50 13 份 | BASELINE/SKILL_APPLICATION/DESIGN_SYSTEM/两份 BUILD_REPORT/RELEASE_CHECKLIST 等 | 本目录文件清单 |
| `game-architecture` | 双平台统一 | PlatformService 既有抽象核对（平台隔离 5 文件） | 确认 H5 无 wx.*、微信无 DOM 依赖（架构级一致性） | 平台隔离 5 文件 grep + 双构建产物 |

## 明确不适用（如实）

- `Mobile Game Development` / `Responsive UI` / `Release Management` / `Quest Systems` 等：**上游 79 技能中不存在**（V11 决策 D-003 实测），相应职责由项目规范文档承担，不虚构技能名。
