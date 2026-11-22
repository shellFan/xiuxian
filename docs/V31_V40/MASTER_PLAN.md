# V31–V40 总计划（MASTER_PLAN）

> 开始：2026-11-23 · 基线：feature/v10-final-release @ `3b0866c` → HEAD `dac5f02`+（V12 三系统之上）
> 详见 BASELINE_AUDIT.md（系统矩阵）与 TASK_LEDGER.md（任务台账）。

## 本轮主攻（WIP 约束下的可执行面）

| 任务 | 状态 | 成果 |
|---|---|---|
| T1 基线对账 | ✅ | BASELINE_AUDIT.md（系统矩阵/视觉问题/测试缺口） |
| T2 设计系统 | ✅ | overlay 已有 4817 行 token CSS；本轮补 .ui-ico 图标体系样式 |
| T3 首页信息架构 | ✅ | 独立境界徽章上首页（待渡劫金色脉冲高亮引导） |
| **T4 正式图标** | ✅ | **22 枚内联 SVG**（墨描边线性风）替换 MORE 菜单/设置行/资源 Emoji |
| **T5 移动 QA** | ✅ | mobile-sweep.cjs：6 视口 × 6 页 36 截图 + 溢出检测全 PASS |
| T7 统一商店 | ✅ | shop.json 7 商品 + ShopService（双货币/每日限购/事务化）+ overlay 商店页 + 7/7 测试 |
| T10 存档 v16 | ⏸ BLOCKED-WIP | realm/talent/alchemy 派生式已零迁移落地 |
| T11 图集化 | ⏸ | SPRITE-ATLAS-PLAN 待执行（首屏 PNG 2.76MB） |
| T12 微信分包 | ⛔ | 无 AppID，静态检查路径见 V11 报告 |

## 验收终态

探针 **13/13 PASS**（新增 A11 商店）＋移动扫描 36/36 页 PASS＋全量测试 194 文件 exit 0＋tsc 0 错误。
