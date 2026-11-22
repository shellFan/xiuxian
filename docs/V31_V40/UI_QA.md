# UI 验收记录（UI_QA）

> 2026-11-23 · 全部来自真实运行（Chrome 移动模拟视口 + CDP）。

## 覆盖矩阵（6 视口 × 6 页 = 36 截图）

视口：360×640 / 375×667 / 390×844 / 393×852 / 412×915 / 430×932
页面：home / craft / talents / settings / achievements / more

| 检查 | 结果 |
|---|---|
| 横向溢出（scrollWidth > clientWidth） | **0 页面命中** |
| 元素越界（right > clientWidth+1 / left < -1） | **0 元素** |
| 控制台异常 | 0 |
| 向导完成率 | 6/6 视口 |
| 截图 | artifacts/V31_V40/mobile/<viewport>/*.png（36 张）+ mobile-sweep-results.json |

## 本轮 UI 变更验收

| 变更 | 证据 |
|---|---|
| MORE 菜单 SVG 图标（修仙/天赋/功法/法宝/人际/合成/宗门/排行榜/成就/图鉴/设置/结算 12 项） | more.png 实拍：全部线性图标，零 Emoji |
| 设置行图标（音效/背景音乐/推送） | settings.png 实拍 |
| 首页独立境界徽章（待渡劫金色脉冲） | 探针 A8 依赖首页入口可达；cultivation-realm.png 显示待渡劫卡 |
| 商店页（7 商品/双货币/限购行） | 13-shop.png + A11 断言（hasPage + goods=7） |

## 遗留 UI 问题（如实）

| # | 问题 | 状态 |
|---|---|---|
| V-4 | canvas 页空态覆盖未全量核对 | 下轮 |
| V-5 | 设计分辨率口径冲突 | D-011 OPEN |
| V-6 | 素材位（丹炉/药材/丹药图）仍 CSS 图+Emoji 混合 | 需美术资产（E3） |
| V-7 | 弹窗竞态下 UI 点击命中率（探针 fallback 记录） | 已有兜底机制，弹出节奏属事件引擎调频问题 |
