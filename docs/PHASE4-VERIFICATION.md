# Phase 4 验证记录

## 基线与范围

- Worktree：D:/git/fan/xiuxian-ui；branch：phase4-ui-content。
- 固定基线：b9a1eb77e33424f39545baa1b05e1a4179025fd8；开始时主线工作区clean。
- 本轮只新增docs、候选配置、文档目录下验证器与报告。不改GameContext、任何Service、业务算法、生产场景、Prefab或现有运行配置。
- 并行主线后来独立推进至30bb6dc；本分支没有merge/rebase跟进。最终整合前须重新核对主线接口，不能认为基线文档永久有效。

## 已实际执行（2026-09-04）

| 命令 | 结果 | 证据范围 |
|---|---|---|
| npm ci | exit0，安装14包 | 新worktree依赖，lock未变 |
| npm test（基线与交付各一次） | exit0，43 test files | 现有游戏回归；含Phase3 integration 18 passed/0 failed |
| npm run build | exit0 | game与orchestrator TypeScript；不是Cocos Editor构建 |
| npm run ai:check | exit0，12 passed/0 failed | 集成检查程序自身结论；见下面限制 |
| node --test docs/validation/phase4-content-check.test.cjs | 首轮17/17；整改后exit0，20/20 | 候选检查器正负用例；内存故障注入，不改磁盘数据 |
| node docs/validation/phase4-content-check.cjs | exit0 | 80事件/10彩蛋、31成就/6隐藏、12每日、25音频计划、15核心文档、源数据不变 |
| git diff --cached --check | exit0 | whitespace；LF转CRLF提示为Git本机配置提示，不修改全局配置 |

## 检查器 RED → GREEN

先创建测试并运行，17项因断言“Phase4 validator must exist”失败（exit1），不是冒充通过。实现只读验证器后17/17通过；负用例确实拒绝重复事件ID/标题、非法Effect key、Infinity、奖励超限、源事件/成就/每日漂移、数量不足、彩蛋不足、选择数量不足、严格支配选项、误启运行、隐藏不足、每日变体越界和每日抽取数过多。

源保护双层：候选按ID对照源对象；源配置再与固定Git基线deepEqual，避免同时改源与候选导致假通过。运行代码diff为空，source扫描未发现候选加载引用。该扫描是针对当前静态入口的检查，不是通用打包安全证明。

## ai:check 限制（不掩盖）

输出中实际有verification runner尝试`npm run build:orchestrator`失败，`command=npm exit=-4058`、stdout/stderr为空；随后测试用例仍将验证器处理失败路径判为通过，汇总12/12。此记录不能证明Windows子进程成功执行build，更不能证明真实模型Provider闭环。本轮另行直接执行npm run build和npm test成功，未改主线orchestrator修该问题。

## 内容复核

root阅读全部50条新事件及31成就/12每日，检查重复、效果对应、精确条件、梗与候选隔离；第一次要求Luna修正泛化成就名、重复会议/午餐事件、KPI“检查即可完成”的误导、FISH成就误放每日说明；之后二次去重。源30事件保持不动，其下午茶“回满”文案与+12不符、团建选项严格支配作为既有问题交主线处理。

模型路由：批量子代理通过tool参数请求并接受gpt-5.6-luna/high，无历史fork；工具回执只返回agent_id，未暴露运行时provider/model证据，故不宣称额外的运行身份验证。主结构与整合保留当前根会话；未修改本机模型配置。

## 明确未验证

- 无新的UI TypeScript、Presenter、ModalManager、Prefab或生产资源绑定；本轮UI CODE不适用，设计与代码不能混称。
- Cocos Editor导入、预览、构建、Inspector绑定、真机安全区/胶囊/触摸/帧率/内存未执行。
- 图片/音频未生成，Prompt与audio-plan仅规划。
- 候选内容未加载；稀有权重、隐藏呈现、随机每日、广告上限/事务没有新实现。
- 正式广告SDK、平台政策、发布包体剔除DEV内容没有验收。

这些是后续接入/人工测试项，不是本轮通过静态检查就能宣称完成的项目。

## 独立审查整改后的验证

2026-09-04 06:18 UTC附近重新执行：npm test exit0（43文件）、npm run build exit0（两个tsc）、ai:check exit0（12/12，仍含-4058限制）、checker exit0、checker tests20/20、git diff --check exit0。新增3条回归先RED（20测试17通过3失败），后GREEN，具体证据见PHASE4-FIX-REPORT.md。

本轮新增成就sourceId别名漏洞、普通离线command遗漏、安全区坐标重复padding、报销工资效果、token引用与12每日精确计数已整改；Sol对2c472a9快照复审PASS，未解决问题各等级均0。原43文件回归不是候选内容运行验收，20个新增检查器测试才验证候选结构及防错。整改报告首次stage发现一处Markdown行末空白，已另提交2c472a9修正并重跑全分支diff --check通过，不改写历史。

## Git传输诊断

普通Git远端查询发生TLS错误；只读trace表明Git实际走本地7898 SOCKS代理，而环境HTTPS_PROXY是本地7897 HTTP代理，curl访问同一Git smart-HTTP端点为200。只对该仓库本次命令设置url-scoped proxy为环境HTTPS_PROXY后，ls-remote exit0，确认远端尚无phase4-ui-content分支。没有关闭TLS校验、没有更改全局Git/系统代理、没有读取凭据。最终push采用同样单次覆盖并核对远端SHA。
