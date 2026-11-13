# V8.0 发布检查清单（RELEASE-CHECKLIST）

## A. 必须通过（发布门槛）

| 项 | 状态 |
|---|---|
| TypeScript 编译 | PASS |
| 全量单元/集成测试（170 文件） | PASS（full-regression2.log EXIT=0） |
| P0 缺陷 | 0 未关闭 |
| EXE 构建 | PASS（pack EXIT=0，指纹见 EXE-ACCEPTANCE） |
| EXE 干净环境试玩 + 120 分钟稳定性 | PASS（soak JSON + log） |
| 重启恢复 | PASS |
| 存档兼容（v13+ 真实引擎验证 + 单测） | PASS |
| 经济幂等 | PASS（单测覆盖） |
| UI 四档分辨率 | PASS（4/4） |

## B. 平台（如实标注）

| 项 | 状态 | 发布动作 |
|---|---|---|
| Windows EXE | RELEASE_CANDIDATE | 可发布 |
| 微信小游戏 | 构建 PASS；主包 6.9MB 超限 → 需分包/压缩；真机 BLOCKED | 完成分包后再走微信审核 |
| 抖音小游戏 | 构建超时 PARTIAL | 需更长构建窗口/排查插件后重试 |

## C. 上线前（不阻塞 RC）

- [ ] 微信主包分包（assets 6.9MB → 主包 ≤4MB + 子包）
- [ ] 广告位 ID 配置（configs enabled=true + 真实 adUnitId）→ 真机广告回归
- [ ] 微信/抖音开发者工具真机预览（本轮 BLOCKED）
- [ ] MNN-0.3B 本地模型部署后复测 NPC（桥接协议已验证）
- [ ] 音效人工听感回归
- [ ] 首页信息架构深度重构（左右分栏）——V8.1 候选

## D. 结论

**RELEASE_CANDIDATE**（Windows EXE 可发布候选；微信/抖音真机验收 BLOCKED，
构建/兼容层已完成到当前环境可达的深度）。
