# V31–V40 开发日志（DEVELOPMENT_LOG）

> 基线：feature/v10-final-release @ `3b0866c`（V12 三旗舰系统之上）。V11/V12 文档保留为历史。

## 2026-11-23 · T1–T4/T5/T7：基线对账 + 正式图标 + 首页境界徽章 + 移动 QA + 统一商店

### T1 基线对账
- fetch 全远程 + WIP 复查（仍未提交）→ BASELINE_AUDIT.md：系统矩阵（✅17/🟡7/⬜4/⛔1）+ 视觉问题清单 + 测试缺口 + 性能隐患

### T4 正式 SVG 图标（22 枚，任务书§7.3）
- `ui-overlay.js`：UI_ICONS 内联 SVG 表（24×24 线性描边，currentColor 统一配色）+ uiIcon() 输出
- 覆盖：5 资源图标（修为/工资/绩效/道心/灵石）+ MORE 菜单 12 项（techniques/equipment/npc/craft/sect/leaderboard/achievements/codex/settings/settlement/meditation/talent/shop）+ 设置行 3 项（sfx/bgm/notify）
- 验收：mobile-sweep more.png 实拍——MORE 菜单零 Emoji；CSS .ui-ico 尺寸/配色体系

### T3 首页境界徽章
- homeHeroHtml 增独立境界徽章（🌀 境界名 / ⚡ 待渡劫金色脉冲高亮）→ 点击直达修仙页

### T5 移动 QA 扫描（任务书§17）
- `scripts/v31-qa/mobile-sweep.cjs`：6 视口（360×640→430×932）× 6 页（home/craft/talents/settings/achievements/more）
- 每页：截图 + 横向溢出检测（scrollWidth）+ 元素越界计数（getBoundingClientRect）+ 异常计数
- 结果：**36/36 页 PASS、0 溢出、0 异常**；产物 36 截图 + mobile-sweep-results.json

### T7 统一商店（任务书§13/§5.13）
- `configs/shop.json`（新）：7 商品（灵石袋×3/丹药×3/补贴包），双货币（salary/spiritStones）、每日限购、职级解锁
- `services/shop-service.ts`（新）：getView（解锁/限购/可购判定）/buy（扣货币→限购键→发货：统一效果通道+灵石直加；事务化全回滚）；构造期校验
- game-context 注册 shop + facade queryShop/buyShopGoods + overlay MORE「商店」页（shop SVG 图标 + 商品卡 + 购买按钮 + 限购行）
- **ShopEffect 类型**：统一效果通道四键 + 灵石直加（GameEffect 不含灵石，灵石走与 craft 同语义的直接变更+事件）

### 测试与验证
- **shop 7/7**（购买扣费发货/每日限购+UTC 跨日刷新/职级锁定/货币不足/跨商品独立/坏配置/生产配置 7 商品）
- 全量 **194 文件 exit 0**；tsc 0 错误；探针 **13/13 PASS**（新增 A11 商店页+真实购买：salary 1000→850、stones 100→120、限购键=1）
- 弹窗竞态如实记录：UI 点击被事件弹窗遮挡时 facade 兜底直调（fallback 字段入证据）

### 涉及文件
ui-overlay.js、ui-overlay.css、shop-service.ts(新)、shop.json(新)+meta、game-context.ts、game-facade.ts、tests/shop/(新)、scripts/v31-qa/mobile-sweep.cjs(新)、docs/V31_V40/
