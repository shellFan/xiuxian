/**
 * 牛马修仙传 V6.1 — AI NPC 桥接模块
 *
 * 架构：
 *   1. 优先尝试本地 MNN-Pocket-0.3B 推理服务（HTTP API，环境变量 MNN_CHAT_URL 配置）
 *   2. 不可用时降级为内置规则引擎对话（NPC 人设 + 上下文感知回复）
 *
 * 约束：AI 仅生成对话文本，绝不绕过规则引擎发奖/修改游戏状态。
 */

const http = require('http');

// ── 配置 ────────────────────────────────────────────────────────────────────
const MNN_CHAT_URL = process.env.MNN_CHAT_URL || 'http://127.0.0.1:7860';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_HISTORY = 12; // 每个NPC最多保留的对话轮数
const MAX_REPLY_CHARS = 300; // 模型输出硬上限，防止超长输出拖垮 UI
const MAX_MESSAGE_CHARS = 400; // 玩家输入硬上限

// 同一 NPC 同时只允许一个在途 MNN 请求：重复点击立即回退规则引擎，
// 不排队、不阻塞、不产生竞态历史。
const inFlight = {};

// ── NPC 人设库 ──────────────────────────────────────────────────────────────
const NPC_PERSONAS = {
  // 掌门 — 高冷导师型
  master: {
    name: '清虚掌门',
    avatar: '🧙',
    systemPrompt: '你是修仙门派掌门清虚道人，说话高冷简短，偶尔关心弟子但嘴硬。用修仙术语，不超过50字。',
    greetings: ['又来为师这里了？', '修行不可懈怠。', '嗯，有事说。'],
    topics: {
      cultivate: '修炼之道在于坚持。你的修为尚浅，多打坐少摸鱼。',
      work: '上班即修行，搬砖即炼心。莫要抱怨。',
      promote: '渡劫非儿戏，道心不稳则万劫不复。你准备好了吗？',
      merge: '合成之道讲究机缘。低阶丹药合高阶，如同职场积累经验。',
      battle: '战斗是检验修行的试金石。出手要果断。',
      default: '为师不知你在说什么。专心修行吧。',
    },
  },
  // 师姐 — 温柔热心型
  senior: {
    name: '灵犀师姐',
    avatar: '👩‍🦰',
    systemPrompt: '你是师姐灵犀，温柔热心，喜欢鼓励师弟/师妹，偶尔八卦。说话亲切，不超过50字。',
    greetings: ['师弟来啦～', '今天修炼辛苦了吗？', '有什么不懂的问师姐呀！'],
    topics: {
      cultivate: '修炼要劳逸结合哦～不过你最近进步很大呢！',
      work: '上班虽然累，但工资可以买好多丹药呢！加油～',
      promote: '渡劫好可怕的…不过你一定没问题的！师姐相信你！',
      merge: '合成有诀窍的，多攒低阶材料，等双倍活动再合！',
      battle: '打不过就跑嘛，留得青山在！',
      default: '嗯嗯，师姐在听呢～',
    },
  },
  // 老板 — 压迫型反派
  boss: {
    name: '钱老板',
    avatar: '👨‍💼',
    systemPrompt: '你是黑心老板钱多多，满脑子KPI和压榨员工，说话阴阳怪气带威胁。不超过50字。',
    greetings: ['又摸鱼？KPI完成了吗？', '这个季度的业绩…哼。', '加班是福报，懂吗？'],
    topics: {
      cultivate: '上班时间修炼？你工资我扣定了！',
      work: '好好干活！别人都能996，你为什么不行？',
      promote: '想升职？先把这个月KPI做完再说！',
      merge: '合成效率太低了！别人一天合50个，你呢？',
      battle: '打赢了有奖金…打输了扣工资。你自己选。',
      default: '少废话，干活去！',
    },
  },
  // 智能助手 — 系统型
  assistant: {
    name: '小牛助手',
    avatar: '🤖',
    systemPrompt: '你是游戏智能助手小牛，帮助玩家了解游戏机制，给出实用建议。简洁友好，不超过60字。',
    greetings: ['你好！有什么可以帮你的？', '需要游戏攻略吗？', '随时问我游戏问题哦！'],
    topics: {
      cultivate: '点击修炼按钮获取修为。连续点击触发连击，连击越高暴击率越高(最高60%)！',
      work: '工作模式：上班赚工资，摸鱼回疲劳，加班多赚钱但伤身体。',
      promote: '晋升需要满足修为和KPI条件。道心≥30提升渡劫成功率。',
      merge: '合成3个同阶角色升阶。高阶角色工资和修为产出更高。',
      battle: '卡牌战斗：出牌攻击/防御，注意能量管理。击败Boss获稀有奖励。',
      default: '你可以在首页查看晋升进度卡片，或问我关于修炼/工作/合成/战斗的问题。',
    },
  },
};

