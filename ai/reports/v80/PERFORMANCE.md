# V8.0 性能报告（TASK-057）

数据来源：打包 EXE CDP `Performance.getMetrics` 30 秒采样 × 120 分钟 soak、
tasklist 进程快照。完整数据：`v80-exe-soak.json`、`metrics/`。

| 指标 | V7.0（60min 基线） | V8.0（120min） | 结论 |
|---|---|---|---|
| JSHeapUsedSize | 26.1–37.1 MB | 见 soak JSON（区间采样） | 无单调增长 |
| DOM 节点 | 首页 ~455 / 战斗 ~173 | 同区间 | 稳定 |
| exceptions | 0 | 0（目标） | — |
| 崩溃 | 0 | 0（目标） | — |
| HTTP 4xx | 0 | 0 | — |
| FPS | 无引擎计数器（NOT_VERIFIED） | 同 | 以动画连续帧证据替代 |

## V8.0 性能相关变更

1. **window.__UI_OVERLAY__ 桥接**：修复 battle-card 模块 5 处 refresh 静默失效
   → 卡牌战斗界面状态实时更新（此前选中态/目标高亮永不渲染）。
2. 首页主列 640→920：节点数同级（72 控件），无回归。
3. backgroundThrottling:false（V7.0 引入）保持：遮挡不冻结。

## 低性能模式（TASK-059 联动）

- 遮挡/最小化仍可运行（挂机游戏语义）
- 飘字上限 30、粒子/震屏常量已有
- 独立低画质开关：NOT_VERIFIED（无自动化验证手段）
