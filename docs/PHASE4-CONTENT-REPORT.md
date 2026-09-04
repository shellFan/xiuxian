# Phase 4 候选内容批量生成报告

## 状态

DONE

## 本轮增量

- 按 root REQUEST_CHANGES 将 30 条成就全部改为职场修仙短梗，保持源条件/奖励精确不变；修正初始职级成就文案，并移除 `FISH_30M` 描述中的技术接入语句。
- 重写新事件 001–015 的反差文案；将 006、041、042、049、050 改为猎头联系、老板学 Git、测试零 Bug、报销到账、交接文档齐全等不同办公室主题，并将 011、046 调离会议顺利主题、012 调离午餐排队主题。
- 修正 `kpi-check-p4` 为“完成 KPI”语义，更新全部日常任务名称/描述的梗与精确度。
- 在集成说明中明确 `FISH_30M` 是成就候选、不接入运行时且不进入日常抽取；补充 `PlayerData.fishingSeconds` 已存在、仅缺 `AchievementService` 的 `FISH_SECONDS` 条件评估，并补充 UTC 午夜切日事实、两个源事件基线例外及主线待决事项。

## 交付文件

- `assets/configs/phase4/office-events.json`
- `assets/configs/phase4/achievements.json`
- `assets/configs/phase4/daily-tasks.json`
- `docs/CONTENT-INTEGRATION.md`
- `docs/PHASE4-CONTENT-REPORT.md`

## 实际计数

- 事件：80 条；CHOICE 14、NEGATIVE 32、RARE 4、POSITIVE 20、EASTER_EGG 10。
- 成就：31 条；复用源成就 ID 30 条；隐藏展示候选 6 条；展示分类覆盖成长、合成、职业、摸鱼、工作、财富、修仙、事件、隐藏。
- 日常任务：12 个模板；源任务 6 个、带 `sourceId` 的变体 6 个。

## 验证摘要

已在 `D:/git/fan/xiuxian-ui` 的 `phase4-ui-content` 分支运行 focused Node 校验，结果通过：

- 本轮增量校验覆盖 8 个新 CHOICE 事件的全部选项对，未发现严格支配；指定替换事件的类型、预算和总量约束保持通过。
- root checker `node docs/validation/phase4-content-check.cjs` 返回 `PASS`；`node --test docs/validation/phase4-content-check.test.cjs` 返回 17/17 通过。

- 三份候选 JSON 均可解析，数量与唯一 ID/标题约束通过。
- 30 条源事件按 ID 深度一致。
- 30 条源成就的 `condition`/`reward` 保持一致。
- 6 条源日常任务的 ID/`type`/`target`/`reward` 保持一致。
- 新事件效果字段、普通/稀有奖励上限、选择题 2–3 个选项与选项文案长度通过。
- 日常变体类型族、`sourceId` 和逐字段奖励上限通过。
- 成就分类覆盖与 5 个隐藏最低要求通过。

## 问题与后续关注

- 三个候选数据文件均保持 `runtimeEnabled: false`，未自动激活。
- 事件池级 RARE 1% / EASTER_EGG 不超过 0.1% 仍需服务 owner 实现，内容未伪造概率字段。
- 隐藏成就元数据仅供展示候选，需 UI/产品审批后才能接入。
- `PlayerData.fishingSeconds` 已存在；`FISH_30M` 是成就候选，等待 `AchievementService` 增加 `FISH_SECONDS` 条件评估。不可用前保持成就候选不接入，不进入日常抽取。
- `DailyTaskService` 按 UTC 午夜切日，对北京时间用户是 08:00 换日；文案和接入说明不采用本地 00:00。
- 源事件 `EVENT_AFTERNOON_TEA` 存在“道心回满”与 `mind: 12` 不完全匹配，`EVENT_SUDDEN_TEAM_BUILDING` 的 `JOIN` 严格支配 `SLACK`；两项保留给主线决定，未破坏源深等值。
- 日常任务每天 5 个、同类型互斥、随机选择和聚合奖励封顶尚未在服务中实现。
- 未运行完整 TypeScript/项目测试，按 brief 留给 root 单独复核；工作树中其他 root-owned 未跟踪文件保持原样。
