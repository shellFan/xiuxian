# 牛马修仙传可玩首页与页面导航设计

## 目标

启动后只呈现一个完整的首页，而不是黑屏或把整张 UI 概念图铺在屏幕上。首页以现有设计稿为视觉基准，并通过底部导航切换任务、合成、晋升和更多页面。

## 范围

本次只恢复核心 Demo 的可玩入口：

- 首页：角色信息、资源条、工作状态、修炼/打工/摸鱼操作、底部导航。
- 合成页：4×4 工位棋盘、招聘入口、牛马卡片、拖拽到空格、同等级合成。
- 任务、晋升、更多页：可从底部导航进入，页面不黑屏；数据和操作沿用已有业务服务。
- 存档：所有操作通过现有 `GameFacade` 和 `SaveService` 持久化。

不包含广告、宗门扩展、挂机系统、排行榜社交扩展或随机事件的新业务开发。

## 方案

保留现有业务层和 Adapter/Facade 结构，在 Cocos `Main.scene` 中建立真实节点层级，由 `GameUIController` 作为唯一页面编排入口。`CocosBootstrapComponent` 创建并持有唯一业务上下文；所有页面组件从同一 Facade 读取状态。

`pc-patch.js` 只承担桌面端兼容诊断和必要的旧包保护，不再依赖它动态生成主要 UI。场景源码、构建产物和启动检查必须保持同步。

## 页面与数据流

```text
CocosBootstrapComponent
        │
        ▼
     GameFacade ── SaveService / Economy / Board / Events
        │
        ▼
GameUIController
   ├─ HomePage
   ├─ TasksPage
   ├─ CraftPage + MergeBoard
   ├─ PromotionPage
   └─ MorePage
```

页面切换只改变页面节点的 `active` 状态，不创建新的业务上下文。按钮事件调用 Facade，事件回调触发局部刷新；UI 不直接修改存档或经济数据。

## 合成语义

招聘把新 Worker 放入第一个空工位。拖动 `from` 到空的 `to` 执行移动；拖动同等级 Worker 到 `to` 时，`from` 清空，`to` 留下等级加一的新 Worker。数据位置、卡片位置和合成动画终点都必须是 `to`。

## 验证

先以测试锁定业务和场景契约，再实现：

- 首页节点存在、只显示首页、底部导航能切换页面。
- 招聘、移动、合成的状态变化和存档恢复。
- 修炼、打工、摸鱼按钮调用真实 Facade。
- 场景脚本 UUID、bundle 新鲜度、TypeScript、全量测试通过。
- 启动日志必须出现 `GAME_READY`、节点解析成功和 UI 绑定成功。
- 若无法用 Cocos Editor 做人工点击验证，报告中明确标记 `MANUAL TEST REQUIRED`。

## 非目标

不重写已有业务服务，不引入 DI 框架，不恢复重复 Bootstrap，不通过 Mock 冒充真实桌面运行验证，也不提前进入 Phase 2 功能。