// ── 对话记忆（短期在内存 + 长期持久化到 npc-memory.json） ────────────────────
// 短期: 最近对话轮（内存）。长期: 玩家概况/好感度/重要事件（磁盘）。
// 永远不把完整存档交给模型 —— 只交 facts 摘要行（≤160 字符）。
const conversations = {}; // { personaId: [{ role, content, ts }] }
const memory = {}; // { personaId: { summary, facts, affinity, notableEvents } }
let memoryDir = null;
let memorySaveTimer = null;

const MEMORY_FILE = function () { return require('path').join(memoryDir, 'xiuxian-save', 'npc-memory.json'); };
const MAX_FACTS = 24;
const MAX_NOTABLE = 20;
const MAX_SUMMARY_CHARS = 400;

function defaultMemory() {
  return { summary: '', facts: {}, affinity: 0, notableEvents: [], updatedAt: 0 };
}

function loadMemory() {
  if (!memoryDir) return;
  try {
    const raw = require('fs').readFileSync(MEMORY_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    Object.keys(parsed || {}).forEach(function (k) { memory[k] = parsed[k]; });
  } catch (e) { /* 首次运行或损坏时从空白开始 */ }
}

function saveMemory() {
  if (!memoryDir) return;
  if (memorySaveTimer) return;
  memorySaveTimer = setTimeout(function () {
    memorySaveTimer = null;
    try {
      const fs = require('fs');
      const file = MEMORY_FILE();
      fs.mkdirSync(require('path').dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(memory, null, 1));
      fs.renameSync(tmp, file);
    } catch (e) { /* 持久化失败不阻塞对话 */ }
  }, 1500);
}

/** 由 Electron 主进程调用：把长期记忆挂到隔离的用户数据目录。 */
function attachMemoryStore(userDataDir) {
  memoryDir = String(userDataDir || '');
  loadMemory();
}

function getMemory(personaId) {
  if (!memory[personaId]) memory[personaId] = defaultMemory();
  return memory[personaId];
}

function rememberContext(personaId, context) {
  if (!context || typeof context !== 'object') return;
  const mem = getMemory(personaId);
  const KEYS = ['profession', 'professionName', 'sect', 'realm', 'stage', 'chapter', 'level',
    'workHours', 'promoAllowed', 'fatigue', 'combo', 'kpi', 'wage', 'daoHeart'];
  KEYS.forEach(function (k) {
    if (context[k] !== undefined && context[k] !== null) mem.facts[k] = context[k];
  });
  const factKeys = Object.keys(mem.facts);
  if (factKeys.length > MAX_FACTS) {
    factKeys.slice(0, factKeys.length - MAX_FACTS).forEach(function (k) { delete mem.facts[k]; });
  }
}

/** 记录一段值得 NPC 长期记住的经历（由游戏在事件结算后调用）。 */
function rememberEvent(personaId, description) {
  const mem = getMemory(personaId);
  const text = String(description || '').slice(0, 120);
  if (!text) return { success: false };
  // 去重：同一事件文本只保留一条
  if (mem.notableEvents.indexOf(text) >= 0) return { success: true, duplicate: true };
  mem.notableEvents.push(text);
  if (mem.notableEvents.length > MAX_NOTABLE) mem.notableEvents.splice(0, mem.notableEvents.length - MAX_NOTABLE);
  saveMemory();
  return { success: true };
}

/** 好感度调整（-5..+5/次），持久化；影响问候语与规则引擎语气由上层决定。 */
function adjustAffinity(personaId, delta) {
  const mem = getMemory(personaId);
  const d = Math.max(-5, Math.min(5, Number(delta) || 0));
  mem.affinity = Math.max(-100, Math.min(100, (mem.affinity || 0) + d));
  saveMemory();
  return { success: true, affinity: mem.affinity };
}

function factsLine(personaId) {
  const mem = getMemory(personaId);
  const pairs = Object.keys(mem.facts).map(function (k) { return k + '=' + mem.facts[k]; });
  let line = pairs.join(' ');
  if (mem.summary) line = line + (line ? ' | ' : '') + '近期摘要: ' + mem.summary;
  if (line.length > 160) line = line.slice(0, 160);
  return line;
}

function getHistory(personaId) {
  if (!conversations[personaId]) conversations[personaId] = [];
  return conversations[personaId];
}

function pushHistory(personaId, role, content) {
  var hist = getHistory(personaId);
  // 去重：连续完全相同的用户发言折叠（防连点重复入库）
  var last = hist[hist.length - 1];
  if (last && last.role === role && last.content === content) {
    last.ts = Date.now();
    last.repeat = (last.repeat || 1) + 1;
    return;
  }
  hist.push({ role: role, content: content, ts: Date.now() });
  // 摘要折叠：溢出的早期轮次并入 summary（容量控制）
  while (hist.length > MAX_HISTORY) {
    var evicted = hist.shift();
    var mem = getMemory(personaId);
    var piece = (evicted.role === 'user' ? '问:' : '答:') + String(evicted.content).slice(0, 40);
    mem.summary = (mem.summary ? mem.summary + '；' : '') + piece;
    if (mem.summary.length > MAX_SUMMARY_CHARS) {
      mem.summary = '…' + mem.summary.slice(mem.summary.length - MAX_SUMMARY_CHARS);
    }
  }
  saveMemory();
}

// ── MNN-Pocket-0.3B HTTP 调用 ────────────────────────────────────────────────
function callMnnChat(persona, userMessage, history, personaId) {
  return new Promise(function (resolve, reject) {
    var systemContent = persona.systemPrompt;
    var profile = factsLine(personaId);
    if (profile) systemContent = systemContent + '\n(玩家概况: ' + profile + ')';
    var body = JSON.stringify({
      model: 'mnn-pocket-0.3b',
      messages: [{ role: 'system', content: systemContent }]
        .concat(history.slice(-6).map(function (m) { return { role: m.role, content: m.content }; }))
        .concat([{ role: 'user', content: userMessage }]),
      max_tokens: 120,
      temperature: 0.8,
    });
    var urlObj;
    try { urlObj = new URL(MNN_CHAT_URL + '/v1/chat/completions'); }
    catch (e) { return reject(new Error('bad MNN_CHAT_URL')); }
    var req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 7860,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: REQUEST_TIMEOUT_MS,
    }, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          var json = JSON.parse(data);
          var text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (text) resolve(text.trim());
          else reject(new Error('empty response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('timeout', function () { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── 降级：规则引擎回复 ──────────────────────────────────────────────────────
function ruleBasedReply(persona, userMessage, context) {
  var msg = (userMessage || '').toLowerCase();
  var topic = 'default';
  if (/修|炼|打坐|exp|修为/.test(msg)) topic = 'cultivate';
  else if (/工作|上班|搬砖|摸鱼|加班|工资|work/.test(msg)) topic = 'work';
  else if (/晋升|渡劫|升职|promote/.test(msg)) topic = 'promote';
  else if (/合成|升阶|merge|丹药/.test(msg)) topic = 'merge';
  else if (/战斗|打架|boss|卡牌|battle/.test(msg)) topic = 'battle';

  var base = persona.topics[topic] || persona.topics.default;

  // 上下文增强：如果玩家提供了游戏状态，追加针对性建议
  var suffix = '';
  if (context) {
    if (topic === 'promote' && context.promoAllowed) suffix = ' 对了，你现在就可以渡劫！';
    else if (topic === 'cultivate' && context.combo > 3) suffix = ' 你已经' + context.combo + '连击了，趁热打铁！';
    else if (topic === 'work' && context.fatigue > 70) suffix = ' 你疲劳度' + context.fatigue + '%了，注意休息啊。';
  }
  return base + suffix;
}

// ── 公开 API ────────────────────────────────────────────────────────────────

/** 检查 AI 服务可用性 */
async function getStatus() {
  return new Promise(function (resolve) {
    var req = http.request(
      MNN_CHAT_URL.replace(/\/$/, '') + '/health',
      { method: 'GET', timeout: 2000 },
      function (res) { resolve({ available: true, mode: 'mnn', url: MNN_CHAT_URL }); }
    );
    req.on('timeout', function () { req.destroy(); resolve({ available: false, mode: 'rule', url: MNN_CHAT_URL }); });
    req.on('error', function () { resolve({ available: false, mode: 'rule', url: MNN_CHAT_URL }); });
    req.end();
  });
}

/** NPC 对话 */
async function chat(personaId, userMessage, context) {
  var persona = NPC_PERSONAS[personaId] || NPC_PERSONAS.assistant;
  rememberContext(personaId, context);
  // 修复：必须在 push 之前对历史做快照。此前把 live 数组直接传给模型，
  // push 之后用户消息会出现两份（重复历史消息缺陷根因）。
  var historySnapshot = getHistory(personaId).slice();
  var safeMessage = sanitizeUserMessage(userMessage);
  pushHistory(personaId, 'user', safeMessage);

  var reply = '';
  var mode = 'rule';
  if (inFlight[personaId]) {
    // 并发保护：同 NPC 的在途请求未结束时直接走规则引擎，绝不排队挂起。
    reply = ruleBasedReply(persona, safeMessage, context);
    mode = 'rule-duplicate';
  } else {
    inFlight[personaId] = true;
    try {
      reply = await callMnnChat(persona, safeMessage, historySnapshot, personaId);
      mode = 'mnn';
    } catch (e) {
      reply = ruleBasedReply(persona, safeMessage, context);
      mode = 'rule';
    } finally {
      inFlight[personaId] = false;
    }
  }
  reply = String(reply || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, MAX_REPLY_CHARS);
  pushHistory(personaId, 'assistant', reply);
  return { reply: reply, mode: mode, persona: persona.name, avatar: persona.avatar };
}

/** 输入清洗：截断 + 去控制字符。模型仅产出文本，任何输入都无法改动游戏状态。 */
function sanitizeUserMessage(userMessage) {
  return String(userMessage == null ? '' : userMessage)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .slice(0, MAX_MESSAGE_CHARS);
}

/** 获取 NPC 列表 */
function getNpcList() {
  return Object.keys(NPC_PERSONAS).map(function (id) {
    var p = NPC_PERSONAS[id];
    return { id: id, name: p.name, avatar: p.avatar, greeting: p.greetings[0] };
  });
}

/** 获取 NPC 问候语 */
function getGreeting(personaId) {
  var persona = NPC_PERSONAS[personaId] || NPC_PERSONAS.assistant;
  var greetings = persona.greetings;
  return greetings[Math.floor(Math.random() * greetings.length)];
}

/** 清空对话记忆（含该 NPC 的长期记忆；不传 personaId 则全清） */
function clearHistory(personaId) {
  if (personaId) {
    delete conversations[personaId];
    delete memory[personaId];
  } else {
    Object.keys(conversations).forEach(function (k) { delete conversations[k]; });
    Object.keys(memory).forEach(function (k) { delete memory[k]; });
  }
  saveMemory();
  return { success: true };
}

module.exports = {
  getStatus, chat, getNpcList, getGreeting, clearHistory, NPC_PERSONAS,
  attachMemoryStore, rememberEvent, adjustAffinity, factsLine, getMemory,
};