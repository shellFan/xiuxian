# GamePlay Agent 20261014-170916-3feb5a

状态：**FAILED**

- EXE：`D:\git\fan\xiuxian\dist\牛马修仙传-win32-x64\牛马修仙传.exe`
- EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- ASAR SHA-256：`40e77d3ce6f0adc97b650005f114534cf4c860e0c3dc833665082c6d4ac736b2`
- Build SHA：`b5a502977afa2aac7ad52c62867be748c3b7b8d12ec3c20472705f48baa1fd19`
- UI_REAL_EXE：`NOT_VERIFIED`；ELECTRON_E2E：`FAILED`；SERVICE_SIM：`PASS`
- 隔离存档：每场景使用独立临时目录；测试结束后移除。
- 场景：6/7 通过；1 失败；0 前置阻塞；0 未验证。
- GUI：输入为 CDP 合成事件，截图为 renderer 表面捕获，不计为物理 Windows UI 输入。每个场景另存 replay.json，包含操作、窗口内容尺寸、前后状态与证据路径。

| 场景 | 状态 | 失败步骤 |
|---|---|---:|
| character-creation | passed | 0 |
| economy | failed | 1 |
| new-player-full-journey | passed | 0 |
| profession-loop | passed | 0 |
| smoke | passed | 0 |
| time-save | passed | 0 |
| viewport-matrix | passed | 0 |

## 缺陷

- **HIGH GAME_DEFECT economy-step-68:** @vars.afterWork.salary: 60 > 60 ([证据](./scenarios/economy/evidence/screenshots/011-failure-step-68.png)); 修复尝试 0/3

## 自动复测

缺陷修复由 Codex Developer 修改代码。将缺陷修复轮次保留在缺陷报告中；单缺陷上限三轮，超过后状态设为 ESCALATED。复跑本次失败场景：`npm run gameplay-agent:rerun-failed`。
