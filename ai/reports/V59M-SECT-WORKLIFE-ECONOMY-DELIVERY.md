# V5.9-M 宗门与职场经济进度报告

**状态：进行中；不得作为 V5.9-M 最终验收报告。**

- 基线 HEAD：`c2f3b03c33ea81a9413244bdb8005ebb6554f7cf`
- 分支：`feature/v59m-sect-worklife-economy`
- 本轮构建输入摘要：`2b42cd65679d51ac4f2e4f371f86623495e9d35f7a95db0de0ce83efc6b6db9d`
- 打包 EXE：`dist/牛马修仙传-win32-x64/牛马修仙传.exe`
- EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- ASAR SHA-256：`ed3f039c36ee781d186624872afbdec8a962f44a03d2c0f4b6d686aaab1f7682`

## 已集成并验证

- 角色创建向导增加独立宗门步骤；所选 `OUTSOURCING` 写入正式角色档案。主页角色卡显示当前宗门入口，宗门页读取可加入列表。
- 配置保留八个历史宗门定义以兼容旧档；根据本任务末尾“不要开发创业宗门”的限制，创业公司 ID 不作为新角色或跳槽目标开放。当前新角色可选其余七宗门。
- 普通工作工资率与已有职业/宗门倍率链路相连；自由宗门的固定工资倍率为零。此项没有独立的工资单闭环验收。
- 新增 `npm run gameplay-agent:sect-creation` 和 `sect-character-creation` 场景，检查可见角色创建流程、权威角色档案、主页入口和宗门页。
- `npm test`：本轮更改后重新执行，160 个测试文件及 36 个 GamePlay Agent runner 测试全部通过（退出码 0）；包含 30/60 游戏日余额模拟、重复性断言和宗门/建角回归测试。
- `npm run build:game`、`npm run pc:build`、`npm run pc:copy`、`npm run pc:pack`、`npm run pc:check`：本轮已执行，`pc:check` 为 PASS。
- 当前打包物 GamePlay Agent：smoke 1/1、宗门建角 1/1、L 卡牌与属性专项 5/5 通过。记录位于 `ai/gameplay-agent/reports/20261017-193704-56d3f6/`、`20261017-194018-0cd3e1/` 和 `20261017-194058-16bb86/`。

## 验证模式与剩余工作

- `ELECTRON_E2E`: PASS；场景通过本地 CDP 合成鼠标/键盘输入和 renderer 截图运行。
- `UI_REAL_EXE`: NOT_VERIFIED；没有用物理 Windows 指针/键盘完成验收。
- `SERVICE_SIM`: NOT_RUN（V5.9-M 专项）。
- L 专项的通过记录覆盖属性加点、卡牌攻防、敌人行动、事件选择、胜利奖励和重启恢复；这不能证明尚未实现的 M 闭环。
- 尚未完成：外包加班申请/审批/拒绝幂等和计薪、1–3 小时加班健康代价、工资单和收入流水、完整下班生活活动及时间预算、心情/次日增益、职业与宗门项目合同、三工作日工资结算、跳槽面试与次日合同生效、宗门专属事件、对应 M GamePlay Agent 专项场景、20 分钟真实墙钟试玩、30 游戏日三画像模拟，以及物理 Windows 输入验收。
- 因此本报告不宣告 V5.9-L/M 总任务通过，M gate 仍未达到。
