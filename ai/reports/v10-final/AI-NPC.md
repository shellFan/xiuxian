# V10.0 FINAL — AI NPC 系统报告

## 组件

1. **ai-bridge.cjs**（Electron 主进程 / h5-server 同源复用）
   - 4 个 NPC 人设（掌门/师姐/老板/助手）+ 游戏 NPC 会话列表（事故群/产品经理/HR仙子/…10+ 会话）。
   - MNN 优先 → 规则引擎降级；`mode` 字段区分 `mnn` / `rule` / `rule-duplicate`。
2. **NPC 长期记忆（V10 新增，§10.3）**
   - 短期：每 NPC 最近 12 轮对话（内存）。
   - 长期：`<userData>/xiuxian-save/npc-memory.json`（隔离目录内，绝不写进玩家 save.json）。
   - facts（职业/境界/疲劳/连击等，来自 aiBuildContext，容量 24）、notableEvents（20 条、去重）、
     affinity（-100..100）、summary（溢出轮次自动折叠摘要，400 字符上限）。
   - 去重：连续相同用户发言折叠为 repeat 计数；事件文本去重。
   - 模型只收 facts 摘要行（≤160 字符）——**整份存档永不出主机进程**。
   - 清空：clearHistory 同时删除持久化记忆（幂等）。
3. **飞剑传书（§10.4）**：独立收件箱（事故群/老板/产品经理/HR仙子/项目群等），回复选项走
   `replyToMessage` 规则校验；NPC 聊天支持自由输入。
4. **下班日报（§10.5）**：任务页/日程卡呈现当日工作·修行摘要（模板生成，数据来自权威状态）。

## 测试（全部真实执行）

- `tests/v10-final/ai-bridge.test.ts` **4/4 PASS**：
  1. 无模型服务时快速降级、不挂起、回复长度上限；
  2. 恶意/超长输入清洗后安全降级；
  3. **mock MNN 端点**捕获请求体：用户消息恰好出现一次（重复历史回归）、system 首位、
     历史中先前交互恰好一次；
  4. 长期记忆持久化：facts 落盘、节流写、清空后移除。
- 全量回归：`tests/run-all.cjs` **174 文件 EXIT=0**（含本测试）。

## 真实模型链路（REAL_MNN）

- 游戏内 E2E：EXE 启动 → 创建角色 → 飞剑传书 → 掌门 → 输入"掌门，我该如何突破当前境界？"
  → 回复气泡（模式徽章 **MNN-0.3B**）："修仙门●清虚道人，破境之法，一念即破。"
  → 截图 `screenshots/desktop/16b-npc-chat-reply.png`。
- H5 链路：`POST /ai/chat` → mode=mnn（浏览器零直连，见 H5-ACCEPTANCE.md）。

## 验收状态

- AI_NPC_RULE: PASS（规则引擎人设+上下文增强，降级路径全绿）
- AI_NPC_MOCK: PASS（mock 端点请求体断言）
- REAL_MNN: PASS（Windows 真实推理 + 游戏内 E2E + 截图）
- NPC_MEMORY: PASS（持久化+摘要+去重+容量+清空，测试覆盖）
- FLYING_SWORD_MESSENGER: PASS（收件箱/会话/回复 UI 真实驱动 + 截图）
- DAILY_REPORT: PASS（任务页日程/日报面板真实渲染 + 截图；AI 化文案走模板，MNN 文案为增量）
