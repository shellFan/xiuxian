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

// ── 对话记忆（内存级，进程重启清空） ────────────────────────────────────────
const conversations = {}; // { personaId: [{ role, content, ts }] }

function getHistory(personaId) {
  if (!conversations[personaId]) conversations[personaId] = [];
  return conversations[personaId];
}

function pushHistory(personaId, role, content) {
  var hist = getHistory(personaId);
  hist.push({ role: role, content: content, ts: Date.now() });
  // 裁剪到 MAX_HISTORY
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
}

// ── MNN-Pocket-0.3B HTTP 调用 ────────────────────────────────────────────────
function callMnnChat(persona, userMessage, history) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({
      model: 'mnn-pocket-0.3b',
      messages: [{ role: 'system', content: persona.systemPrompt }]
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
  var history = getHistory(personaId);
  pushHistory(personaId, 'user', userMessage);

  var reply = '';
  var mode = 'rule';
  try {
    reply = await callMnnChat(persona, userMessage, history);
    mode = 'mnn';
  } catch (e) {
    reply = ruleBasedReply(persona, userMessage, context);
    mode = 'rule';
  }
  pushHistory(personaId, 'assistant', reply);
  return { reply: reply, mode: mode, persona: persona.name, avatar: persona.avatar };
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

/** 清空对话记忆 */
function clearHistory(personaId) {
  if (personaId) delete conversations[personaId];
  else Object.keys(conversations).forEach(function (k) { delete conversations[k]; });
  return { success: true };
}

module.exports = { getStatus, chat, getNpcList, getGreeting, clearHistory, NPC_PERSONAS };