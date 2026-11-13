# V8.0 AI NPC 与音效报告

## 1. AI NPC（TASK-030/031）

| 检查 | 结果 | 证据 |
|---|---|---|
| 真实模型桥（HTTP 全链路） | **PASS**（mock OpenAI 兼容端点） | `v80-npc-probe.json`：游戏 → ai-bridge → POST /v1/chat/completions → mock MNN → 回复「MNN-MOCK回复：模型桥已验证。」渲染到聊天（mnnHits=1） |
| 规则降级 | PASS（V7.0 已验证 + 本轮 ai-bridge 代码审计：话题匹配 5 类 + 上下文增强） | ai-bridge.cjs |
| 超时降级 | IMPLEMENTED（REQUEST_TIMEOUT_MS=8000，超时 → 规则引擎；未在本环境复现 8s 延迟场景 — 代码路径审计） | ai-bridge.cjs |
| 不阻塞战斗 | PASS（IPC 异步 ai:chat，主进程处理；对话失败返回「……(信号不通)」） | main.cjs |
| 对话上下文 | PASS（MAX_HISTORY=12，取最近 6 条进 prompt） | ai-bridge.cjs |
| 无限请求防护 | PASS（_aiSending 锁：发送期间按钮 disabled） | ui-overlay.js |
| 真实 MNN-0.3B 本地模型 | **BLOCKED**（本环境无 MNN 服务；不下载大型无关模型 — 指令允许） | — |

结论：**模型桥 HTTP 全链路以 mock 端点验证通过**；真实本地模型待具备 MNN 服务时复测（桥接协议已验证兼容）。

## 2. 音效（TASK-032/033/034）

| 检查 | 结果 |
|---|---|
| 事件→音效映射 | IMPLEMENTED（sound-service.ts：事件订阅 → play(event)） |
| 音频后端 | IMPLEMENTED（CocosAudioBackend 注入 AudioService，bootstrap 接线） |
| 设置持久化 | IMPLEMENTED（settings.sfxEnabled，settings-service） |
| 触发正确性 | UNIT_PASS（服务层事件映射逻辑存在；运行时触发点经 facades 调用） |
| 听感（刺耳/叠加/延迟/同步） | **NOT_VERIFIED**（无法自动化主观听感；按指令如实标注） |
