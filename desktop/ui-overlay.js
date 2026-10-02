/**
 * 牛马修仙传 — Web V1 DOM Overlay UI
 *
 * 视觉基准: docs/img/image5.png (11 屏概念图)
 * 通过 window.__GAME_FACADE__ 桥接 Cocos 游戏数据; Facade 缺席时进入演示模式。
 *
 * 屏幕: 首页/任务/合成/晋升 + 子页(宗门/排行榜/好友/成就/设置) + 弹窗(事件/广告/离线)
 */
;(function () {
  'use strict';

  /* ═════════════════════════════════════════════════════════
     §0. Constants
     ═════════════════════════════════════════════════════════ */

  var ASSET = 'ui-slice/';

  /* 底部导航（§52）：固定六项；合成收纳进「更多」（§54） */
  var NAV_TABS = [
    { id: 'HOME',        label: '首页', emoji: '🏠' },
    { id: 'TASKS',       label: '任务', emoji: '📜' },
    { id: 'PROJECT',     label: '项目', emoji: '⚔️' },
    { id: 'CULTIVATION', label: '修仙', emoji: '🧘' },
    { id: 'PROMOTION',   label: '晋升', emoji: '🏯' },
    { id: 'MORE',        label: '更多', emoji: '▦' },
  ];

  var PLAYER_NAME = '范大牛';

  /* V5.5 §75：任务页新分类——今日工作 / 修仙支线 / 临时塞活 */
  var TASK_TABS = [
    { type: 'WORK',        label: '今日工作' },
    { type: 'DAILY',       label: '今日工作·日常' },
    { type: 'CULTIVATION', label: '修仙支线' },
    { type: 'EVENT',       label: '临时塞活' },
  ];

  var TASK_TYPE_ICONS = { DAILY: '📅', WORK: '💼', CULTIVATION: '🧘', EVENT: '🎉' };

  /* 任务图标切片 */
  var TASK_ICONS = {
    task_daily_report: 'task-report',
    task_fix_bug: 'task-bug',
    task_paid_fish: 'task-fish',
    task_useless_meeting: 'task-meeting',
  };

  var CRAFT_TABS = [
    { id: 'pill',     label: '丹药', match: function (id) { return id.indexOf('pill_') === 0; } },
    { id: 'gongfa',   label: '功法', match: function (id) { return id.indexOf('talisman_') === 0 || id.indexOf('page_') === 0; } },
    { id: 'artifact', label: '法宝', match: function (id) { return id.indexOf('artifact_') === 0; } },
    { id: 'mat',      label: '材料', match: function () { return false; } },
  ];

  /* 配方图标: 材料(两种) → 产物 */
  var CRAFT_MATS = {
    pill:     ['mat-herb-a', 'mat-herb-b'],
    gongfa:   ['mat-scroll-a', 'mat-scroll-b'],
    artifact: ['mat-crystal-a', 'mat-ore-b'],
  };
  var CRAFT_RESULT = {
    pill_juqi: 'item-pill-juqi', pill_huichun: 'item-pill-huichun', page_gongfa: 'item-gongfa-book',
    pill_lingshen: 'item-pill-juqi', pill_juling: 'item-pill-juqi', pill_poxian: 'item-pill-juqi',
    talisman_salary: 'mat-scroll-a', talisman_mind: 'mat-scroll-b',
    artifact_lingpai: 'item-stone',
  };

  var SECT_IMAGES = { PRIVATE: 'sect-minying', FOREIGN: 'sect-waiqi', STATE: 'sect-guoqi', BIG_TECH: 'sect-dachang' };

  var FACE_IMAGES = ['face-zhangsan', 'face-xiaoshimei', 'face-tutou', 'face-ceshi'];

  var ACH_ICONS = ['ach-first-task', 'ach-fish', 'ach-overtime', 'ach-promo'];

  var QUOTES = [
    '“摸鱼不进法，修仙不内卷！”',
    '“上班也是渡劫，摸鱼便是炼气。”',
    '“老板画饼，我自吞霞。”',
    '“工位即洞府，日报即经文。”',
  ];

  var STAT_ICONS = {
    cultivation: ['💧', 'ico--blue'],
    salary:      ['💰', 'ico--gold'],
    performance: ['📈', 'ico--orange'],
    mind:        ['☯', 'ico--jade'],
    stone:       ['💎', 'ico--jade'],
  };

  var EFFECT_LABELS = { salary: '工资', performance: '绩效', cultivation: '修为', mind: '道心' };
  var MIND_LABELS = ['心魔缠身', '焦虑', '疲惫', '平静', '专注', '道心通明'];

  /* ═════════════════════════════════════════════════════════
     §1. Utilities
     ═════════════════════════════════════════════════════════ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtNum(n) {
    if (n == null || isNaN(Number(n))) return '0';
    n = Number(n);
    if (n >= 1e8) return trimZero((n / 1e8).toFixed(1)) + '亿';
    if (n >= 1e4) return trimZero((n / 1e4).toFixed(1)) + '万';
    if (n >= 1000) return n.toLocaleString('zh-CN');
    return String(Math.floor(n));
  }
  function trimZero(s) { return s.replace(/\.0$/, ''); }

  function pct(cur, req) {
    if (!req || req <= 0) return 0;
    return Math.min(100, Math.max(0, (cur / req) * 100));
  }

  function hms(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    return p2(h) + ':' + p2(m) + ':' + p2(s);
  }

  function fmtDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    if (seconds < 60) return seconds + '秒';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return h + '小时' + m + '分钟';
    return m + '分钟';
  }

  function img(name, cls, style) {
    return '<img src="' + ASSET + name + '.png" ' + (cls ? 'class="' + cls + '" ' : '') +
      (style ? 'style="' + style + '" ' : '') + 'alt="">';
  }

  function icon(statName, extraCls) {
    var def = STAT_ICONS[statName] || ['❓', 'ico--blue'];
    return '<span class="ico ' + def[1] + (extraCls ? ' ' + extraCls : '') + '">' + def[0] + '</span>';
  }

  /* 效果对象 → "修为 +15 道心 -8" */
  function effectText(effects) {
    if (!effects) return '';
    var parts = [];
    for (var key in EFFECT_LABELS) {
      if (!Object.prototype.hasOwnProperty.call(EFFECT_LABELS, key)) continue;
      var v = effects[key];
      if (!v) continue;
      var sign = v > 0 ? '+' : '';
      var cls = v > 0 ? 'val-pos' : 'val-neg';
      parts.push(EFFECT_LABELS[key] + ' <span class="' + cls + '">' + sign + v + '</span>');
    }
    return parts.join(' ');
  }

  function mindLabel(mind, maxMind) {
    if (!maxMind) return MIND_LABELS[0];
    var r = mind / maxMind;
    if (r <= 0.1) return MIND_LABELS[0];
    if (r <= 0.3) return MIND_LABELS[1];
    if (r <= 0.5) return MIND_LABELS[2];
    if (r <= 0.7) return MIND_LABELS[3];
    if (r <= 0.9) return MIND_LABELS[4];
    return MIND_LABELS[5];
  }

  function faceFor(seed) {
    return FACE_IMAGES[Math.abs(seed) % FACE_IMAGES.length];
  }

  /* ═════════════════════════════════════════════════════════
     §2. Data Layer — Facade bridge + Demo data
     ═════════════════════════════════════════════════════════ */

  var _facade = null;
  var _demoMode = false;
  var _unsubs = [];

  function facade() { return _facade || (window && window.__GAME_FACADE__) || null; }

  /* 演示数据 — Facade 未就绪时保证 11 屏完整可看 */
  var DEMO = {
    hud: {
      careerLevel: 1, careerName: '实习牛马', realm: '炼气一层', requiredExp: 100,
      salary: 288, performance: 35, cultivationExp: 166, spiritStones: 42,
      mind: 86, maxMind: 100, workMode: 'FISHING', kpiCompleted: 2, kpiTotal: 3,
      salaryEfficiency: 1.3, cultivationEfficiency: 1.2, isFishingMode: true,
    },
    kpi: {
      careerLevel: 1, allCompleted: false,
      items: [
        { type: 'MERGE_COUNT', target: 3, progress: 1, completed: false, description: '合成牛马 3 次' },
        { type: 'WORK_SECONDS', target: 300, progress: 210, completed: false, description: '累计工作 5 分钟' },
        { type: 'CULTIVATION', target: 50, progress: 50, completed: true, description: '修为达到 50' },
      ],
    },
    careerNext: { level: 2, name: '正式牛马', realm: '炼气三层' },
    tasks: {
      active: [
        { taskId: 'task_fix_bug', taskType: 'DAILY', name: '修复线上Bug', description: '紧急修复生产环境问题', durationSeconds: 30, startedAt: Date.now() - 12000, rewardSalary: 30, rewardCultivation: 60, rewardSpiritStones: 0, rewardPerformance: 15, rewardMind: -5, completed: false, claimed: false },
      ],
      configs: [
        { id: 'task_daily_report', type: 'DAILY', name: '写日报', description: '完成今天的工作日报', durationSeconds: 10, rewardSalary: 10, rewardCultivation: 30, rewardSpiritStones: 0, rewardPerformance: 5 },
        { id: 'task_paid_fish', type: 'DAILY', name: '带薪摸鱼', description: '合理摸鱼，恢复状态', durationSeconds: 15, rewardSalary: 0, rewardCultivation: 5, rewardSpiritStones: 0, rewardMind: 15 },
        { id: 'task_useless_meeting', type: 'DAILY', name: '参加无效会议', description: '听不懂但开完的会议', durationSeconds: 20, rewardSalary: 0, rewardCultivation: 0, rewardSpiritStones: 0, rewardPerformance: 10, rewardMind: -10 },
      ],
    },
    recipes: [
      { id: 'pill_juqi', name: '聚气丹', description: '修为+50，入门丹药', costCultivation: 100, costSpiritStones: 0, effect: { cultivation: 50 }, unlockCareerLevel: 1 },
      { id: 'pill_huichun', name: '回春丹', description: '道心+50，恢复状态', costCultivation: 150, costSpiritStones: 3, effect: { mind: 50 }, unlockCareerLevel: 1 },
      { id: 'pill_lingshen', name: '灵参丹', description: '修为+50，入门丹药', costCultivation: 100, costSpiritStones: 0, effect: { cultivation: 50 }, unlockCareerLevel: 1 },
      { id: 'pill_juling', name: '聚灵丹', description: '修为+200，中级丹药', costCultivation: 500, costSpiritStones: 10, effect: { cultivation: 200 }, unlockCareerLevel: 2 },
      { id: 'pill_poxian', name: '破仙丹', description: '修为+800，高级丹药', costCultivation: 2000, costSpiritStones: 50, effect: { cultivation: 800 }, unlockCareerLevel: 4 },
      { id: 'page_gongfa', name: '初级功法残页', description: '参悟后修为+400', costCultivation: 500, costSpiritStones: 10, effect: { cultivation: 400 }, unlockCareerLevel: 2 },
      { id: 'talisman_salary', name: '加薪符', description: '工资+100', costCultivation: 200, costSpiritStones: 5, effect: { salary: 100 }, unlockCareerLevel: 1 },
      { id: 'talisman_mind', name: '静心符', description: '道心+30', costCultivation: 150, costSpiritStones: 3, effect: { mind: 30 }, unlockCareerLevel: 1 },
      { id: 'artifact_lingpai', name: '灵牌', description: '绩效+50', costCultivation: 300, costSpiritStones: 15, effect: { performance: 50 }, unlockCareerLevel: 3 },
    ],
    craftedCount: {},
    promotion: { allowed: false, needsRetry: false, probability: 45 },
    sects: [
      { id: 'PRIVATE', name: '民企宗', modifiers: { salaryMultiplier: 1.15, cultivationMultiplier: 1, mindMultiplier: 0.9, performanceMultiplier: 1 } },
      { id: 'FOREIGN', name: '外企宗', modifiers: { salaryMultiplier: 1.05, cultivationMultiplier: 1, mindMultiplier: 1.15, performanceMultiplier: 1 } },
      { id: 'STATE', name: '国企宗', modifiers: { salaryMultiplier: 0.95, cultivationMultiplier: 1, mindMultiplier: 1, performanceMultiplier: 1, offlineGainMultiplier: 1.2 } },
      { id: 'BIG_TECH', name: '大厂宗', modifiers: { salaryMultiplier: 1, cultivationMultiplier: 1.2, mindMultiplier: 0.8, performanceMultiplier: 1 } },
    ],
    sectId: null,
    leaderboard: {
      playerRank: 23, totalEntries: 50,
      entries: [
        { rank: 1, name: '修仙的张三', sectName: '外企宗', careerLevel: 7, careerName: '元婴中期', cultivationExp: 82000, isPlayer: false },
        { rank: 2, name: '摸鱼王', sectName: '国企宗', careerLevel: 6, careerName: '金丹后期', cultivationExp: 68000, isPlayer: false },
        { rank: 3, name: '代码如来', sectName: '大厂宗', careerLevel: 6, careerName: '金丹中期', cultivationExp: 51000, isPlayer: false },
        { rank: 4, name: '产品秃头', sectName: '私企宗', careerLevel: 5, careerName: '补基后期', cultivationExp: 43000, isPlayer: false },
        { rank: 5, name: '测试小哥', sectName: '外企宗', careerLevel: 4, careerName: '筑基中期', cultivationExp: 39000, isPlayer: false },
        { rank: 23, name: PLAYER_NAME, sectName: '', careerLevel: 1, careerName: '炼气一层', cultivationExp: 168, isPlayer: true },
      ],
    },
    friends: {
      totalFriends: 4, onlineCount: 2, giftsToSend: 4, giftsToClaim: 0,
      friends: [
        { id: 'f1', name: '修仙的张三', sectName: '外企宗', careerLevel: 6, careerName: '金丹后期', cultivationExp: 51000, lastOnline: Date.now() - 120000, isOnline: true, giftSent: false, giftReceived: false },
        { id: 'f2', name: '摸鱼小师妹', sectName: '国企宗', careerLevel: 5, careerName: '筑基后期', cultivationExp: 22000, lastOnline: Date.now() - 3 * 3600000, isOnline: false, giftSent: false, giftReceived: false },
        { id: 'f3', name: '产品秃头', sectName: '大厂宗', careerLevel: 4, careerName: '筑气六层', cultivationExp: 12000, lastOnline: Date.now() - 26 * 3600000, isOnline: false, giftSent: false, giftReceived: false },
        { id: 'f4', name: '测试小哥', sectName: '私企宗', careerLevel: 3, careerName: '炼气三层', cultivationExp: 6000, lastOnline: Date.now() - 5 * 3600000, isOnline: false, giftSent: false, giftReceived: false },
      ],
    },
    achievements: [
      { id: 'FIRST_MERGE', name: '初入职场', description: '第一次完成任务', category: 'MERGE', condition: { type: 'KPI', target: 1 }, reward: { salary: 50 } },
      { id: 'MERGE_10', name: '摸鱼达人', description: '累计摸鱼10次', category: 'MERGE', condition: { type: 'KPI', target: 10 }, reward: { cultivation: 100 } },
      { id: 'MERGE_50', name: '加班战士', description: '累计完成50个任务', category: 'MERGE', condition: { type: 'KPI', target: 50 }, reward: { salary: 200 } },
      { id: 'PROMOTION_SUCCESS', name: '渡劫新星', description: '第一次晋升', category: 'PROMOTION', condition: { type: 'PROMOTION', target: 1 }, reward: { cultivation: 200 } },
    ],
    achStatus: { FIRST_MERGE: 'COMPLETED', MERGE_10: 'LOCKED', MERGE_50: 'LOCKED', PROMOTION_SUCCESS: 'LOCKED' },
    event: {
      id: 'EVENT_DEMAND_TODAY', type: 'CHOICE', title: '随机事件',
      description: '这个需求今天能上线吗？很简单的一个功能！',
      choices: [
        { id: 'A', text: 'A. 澄问题老板', effects: { performance: 10, mind: -10 } },
        { id: 'B', text: 'B. 风险比较大', effects: { performance: -3, mind: 8 } },
        { id: 'C', text: 'C. 先让产品确认一下', effects: null },
      ],
    },
    offline: { salary: 101, cultivationExp: 202, spiritStones: 15, elapsedSeconds: 12120, capped: false },
  };

  /* ── 数据读取 ── */

  function readHUD() {
    var f = facade();
    if (!f) { _demoMode = true; return DEMO.hud; }
    try {
      var s = f.snapshot();
      if (!s) return null;
      var career = f.queryCareer ? f.queryCareer() : null;
      var kpi = f.queryKpi ? f.queryKpi() : null;
      return {
        careerLevel: s.careerLevel,
        careerName: career ? career.name : '实习牛马',
        realm: career ? career.realm : '炼气一层',
        requiredExp: career ? career.requiredExp : 0,
        sectName: (function () { try { var sec = f.querySect ? f.querySect() : null; return sec ? sec.name : null; } catch (e) { return null; } })(),
        salary: s.salary, performance: s.performance,
        cultivationExp: s.cultivationExp, spiritStones: s.spiritStones,
        mind: s.mind, maxMind: s.maxMind,
        workMode: s.workMode, isFishingMode: s.isFishingMode,
        kpiCompleted: kpi ? kpi.items.filter(function (i) { return i.completed; }).length : 0,
        kpiTotal: kpi ? kpi.items.length : 0,
        salaryEfficiency: s.salaryEfficiency, cultivationEfficiency: s.cultivationEfficiency,
      };
    } catch (e) { console.warn('[UI] readHUD:', e); return null; }
  }

  function readKpi() {
    var f = facade();
    if (!f) return DEMO.kpi;
    try { return f.queryKpi(); } catch (e) { return DEMO.kpi; }
  }

  function readCareerAt(level) {
    var f = facade();
    if (!f) return level === DEMO.hud.careerLevel + 1 ? DEMO.careerNext : null;
    try { return f.queryCareerAt ? f.queryCareerAt(level) : null; } catch (e) { return null; }
  }

  function readTasks() {
    var f = facade();
    if (!f) { _demoMode = true; return DEMO.tasks; }
    try {
      return {
        active: f.queryActiveTasks ? f.queryActiveTasks() : [],
        configs: f.queryTaskConfigs ? f.queryTaskConfigs() : [],
      };
    } catch (e) { return DEMO.tasks; }
  }

  function readRemaining(taskId) {
    var f = facade();
    if (!f) {
      var t = null;
      DEMO.tasks.active.forEach(function (a) { if (a.taskId === taskId) t = a; });
      if (!t) return 0;
      return Math.max(0, t.durationSeconds - (Date.now() - t.startedAt) / 1000);
    }
    try { return f.queryTaskRemaining(taskId); } catch (e) { return 0; }
  }

  function readRecipes() {
    var f = facade();
    if (!f) { _demoMode = true; return DEMO.recipes; }
    try { return (f.queryAllCraftRecipes ? f.queryAllCraftRecipes() : []) || []; } catch (e) { return []; }
  }

  function readCanCraft(id) {
    var f = facade();
    if (!f) return { canCraft: true };
    try { return f.queryCanCraft(id) || { canCraft: false, reason: '不可炼制' }; } catch (e) { return { canCraft: false, reason: '不可炼制' }; }
  }

  function readCraftedCount(id) {
    var f = facade();
    if (!f) return DEMO.craftedCount[id] || 0;
    try { return f.queryCraftedCount ? f.queryCraftedCount(id) : 0; } catch (e) { return 0; }
  }

  function readPromotion() {
    var f = facade();
    if (!f) { _demoMode = true; return DEMO.promotion; }
    try {
      var check = f.queryPromotionCheck ? f.queryPromotionCheck() : { allowed: false };
      return {
        allowed: !!check.allowed,
        reason: check.reason || '',
        probability: f.queryPromotionProbability ? f.queryPromotionProbability() : 0,
        needsRetry: f.queryPromotionNeedsRetry ? f.queryPromotionNeedsRetry() : false,
        optionId: (f.queryPromotionOptions() || [{}])[0].id || '',
      };
    } catch (e) { return DEMO.promotion; }
  }

  function readSects() {
    var f = facade();
    if (!f) { _demoMode = true; return { sects: DEMO.sects, currentId: DEMO.sectId }; }
    try {
      var cur = f.querySect ? f.querySect() : null;
      return { sects: f.querySects() || [], currentId: cur ? cur.id : null };
    } catch (e) { return { sects: [], currentId: null }; }
  }

  function readLeaderboard() {
    var f = facade();
    if (!f) { _demoMode = true; return DEMO.leaderboard; }
    try { return f.queryLeaderboard(); } catch (e) { return DEMO.leaderboard; }
  }

  function readFriends() {
    var f = facade();
    if (!f) { _demoMode = true; return DEMO.friends; }
    try { return f.queryFriends(); } catch (e) { return DEMO.friends; }
  }

  function readAchievements() {
    var f = facade();
    if (!f) { _demoMode = true; return { configs: DEMO.achievements, status: DEMO.achStatus }; }
    try {
      var configs = f.queryAchievementConfigs() || [];
      var status = {};
      configs.forEach(function (c) { status[c.id] = f.queryAchievementStatus(c.id); });
      return { configs: configs, status: status };
    } catch (e) { return { configs: [], status: {} }; }
  }

  function readCurrentEvent() {
    var f = facade();
    if (!f) return null; // 演示模式不自动弹事件(可从"更多"里手动触发预览)
    try { return f.queryCurrentEvent ? f.queryCurrentEvent() : null; } catch (e) { return null; }
  }

  function readRates() {
    var hud = readHUD() || {};
    /* 每分钟收益: idle 配置的每小时基数 × 职级系数 × 效率 ÷ 60。
       基数与职级系数不直接暴露 — 用快照效率乘以保守基数演示。 */
    var baseSalary = 10 * Math.max(1, hud.careerLevel || 1);
    var baseCult = 5 * Math.max(1, hud.careerLevel || 1);
    return {
      salaryPerMin: (baseSalary * (hud.salaryEfficiency || 1)) / 60,
      cultivationPerMin: (baseCult * (hud.cultivationEfficiency || 1)) / 60,
    };
  }

  /* ═════════════════════════════════════════════════════════
     §3. Commands
     ═════════════════════════════════════════════════════════ */

  function cmd(name) {
    var f = facade();
    var args = Array.prototype.slice.call(arguments, 1);
    if (!f || typeof f[name] !== 'function') {
      console.warn('[overlay] command unavailable:', name);
      return;
    }
    try {
      var r = f[name].apply(f, args);
      if (r && typeof r.then === 'function') {
        r.then(function () { refresh(); }).catch(function (e) { toast(errMsg(e), 'error'); });
      } else if (name === 'cultivate' && r && r.cultivationExp !== undefined) {
        toast('修炼成功，修为 +' + r.cultivationExp, 'success');
        refresh();
      } else {
        refresh();
      }
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  function errMsg(e) { return (e && e.message) ? String(e.message) : '操作失败'; }

  /* 带结果提示的命令 */
  function cmdResult(name, okMsg) {
    var f = facade();
    var args = Array.prototype.slice.call(arguments, 2);
    if (!f || typeof f[name] !== 'function') { console.warn('[overlay] command unavailable:', name); return; }
    try {
      var r = f[name].apply(f, args);
      if (r && r.success === false) toast(r.reason || '操作失败', 'error');
      else toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'success');
      refresh();
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  /* ═════════════════════════════════════════════════════════
     §4. Toast
     ═════════════════════════════════════════════════════════ */

  function toast(msg, type) {
    var box = $('#ToastBox');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'ux-toast' + (type && type !== 'info' ? ' ux-toast--' + type : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('ux-toast--leaving');
      setTimeout(function () { el.remove(); }, 320);
    }, 2400);
  }

  /* ═════════════════════════════════════════════════════════
     §5. Popup system
     ═════════════════════════════════════════════════════════ */

  function popupLayer() { return $('#PopupLayer'); }

  var _startupWelcomePending = false;
  var _modalRedispatchScheduled = false;

  function scheduleModalRedispatch() {
    if (_modalRedispatchScheduled) return;
    _modalRedispatchScheduled = true;
    setTimeout(function () {
      _modalRedispatchScheduled = false;
      dispatchNextModal();
    }, 0);
  }

  function closePopup() {
    var layer = popupLayer();
    if (layer) layer.innerHTML = '';
    _adTimer && clearInterval(_adTimer); _adTimer = null;
    scheduleModalRedispatch();
  }

  function popupOpen() {
    var layer = popupLayer();
    return !!layer && layer.innerHTML !== '';
  }

  function markPresentation(kind) {
    var layer = popupLayer();
    var modal = layer && $('.ux-modal-layer', layer);
    if (modal) modal.setAttribute('data-presentation-kind', kind);
  }

  /*
   * One-shot arbitration over the current canonical Facade projections.
   * Candidates are rebuilt on every pass and are never retained or consumed here;
   * their owning services remain the sole source of truth.
   */
  function dispatchNextModal(requestedAttempt) {
    if (popupOpen()) return null;
    var f = facade();
    if (!f || typeof f.queryNextPresentation !== 'function') return null;
    var candidates = [];
    var incidentState = null;
    var decisions = null;
    var workplace = null;
    var canSettle = false;
    var weekend = null;
    var info = null;
    var battle = null;
    var finishedBattle = null;

    try { incidentState = f.queryIncidentState ? f.queryIncidentState() : null; } catch (e) { incidentState = null; }
    try { decisions = f.queryOfflineDecisions ? f.queryOfflineDecisions() : null; } catch (e) { decisions = null; }
    try { workplace = f.queryV2CurrentEvent ? f.queryV2CurrentEvent() : null; } catch (e) { workplace = null; }
    try { canSettle = !!(f.queryCanSettleDay && f.queryCanSettleDay()); } catch (e) { canSettle = false; }
    try {
      var msgBadge = f.queryMessengerBadge ? f.queryMessengerBadge() : null;
      if (msgBadge && msgBadge.hasCritical) {
        candidates.push({
          id: 'criticalmsg:' + msgBadge.criticalUnread, kind: 'CRITICAL_MESSAGE', projection: msgBadge,
          open: function () { if (V2 && typeof V2.maybeShowCriticalMessage === 'function') V2.maybeShowCriticalMessage(); else showDialog('📨 飞剑传书 · 关键消息', '事故群/老板有 <b>' + msgBadge.criticalUnread + '</b> 条未读，请进入飞剑传书处理。', [{ label: '知道了', cls: 'gold' }]); },
        });
      }
    } catch (e) { /* messenger badge failure must not block arbitration */ }
    try {
      var clock = f.queryGameClock ? f.queryGameClock() : null;
      var weekendOptions = f.queryWeekendOptions ? f.queryWeekendOptions() : null;
      var weekendChosen = f.queryWeekendChosen ? f.queryWeekendChosen() : true;
      if (clock && clock.isWeekend && !weekendChosen && weekendOptions && weekendOptions.length) weekend = weekendOptions;
    } catch (e) { weekend = null; }
    try { info = f.queryCurrentEvent ? f.queryCurrentEvent() : null; } catch (e) { info = null; }
    try { battle = f.queryBattle ? f.queryBattle() : null; } catch (e) { battle = null; }
    try { finishedBattle = f.queryFinishedBattle ? f.queryFinishedBattle() : null; } catch (e) { finishedBattle = null; }

    var activeIncident = incidentState && incidentState.active;
    if (activeIncident && activeIncident.severity === 'S1') {
      candidates.push({
        id: 'incident:' + activeIncident.id,
        kind: 'S1',
        projection: activeIncident,
        open: function () {
          showDialog('S1 生产事故', '<b>' + escHtml(activeIncident.type || activeIncident.id) + '</b><br>事故仍保留在正式状态中，请立即进入处置流程。', [
            { label: '立即处理', cls: 'gold' },
          ]);
        },
      });
    }
    if (_startupWelcomePending) {
      candidates.push({
        id: 'startup:welcome', kind: 'PENDING', projection: null,
        open: function () {
          _startupWelcomePending = false;
          showWelcomeBackPopup();
        },
      });
    }
    if (decisions && decisions.session && decisions.session.status === 'PENDING' && decisions.current) {
      candidates.push({ id: 'pending:' + decisions.current.id, kind: 'PENDING', projection: decisions.current, open: showOfflineDecisionPopup });
    }
    /* Promotion/tutorial participate only as an actual current UI attempt. */
    if (requestedAttempt && requestedAttempt.kind === 'PROMOTION') candidates.push(requestedAttempt);
    if (requestedAttempt && requestedAttempt.kind === 'TUTORIAL_CRITICAL') candidates.push(requestedAttempt);
    if (workplace) candidates.push({ id: 'workplace:' + workplace.id, kind: 'WORKPLACE', projection: workplace, open: function () { if (V2) V2.maybeShowV2EventModal(); } });
    if (canSettle || weekend) {
      candidates.push({
        id: canSettle ? 'daily:settlement' : 'daily:weekend', kind: 'DAILY', projection: canSettle ? f.queryGameDay() : weekend,
        open: function () { if (V2) { if (canSettle) V2.maybeShowSettlementModal(); else V2.maybeShowWeekendModal(); } },
      });
    }
    if (info || (battle && battle.skillOffers && battle.skillOffers.length) || finishedBattle) {
      candidates.push({
        id: info ? 'info:' + info.id : 'info:battle', kind: 'INFO', projection: info || finishedBattle || battle,
        open: function () { if (info) maybeShowEventPopup(); else maybeShowBattleModals(); },
      });
    }
    if (requestedAttempt && requestedAttempt.kind !== 'PROMOTION' && requestedAttempt.kind !== 'TUTORIAL_CRITICAL') candidates.push(requestedAttempt);

    var selected = f.queryNextPresentation(candidates);
    if (!selected) return null;
    selected.open();
    markPresentation(selected.kind);
    return selected.projection || null;
  }

  /* 通用对话框 */
  function showDialog(title, bodyHtml, actions) {
    var layer = popupLayer();
    if (!layer) return;
    var btns = (actions || []).map(function (a, i) {
      return '<button class="ux-btn ux-btn--' + (a.cls || 'gray') + ' ux-btn--md" data-idx="' + i + '">' + escHtml(a.label) + '</button>';
    }).join('');
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup ux-dialog">' +
          '<div class="ux-popup-card">' +
            '<div class="ux-dialog-title">' + escHtml(title) + '</div>' +
            '<div class="ux-dialog-body">' + bodyHtml + '</div>' +
            '<div class="ux-dialog-actions">' + btns + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    $$('.ux-dialog-actions .ux-btn', layer).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = (actions || [])[Number(b.dataset.idx)];
        closePopup();
        if (a && a.onClick) a.onClick();
      });
    });
  }

  /* 随机事件弹窗 */
  var _dismissedEventId = null;
  var _dismissedAt = 0;

  function maybeShowEventPopup() {
    if (popupOpen()) return;
    var ev = readCurrentEvent();
    if (!ev) return;
    if (ev.id === _dismissedEventId && Date.now() - _dismissedAt < 60000) return;

    var f = facade();
    var optionsHtml;
    if (ev.type === 'CHOICE' && Array.isArray(ev.choices) && ev.choices.length) {
      optionsHtml = '<div class="ux-event-options">' + ev.choices.map(function (c, i) {
        var eff = c.effects ? effectText(c.effects) : '<span style="color:var(--text-ink-muted)">随机结果</span>';
        var letter = String.fromCharCode(65 + i);
        return '<button class="ux-event-option" data-choice="' + escHtml(c.id) + '">' +
          '<span>' + escHtml(c.text.indexOf(letter) === 0 ? c.text : letter + '. ' + c.text) + '</span>' +
          '<span class="opt-effects">' + eff + '</span></button>';
      }).join('') + '</div>';
    } else {
      optionsHtml =
        '<div class="ux-event-options">' +
          '<div class="ux-event-option" style="justify-content:center">' + effectText(ev.effects) + '</div>' +
          '<button class="ux-btn ux-btn--gold ux-btn--md" id="EventOkBtn" style="width:100%">知道了</button>' +
        '</div>';
    }

    var layer = popupLayer();
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">' + escHtml(ev.title || '随机事件') + '</span>' +
            '<button class="ux-close" id="EventCloseBtn">✕</button>' +
          '</div>' +
          img('event-boss', 'ux-event-boss') +
          '<div class="ux-popup-card" style="margin-top:16px">' +
            '<div class="ux-event-bubble">' + escHtml(ev.description || '') + '</div>' +
            optionsHtml +
          '</div>' +
        '</div>' +
      '</div>';

    $('#EventCloseBtn').addEventListener('click', function () {
      _dismissedEventId = ev.id;
      _dismissedAt = Date.now();
      closePopup();
    });
    $$('.ux-event-option[data-choice]', layer).forEach(function (b) {
      b.addEventListener('click', function () {
        try { f.resolveEventChoice(ev.id, b.dataset.choice); } catch (e) { toast(errMsg(e), 'error'); }
        closePopup();
        toast('选择已确定', 'success');
        refresh();
      });
    });
    var okBtn = $('#EventOkBtn');
    if (okBtn) okBtn.addEventListener('click', function () {
      try { f.resolveEvent(ev.id); } catch (e) { toast(errMsg(e), 'error'); }
      closePopup();
      refresh();
    });
  }

  /* 广告弹窗 — 3 秒模拟播放倒计时后回调 */
  var _adTimer = null;

  function showAdPopup(options) {
    var layer = popupLayer();
    if (!layer) return;
    var seconds = 3;
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">广告弹窗</span>' +
            '<button class="ux-close" id="AdCloseBtn">✕</button>' +
          '</div>' +
          '<div class="ux-popup-card">' +
            '<div class="ux-ad-title">看广告获得双倍奖励</div>' +
            img('ad-cow', 'ux-ad-cow') +
            '<div class="ux-ad-status">广告播放中...</div>' +
            '<div class="ux-ad-count" id="AdCount">' + seconds + '</div>' +
            '<div class="ux-ad-note">看完广告可获得双倍奖励</div>' +
            '<div class="ux-ad-actions"><button class="ux-btn ux-btn--gray ux-btn--md" id="AdCancelBtn">取消</button></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      closePopup();
      options.onComplete && options.onComplete();
    }
    function cancel() {
      if (done) return;
      done = true;
      closePopup();
      try { facade() && facade().cancelRewardedAd && facade().cancelRewardedAd(); } catch (e) { /* noop */ }
      options.onCancel && options.onCancel();
    }
    $('#AdCloseBtn').addEventListener('click', cancel);
    $('#AdCancelBtn').addEventListener('click', cancel);
    _adTimer = setInterval(function () {
      seconds -= 1;
      var el = $('#AdCount');
      if (el) el.textContent = String(Math.max(0, seconds));
      if (seconds <= 0) finish();
    }, 900);
  }

  /* 离线收益弹窗 */
  function showOfflinePopup(settlementId) {
    var f = facade();
    if (!f) return;
    var p;
    try { p = f.queryOfflinePreview(settlementId); } catch (e) { return; }
    if (!p || !p.elapsedSeconds || p.elapsedSeconds < 60) return;
    if (f.queryOfflineIsSettled && f.queryOfflineIsSettled(settlementId)) return;

    var layer = popupLayer();
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">离线收益窗</span>' +
          '</div>' +
          '<div class="ux-popup-card">' +
            '<div class="ux-off-title">您已离线</div>' +
            '<div class="ux-off-duration">' + fmtDuration(p.elapsedSeconds) + '</div>' +
            '<div class="ux-off-sub">我们为您收集了修炼收益</div>' +
            '<div class="ux-off-rows">' +
              (p.cultivationExp > 0 ? '<div class="ux-off-row">' + icon('cultivation') + '<span class="rn">修为</span><span class="rv">+' + fmtNum(p.cultivationExp) + '</span></div>' : '') +
              (p.salary > 0 ? '<div class="ux-off-row">' + icon('salary') + '<span class="rn">工资</span><span class="rv">+' + fmtNum(p.salary) + '</span></div>' : '') +
              (p.spiritStones > 0 ? '<div class="ux-off-row">' + icon('stone') + '<span class="rn">灵石</span><span class="rv">+' + fmtNum(p.spiritStones) + '</span></div>' : '') +
            '</div>' +
            '<div class="ux-off-cap">离线收益最多累计 8 小时</div>' +
            '<div class="ux-off-actions">' +
              '<button class="ux-btn ux-btn--blue ux-btn--md" id="OffNormalBtn">正常领取</button>' +
              '<button class="ux-btn ux-btn--gold ux-btn--md" id="OffDoubleBtn">看广告 ×2</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    $('#OffNormalBtn').addEventListener('click', function () {
      try {
        var r = f.claimOfflineReward(settlementId);
        toast('离线收益已领取：修为 +' + fmtNum(r.cultivationExp), 'success');
      } catch (e) { toast(errMsg(e), 'error'); }
      closePopup();
      refresh();
    });
    $('#OffDoubleBtn').addEventListener('click', function () {
      showAdPopup({
        onComplete: function () {
          try {
            f.claimOfflineDouble(settlementId, function (ok) {
              toast(ok ? '双倍离线收益已领取！' : '广告未完成，收益保留', ok ? 'success' : 'error');
              refresh();
            });
          } catch (e) { toast(errMsg(e), 'error'); }
        },
      });
    });
  }

  /* 回归欢迎摘要。文案、模拟结果与决策会话全部由 Facade 提供。 */
  function showWelcomeBackPopup() {
    var f = facade();
    if (!f || typeof f.prepareWelcomeBackSummary !== 'function') return;
    var summary;
    try { summary = f.prepareWelcomeBackSummary(); } catch (e) { return; }
    if (!summary || !summary.settlementId || !summary.simulation) return;

    var simulation = summary.simulation;
    var decisions = summary.decisions || {};
    var session = decisions.session;
    var decisionRemaining = session && session.status === 'PENDING'
      ? Math.max(0, session.pendingEventIds.length - session.cursor)
      : 0;
    var pendingCount = Math.max(Number(simulation.pendingDecisionCount) || 0, decisionRemaining);
    /* 离线不足 60 秒且没有待决策内容时不弹简报——没有可领取或决策的事项。 */
    if ((simulation.effectiveSeconds || 0) < 60 && pendingCount === 0) return;
    var hasPending = decisionRemaining > 0 && !!decisions.current;
    var policyLabels = { NORMAL: '均衡', SAFE: '稳健', GRINDER: '卷王', SLACKER: '摸鱼' };
    var summaryRows = '' +
      '<div class="ux-welcome-summary-row"><span>有效时长</span><b>' + fmtDuration(simulation.effectiveSeconds) + (simulation.capped ? '（已封顶）' : '') + '</b></div>' +
      '<div class="ux-welcome-summary-row"><span>托管策略</span><b>' + escHtml(policyLabels[simulation.policyUsed] || simulation.policyUsed) + '</b></div>' +
      '<div class="ux-welcome-summary-row"><span>基础收益</span><b>工资 +' + fmtNum(simulation.salary) + ' · 修为 +' + fmtNum(simulation.cultivation) + ' · 灵石 +' + fmtNum(simulation.spiritStones) + '</b></div>' +
      '<div class="ux-welcome-summary-row"><span>离线活动</span><b>工作 ' + fmtDuration(simulation.workSeconds) + ' · 摸鱼 ' + fmtDuration(simulation.fishingSeconds) + ' · 修炼 ' + fmtDuration(simulation.cultivatingSeconds) + '</b></div>' +
      '<div class="ux-welcome-summary-row"><span>加班</span><b>' + fmtDuration(simulation.overtimeSeconds) + '</b></div>' +
      '<div class="ux-welcome-summary-row"><span>自动处理</span><b>事件 ' + fmtNum(simulation.eventsAutoResolved) + ' · 任务 ' + fmtNum(simulation.tasksCompleted) + '</b></div>' +
      '<div class="ux-welcome-summary-row"><span>待你决策</span><b>' + fmtNum(pendingCount) + ' 项</b></div>' +
      '<div class="ux-welcome-summary-row"><span>新增事故</span><b>' + fmtNum(simulation.incidentsRaised) + ' 起</b></div>';
    var layer = popupLayer();
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup ux-welcome-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">欢迎回来，牛马</span>' +
          '</div>' +
          '<div class="ux-welcome-scroll">' +
            '<div class="ux-popup-card">' +
              '<div class="ux-welcome-title">离线工作简报</div>' +
              '<div class="ux-welcome-line">' + escHtml(summary.welcomeLine.text) + '</div>' +
              '<div class="ux-welcome-summary">' + summaryRows + '</div>' +
      (welcomeMessengerLine(summary) || '') +
              '<div class="ux-welcome-policies">' +
                Object.keys(policyLabels).map(function (policy) {
                  return '<button class="ux-welcome-policy' + (simulation.policyUsed === policy ? ' is-active' : '') + '" data-policy="' + policy + '">' + policyLabels[policy] + '</button>';
                }).join('') +
              '</div>' +
              '<div class="ux-welcome-note">托管策略变更将在下次回归时生效；高风险破事仍由你亲自处理。</div>' +
              '<button class="ux-btn ux-btn--gold ux-btn--md ux-welcome-continue" id="WelcomeContinueBtn">' + (hasPending ? '领取并处理破事' : '继续上班') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

  /* V5：欢迎简报的飞剑传书摘要行（§94） */
  function welcomeMessengerLine(summary) {
    var f = facade();
    if (!f || typeof f.queryMessengerBadge !== 'function') return '';
    try {
      var messages = (f.context.player.messages ?? []);
      var away = summary.simulation && summary.simulation.effectiveSeconds ? summary.simulation.effectiveSeconds : 0;
      var received = messages.filter(function (m) { return away > 0; }).length;
      if (received <= 0) return '';
      return '<div class="ux-welcome-line" style="margin-top:10px">📨 离线期间飞剑传书已抵达 ' + received +
        ' 条；重要破事已进入待决策队列，S1 永远优先。</div>';
    } catch (e) { return ''; }
  }

  $$('.ux-welcome-policy', layer).forEach(function (button) {
      button.addEventListener('click', function () {
        var policy = button.getAttribute('data-policy');
        try {
          f.setAutoPolicy(policy);
          $$('.ux-welcome-policy', layer).forEach(function (candidate) { candidate.classList.remove('is-active'); });
          button.classList.add('is-active');
          toast('托管策略已保存，下次回归生效', 'success');
        } catch (e) { toast(errMsg(e), 'error'); }
      });
    });
    $('#WelcomeContinueBtn').addEventListener('click', function () {
      try {
        if ((!f.queryOfflineIsSettled || !f.queryOfflineIsSettled(summary.settlementId)) && simulation.effectiveSeconds > 0) {
          f.claimOfflineReward(summary.settlementId);
          toast('离线收益已领取', 'success');
        }
      } catch (e) {
        /* 领取失败（如离线时长过短）也必须关闭简报，绝不能把玩家卡在启动弹窗里 */
        toast(errMsg(e), 'error');
      }
      closePopup();
      refresh();
    });
  }

  /* 按持久游标逐条处理 canonical pendingEvents；关闭后再次打开会从当前游标恢复。 */
  function showOfflineDecisionPopup() {
    var f = facade();
    if (!f || typeof f.prepareOfflineDecisions !== 'function') return;
    var decisions;
    try { decisions = f.prepareOfflineDecisions(); } catch (e) { toast(errMsg(e), 'error'); return; }
    var session = decisions && decisions.session;
    var current = decisions && decisions.current;
    if (!session || session.status !== 'PENDING' || !current) {
      closePopup();
      refresh();
      return;
    }

    var positionText = (session.cursor + 1) + ' / ' + session.pendingEventIds.length;
    var kind = current.eventId.indexOf('incident:') === 0 ? '生产事故' : current.eventId.indexOf('task:') === 0 ? '紧急任务' : '待办决策';
    var actionText = current.eventId.indexOf('incident:') === 0 ? '接手事故' : current.eventId.indexOf('task:') === 0 ? '处理任务' : '确认并继续';
    var overflowText = decisions.overflowSummary
      ? '<div class="ux-welcome-overflow">另有 ' + fmtNum(decisions.overflowSummary.total) + ' 项排队中，将按优先级继续呈现。</div>'
      : '';
    var layer = popupLayer();
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup ux-welcome-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">处理破事</span>' +
          '</div>' +
          '<div class="ux-welcome-scroll">' +
            '<div class="ux-popup-card ux-welcome-decision">' +
              '<div class="ux-welcome-position">' + positionText + '</div>' +
              '<div class="ux-welcome-decision-kind">' + escHtml(kind) + ' · ' + escHtml(current.priority) + '</div>' +
              '<div class="ux-welcome-decision-id">' + escHtml(current.eventId) + '</div>' +
              '<div class="ux-welcome-decision-action">当前行动：' + escHtml(actionText) + '</div>' +
              overflowText +
              '<button class="ux-btn ux-btn--gold ux-btn--md ux-welcome-continue" data-offline-decision-action>' + escHtml(actionText) + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    $('[data-offline-decision-action]', layer).addEventListener('click', function () {
      try {
        var result = f.performOfflineDecision(current.id);
        if (!result || !result.success) toast('该事项状态已变化，正在恢复进度', 'error');
        closePopup();
        refresh();
      } catch (e) { toast(errMsg(e), 'error'); }
    });
  }

  /* ═════════════════════════════════════════════════════════
     §6. Page renderers
     ═════════════════════════════════════════════════════════ */

  /* ── 6a-0. 职业选择（V5.5 §12：选择你的牛马道途） ── */

  function professionSelected() {
    var f = facade();
    if (!f || typeof f.isProfessionSelected !== 'function') return true;
    try { return f.isProfessionSelected(); } catch (e) { return true; }
  }

  function renderProfessionSelect() {
    var f = facade();
    var views = f && typeof f.queryProfessions === 'function' ? (function () { try { return f.queryProfessions(); } catch (e) { return []; } })() : [];
    var cards = views.map(function (p) {
      var locked = p.locked;
      return '<button class="ux-prof-card ux-prof-card--' + escHtml(p.color) + (locked ? ' is-locked' : '') +
        '" data-choose-profession="' + escHtml(p.id) + '"' + (locked ? ' disabled' : '') + '>' +
        '<span class="pc-name">' + escHtml(p.name) + '</span>' +
        '<span class="pc-title">【' + escHtml(p.title) + '】</span>' +
        '<span class="pc-desc">' + escHtml(p.description) + '</span>' +
        '<span class="pc-traits">' + p.traits.map(function (t) { return '<i>' + escHtml(t) + '</i>'; }).join('') + '</span>' +
        (locked ? '<span class="pc-lock">敬请期待</span>' : (p.selected ? '<span class="pc-lock">当前职业</span>' : '')) +
      '</button>';
    }).join('');
    return '<div class="ux-prof-select">' +
      '<div class="ux-prof-head">选择你的牛马道途</div>' +
      '<div class="ux-prof-sub">职业决定你的怪物、技能、任务与 Build。选定后本轮不可更换。</div>' +
      '<div class="ux-prof-grid">' + cards + '</div>' +
      '<div class="ux-prof-note">检测到你多年搬砖经验，默认觉醒：Java后端·代码剑修。可免费更换一次。</div>' +
    '</div>';
  }

  /* ── 6a-1. 今日修仙目标（V5.5 §86~§94：Journey Guide / NextGoal） ── */

  function journeyGuideHtml() {
    var f = facade();
    if (!f || typeof f.queryNowGoal !== 'function') return '';
    var goals = [];
    try { goals = f.queryGoals() || []; } catch (e) { return ''; }
    var now = goals[0];
    var hookHtml = '';
    if (f && typeof f.queryTomorrowHook === 'function') {
      var hook = '';
      try { hook = f.queryTomorrowHook() || ''; } catch (e) { hook = ''; }
      if (hook) hookHtml = '<div class="ux-tomorrow-hook"><span class="th-label">明日预告</span>' + escHtml(hook) + '</div>';
    }
    if (!now) return hookHtml;
    var attrs = now.action === 'select'
      ? 'data-select-action="WORK"'
      : (now.page ? 'data-goto-page="' + escHtml(now.page) + '"' : '');
    return '<button class="ux-journey" ' + attrs + '>' +
      '<span class="jg-icon">' + now.icon + '</span>' +
      '<span class="jg-main"><b>' + escHtml(now.text) + '</b><i>' + escHtml(now.sub) + '</i></span>' +
      '<span class="jg-btn">' + escHtml(now.btn) + ' ›</span>' +
    '</button>' + hookHtml;
  }

  /* V5.6 §5.3：Today Capacity Widget */
  function todayCapacityHtml() {
    var f = facade();
    if (!f || typeof f.queryTodayCapacity !== 'function') return '';
    var cap = null;
    try { cap = f.queryTodayCapacity(); } catch (e) { return ''; }
    if (!cap) return '';
    var hm = function (m) { return Math.floor(m / 60) + 'h' + String(Math.round(m % 60)).padStart(2, '0') + 'm'; };
    return '<div class="ux-capacity' + (cap.overload ? ' overload' : '' ) + '">' +
      '<span class="cap-label">今日容量</span>' +
      '<span class="cap-item">剩余工时 <b>' + hm(cap.remainingWorkMinutes) + '</b></span>' +
      '<span class="cap-item">剩余计划 <b>' + hm(cap.remainingPlanMinutes) + '</b></span>' +
      '<span class="cap-item">预计下班 <b>' + cap.projectedOffWorkTime + '</b></span>' +
      (cap.overload ? '<span class="cap-warn">' + escHtml(cap.advice) + '</span>' : '') +
    '</div>';
  }
  /* ── 6a. 首页（方案 B：左右分栏 + 中央时间场景 + 动作选择器 + 动态详情） ── */


  /* V2 UI 桥接（ui-overlay-v2.js） */
  var V2 = null; // 由 initV2Bridge 在注入宿主后赋值（未 init 的 V2UI 缺少 H 工具）

  var _selectedAction = null; // 动作选择器选中项；null = 按当前状态推断默认（§88~§91）
  var _cultivateFx = null;    // 修炼点击反馈 { exp, mind, at }（§140~§143）

  /* 四个玩法入口（§23~§27）：选择器，不是展开器（§28） */
  var HOME_ACTIONS = [
    { id: 'WORK',        label: '努力工作', sub: '工资 +30%',   desc: '推进任务\n获得工资与绩效', emoji: '💼', img: 'task-report',      cls: 'blue' },
    { id: 'FISHING',     label: '带薪摸鱼', sub: '道心恢复',    desc: '公司也为你的\n修仙买单',   emoji: '🐟', img: 'task-fish',        cls: 'green' },
    { id: 'CULTIVATING', label: '修炼一次', sub: '修为 ×2.0',   desc: '引气入体\n提升修为境界',   emoji: '🧘', img: 'promo-cur',        cls: 'gold' },
    { id: 'SOCIAL',      label: '社交划水', sub: '人际关系 +2', desc: '喝杯咖啡\n和同事聊聊人生', emoji: '🍵', img: 'face-xiaoshimei',  cls: 'purple' },
  ];

  function renderHome() {
    var hud = readHUD();
    if (!hud) return emptyState('⏳', '加载中...', '正在唤醒游戏数据');
    if (!professionSelected()) return renderProfessionSelect();
    return '' +
      '<div class="ux-home">' +
        homeTopbarHtml(hud) +
        '<aside class="ux-home-col ux-home-left">' + homeLeftHtml(hud) + '</aside>' +
        '<main class="ux-home-col ux-home-center">' + homeCenterHtml(hud) + '</main>' +
        '<aside class="ux-home-col ux-home-right">' + homeRightHtml(hud) + '</aside>' +
      '</div>';
  }

  /* PC 首页顶栏（§4~§6）：品牌 / 日期·状态 / NPC 动态 / 快捷入口 */
  function homeTopbarHtml(hud) {
    var g = null;
    var f = facade();
    if (f && typeof f.queryGameClock === 'function') { try { g = f.queryGameClock(); } catch (e) { g = null; } }
    var dateText = '';
    var weekName = '';
    var stateText = '准备开工';
    if (g) {
      var nowDate = new Date();
      dateText = (nowDate.getMonth() + 1) + '月' + nowDate.getDate() + '日';
      weekName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][g.weekday] || '';
      if (g.isWeekend) stateText = '周末';
      else if (g.isWorkingHours) stateText = '上班中';
      else stateText = (g.hour >= 18) ? '已下班' : '未开工';
    }
    var pending = pendingIssueCount();
    return '<div class="ux-topbar">' +
      '<div class="ux-brand">' + img('brand-title', 'ux-brand-title') + '</div>' +
      '<div class="ux-topbar-date"><b>' + escHtml(dateText) + '</b><span>' + escHtml(weekName) +
        ' · ' + escHtml(hud.careerName || '') + ' · ' + escHtml(hud.realm || '') + '</span></div>' +
      '<span class="ux-topbar-state' + (g && g.isWorkingHours && !g.isWeekend ? ' is-working' : '') + '">' + escHtml(stateText) + '</span>' +
      '<div class="ux-topbar-npc"><span class="ux-topbar-npc-name">小师妹</span>' +
        '<span class="ux-topbar-npc-line">' + escHtml(npcDynamicLine(hud)) + '</span></div>' +
      (pending > 0 ? '<button class="ux-topbar-pending" data-action="openPending" title="点击处理">🚨 ' + pending + ' 件破事待处理</button>' : '') +
      '<nav class="ux-topbar-shortcuts">' +
        '<button class="ux-shortcut" data-action="openMessenger"><span class="sc-ico">📨</span><span>飞剑</span>' +
        (messengerBadgeCount() > 0 ? '<span class="ux-shortcut-badge">' + messengerBadgeCount() + '</span>' : '') + '</button>' +
        '<button class="ux-shortcut" data-nav="TASKS"><span class="sc-ico">📜</span><span>任务</span></button>' +
        '<button class="ux-shortcut" data-nav="PROJECT"><span class="sc-ico">⚔️</span><span>项目</span></button>' +
        '<button class="ux-shortcut" data-action="goto" data-page="npc"><span class="sc-ico">🧑‍🤝‍🧑</span><span>人际</span></button>' +
        '<button class="ux-shortcut" data-nav="CRAFT"><span class="sc-ico">🎒</span><span>背包</span></button>' +
        '<button class="ux-shortcut" data-action="settings"><span class="sc-ico">⚙️</span><span>设置</span></button>' +
      '</nav>' +
    '</div>';
  }

  /* 左栏（§8~§11）：一张角色卡 + 紧凑资源列表，不再用四个大方块 */
  function homeLeftHtml(hud) {
    var f = facade();
    var evidence = f && typeof f.queryEvidence === 'function' ? (function () { try { return f.queryEvidence(); } catch (e) { return []; } })() : [];
    var rates = readRates();
    var expReq = hud.requiredExp > 0 ? hud.requiredExp : 0;
    var expPct = expReq > 0 ? pct(hud.cultivationExp, expReq) : 100;
    var expNum = expReq > 0 ? fmtNum(hud.cultivationExp) + ' / ' + fmtNum(expReq) : fmtNum(hud.cultivationExp) + ' 修为';
    var sectName = hud.sectName || '散修';
    return '<div class="ux-card ux-charpanel">' +
      '<div class="ux-char-head">' +
        img('home-avatar', 'ux-char-avatar') +
        '<div class="ux-char-id">' +
          '<div class="ux-char-name">' + PLAYER_NAME + '</div>' +
          '<div class="ux-char-sub">' + escHtml(hud.careerName) + ' <b>Lv.' + hud.careerLevel + '</b></div>' +
          '<div class="ux-char-realm">' + escHtml(hud.realm) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ux-char-exp">' +
        '<div class="ux-progress"><div class="ux-progress-fill ux-progress-fill--blue" style="width:' + expPct + '%"></div></div>' +
        '<span class="ux-char-expnum">' + expNum + '</span>' +
      '</div>' +
      '<button class="ux-char-sect" data-action="goto" data-page="sect">宗门：' + escHtml(sectName) + '<span class="arr">›</span></button>' +
      '<div class="ux-char-quote">“' + escHtml(playerQuote(hud)) + '”</div>' +
      '<div class="ux-reslist">' +
        resRow('cultivation', '修为', fmtNum(hud.cultivationExp), '+' + rates.cultivationPerMin.toFixed(1) + '/分') +
        resRow('salary', '工资', '¥' + fmtNum(hud.salary), '+' + rates.salaryPerMin.toFixed(2) + '/分') +
        resRow('performance', '绩效', fmtNum(hud.performance), '') +
        resRow('mind', '道心', fmtNum(hud.mind) + '<small> / ' + fmtNum(hud.maxMind) + '</small>', '') +
      '</div>' +
      '<button class="ux-char-evidence" data-action="openModal" data-modal="evidence">🧾 证据袋 <b>' + evidence.length + '</b> 件<span class="arr">›</span></button>' +
    '</div>';
  }

  function resRow(stat, label, value, rate) {
    return '<div class="ux-res-row">' + icon(stat) +
      '<span class="rn">' + label + '</span>' +
      '<span class="rv">' + value + '</span>' +
      (rate ? '<span class="rr">' + rate + '</span>' : '<span class="rr"></span>') +
    '</div>';
  }

  /* 中栏（§12~§41）：时间场景 / 动作选择器 / 动作详情 */
  function homeCenterHtml(hud) {
    return workSceneHtml(hud) + v57situationChipHtml() + v57fatigueChipHtml() + todayCapacityHtml() + journeyGuideHtml() + actionSelectorHtml(hud) + actionDetailHtml(hud);
  }

  /* 中栏顶部：办公室场景 + 下班倒计时 + 今日已赚浮层（§12~§20） */
  function workSceneHtml(hud) {
    var f = facade();
    var view = null;
    if (f && typeof f.queryWorkToday === 'function') {
      try { view = f.queryWorkToday(); } catch (e) { view = null; }
    }
    if (!view) {
      view = { countdownMs: 5 * 60 * 1000, standardWorkSeconds: 7 * 3600 + 55 * 60, overtimeSeconds: 0, freeOvertimeSeconds: 0, paidFishingSalary: 0, timeline: [] };
    }
    var overtime = f && typeof f.queryOvertime === 'function' ? (function () { try { return f.queryOvertime(); } catch (e) { return null; } })() : null;
    var overtimeStatus = overtime ? { source: overtime.source, status: overtime.status, free: overtime.free } : null;
    if (f && typeof f.queryOvertimeStatus === 'function') {
      try { overtimeStatus = f.queryOvertimeStatus(); } catch (e) { /* retain active-session projection */ }
    }
    var g = f && typeof f.queryGameClock === 'function' ? (function () { try { return f.queryGameClock(); } catch (e) { return null; } })() : null;
    var rates = readRates();
    var day = f && typeof f.queryGameDay === 'function' ? (function () { try { return f.queryGameDay(); } catch (e) { return null; } })() : null;
    var income = day && day.income ? (day.income.salary || 0) : (hud.salaryToday != null ? hud.salaryToday : 0);

    var weekend = !!(g && g.isWeekend);
    var hour = g ? g.hour + g.minute / 60 : 12;
    var phase = weekend ? 'free' : hour >= 18 ? 'night' : hour >= 17.4 ? 'dusk' : (hour >= 12 && hour < 14) ? 'noon' : 'day';
    var preOffWork = !weekend && view.countdownMs > 0 && view.countdownMs <= 5 * 60 * 1000;
    var overtimeActive = !!(overtime && overtime.status === 'ACTIVE');

    /* 主标题（§14/§18~§20） */
    var headline;
    if (overtimeActive) {
      headline = '<div class="ux-scene-label">' + (overtime.free ? '免费加班已持续' : '带薪加班已持续') + '</div>' +
        '<div class="ux-scene-count">' + hms((overtime.free ? view.freeOvertimeSeconds : view.overtimeSeconds) || 0) + '</div>' +
        '<div class="ux-scene-sub">工资已经下班了，你还没有。</div>';
    } else if (weekend) {
      headline = '<div class="ux-scene-label">距离周一</div>' +
        '<div class="ux-scene-count">' + hms(timeUntilMondayMs() / 1000) + '</div>' +
        '<div class="ux-scene-sub">肉身自由。修仙不打卡。</div>';
    } else if (view.countdownMs <= 0) {
      headline = '<div class="ux-scene-label">今日工资已经停止增长</div>' +
        '<div class="ux-scene-sub">额外工资 <b>¥0.00</b> —— 先结算今天，再把工位还给夜色。</div>';
    } else {
      var passPct = Math.max(0, Math.min(100, Math.round((view.standardWorkSeconds || 0) / (8 * 3600) * 100)));
      headline = '<div class="ux-scene-label">距离下班还有</div>' +
        '<div class="ux-scene-count" id="WorkTodayCountdown">' + hms(view.countdownMs / 1000) + '</div>' +
        '<div class="ux-scene-sub">今天已熬过去 <b class="ux-scene-pct">' + passPct + '%</b></div>' +
        '<div class="ux-wt-bar"><i style="width:' + passPct + '%"></i></div>';
    }

    /* 今日已赚浮层（§16）：属于场景，不做大卡片 */
    var fishingPaid = view.paidFishingSalary || (day && day.settlementInputs ? day.settlementInputs.paidFishingSalary : 0) || 0;
    var earned = '<div class="ux-scene-earned">' +
      '<span class="lb">今日已赚</span>' +
      '<b>¥' + income.toFixed(2) + '</b>' +
      '<span class="r">+¥' + rates.salaryPerMin.toFixed(2) + ' / 分钟</span>' +
      '<span class="r">+¥' + (rates.salaryPerMin / 60).toFixed(3) + ' / 秒</span>' +
      '<span class="r">+¥' + (rates.salaryPerMin * 60).toFixed(2) + ' / 小时</span>' +
      (fishingPaid > 0 ? '<span class="r fishing">🐟 摸鱼入账 ¥' + fishingPaid.toFixed(2) + '</span>' : '') +
    '</div>';

    /* 今日局势 chips（§98~§102）：场景左上，最多 3 + N */
    var chips = '';
    if (V2) {
      var dungeonBanner = V2 && typeof V2.messengerIncidentBannerHtml === 'function' ? V2.messengerIncidentBannerHtml() : '';
      var sit = null;
      try { sit = f && typeof f.queryDailySituation === 'function' ? f.queryDailySituation() : null; } catch (e) { sit = null; }
      if (sit && sit.company) {
        var defs = [sit.company, sit.boss, sit.project, sit.personal].filter(function (d) { return d; });
        var shown = defs.slice(0, 3);
        chips = '<div class="ux-scene-chips">' +
          shown.map(function (d) {
            return '<span class="ux-sit-chip" title="' + escHtml(d.description || '') + '">' + escHtml(d.name) + '</span>';
          }).join('') +
          (defs.length > 3 ? '<span class="ux-sit-chip ux-sit-chip--more" title="' + defs.slice(3).map(function (d) { return escHtml(d.name); }).join('、') + '">+' + (defs.length - 3) + '</span>' : '') +
        '</div>';
      }
    }

    /* 底部操作条（§103~§107）：加班/结算按钮只在对应时段出现 */
    var stripLeft = '<span class="ux-status-ribbon">' + escHtml(homeStatusText(hud)) + '</span>';
    var stripRight = '';
    if (overtime && overtime.status === 'OFFERED') {
      stripRight = '<button class="ux-btn ux-btn--blue ux-btn--sm" data-action="acceptFreeOvertime">接受加班</button>' +
        '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="declineOvertime">婉拒，准时下班</button>';
    } else if (overtimeActive) {
      stripRight = '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="finishOvertime">结束加班</button>';
    } else if (preOffWork && overtimeStatus && overtimeStatus.status === 'COMPLETED') {
      stripRight = '<button class="ux-btn ux-btn--gray ux-btn--sm" disabled>加班询问已处理</button>';
    } else if (preOffWork) {
      stripRight = '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="requestFreeOvertime">处理加班询问</button>';
    } else if (!weekend && view.countdownMs <= 0) {
      stripRight = f && typeof f.queryCanSettleDay === 'function' && f.queryCanSettleDay()
        ? '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="doSettle">查看今日结算</button>'
        : '<button class="ux-btn ux-btn--gray ux-btn--sm" disabled>今日已结算</button>';
    } else if (weekend) {
      stripRight = '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="voluntaryOvertime">主动渡劫（加班 2h）</button>';
    } else {
      stripRight = '<span class="ux-idle-timer">今日挂机 <b>' + hms(sessionSeconds()) + '</b></span>';
    }

    /* 项目进行中 → 场景横幅入口（首页保持干净，战场在项目页） */
    var battleBanner = '';
    if (f && typeof f.queryBattle === 'function') {
      var run = null;
      try { run = f.queryBattle(); } catch (e) { run = null; }
      if (run) {
        battleBanner = '<button class="ux-scene-battle" data-action="goto" data-page="project">⚔ 项目攻坚中 · 第 ' + (run.wave + 1) + '/' + run.waveTotal +
          ' 波 · Lv' + run.level + ' · 击杀 ' + run.kills + '<span class="arr">进入现场 ›</span></button>';
      }
    }

    return '<section class="ux-work-today ux-scene ux-scene--' + phase + (_cultivateFx && Date.now() - _cultivateFx.at < 2600 ? ' ux-scene--blessing' : '') + '">' +
      chips + earned + dungeonBanner + battleBanner + tutorialHintHtml() +
      '<div class="ux-scene-main">' + headline + '</div>' +
      '<div class="ux-scene-strip">' + stripLeft + '<div class="ux-scene-strip-actions">' + stripRight + '</div></div>' +
    '</section>';
  }

  /* 中栏第二层：四个动作卡 = 选择器（§21~§30） */
  function selectedActionKey(hud) {
    if (_selectedAction) return _selectedAction;
    var mode = hud.workMode || 'WORK';
    for (var i = 0; i < HOME_ACTIONS.length; i++) if (HOME_ACTIONS[i].id === mode) return mode;
    return 'WORK';
  }

  function actionSelectorHtml(hud) {
    var sel = selectedActionKey(hud);
    var running = hud.workMode || 'WORK';
    return '<div class="ux-actions">' + HOME_ACTIONS.map(function (a) {
      var isRunning = a.id === running;
      return '<button type="button" class="ux-action ux-action--' + a.cls +
        (a.id === sel ? ' is-selected' : '') + (isRunning ? ' is-running' : '') +
        '" data-select-action="' + a.id + '">' +
        '<span class="ux-action-art">' + (a.img ? img(a.img) : a.emoji) + '</span>' +
        '<span class="ux-action-title">' + a.label + '</span>' +
        '<span class="ux-action-sub">' + a.sub + '</span>' +
        '<span class="ux-action-desc">' + a.desc.replace('\n', '，') + '</span>' +
        (isRunning ? '<span class="ux-action-running">' + (a.id === 'WORK' ? '搬砖中' : '进行中') + '</span>' : '') +
      '</button>';
    }).join('') + '</div>';
  }

  /* 中栏第三层：动态详情面板（§30~§42），统一 ViewModel 渲染（§127~§129） */
  function actionDetailHtml(hud) {
    var key = selectedActionKey(hud);
    var m = actionDetailModel(key, hud);
    var tags = m.tags.map(function (t) { return '<span class="ux-detail-tag">' + escHtml(t) + '</span>'; }).join('');
    var rewards = m.rewards.map(function (r) {
      return '<span class="ux-detail-reward">' + icon(r[0]) + ' ' + escHtml(r[1]) + ' <b>' + escHtml(r[2]) + '</b></span>';
    }).join('');
    return '<section class="ux-detail ux-detail--' + m.cls + '" data-detail-type="' + key + '">' +
      '<div class="ux-detail-art">' + (m.img ? img(m.img) : m.emoji) + '</div>' +
      '<div class="ux-detail-main">' +
        '<div class="ux-detail-head"><span class="ux-detail-title">' + escHtml(m.title) + '</span>' + tags +
          '<span class="ux-detail-state">' + escHtml(m.stateText) + '</span></div>' +
        '<div class="ux-detail-desc">' + escHtml(m.desc) + '</div>' +
        (m.body ? '<div class="ux-detail-body">' + m.body + '</div>' : '') +
        (rewards ? '<div class="ux-detail-rewards">' + rewards + '</div>' : '') +
      '</div>' +
      '<div class="ux-detail-side">' +
        detailButton(m.primary, 'gold') +
        detailButton(m.secondary, 'blue') +
        (m.note ? '<div class="ux-detail-note">' + escHtml(m.note) + '</div>' : '') +
      '</div>' +
      cultivateFxHtml() +
    '</section>';
  }

  function detailButton(btn, cls) {
    if (!btn) return '';
    if (btn.disabled) {
      return '<button type="button" class="ux-btn ux-btn--gray ux-btn--md" disabled title="' + escHtml(btn.reason || '暂时不可用') + '">' + escHtml(btn.label) + '</button>' +
        (btn.reason ? '<div class="ux-detail-why">' + escHtml(btn.reason) + '</div>' : '');
    }
    var attrs = 'data-action="' + escHtml(btn.action) + '"';
    if (btn.arg != null) attrs += ' data-mode="' + escHtml(btn.arg) + '"';
    if (btn.page != null) attrs += ' data-page="' + escHtml(btn.page) + '"';
    return '<button type="button" class="ux-btn ux-btn--' + (btn.cls || cls) + ' ux-btn--md" ' + attrs + '>' + escHtml(btn.label) + '</button>';
  }

  function tryQuery(name) {
    var f = facade();
    if (!f || typeof f[name] !== 'function') return null;
    try { return f[name](); } catch (e) { return null; }
  }

  function actionDetailModel(key, hud) {
    var mode = hud.workMode || 'WORK';
    var rates = readRates();
    var base = {
      WORK: {
        cls: 'blue', emoji: '💼', img: 'task-report', title: '努力工作', tags: ['事业', '稳定收入'],
        desc: '推进手头任务，工资与绩效稳步入账。老板的目光 +1。',
        rewards: [['salary', '预计工资', '¥' + rates.salaryPerMin.toFixed(2) + '/分'], ['performance', '结算方式', '随任务与事件入账']],
      },
      FISHING: {
        cls: 'green', emoji: '🐟', img: 'task-fish', title: '带薪摸鱼', tags: ['修仙', '道心回复'],
        desc: '摸鱼养性，游刃有余。公司将为本次修仙支付工资。',
        rewards: [['mind', '道心回复', '+36/小时'], ['salary', '带薪收入', '¥' + (rates.salaryPerMin * 0.6).toFixed(2) + '/分']],
      },
      CULTIVATING: {
        cls: 'gold', emoji: '🧘', img: 'promo-cur', title: '修炼一次', tags: ['修仙', '内卷自救'],
        desc: '引气入体，感受仙气流转，在工位上也能突破。（消耗少量时间，获得修为与道心）',
        rewards: [['cultivation', '预计修为', '+2~6'], ['mind', '预计道心', '+1']],
      },
      SOCIAL: {
        cls: 'purple', emoji: '🍵', img: 'face-xiaoshimei', title: '社交划水', tags: ['人际', '茶水间'],
        desc: '泡杯茶，和同事交换情报。道心平稳回复，关系靠事件升温。',
        rewards: [['mind', '道心回复', '+24/小时'], ['salary', '带薪收入', '¥' + (rates.salaryPerMin * 0.5).toFixed(2) + '/分']],
      },
    }[key];
    var m = JSON.parse(JSON.stringify(base));
    m.stateText = { WORK: '未在状态', FISHING: '未在状态', CULTIVATING: '可修炼', SOCIAL: '未在状态' }[key];

    if (key === 'WORK') {
      var assigned = tryQuery('queryAssignedTasks');
      var top = assigned && assigned.top && assigned.top[0];
      if (mode === 'WORK') {
        m.stateText = '正在搬砖';
        m.primary = { label: '保持专注', disabled: true, reason: '当前已是工作状态' };
      } else {
        m.primary = { label: '开始工作', action: 'mode', arg: 'WORK' };
      }
      m.secondary = top
        ? { label: '进入项目', action: 'projectEntry' }
        : { label: '看看今日待办', action: 'gotoTasks' };
      m.body = top
        ? '当前塞来的活：<b>' + escHtml(top.title) + '</b>（' + escHtml(top.priority) + ' · ' + escHtml(sourceName(top.source)) + '）'
        : '暂时没人塞活。这是暴风雨前的宁静，警惕。';
      m.note = '工资按 1.3× 结算；道心 -12/小时，注意休息。';
    } else if (key === 'FISHING') {
      var view = tryQuery('queryWorkToday') || {};
      var fishingPaid = view.paidFishingSalary || 0;
      if (mode === 'FISHING') {
        m.stateText = '带薪摸鱼中';
        m.body = '🐟 本次摸鱼已入账 <b>¥' + fishingPaid.toFixed(2) + '</b> · 当前道心 <b>' + fmtNum(hud.mind) + '/' + fmtNum(hud.maxMind) + '</b>';
        m.primary = { label: '收心工作', action: 'mode', arg: 'WORK' };
        m.rewards = [['mind', '本次道心', '持续回复中'], ['salary', '本次工资', '¥' + fishingPaid.toFixed(2)]];
      } else if (hud.mind >= hud.maxMind) {
        m.primary = { label: '开始摸鱼', disabled: true, reason: '道心已满，此刻无需摸鱼' };
      } else {
        m.primary = { label: '开始摸鱼', action: 'mode', arg: 'FISHING' };
      }
      m.secondary = { label: '处理待办', action: 'gotoTasks' };
      m.note = '工资按 0.6× 结算；道心 +36/小时。';
    } else if (key === 'CULTIVATING') {
      var cd = cooldownOf('cultivate');
      if (mode === 'CULTIVATING') m.stateText = '工位悟道中';
      if (cd > 0) {
        m.primary = { label: '冷却中 ' + Math.ceil(cd) + 's', disabled: true, reason: '气息未平，稍候再战' };
      } else {
        m.primary = { label: '开始修炼', action: 'cultivate' };
      }
      m.secondary = mode === 'CULTIVATING'
        ? { label: '修炼中 ×2.0', disabled: true, reason: '挂机修炼状态进行中' }
        : { label: '进入修炼状态', action: 'mode', arg: 'CULTIVATING' };
      m.note = '修炼状态：修为 ×2.0、工资 ×0.3；单击修炼立即结算。';
    } else if (key === 'SOCIAL') {
      var rels = tryQuery('queryNpcViews') || [];
      var best = rels.slice().sort(function (a, b) { return (b.relationship || 0) - (a.relationship || 0); })[0];
      var g = tryQuery('queryGameClock');
      if (mode === 'SOCIAL') {
        m.stateText = '茶水间论道中';
        m.body = rels.length
          ? '在座：' + rels.slice(0, 3).map(function (n) { return escHtml(n.name) + '（' + escHtml(n.stageLabel) + '）'; }).join(' · ')
          : '茶水间只剩你和咖啡机。';
        m.primary = { label: '回到工位', action: 'mode', arg: 'WORK' };
      } else if (g && g.isWeekend) {
        m.primary = { label: '社交划水', disabled: true, reason: '周末没人上班，同事都在闭关' };
      } else {
        m.primary = { label: best ? '找' + best.name + '喝咖啡' : '开始社交划水', action: 'mode', arg: 'SOCIAL' };
      }
      m.secondary = { label: '人际详情', action: 'goto', page: 'npc' };
      m.body = m.body || (rels.length
        ? '今日可交流：' + rels.slice(0, 3).map(function (n) { return escHtml(n.name) + '（' + escHtml(n.stageLabel) + '）'; }).join(' · ')
        : '办公室静悄悄，都在开会。');
      m.note = '道心 +24/小时；人际关系随事件选择变化。';
    }
    return m;
  }

  /* 修炼点击反馈（§140~§143）：详情区轻量 +N 动画，数字由 facade 返回 */
  function cultivateFxHtml() {
    if (!_cultivateFx || Date.now() - _cultivateFx.at >= 4000) return '';
    return '<div class="ux-detail-fx"><span class="fx-chip">💧 修为 +' + _cultivateFx.exp + '</span><span class="fx-chip">☯ 道心 +1</span></div>';
  }

  /* 教程 V2 软引导（桌面桥接）：只读展示当前步骤，文案随服务状态更新，绝不拦截输入 */
  var TUTORIAL_HINTS = {
    WELCOME: '欢迎入职牛马修仙传！白天上班，晚上渡劫——先活过今天。',
    FIRST_WORK: '点「努力工作」开始搬砖，赚取工资与修为。',
    FIRST_FISH: '试试「带薪摸鱼」，公司为你的道心买单。',
    FIRST_CULTIVATE: '点「开始修炼」，工位上也能引气入体。',
    FIRST_TASK: '打开「任务」，接下第一个真实任务。',
  };

  function tutorialHintHtml() {
    var t = null;
    var f = facade();
    if (f && typeof f.queryTutorial === 'function') {
      try { t = f.queryTutorial(); } catch (e) { t = null; }
    }
    if (!t || t.isCompleted) return '';
    var copy = TUTORIAL_HINTS[t.currentStep];
    if (!copy) return '';
    return '<div class="ux-tutorial-hint" data-tutorial-hint data-step="' + escHtml(t.currentStep) + '">' +
      '<span class="tag">新手引导</span><span class="txt">' + escHtml(copy) + '</span></div>';
  }

  /* ── V4 项目战斗（自动攻击引擎的可见层） ── */
  /* V5.5 §15~§25：项目攻坚三栏战斗（左：玩家/中：敌人/右：项目信息 + 底部日志/技能） */
  function battleSkillCn(id) {
    var def = battleSkillDef(id);
    return def ? def.name : id;
  }

  function materialCn(id) {
    var f = facade();
    var name = null;
    if (f && typeof f.queryMaterialName === 'function') {
      try { name = f.queryMaterialName(id); } catch (e) { name = null; }
    }
    return name || id;
  }

  function battleHtml() {
    var f = facade();
    var run = f && typeof f.queryBattle === 'function' ? (function () { try { return f.queryBattle(); } catch (e) { return null; } })() : null;
    if (!run) return '';
    var profDef = f && typeof f.queryProfessionDef === 'function' ? (function () { try { return f.queryProfessionDef(); } catch (e) { return null; } })() : null;
    var profName = profDef ? profDef.name + ' · ' + profDef.title : '未觉醒';
    // V5.7：Build / 道法共鸣 / 进化标识（§114）
    var buildName = '';
    var synChips = '';
    var evoChips = '';
    try {
      var builds = f.queryBattleBuildOptions ? f.queryBattleBuildOptions() : [];
      var bDef = builds.filter(function (b) { return b.id === run.buildId; })[0];
      buildName = bDef ? bDef.name : run.buildId;
      var syns = f.querySynergies ? f.querySynergies() : [];
      var activeIds = new Set(run.synergies || []);
      synChips = syns.filter(function (s) { return activeIds.has(s.id); })
        .map(function (s) { return '<span class="ux-bt-syn" title="' + escHtml(s.desc) + '">✦ ' + escHtml(s.name) + '</span>'; }).join('');
      var evoMap = f.querySkillEvolutions ? f.querySkillEvolutions() : {};
      evoChips = (run.evolvedSkills || []).map(function (id) { return '<span class="ux-bt-evo">✧ ' + escHtml(id) + '</span>'; }).join('');
      void evoMap;
    } catch (e) { /* chips best-effort */ }

    // 左栏：玩家
    var hpPct = Math.max(0, Math.min(100, Math.round(run.playerHp / run.playerMaxHp * 100)));
    var playerCol =
      '<div class="ux-bt-col ux-bt-player">' +
        '<div class="ux-bt-label">侠士</div>' +
        '<div class="ux-bt-player-name">' + escHtml(profName) + '</div>' +
        '<div class="ux-bt-player-level">Lv.' + run.level + '<small>' + run.exp + '/' + run.expNext + ' exp</small></div>' +
        '<div class="ux-bt-hpbar"><i style="width:' + hpPct + '%"></i><span>' + Math.round(run.playerHp) + '/' + run.playerMaxHp + '</span></div>' +
        (run.shield > 0 ? '<div class="ux-bt-shield">🛡 护盾 ' + run.shield + '</div>' : '') +
        '<div class="ux-bt-stats">攻 ' + run.attack + ' · 攻速 ' + Number(run.intervalSec).toFixed(1) + 's · 暴击 ' + Math.round(run.critChance * 100) + '%</div>' +
      '</div>';

    // 中栏：敌人卡 + 飘字容器
    var enemies = (run.enemies || []).filter(function (e) { return e.hp > 0; }).map(function (e) {
      var pct = Math.max(0, Math.min(100, Math.round(e.hp / e.maxHp * 100)));
      var bossCls = e.tier === 'BOSS' ? ' is-boss' : e.tier === 'ELITE' ? ' is-elite' : '';
      var mech = e.mechanic === 'SLOW' ? ' · 减速' : e.mechanic === 'SUMMON' ? ' · 召唤' : e.mechanic === 'SUMMON_SMALL' ? ' · 召唤' : '';
      return '<div class="ux-bt-enemy' + bossCls + '" data-enemy-uid="' + escHtml(e.uid) + '">' +
        '<span class="ux-bt-enemy-face">' + (e.tier === 'BOSS' ? '👹' : e.tier === 'ELITE' ? '👺' : '🐛') + '</span>' +
        '<span class="ux-bt-enemy-name">' + escHtml(e.name) + (bossCls ? ' ⚠' : '') + escHtml(mech) + '</span>' +
        '<span class="ux-bt-enemy-hp"><i style="width:' + pct + '%"></i><em>' + Math.round(e.hp) + '/' + e.maxHp + '</em></span>' +
        '<span class="ux-float-layer"></span>' +
      '</div>';
    }).join('') || '<div class="ux-bt-clearing">这一波清空了，下一波马上来……</div>';

    // 右栏：项目信息
    var wavePct = Math.round((run.wave / run.waveTotal) * 100);
    var lootRows = [];
    var mats = run.loot ? run.loot.materials : {};
    Object.keys(mats).forEach(function (id) { lootRows.push('📜 ' + escHtml(materialCn(id)) + ' ×' + mats[id]); });
    (run.loot ? run.loot.equipment : []).forEach(function (id) { lootRows.push('🎽 ' + escHtml(materialCn(id))); });
    if (run.loot && run.loot.spiritStones) lootRows.push('💎 灵石 ×' + run.loot.spiritStones);
    var projectCol =
      '<div class="ux-bt-col ux-bt-project">' +
        '<div class="ux-bt-label">项目</div>' +
        '<div class="ux-bt-wavebar"><i style="width:' + wavePct + '%"></i><span>第 ' + (run.wave + 1) + '/' + run.waveTotal + ' 波</span></div>' +
        '<div class="ux-bt-build">Build: ' + escHtml(run.buildId) + '</div>' +
        (run.night ? '<div class="ux-bt-night">🌙 夜班 · 掉落加成</div>' : '') +
        '<div class="ux-bt-kills">击杀 ' + run.kills + '</div>' +
        (lootRows.length ? '<div class="ux-bt-loot">' + lootRows.join('<br>') + '</div>' : '<div class="ux-bt-loot ux-bt-loot--empty">暂无掉落</div>') +
        '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="abandonBattle">放弃项目</button>' +
      '</div>';

    // 底部：日志 + 技能快捷（CD 由 UI 层每秒刷新）
    var logLines = (run.log || []).slice(-30).map(function (l) { return '<div class="ux-bt-logline">' + escHtml(l) + '</div>'; }).join('');
    var skillBtns = (run.skills || []).slice(0, 4).map(function (id) {
      return '<button class="ux-bt-skill" data-action="battleSkill" data-skill="' + escHtml(id) + '">' + escHtml(battleSkillCn(id)) + '</button>';
    }).join('');

    return '<section class="ux-battle2">' +
      '<div class="ux-battle2-grid">' +
        playerCol +
        '<div class="ux-bt-col ux-bt-arena"><div class="ux-bt-label">战场</div><div class="ux-bt-enemies">' + enemies + '</div></div>' +
        projectCol +
      '</div>' +
      '<div class="ux-battle2-bottom">' +
        '<div class="ux-bt-buildrow"><span class="ux-bt-build">Build·' + escHtml(buildName) + '</span>' + synChips + evoChips + '</div>' +
        '<div class="ux-bt-skills">' + (skillBtns || '<span class="ux-bt-skill-hint">战斗技能在升级三选一中解锁</span>') + '</div>' +
        '<div class="ux-bt-log" id="BattleLog">' + logLines + '</div>' +
      '</div>' +
    '</section>';
  }


  function maybeShowBattleModals() {
    var f = facade();
    if (!f) return;
    var run = null;
    try { run = f.queryBattle(); } catch (e) { return; }
    // 升级三选一
    if (run && run.skillOffers && run.skillOffers.length && !popupOpen()) {
      var layer = popupLayer();
      if (layer) {
        var opts = run.skillOffers.map(function (id) {
          var def = battleSkillDef(id);
          var name = def ? def.name : null;
          var desc = def ? def.desc : null;
          /* V5.7：进化候选不在技能表——按进化选项解析名/描述 */
          if (!name && f.queryEvolutionOption) {
            var evo = (function () { try { return f.queryEvolutionOption(id); } catch (e) { return null; } })();
            if (evo) { name = evo.name; desc = evo.desc; }
          }
          if (!name) { name = '攻击强化'; desc = '攻击 +3，朴实无华。'; }
          return '<button class="ux-event-option" data-battle-skill="' + escHtml(id) + '"><span>' + escHtml(name) + '</span><span class="opt-effects">' + escHtml(desc) + '</span></button>';
        }).join('');
        layer.innerHTML =
          '<div class="ux-modal-layer">' +
            '<div class="ux-popup">' +
              '<div class="ux-header" style="height:70px;border-radius:16px 16px 0 0;margin:0 -18px 14px"><span class="ux-header-title">升级！选择你的道</span></div>' +
              '<div class="ux-popup-card"><div class="ux-event-options">' + opts + '</div></div>' +
            '</div>' +
          '</div>';
        $$('.ux-event-option[data-battle-skill]', layer).forEach(function (b) {
          b.addEventListener('click', function () {
            try { f.chooseBattleSkill(b.getAttribute('data-battle-skill')); } catch (e) { toast(errMsg(e), 'error'); }
            closePopup();
          });
        });
      }
      return;
    }
    // 结算弹窗（胜利/败北）
    var done = null;
    try { done = f.queryFinishedBattle(); } catch (e) { done = null; }
    if (done && !popupOpen() && _battleResultShown !== done.runId) {
      _battleResultShown = done.runId;
      renderProjectOutcome(done);
    }
  }

  /* V5.5 §27~§34：项目阶段结算——标题按结局、掉落中文名、随后跟一个领导/产品决策。 */
  function projectOutcomeCn(id) {
    var f = facade();
    if (f && typeof f.queryMaterialName === 'function') {
      try { return f.queryMaterialName(id); } catch (e) { /* fallthrough */ }
    }
    return id;
  }

  function renderProjectOutcome(done) {
    var f = facade();
    var loot = done.loot || {};
    var lootLines = [];
    Object.keys(loot.materials || {}).forEach(function (m) { lootLines.push('📜 ' + escHtml(projectOutcomeCn(m)) + ' ×' + loot.materials[m]); });
    (loot.equipment || []).forEach(function (eq) { lootLines.push('🎽 ' + escHtml(projectOutcomeCn(eq))); });
    if (loot.spiritStones) lootLines.push('💎 灵石 ×' + loot.spiritStones);
    if (loot.expGained) lootLines.push('💧 修为经验 ×' + loot.expGained);
    var victory = done.status === 'VICTORY';

    /* 决策选项（§29~§34 六种结局方向）：胜利走领导/产品线，失败走补救线。 */
    var decisions = (function () {
      if (f && typeof f.queryPendingProjectDecisions === 'function') {
        try { return f.queryPendingProjectDecisions().map(function (d) { return { id: d.id, label: d.label, fx: { note: d.note } }; }); } catch (e) { return []; }
      }
      return [];
    })();

    var optionHtml = decisions.map(function (d, i) {
      return '<button class="ux-event-option" data-project-decision="' + escHtml(d.id) + '" data-decision-idx="' + i + '">' +
        '<span>' + escHtml(d.label) + '</span>' +
        '<span class="opt-effects">' + escHtml(d.fx.note) + '</span></button>';
    }).join('');

    var title = victory ? '【项目阶段结算】' : '【项目受挫】';
    var flavor = victory ? 'Boss 已被超度，东西落了一地。但项目还没完——' : '败北亦有收获（30% 掉落）。接下来——';
    var layer2 = popupLayer();
    if (!layer2) return;
    layer2.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:70px;border-radius:16px 16px 0 0;margin:0 -18px 14px"><span class="ux-header-title">' + title + '</span></div>' +
          '<div class="ux-popup-card">' +
            '<div class="ux-event-bubble">' + escHtml(flavor) + '</div>' +
            (lootLines.length ? '<div class="ux-off-rows">' + lootLines.map(function (l) { return '<div class="ux-off-row"><span class="rv">' + l + '</span></div>'; }).join('') + '</div>' : '<div class="ux-agenda-empty">什么都没掉。就当修炼了。</div>') +
            v57BossDropCardsHtml(done) +
            '<div class="ux-event-options">' + optionHtml + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    $$('.ux-event-option[data-project-decision]', layer2).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-decision-idx'));
        var decision = decisions[idx];
        try {
          if (typeof f.resolveProjectDecision === 'function') {
            var r = f.resolveProjectDecision(decision.id);
            toast(r.ok ? (decision.label.slice(0, 22) + '……') : (r.reason || '决策失败'), r.ok ? 'info' : 'error');
          } else {
            toast('项目系统未就绪', 'error');
          }
          f.clearFinishedBattle();
        } catch (eApply) { toast(errMsg(eApply), 'error'); }
        closePopup();
        refresh();
      });
    });
    v57BindExtra(layer2);
  }

  var _battleResultShown = null;
  var _battleSkillDefs = null;

  function battleSkillDef(id) {
    if (!_battleSkillDefs) {
      var f = facade();
      try { _battleSkillDefs = f && f.queryBattleSkillDefs ? f.queryBattleSkillDefs() : []; } catch (e) { _battleSkillDefs = []; }
    }
    return (_battleSkillDefs || []).filter(function (s) { return s.id === id; })[0] || null;
  }

  function openBuildSelectModal() {
    var f = facade();
    if (!f || typeof f.queryBattleBuildOptions !== 'function') { toast('游戏尚未就绪', 'error'); return; }
    /* V5.7：战斗进行中不允许换 Build 重开 */
    var activeRun = null;
    try { activeRun = f.queryBattle(); } catch (e) { activeRun = null; }
    if (activeRun) { toast('已有进行中的战斗，先完成或放弃它。', 'error'); return; }
    var builds = f.queryBattleBuildOptions() || [];
    var layer = popupLayer();
    if (!layer) return;
    var cards = builds.map(function (b) {
      return '<button class="ux-event-option" data-battle-build="' + escHtml(b.id) + '">' +
        '<span>' + escHtml(b.name) + '</span>' +
        '<span class="opt-effects">' + escHtml(b.desc) + ' · HP ' + b.baseHp + ' · 攻 ' + b.baseAttack + '</span></button>';
    }).join('');
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:70px;border-radius:16px 16px 0 0;margin:0 -18px 14px"><span class="ux-header-title">选择 Build 进入项目</span></div>' +
          '<div class="ux-popup-card"><div class="ux-event-options">' + cards + '</div>' +
          '<div class="ux-modal-note">5 波推进：普通 → 精英 → Boss。Boss 胜利自动完成当前待办。</div></div>' +
        '</div>' +
      '</div>';
    $$('.ux-event-option[data-battle-build]', layer).forEach(function (b) {
      b.addEventListener('click', function () {
        try {
          f.startBattleRun('PROJECT', b.getAttribute('data-battle-build'));
          closePopup();
          refresh();
        } catch (e) { toast(errMsg(e), 'error'); }
      });
    });
  }

  /* 右栏（§43~§51）：今日待办 / 飞剑传书 Widget / 最近动态 / 今日生活（购买力+黄历合并） */
  function homeRightHtml(hud) {
    void hud;
    return agendaHtml() + messengerWidgetHtml() + recentTimelineHtml() + todayLifeHtml();
  }

  /* V5 飞剑传书 Widget（§37）：紧凑入口，2 条预览 + 查看，不撑高首页 */
  function messengerWidgetHtml() {
    var f = facade();
    var badge = f && typeof f.queryMessengerBadge === 'function' ? (function () { try { return f.queryMessengerBadge(); } catch (e) { return null; } })() : null;
    if (!badge) return '';
    var previews = '';
    var conversations = f && typeof f.queryConversations === 'function' ? (function () { try { return f.queryConversations(); } catch (e) { return []; } })() : [];
    var withUnread = conversations.filter(function (c) { return c.unreadCount > 0; }).slice(0, 2);
    for (var i = 0; i < withUnread.length; i++) {
      previews += '<div class="ux-msg-preview"><span class="mp-title">' + escHtml(withUnread[i].title) +
        (withUnread[i].unreadCount > 1 ? ' <b>' + withUnread[i].unreadCount + '</b>' : '') +
        '</span><span class="mp-text">' + escHtml(String(withUnread[i].lastPreview || '').slice(0, 30)) + '</span></div>';
    }
    if (!previews) previews = '<div class="ux-msg-preview"><span class="mp-text">灵网安静，无人传书。</span></div>';
    return '<div class="ux-card ux-messenger-widget">' +
      '<div class="ux-card-title">📨 飞剑传书' +
      (badge.totalUnread > 0 ? ' <span class="ux-msg-badge' + (badge.hasCritical ? ' critical' : '') + '">' + badge.totalUnread + '</span>' : '') +
      '<button class="ux-card-more" data-action="openMessenger">查看</button></div>' +
      previews +
    '</div>';
  }

  function homeStatusText(hud) {
    var f = facade();
    var ot = null;
    if (f && typeof f.queryOvertime === 'function') { try { ot = f.queryOvertime(); } catch (e) { ot = null; } }
    if (ot && ot.status === 'ACTIVE') return ot.free ? '正在免费燃烧生命...' : '带薪奋斗中...';
    if (hud.workMode === 'FISHING') return '带薪摸鱼中，道心平稳……';
    if (hud.workMode === 'CULTIVATING') return '工位悟道中……';
    if (hud.workMode === 'SOCIAL') return '茶水间论道……';
    return '正在搬砖，修为渐长……';
  }

  /* 顶栏 NPC 动态（§5）：只显示一句，前缀由顶栏名牌承担 */
  function npcDynamicLine(hud) {
    var raw = npcRawLine(hud);
    var text = raw.replace(/^小师妹[:：]\s*/, '').replace(/^[“"]|[”"]$/g, '');
    return '“' + text + '”';
  }

  function npcRawLine(hud) {
    var f = facade();
    var g = f && typeof f.queryGameClock === 'function' ? (function () { try { return f.queryGameClock(); } catch (e) { return null; } })() : null;
    var hour = g ? g.hour : 12;
    if (g && g.isWeekend) {
      return ['小师妹：周末的云比周一的好看。', '小师妹：别看手机了，企业群不会自己冒红点。', '小师妹：今天的修炼计划是——躺着。'][dayPick(3)];
    } else if (hour >= 18) {
      return ['小师妹："工资已经下班了，你还没有。"', '小师妹："再不走，保洁阿姨都要赶人了。"', '小师妹："晚风不错，适合御剑（地铁）。"'][dayPick(3)];
    } else if (hour >= 17) {
      return ['小师妹："已经开始偷偷收拾东西。"', '小师妹："不要有人叫我。"', '小师妹："还有一会儿，行吧，我陪你。"'][dayPick(3)];
    } else if (hud.workMode === 'FISHING') {
      return ['小师妹："正在屏蔽产品经理的气息。"', '小师妹："摸鱼是门手艺，你已经是老师傅了。"'][dayPick(2)];
    } else if (hud.workMode === 'CULTIVATING') {
      return ['小师妹："正在和困意斗法。"', '小师妹："肉身在工位，元神已到食堂。"'][dayPick(2)];
    }
    return ['小师妹："正在炼化老板画的大饼。"', '小师妹："还有几个小时，行吧，我陪你。"', '小师妹："今天也要平安下班哦。"'][dayPick(3)];
  }

  /* 角色一句话（§10）：按日轮换的随机角色状态，统一由左栏包引号 */
  function playerQuote(hud) {
    var status = homeStatusText(hud).replace(/\.+$/, '');
    var base = QUOTES[dayPick(QUOTES.length)];
    return (dayPick(2) === 0 ? base : status).replace(/^[“"]|[”"]$/g, '');
  }

  /* 顶栏破事 Badge（§93/§94）：只读各服务投影计数，点击走统一仲裁 */
  function pendingIssueCount() {
    var f = facade();
    if (!f) return 0;
    var n = 0;
    try { var inc = f.queryIncidentState ? f.queryIncidentState() : null; if (inc && inc.active) n += 1; } catch (e) { /* noop */ }
    try {
      var d = f.queryOfflineDecisions ? f.queryOfflineDecisions() : null;
      if (d && d.session && d.session.status === 'PENDING') {
        n += Math.max(0, (d.session.pendingEventIds || []).length - (d.session.cursor || 0));
      }
    } catch (e) { /* noop */ }
    try { if (f.queryV2CurrentEvent && f.queryV2CurrentEvent()) n += 1; } catch (e) { /* noop */ }
    return n;
  }

  /* 飞剑传书未读数（顶栏徽标） */
  function messengerBadgeCount() {
    var f = facade();
    if (!f || typeof f.queryMessengerBadge !== 'function') return 0;
    try { return f.queryMessengerBadge().totalUnread; } catch (e) { return 0; }
  }

  function dayPick(mod) {
    var day = 0;
    var f = facade();
    if (f && typeof f.queryGameDay === 'function') { try { day = (f.queryGameDay() || {}).dayIndex || 0; } catch (e) { day = 0; } }
    return (day + new Date().getDate()) % mod;
  }

  /* 实时工资与带薪摸鱼收入全部来自 queryWorkToday / queryGameDay 投影（§10/§11/§123） */

  function timeUntilMondayMs() {
    var now = new Date();
    var next = new Date(now);
    var add = (8 - now.getDay()) % 7 || 7;
    next.setDate(now.getDate() + add);
    next.setHours(9, 0, 0, 0);
    return Math.max(0, next.getTime() - now.getTime());
  }

  /* 今日待办（§45/§46）：3 条 + 全部入口，空态紧凑 */
  function agendaHtml() {
    var f = facade();
    var data = f && typeof f.queryAssignedTasks === 'function' ? (function () { try { return f.queryAssignedTasks(); } catch (e) { return null; } })() : null;
    var top = data ? data.top.slice(0, 3) : [];
    var overflow = data ? Math.max(0, data.openCount - top.length) : 0;
    var prioCls = { P0: 'p0', P1: 'p1', P2: 'p2', P3: 'p3' };
    var items = top.map(function (t) {
      return '<div class="ux-agenda-item' + (t.priority === 'P0' && !t.isFakeP0 ? ' ux-agenda-item--hot' : '') + '">' +
        '<span class="ux-prio ' + (prioCls[t.priority] || 'p3') + '">' + t.priority + '</span>' +
        '<span class="ux-agenda-title" title="' + escHtml(t.title) + '">' + escHtml(t.title) + '</span>' +
        '<span class="ux-agenda-src">' + escHtml(sourceName(t.source)) + '</span>' +
        '<button class="ux-agenda-btn" data-action="assignedDone" data-id="' + t.id + '" title="完成">✓</button>' +
        '<button class="ux-agenda-btn ux-agenda-btn--no" data-action="assignedRefuse" data-id="' + t.id + '" title="拒绝/搁置">✕</button>' +
        '</div>';
    }).join('');
    if (!items) items = '<div class="ux-agenda-empty">暂时没人塞活。警惕。</div>';
    return '<div class="ux-card ux-agenda"><div class="ux-card-title">今日待办' +
      (overflow > 0 ? ' <span class="ux-agenda-more">+' + overflow + ' 件破事</span>' : '') +
      '<button class="ux-card-more" data-action="openModal" data-modal="agenda">全部</button></div>' + items + '</div>';
  }

  function sourceName(src) {
    var map = { BOSS: '老板', COLLEAGUE: '同事', PRODUCT: '产品', TEST: '测试', CLIENT: '客户', INCIDENT: '事故', SYSTEM: '系统' };
    return map[src] || src || '';
  }

  /* 今日生活（§48~§50）：购买力 + 黄历合并为一块紧凑卡 */
  var POWER_ITEMS = [
    { icon: '☕', name: '咖啡', price: 18 },
    { icon: '🍜', name: '午饭', price: 24 },
    { icon: '🧋', name: '奶茶', price: 15 },
    { icon: '🏠', name: '房租', price: 4200, per: '月' },
  ];
  var FORTUNE_DO = ['提交代码', '装忙', '带薪摸鱼', '敷衍评审', '准点下班', '已读不回', '顺水推舟', '摸鱼修炼'];
  var FORTUNE_DONT = ['回复"在"', '周五上线', '接需求', '正面硬刚', '口头答应', '深夜发布', '打开需求文档', '轻信排期'];
  function todayLifeHtml() {
    var f = facade();
    var day = f && typeof f.queryGameDay === 'function' ? (function () { try { return f.queryGameDay(); } catch (e) { return null; } })() : null;
    var income = day && day.income ? day.income.salary : 0;
    var power = POWER_ITEMS.slice(0, 3).map(function (it) {
      var n = it.price > 0 ? income / it.price : 0;
      return '<div class="ux-power-item"><span>' + it.icon + ' ' + it.name + '</span><b>' +
        (n >= 100 ? Math.floor(n) : n.toFixed(1)) + (it.name === '午饭' ? '顿' : '杯') + '</b></div>';
    }).join('');
    var dayIndex = day ? day.dayIndex : 1;
    var doIdx = (dayIndex * 7 + new Date().getDay() * 3) % FORTUNE_DO.length;
    var dontIdx = (dayIndex * 5 + new Date().getDay() * 2 + 3) % FORTUNE_DONT.length;
    return '<div class="ux-card ux-life">' +
      '<div class="ux-card-title">今日生活<button class="ux-card-more" data-action="openModal" data-modal="power">全部</button></div>' +
      '<div class="ux-life-power">' + power + '</div>' +
      '<div class="ux-life-fortune">' +
        '<div class="ux-fortune-row"><span class="do">宜</span><span class="ft">' + FORTUNE_DO[doIdx] + '</span></div>' +
        '<div class="ux-fortune-row"><span class="dont">忌</span><span class="ft">' + FORTUNE_DONT[dontIdx] + '</span></div>' +
      '</div>' +
    '</div>';
  }

  /* 最近动态（§47/§58）：最多 4 条，点击看全部 */
  function recentTimelineHtml() {
    var f = facade();
    var view = f && typeof f.queryWorkToday === 'function' ? (function () { try { return f.queryWorkToday(); } catch (e) { return null; } })() : null;
    var tl = view && view.timeline ? view.timeline.slice(-4).reverse() : [];
    var items = tl.map(function (entry) {
      var time = new Date(entry.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      var name = TIMELINE_NAMES[entry.eventId] || entry.eventId || entry.kind;
      return '<div class="ux-recent-item"><span>' + time + '</span>' + escHtml(name) + '</div>';
    }).join('') || '<div class="ux-agenda-empty">今天还风平浪静。</div>';
    return '<div class="ux-card ux-recent"><div class="ux-card-title">最近动态<button class="ux-card-more" data-action="openModal" data-modal="timeline">全部</button></div>' + items + '</div>';
  }

  var TIMELINE_NAMES = {
    MEETING: '会议', INCIDENT: '事故处理', MODE_TRANSITION: '切换状态',
  };

  /* ── 首页弹窗（子 Modal 可滚动，§135） ── */
  function openHomeModal(kind) {
    var f = facade();
    var title = '详情';
    var body = '';
    if (kind === 'timeline') {
      title = '今日时间线';
      var view = f && typeof f.queryWorkToday === 'function' ? (function () { try { return f.queryWorkToday(); } catch (e) { return null; } })() : null;
      var tl = view && view.timeline ? view.timeline : [];
      body = tl.length ? '<div class="ux-modal-list">' + tl.map(function (entry) {
        var time = new Date(entry.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return '<div class="ux-recent-item"><span>' + time + '</span>' + escHtml(TIMELINE_NAMES[entry.eventId] || entry.eventId || entry.kind) + '</div>';
      }).join('') + '</div>' : '<div class="ux-agenda-empty">今天还风平浪静。</div>';
    } else if (kind === 'power') {
      title = '今日购买力';
      var day = f && typeof f.queryGameDay === 'function' ? (function () { try { return f.queryGameDay(); } catch (e) { return null; } })() : null;
      var income = day && day.income ? day.income.salary : 0;
      body = '<div class="ux-modal-list">' + POWER_ITEMS.map(function (it) {
        var n = it.price > 0 ? income / it.price : 0;
        return '<div class="ux-power-item"><span>' + it.icon + ' ' + it.name + '</span><b>' + (n >= 100 ? Math.floor(n) : n.toFixed(1)) + (it.per || (it.name === '午饭' ? '顿' : '杯')) + '</b></div>';
      }).join('') + '</div><div class="ux-modal-note">按今日实时工资折算 · 仅为修仙士的浪漫</div>';
    } else if (kind === 'agenda') {
      title = '全部待办';
      var data = f && typeof f.queryAssignedTasks === 'function' ? (function () { try { return f.queryAssignedTasks(); } catch (e) { return null; } })() : null;
      var open = data ? data.all : [];
      body = open.length ? '<div class="ux-modal-list">' + open.map(function (t) {
        return '<div class="ux-agenda-item"><span class="ux-prio ' + (t.priority === 'P0' ? 'p0' : t.priority === 'P1' ? 'p1' : t.priority === 'P2' ? 'p2' : 'p3') + '">' + t.priority + '</span>' +
          '<span class="ux-agenda-title">' + escHtml(t.title) + '</span>' +
          '<button class="ux-agenda-btn" data-action="assignedDone" data-id="' + t.id + '">✓</button>' +
          '<button class="ux-agenda-btn ux-agenda-btn--no" data-action="assignedRefuse" data-id="' + t.id + '">✕</button></div>';
      }).join('') + '</div>' : '<div class="ux-agenda-empty">暂时没人塞活。警惕。</div>';
    } else if (kind === 'evidence') {
      title = '证据袋';
      var evidence = f && typeof f.queryEvidence === 'function' ? (function () { try { return f.queryEvidence(); } catch (e) { return []; } })() : [];
      body = evidence.length ? '<div class="ux-modal-list">' + evidence.map(function (ev) {
        return '<div class="ux-recent-item"><span class="ux-evidence-type">' + escHtml(ev.type) + '</span>' + escHtml(ev.label) + '</div>';
      }).join('') + '</div><div class="ux-modal-note">证据用于解锁事件选项与复盘定责——它不是库存垃圾。</div>'
        : '<div class="ux-agenda-empty">还没有证据。干活、截图、留痕都会攒下证据。</div>';
    } else {
      return;
    }
    var layer = popupLayer();
    if (!layer) return;
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup ux-popup--wide">' +
          '<div class="ux-header" style="height:70px;border-radius:16px 16px 0 0;margin:0 -18px 14px">' +
            '<span class="ux-header-title">' + escHtml(title) + '</span>' +
          '</div>' +
          '<div class="ux-popup-card ux-popup-card--scroll">' + body + '</div>' +
          '<div class="ux-dialog-actions"><button class="ux-btn ux-btn--gray ux-btn--md" data-action="closePopup">关闭</button></div>' +
        '</div>' +
      '</div>';
  }


  /* ── 6b. 任务 ── */

  var _taskTab = 'DAILY';

  function renderTasks() {
    var data = readTasks();
    var html = '<div class="ux-tabs">' + TASK_TABS.map(function (t) {
      return '<button class="ux-tab' + (_taskTab === t.type ? ' ux-tab--active' : '') + '" data-tasktab="' + t.type + '">' + t.label + '</button>';
    }).join('') + '</div>';
    var taskList = '';

    var configs = (data.configs || []).filter(function (c) { return c.type === _taskTab; });
    var active = (data.active || []).filter(function (t) { return !t.claimed; });
    var activeHere = active.filter(function (t) { return (t.taskType || '') === _taskTab; });
    var activeIds = {};
    active.forEach(function (t) { activeIds[t.taskId] = true; });
    var available = configs.filter(function (c) { return !activeIds[c.id]; });

    if (!activeHere.length && !available.length) {
      return html + emptyState('📋', '暂无任务', '继续修炼，任务会自动出现');
    }

    activeHere.forEach(function (t) {
      var remain = t.completed ? 0 : readRemaining(t.taskId);
      taskList += taskCard(t, remain, true);
    });
    available.forEach(function (c) { taskList += taskCard(c, c.durationSeconds, false); });
    return html + '<div class="ux-task-list">' + taskList + '</div>';
  }

  function taskIcon(taskOrCfg) {
    var sliced = TASK_ICONS[taskOrCfg.taskId || taskOrCfg.id];
    if (sliced) return img(sliced, 'ux-task-icon');
    var emoji = TASK_TYPE_ICONS[taskOrCfg.taskType || taskOrCfg.type] || '📋';
    return '<div class="ux-task-icon" style="display:flex;align-items:center;justify-content:center;font-size:52px">' + emoji + '</div>';
  }

  function taskCard(t, seconds, isActive) {
    var rewards = rewardRows(t);
    var right;
    if (isActive) {
      var done = seconds <= 0;
      right = '<div class="ux-task-right">' +
        (done
          ? '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="claim" data-id="' + escHtml(t.taskId) + '">领取</button>'
          : '<button class="ux-btn ux-btn--gray ux-btn--sm" disabled>' + Math.ceil(seconds) + 's</button>') +
        '<div class="ux-task-timebar"><div class="ux-progress" style="height:18px">' +
          '<div class="ux-progress-fill ux-progress-fill--blue" style="width:' + pct(t.durationSeconds - seconds, t.durationSeconds) + '%"></div>' +
        '</div></div></div>';
    } else {
      right = '<div class="ux-task-right">' +
        '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="start" data-id="' + escHtml(t.id) + '">开始</button>' +
        '<div class="ux-task-duration">' + fmtDuration(seconds) + '</div></div>';
    }
    return '<div class="ux-card ux-task-card">' + taskIcon(t) +
      '<div class="ux-task-info">' +
        '<div class="ux-task-name">' + escHtml(t.name || '任务') + '</div>' +
        '<div class="ux-task-desc">' + escHtml(t.description || '') + '</div>' +
        (rewards ? '<div class="ux-task-rewards">' + rewards + '</div>' : '') +
      '</div>' + right + '</div>';
  }

  function rewardRows(t) {
    var rows = [];
    if (t.rewardCultivation) rows.push(rewardRow('cultivation', '修为', t.rewardCultivation));
    if (t.rewardSalary) rows.push(rewardRow('salary', '工资', t.rewardSalary));
    if (t.rewardPerformance) rows.push(rewardRow('performance', '绩效', t.rewardPerformance));
    if (t.rewardSpiritStones) rows.push(rewardRow('stone', '灵石', t.rewardSpiritStones));
    if (t.rewardMind) rows.push(rewardRow('mind', '道心', t.rewardMind));
    return rows.join('');
  }

  function rewardRow(stat, label, v) {
    var sign = v > 0 ? '+' : '';
    var cls = v > 0 ? 'val-pos' : 'val-neg';
    return '<div class="ux-reward-row">' + icon(stat) + label + ' <span class="' + cls + '">' + sign + v + '</span></div>';
  }

  /* ── 6c. 物品合成 ── */

  var _craftTab = 'pill';

  function renderCraft() {
    var recipes = readRecipes();
    var html = '<div class="ux-tabs">' + CRAFT_TABS.map(function (t) {
      return '<button class="ux-tab' + (_craftTab === t.id ? ' ux-tab--active' : '') + '" data-crafttab="' + t.id + '">' + t.label + '</button>';
    }).join('') + '</div>';

    if (_craftTab === 'mat') {
      var hud = readHUD() || {};
      return html +
        '<div class="ux-card"><div class="ux-task-name" style="margin-bottom:10px">💎 灵石</div>' +
        '<div class="ux-reward-row">' + icon('stone') + '持有数量 <span class="val-pos" style="font-size:28px">' + fmtNum(hud.spiritStones) + '</span></div>' +
        '<div class="ux-recipe-desc" style="margin-top:12px">灵石通过挂机收益与任务获得，是炼制丹药法宝的通用耗材。</div></div>' +
        '<div class="ux-card"><div class="ux-task-name" style="margin-bottom:10px">🌿 素材图鉴</div>' +
        '<div style="display:flex;gap:18px">' +
          matTile('mat-herb-a', '聚气草') + matTile('mat-crystal-a', '晶石') + matTile('mat-scroll-a', '功法卷') + matTile('mat-flower-a', '回春花') +
        '</div></div>';
    }

    var list = recipes.filter(function (r) {
      var tab = CRAFT_TABS.filter(function (t) { return t.id === _craftTab; })[0];
      return tab && tab.match(r.id);
    });
    if (!list.length) return html + emptyState('🧪', '暂无配方', '提升职级后解锁更多配方');

    list.forEach(function (r) {
      var check = readCanCraft(r.id);
      var count = readCraftedCount(r.id);
      var mats = CRAFT_MATS[(_craftTab === 'gongfa' && r.id.indexOf('talisman_') === 0) ? 'gongfa' : _craftTab] || CRAFT_MATS.pill;
      var resultImg = CRAFT_RESULT[r.id] || 'item-pill-juqi';
      html += '' +
        '<div class="ux-card ux-recipe-card">' +
          '<div class="ux-recipe-name">' + escHtml(r.name) +
            (count > 0 ? '<span class="ux-recipe-count">已炼 ×' + count + '</span>' : '') + '</div>' +
          '<div class="ux-recipe-flow">' +
            '<div class="ux-mat">' + img(mats[0]) + '<span class="x' + (readHUD() && readHUD().cultivationExp < r.costCultivation ? ' lack' : '') + '">×' + fmtNum(r.costCultivation) + '</span></div>' +
            '<div class="ux-mat">' + img(mats[1]) + '<span class="x' + ((readHUD() && readHUD().spiritStones < r.costSpiritStones) ? ' lack' : '') + '">×' + fmtNum(r.costSpiritStones) + '</span></div>' +
            '<span class="ux-arrow">→</span>' +
            '<div class="ux-recipe-result">' + img(resultImg) + '</div>' +
            '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="craft" data-id="' + escHtml(r.id) + '"' + (check.canCraft ? '' : ' disabled') + '>合成</button>' +
          '</div>' +
          '<div class="ux-recipe-desc">' + escHtml(r.description || '') +
            (!check.canCraft && check.reason ? ' · <span class="val-neg">' + escHtml(check.reason) + '</span>' : '') +
          '</div>' +
        '</div>';
    });
    return html;
  }

  function matTile(name, label) {
    return '<div class="ux-mat">' + img(name) + '<span class="x" style="font-weight:700">' + label + '</span></div>';
  }

  /* ── 6c-1. 飞剑传书（V5 消息中心，§36：左 30% 会话 / 右 70% 聊天） ── */

  var _messengerActiveConversation = null;
  var _messengerReplyMessageId = null;

  function renderMessenger() {
    var f = facade();
    if (!f || typeof f.queryConversations !== 'function') return emptyState('📨', '飞剑传书未就绪', '灵网正在接入……');
    var conversations = (function () { try { return f.queryConversations(); } catch (e) { return []; } })();
    if (!_messengerActiveConversation && conversations.length) _messengerActiveConversation = conversations[0].id;
    var activeId = _messengerActiveConversation;
    var listHtml = conversations.map(function (c) {
      return '<button class="ux-conv' + (c.id === activeId ? ' is-active' : '') +
        (c.unreadCount > 0 ? ' has-unread' : '') + '" data-open-conversation="' + escHtml(c.id) + '">' +
        '<span class="ux-conv-avatar">' + escHtml(c.avatar === 'group' ? '👥' : c.avatar === 'system' ? '📡' : '🧑') + '</span>' +
        '<span class="ux-conv-main"><span class="ux-conv-title">' + escHtml(c.title) + '</span>' +
        '<span class="ux-conv-last">' + escHtml(String(c.lastPreview || '').slice(0, 24)) + '</span></span>' +
        '<span class="ux-conv-side">' + (c.unreadCount > 0 ? '<b class="ux-msg-badge">' + c.unreadCount + '</b>' : '') +
        '<i>' + (c.lastMessageAt ? new Date(c.lastMessageAt).toTimeString().slice(0, 5) : '') + '</i></span>' +
        '</button>';
    }).join('');

    var messages = activeId ? (function () { try { return f.queryMessages(activeId); } catch (e) { return []; } })() : [];
    var convTitle = (conversations.filter(function (c) { return c.id === activeId; })[0] || {}).title || '';
    var typing = f && typeof f.queryTyping === 'function' ? (function () { try { return f.queryTyping(); } catch (e) { return null; } })() : null;
    var typingHtml = typing && typing.conversationId === activeId ? '<div class="ux-chat-typing">对方正在输入……</div>' : '';
    if (!_messengerReplyMessageId) {
      var pendingMsg = messages.filter(function (m) { return m.options && m.options.length; })[0];
      if (pendingMsg) _messengerReplyMessageId = pendingMsg.id;
    }
    var chatHtml = messages.map(function (m) {
      if (m.recalled) return '<div class="ux-chat-row system"><span class="ux-chat-recall">撤回了一条消息</span></div>';
      var mine = m.content.indexOf('【我】') >= 0;
      var body = escHtml(m.content).replace('【我】', '</span><span class="ux-chat-mine-tag">【我】');
      var replyBlock = '';
      if (m.options && m.options.length && _messengerReplyMessageId === m.id) {
        replyBlock = '<div class="ux-reply-options">' + m.options.map(function (o) {
          return '<button class="ux-reply-option" data-reply="' + escHtml(o.id) + '" data-message="' + escHtml(m.id) + '">' +
            (o.tag ? '<span class="ux-reply-tag">' + escHtml(o.tag) + '</span>' : '') + escHtml(o.text) + '</button>';
        }).join('') + '</div>';
      }
      return '<div class="ux-chat-row' + (mine ? ' mine' : '') + '">' +
        '<span class="ux-chat-sender">' + escHtml(m.senderName) + ' · ' + new Date(m.timestamp).toTimeString().slice(0, 5) + '</span>' +
        '<span class="ux-chat-bubble">' + body + '</span>' + replyBlock + '</div>';
    }).join('') || '<div class="ux-chat-empty">暂无传书。灵网安静。</div>';
    var typingRow = typingHtml;
    return '<div class="ux-messenger">' +
      '<aside class="ux-messenger-list">' + listHtml + '</aside>' +
      '<section class="ux-messenger-chat">' +
        '<div class="ux-chat-title">' + escHtml(convTitle) + '</div>' +
        '<div class="ux-chat-scroll" id="MessengerChatScroll">' + chatHtml + typingRow + '</div>' +
        '<div class="ux-chat-footer" id="MessengerReplyBar">' +
          (_messengerReplyMessageId ? '<span class="ux-reply-hint">选择你的回复：</span>' : '<span class="ux-reply-hint">有飞剑待处理时，回复选项会出现在这里。</span>') +
        '</div>' +
      '</section>' +
    '</div>';
  }

  /* ── 6c-2. 项目（V4 战斗主场，首页只留入口横幅） ── */

  function renderProject() {
    var f = facade();
    var run = f && typeof f.queryBattle === 'function' ? (function () { try { return f.queryBattle(); } catch (e) { return null; } })() : null;
    var html = '<div class="ux-project-page">';
    html += battleHtml();
    if (!run) {
      html += '<div class="ux-card ux-project-intro">' +
        '<div class="ux-task-name">⚔️ 项目攻坚</div>' +
        '<div class="ux-recipe-desc">以 Build 迎战五波推进：普通 → 精英 → Boss。Boss 胜利自动完成当前待办，掉落材料与法宝。</div>' +
        '<div class="ux-recipe-desc">夜班（22:00 后）掉落加成，代价是第二天更难起床。</div>' +
        '<div class="ux-dialog-actions"><button class="ux-btn ux-btn--gold ux-btn--md" data-action="projectEntry">选择 Build 进入项目</button></div>' +
      '</div>';
    }
    html += '</div>';
    /* V5.7：项目历史 + 战绩（§58/§62） */
    if (f && typeof f.queryProjectHistory === 'function') {
      var history = [];
      var records = [];
      try { history = f.queryProjectHistory() || []; records = f.queryCareerRecords() || []; } catch (e) { history = []; }
      if (history.length > 0) {
        html += '<div class="ux-card"><div class="ux-card-title">项目档案</div>' +
          history.slice(-5).reverse().map(function (h) {
            return '<div class="ux-ph-row"><span class="ph-name">' + escHtml(h.name) + '</span>' +
              '<span class="ph-ending">' + escHtml(h.ending) + '</span>' +
              '<span class="ph-meta">债 ' + h.techDebt + ' · 变更 ' + h.requirementChanges + ' · Bug ' + h.bugCount + '</span></div>';
          }).join('') + '</div>';
      }
      var reachedRecords = records.filter(function (r) { return r.reached; });
      if (reachedRecords.length > 0) {
        html += '<div class="ux-card"><div class="ux-card-title">战绩</div>' +
          reachedRecords.map(function (r) {
            return '<div class="ux-ph-row"><span class="ph-name">🏆 ' + escHtml(r.name) + '</span>' +
              '<span class="ph-meta">' + escHtml(r.desc) + '</span></div>';
          }).join('') + '</div>';
      }
    }
    return html;
  }

  /* ── 6c-3. 修仙（境界 / 功法 / 法宝） ── */

  function renderCultivation() {
    var hud = readHUD();
    if (!hud) return emptyState('⏳', '加载中...', '');
    var cd = cooldownOf('cultivate');
    var head = '<div class="ux-card ux-cult-head">' +
      '<div class="ux-task-name">🧘 ' + escHtml(hud.realm) + ' · ' + escHtml(hud.careerName) + ' Lv.' + hud.careerLevel + '</div>' +
      '<div class="ux-progress" style="height:18px;margin-top:8px"><div class="ux-progress-fill ux-progress-fill--blue" style="width:' + pct(hud.cultivationExp, hud.requiredExp || hud.cultivationExp || 1) + '%"></div></div>' +
      '<div class="ux-recipe-desc">修为 ' + fmtNum(hud.cultivationExp) + ' / ' + fmtNum(hud.requiredExp) + ' · 道心 ' + fmtNum(hud.mind) + ' / ' + fmtNum(hud.maxMind) + '</div>' +
      '<div class="ux-dialog-actions">' +
        '<button class="ux-btn ux-btn--gold ux-btn--md" data-action="cultivate"' + (cd > 0 ? ' disabled' : '') + '>' +
          (cd > 0 ? '冷却中 ' + Math.ceil(cd) + 's' : '修炼一次') + '</button>' +
      '</div>' +
    '</div>';
    return head + (V2 ? V2.renderTechniques() + V2.renderEquipment() : emptyState('📖', '功法数据未就绪', '稍后再来看看'));
  }

  /* ── 6d. 晋升渡劫 ── */

  function renderPromotion() {
    var hud = readHUD();
    if (!hud) return emptyState('⏳', '加载中...', '');
    var promo = readPromotion();
    var kpi = readKpi();
    var next = readCareerAt(hud.careerLevel + 1);

    var stageHtml =
      '<div class="ux-promo-stage">' +
        '<div class="ux-stage-box">' +
          '<div class="ux-stage-label">当前职级</div>' +
          '<div class="ux-stage-name">' + escHtml(hud.careerName) + '</div>' +
          '<div class="ux-stage-realm">' + escHtml(hud.realm) + '</div>' +
          img('promo-cur', 'ux-stage-img') +
        '</div>' +
        '<div class="ux-promo-arrow">➤</div>' +
        '<div class="ux-stage-box ux-stage-box--next">' +
          '<div class="ux-stage-label">下一阶段</div>' +
          '<div class="ux-stage-name">' + escHtml(next ? next.name : '？？？') + '</div>' +
          '<div class="ux-stage-realm">' + escHtml(next ? next.realm : '') + '</div>' +
          img('promo-next', 'ux-stage-img') +
        '</div>' +
      '</div>';

    var rows = '';
    /* 修为条件 */
    var reqExp = Math.max(hud.requiredExp, 0);
    rows += reqRow('cultivation', '修为', hud.cultivationExp, reqExp, reqExp <= 0 || hud.cultivationExp >= reqExp, 'blue');
    /* KPI 条件 (真实晋升门槛) */
    (kpi.items || []).forEach(function (item) {
      var stat = item.type === 'SALARY_EARNED' ? 'salary' : (item.type === 'CULTIVATION' ? 'cultivation' : 'performance');
      rows += reqRow(stat, kpiShortLabel(item.type), item.progress, item.target, item.completed, item.completed ? 'green' : 'orange');
    });
    /* 道心 (影响渡劫成功率) */
    rows += reqRow('mind', '道心', hud.mind, hud.maxMind, hud.mind >= 30, 'green');
    var reqHtml = '<div class="ux-card"><div class="ux-req-rows">' + rows + '</div>' +
      '<div class="ux-promo-note">满足全部条件后可进行渡劫晋升 · 当前成功率 ' + Math.floor(promo.probability) + '%</div></div>';

    var btn;
    if (promo.allowed) {
      btn = '<button class="ux-btn ux-btn--gold ux-btn--lg" data-action="promote">渡劫晋升</button>';
    } else if (promo.needsRetry) {
      btn = '<button class="ux-btn ux-btn--gray ux-btn--md" data-action="promoRetry">渡劫失败 · 看广告再试</button>';
    } else {
      btn = '<button class="ux-btn ux-btn--gray ux-btn--lg" disabled>渡劫晋升</button>';
    }

    return stageHtml + reqHtml + '<div class="ux-promo-action">' + btn + '</div>';
  }

  function kpiShortLabel(type) {
    return { MERGE_COUNT: '完成任务', WORK_SECONDS: '工作时长', CULTIVATION: '修为达标', SALARY_EARNED: '累计工资', EVENT_RESOLVED: '处理事件' }[type] || '任务';
  }

  function reqRow(stat, label, cur, req, ok, fill) {
    var numsRight = req > 0 ? '/ ' + fmtNum(req) : '已达标';
    return '<div class="ux-req-row">' + icon(stat) +
      '<span class="ux-req-label">' + escHtml(label) + '</span>' +
      '<div class="ux-req-mid">' +
        '<div class="ux-req-nums"><span>' + fmtNum(cur) + '</span><span>' + numsRight + '</span></div>' +
        '<div class="ux-progress" style="height:20px"><div class="ux-progress-fill ux-progress-fill--' + fill + '" style="width:' + pct(cur, req) + '%"></div></div>' +
      '</div>' +
      '<span class="ux-check' + (ok ? '' : ' ux-check--pending') + '">✓</span></div>';
  }

  /* ── 6e. 宗门 ── */

  function sectEffectLines(mods) {
    var lines = [];
    function line(txt, positive) {
      lines.push('<div class="ux-sect-effect"><span class="' + (positive ? 'val-pos' : 'val-neg') + '">' + txt + '</span></div>');
    }
    if (mods.salaryMultiplier && mods.salaryMultiplier !== 1) {
      var v = Math.round(Math.abs(mods.salaryMultiplier - 1) * 100);
      line('工资 ' + (mods.salaryMultiplier > 1 ? '+' : '-') + v + '%', mods.salaryMultiplier > 1);
    }
    if (mods.cultivationMultiplier && mods.cultivationMultiplier !== 1) {
      var cv = Math.round(Math.abs(mods.cultivationMultiplier - 1) * 100);
      line('修为 ' + (mods.cultivationMultiplier > 1 ? '+' : '-') + cv + '%', mods.cultivationMultiplier > 1);
    }
    if (mods.mindMultiplier && mods.mindMultiplier !== 1) {
      var mv = Math.round(Math.abs(mods.mindMultiplier - 1) * 100);
      if (mods.mindMultiplier > 1) line('道心恢复 +' + mv + '%', true);
      else line('道心消耗 +' + mv + '%', false);
    }
    if (mods.performanceMultiplier && mods.performanceMultiplier !== 1) {
      var pv = Math.round(Math.abs(mods.performanceMultiplier - 1) * 100);
      line('绩效 ' + (mods.performanceMultiplier > 1 ? '+' : '-') + pv + '%', mods.performanceMultiplier > 1);
    }
    if (mods.offlineGainMultiplier && mods.offlineGainMultiplier !== 1) {
      var ov = Math.round((mods.offlineGainMultiplier - 1) * 100);
      line('离线收益 +' + ov + '%', ov > 0);
    }
    return lines.join('');
  }

  function renderSect() {
    var data = readSects();
    var html = '<div class="ux-section-ribbon">选择宗门</div>';
    if (!data.sects.length) return html + emptyState('⚔️', '暂无宗门', '');
    data.sects.forEach(function (s) {
      var isCur = data.currentId === s.id;
      var btn = isCur
        ? '<button class="ux-btn ux-btn--gray ux-btn--sm" disabled>已选择</button>'
        : '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="sect" data-id="' + s.id + '">选择</button>';
      html += '<div class="ux-card ux-sect-card">' +
        (isCur ? '<span class="ux-sect-current">当前宗门</span>' : '') +
        img(SECT_IMAGES[s.id] || 'sect-minying', 'ux-sect-img') +
        '<div class="ux-sect-info">' +
          '<div class="ux-sect-name">' + escHtml(s.name) + '</div>' +
          sectEffectLines(s.modifiers || {}) +
        '</div>' + btn + '</div>';
    });
    return html;
  }

  /* ── 6f. 排行榜 ── */

  var _lbTab = 'exp';

  function renderLeaderboard() {
    var view = readLeaderboard();
    var entries = (view.entries || []).slice();
    var html = '<div class="ux-tabs">' +
      '<button class="ux-tab' + (_lbTab === 'exp' ? ' ux-tab--active' : '') + '" data-lbtab="exp">修为榜</button>' +
      '<button class="ux-tab' + (_lbTab === 'level' ? ' ux-tab--active' : '') + '" data-lbtab="level">职级榜</button>' +
      '<button class="ux-tab' + (_lbTab === 'sect' ? ' ux-tab--active' : '') + '" data-lbtab="sect">宗门榜</button>' +
      '</div>';

    if (_lbTab === 'level') entries.sort(function (a, b) { return b.careerLevel - a.careerLevel || b.cultivationExp - a.cultivationExp; });
    else entries.sort(function (a, b) { return b.cultivationExp - a.cultivationExp; });

    html += '<div class="ux-card" style="padding:14px 10px">' +
      '<div class="ux-lb-head"><span class="ux-lb-c1">排名</span><span class="ux-lb-c2">玩家名</span><span class="ux-lb-c3">境界/职级</span><span class="ux-lb-c4">修为</span></div>';

    entries.slice(0, 10).forEach(function (e, i) {
      var rank = i + 1;
      var rankHtml = rank <= 3
        ? '<span class="ux-lb-rank ux-lb-rank--' + rank + '">' + rank + '</span>'
        : '<span class="ux-lb-rank">' + rank + '</span>';
      var sub = _lbTab === 'sect' ? escHtml(e.sectName || '散修') : escHtml(e.careerName || ('Lv.' + e.careerLevel));
      html += '<div class="ux-lb-row' + (e.isPlayer ? ' ux-lb-row--me' : '') + '">' +
        '<span class="ux-lb-c1">' + rankHtml + '</span>' +
        '<span class="ux-lb-c2"><div class="ux-lb-name">' + escHtml(e.isPlayer ? PLAYER_NAME : e.name) + '</div></span>' +
        '<span class="ux-lb-c3"><div class="ux-lb-realm">' + sub + '</div></span>' +
        '<span class="ux-lb-c4"><div class="ux-lb-score">' + (_lbTab === 'level' ? 'Lv.' + e.careerLevel : fmtNum(e.cultivationExp)) + '</div></span>' +
        '</div>';
    });

    /* 我的排名不在前十 → 底部补一行 */
    var meInTop = entries.slice(0, 10).some(function (e) { return e.isPlayer; });
    if (!meInTop && view.playerRank) {
      var me = entries.filter(function (e) { return e.isPlayer; })[0];
      if (me) {
        html += '<div class="ux-lb-row ux-lb-row--me" style="margin-top:14px">' +
          '<span class="ux-lb-c1"><span class="ux-lb-rank">' + view.playerRank + '</span></span>' +
          '<span class="ux-lb-c2"><div class="ux-lb-name">' + PLAYER_NAME + '</div></span>' +
          '<span class="ux-lb-c3"><div class="ux-lb-realm">' + escHtml(me.careerName || '') + '</div></span>' +
          '<span class="ux-lb-c4"><div class="ux-lb-score">' + fmtNum(me.cultivationExp) + '</div></span></div>';
      }
    }
    html += '</div>';
    return html;
  }

  /* ── 6g. 好友 ── */

  var _friendTab = 'list';

  function renderFriends() {
    var view = readFriends();
    var html = '<div class="ux-tabs">' +
      '<button class="ux-tab' + (_friendTab === 'list' ? ' ux-tab--active' : '') + '" data-ftab="list">好友列表</button>' +
      '<button class="ux-tab' + (_friendTab === 'add' ? ' ux-tab--active' : '') + '" data-ftab="add">添加好友</button>' +
      '</div>';

    if (_friendTab === 'add') {
      return html + '<div class="ux-card" style="text-align:center;padding:40px 20px">' +
        '<div style="font-size:56px;margin-bottom:12px">🤝</div>' +
        '<div class="ux-task-name">好友邀请码</div>' +
        '<div class="ux-recipe-desc" style="margin:10px 0 18px">把邀请码分享给同事，互相拜访赠送灵石。</div>' +
        '<div class="ux-lb-score" style="font-size:34px;letter-spacing:4px">NM-2026-XX88</div>' +
        '<button class="ux-btn ux-btn--gold ux-btn--md" data-action="copyInvite" style="margin-top:18px">复制邀请码</button></div>';
    }

    if (!view.friends || !view.friends.length) {
      return html + emptyState('👥', '暂无好友', '去添加好友一起摸鱼修仙');
    }
    view.friends.forEach(function (fr, i) {
      var online = fr.isOnline;
      var lastSeen = online ? '在线' : timeAgo(fr.lastOnline) + '前在线';
      var canClaim = view.giftsToClaim > 0 && fr.giftReceived; // 数据侧只给计数，具体归属用简化展示
      html += '<div class="ux-card ux-friend-card">' +
        img(faceFor(i + 1), 'ux-friend-avatar') +
        '<div class="ux-friend-info">' +
          '<div class="ux-friend-name">' + escHtml(fr.name) + (canClaim ? '<span class="ux-gift-dot">可领礼物</span>' : '') + '</div>' +
          '<div class="ux-friend-realm">' + escHtml(fr.careerName || '') + ' · ' + escHtml(fr.sectName || '散修') + '</div>' +
          '<div class="ux-friend-online ' + (online ? 'on--yes' : 'on--no') + '">' + lastSeen + '</div>' +
        '</div>' +
        '<button class="ux-btn ux-btn--blue ux-btn--sm" data-action="visit" data-id="' + escHtml(fr.id) + '">拜访</button>' +
        '</div>';
    });
    return html;
  }

  function timeAgo(ts) {
    if (!ts) return '很久';
    var s = Math.max(1, (Date.now() - ts) / 1000);
    if (s < 3600) return Math.floor(s / 60) + '分钟';
    if (s < 86400) return Math.floor(s / 3600) + '小时';
    return Math.floor(s / 86400) + '天';
  }

  /* ── 6h. 成就 ── */

  var _achTab = 'all';

  function renderAchievements() {
    var data = readAchievements();
    var html = '<div class="ux-tabs">' +
      ['all:全部', 'unlocked:已解锁', 'locked:未解锁', 'hidden:隐藏'].map(function (pair) {
        var p = pair.split(':');
        return '<button class="ux-tab' + (_achTab === p[0] ? ' ux-tab--active' : '') + '" data-achtab="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div>';

    var list = (data.configs || []).filter(function (c) {
      var st = data.status[c.id];
      if (_achTab === 'unlocked') return st === 'COMPLETED' || st === 'CLAIMED';
      if (_achTab === 'locked') return st === 'LOCKED';
      if (_achTab === 'hidden') return c.category === 'EVENT';
      return true;
    });

    if (!list.length) return html + emptyState('🏆', '暂无成就', '继续修仙，成就自然解锁');

    list.forEach(function (c, i) {
      var st = data.status[c.id];
      var right;
      if (st === 'COMPLETED') {
        right = '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="claimAch" data-id="' + escHtml(c.id) + '">领取</button>';
      } else if (st === 'CLAIMED') {
        right = '<span class="ux-ach-progress" style="color:#4e9e3e">已领取</span>';
      } else {
        right = '<span class="ux-ach-lock">🔒</span>';
      }
      html += '<div class="ux-card ux-ach-card">' +
        img(ACH_ICONS[i % ACH_ICONS.length], 'ux-ach-icon' + (st === 'LOCKED' ? ' ux-ach-icon--locked' : '')) +
        '<div class="ux-ach-info">' +
          '<div class="ux-ach-name">' + escHtml(c.name) + '</div>' +
          '<div class="ux-ach-desc">' + escHtml(c.description) + '</div>' +
          (c.reward ? '<div class="ux-ach-reward">奖励: ' + effectText(c.reward).replace(/<span class="/g, '<span class="') + '</div>' : '') +
        '</div>' + right + '</div>';
    });
    return html;
  }

  /* ── 6i. 更多 / 设置 ── */

  function renderMore() {
    return '' +
      '<div class="ux-more-grid">' +
        moreItem('techniques', '📖', '功法', '主修与辅助 Build') +
        moreItem('equipment', '🎽', '法宝', '三槽职场法宝') +
        moreItem('npc', '🧑‍🤝‍🧑', '人际', '六位核心NPC关系') +
        moreItem('craft', '🧪', '合成', '丹药与功法炼制') +
        moreItem('sect', '⚔️', '宗门', '选择你的流派') +
        moreItem('leaderboard', '🏆', '排行榜', '修为职级大比拼') +
        moreItem('friends', '👥', '好友', '拜访好友赠灵石') +
        moreItem('achievements', '📜', '成就', '职场修仙履历') +
        moreItem('profession', '🧙', '职业', '职业等级与Build') +
        moreItem('codex', '📚', '图鉴', '怪物·Boss·装备·事件') +
        moreItem('settlement', '🌇', '结算', '今日下班结算') +
        moreItem('settings', '⚙️', '设置', '音效与存档') +
      '</div>' +
      '<div class="ux-about">—— 白天上班，晚上修仙，上班也是渡劫 ——<br>《牛马修仙传》Web V1</div>';
  }

  function moreItem(page, emoji, label, sub) {
    return '<button class="ux-card ux-more-item" data-action="goto" data-page="' + page + '">' +
      '<span class="mc">' + emoji + '</span><span class="mi">' + label + '</span><span class="ms">' + sub + '</span></button>';
  }

  function renderSettings() {
    return '' +
      '<div class="ux-card">' +
        settingRow('音效', '游戏音效开关', 'sfx', true) +
        settingRow('背景音乐', '修仙背景音乐开关', 'bgm', true) +
        settingRow('推送提醒', '渡劫与事件提醒', 'notify', false) +
      '</div>' +
      '<div class="ux-card" style="margin-top:20px">' +
        '<div class="ux-setting-row" style="display:flex;align-items:center;justify-content:space-between">' +
          '<div><div class="ux-task-name">清空存档</div><div class="ux-recipe-desc">删除本地存档并重新开始（危险操作）</div></div>' +
          '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="clearSave">清空</button>' +
        '</div>' +
      '</div>' +
      '<div class="ux-about">《牛马修仙传》 v1.0-rc.1 · Web V1<br>上班也是渡劫</div>';
  }

  function settingRow(label, desc, key, on) {
    return '<div class="ux-setting-row" style="display:flex;align-items:center;justify-content:space-between;padding:14px 0">' +
      '<div><div class="ux-task-name">' + label + '</div><div class="ux-recipe-desc">' + desc + '</div></div>' +
      '<button class="ux-btn ux-btn--' + (on ? 'gold' : 'gray') + ' ux-btn--sm" data-action="toggle" data-key="' + key + '">' + (on ? '开' : '关') + '</button></div>';
  }

  function emptyState(emoji, txt, hint) {
    return '<div class="ux-empty"><div class="big">' + emoji + '</div><div class="txt">' + escHtml(txt) + '</div>' +
      (hint ? '<div class="hint">' + escHtml(hint) + '</div>' : '') + '</div>';
  }

  /* ═════════════════════════════════════════════════════════
     §7. Screen controller
     ═════════════════════════════════════════════════════════ */

  var _screen = 'HOME';          // 当前主页面
  var _subPage = null;           // 子页面: SECT/LEADERBOARD/FRIENDS/ACHIEVEMENTS/SETTINGS
  var _cdCache = {};             // 冷却缓存(秒)
  var _sessionStart = Date.now();

  function sessionSeconds() { return (Date.now() - _sessionStart) / 1000; }

  function cooldownOf(key) {
    var f = facade();
    if (!f) return 0;
    try {
      if (key === 'cultivate') return f.queryCultivationCooldown ? f.queryCultivationCooldown() : 0;
    } catch (e) { /* noop */ }
    return 0;
  }

  var PAGE_TITLES = {
    HOME: '', TASKS: '任务', PROJECT: '项目攻坚', CULTIVATION: '修仙', PROMOTION: '晋升渡劫', MORE: '更多',
    MESSENGER: '飞剑传书',
    SECT: '宗门页', LEADERBOARD: '排行榜', FRIENDS: '好友', ACHIEVEMENTS: '成就', SETTINGS: '设置',
    TECHNIQUES: '功法', EQUIPMENT: '法宝', NPC: '人际关系', SETTLEMENT: '下班结算', DEV: 'DEV 面板',
    PROFESSION: '职业修行', CODEX: '修仙图鉴',
  };

  function currentPage() { return _subPage || _screen; }

  /* ── V5.7 Depth & Retention UI ─────────────────────────────────────────── */

  var _codexTab = 'MONSTER';
  var _weekSettlementShownFor = null;

  function v57fatigueChipHtml() {
    var f = facade();
    var view = null;
    try { view = f && f.queryFatigueView ? f.queryFatigueView() : null; } catch (e) { view = null; }
    if (!view) return '';
    var cls = { FRESH: 'ok', LIGHT: 'ok', HEAVY: 'warn', CRITICAL: 'bad', COLLAPSE: 'bad' }[view.band] || 'ok';
    return '<button class="ux-fatigue-chip ux-fatigue--' + cls + '" data-action="goto" data-page="profession">' +
      '<span class="fc-ico">😵‍💫</span><span>疲劳 ' + view.value + '</span>' +
      '<span class="fc-band">' + escHtml(view.bandName) + '</span></button>';
  }

  function v57situationChipHtml() {
    var f = facade();
    var sit = null;
    try { sit = f && f.queryTodaySituation ? f.queryTodaySituation() : null; } catch (e) { sit = null; }
    if (!sit) return '';
    return '<button class="ux-situation-chip" data-action="goto" data-page="profession" title="' + escHtml(sit.desc) + '">' +
      '<span class="sc-ico2">🌤</span><span>今日·' + escHtml(sit.name) + '</span></button>';
  }

  function renderProfession() {
    var f = facade();
    var d = null;
    try { d = f && f.queryProfessionDepth ? f.queryProfessionDepth() : null; } catch (e) { d = null; }
    if (!d) return emptyState('🧙', '职业', '职业数据未就绪');
    var fat = null;
    try { fat = f.queryFatigueView(); } catch (e) { fat = null; }
    var expPct = d.expToNext > 0 ? Math.min(100, Math.round((d.exp / Math.max(1, d.exp + d.expToNext)) * 100)) : 100;
    var html = '' +
      '<div class="ux-card ux-prof-head">' +
        '<div class="ux-prof-title-row"><span class="ux-prof-name">' + escHtml(d.name) + ' · ' + escHtml(d.title) + '</span>' +
        '<span class="ux-prof-level">Lv' + d.level + '</span></div>' +
        '<div class="ux-prof-current-title">「' + escHtml(d.currentTitle) + '」</div>' +
        '<div class="ux-prof-expbar"><div class="fill" style="width:' + expPct + '%"></div></div>' +
        '<div class="ux-prof-exp-text">职业经验 ' + d.exp + (d.expToNext > 0 ? '（距下一级还差 ' + d.expToNext + '）' : '（已圆满）') + '</div>' +
      '</div>';
    if (fat) {
      html += '<div class="ux-card ux-fatigue-card">' +
        '<div class="ux-card-title">身体状态</div>' +
        '<div class="ux-fatigue-row"><span class="fr-label">疲劳</span><span class="fr-value">' + fat.value + '/100 · ' + escHtml(fat.bandName) + '</span></div>' +
        '<div class="ux-fatigue-bar"><div class="fill ' + (fat.value > 80 ? 'bad' : fat.value > 60 ? 'warn' : '') + '" style="width:' + fat.value + '%"></div></div>' +
        '<div class="ux-fatigue-advice">' + escHtml(fat.advice) + '</div>' +
        (fat.forcedRest ? '<button class="ux-fatigue-rest" data-v57-rest="4">请假休息（+4小时，恢复疲劳）</button>' : '') +
      '</div>';
    }
    /* 周目标 */
    var goals = [];
    try { goals = f.queryWeeklyGoals ? f.queryWeeklyGoals() : []; } catch (e) { goals = []; }
    if (goals && goals.length) {
      html += '<div class="ux-card"><div class="ux-card-title">本周目标</div>' +
        goals.map(function (g) {
          return '<div class="ux-goal-row' + (g.done ? ' done' : '') + '">' +
            '<span class="gr-name">' + escHtml(g.name) + '</span>' +
            '<span class="gr-progress">' + g.progress + '/' + g.target + '</span></div>';
        }).join('') +
        '<button class="ux-goal-claim" data-v57-claim-weekly="' + (goals.every(function (g) { return g.done; }) ? '1' : '0') + '">领取周目标奖励</button>' +
      '</div>';
    }
    /* 道法共鸣 */
    var syns = [];
    try { syns = f.querySynergies ? f.querySynergies() : []; } catch (e) { syns = []; }
    if (syns && syns.length) {
      html += '<div class="ux-card"><div class="ux-card-title">道法共鸣</div>' +
        syns.map(function (s) {
          return '<div class="ux-syn-row' + (s.active ? ' active' : '') + '">' +
            '<span class="sy-dot"></span><span class="sy-name">' + escHtml(s.name) + '</span>' +
            '<span class="sy-desc">' + escHtml(s.desc) + '</span></div>';
        }).join('') +
      '</div>';
    }
    /* 等级 perk */
    html += '<div class="ux-card"><div class="ux-card-title">职业成长路线</div>' +
      d.perks.map(function (p) {
        return '<div class="ux-perk-row' + (p.reached ? ' reached' : '') + '">' +
          '<span class="pk-lv">Lv' + p.level + '</span><span class="pk-desc">' + escHtml(p.desc) + '</span></div>';
      }).join('') +
    '</div>';
    /* Build 列表 */
    html += '<div class="ux-card"><div class="ux-card-title">本职业 Build（战斗开局可选）</div><div class="ux-build-tags">' +
      d.buildIds.map(function (b) { return '<span class="ux-build-tag">' + escHtml(b) + '</span>'; }).join('') +
    '</div></div>';
    return html;
  }

  var CODEX_TABS = [
    { id: 'MONSTER', label: '怪物' },
    { id: 'BOSS', label: 'Boss' },
    { id: 'EQUIPMENT', label: '装备' },
    { id: 'EVENT', label: '事件' },
    { id: 'ACHIEVEMENT', label: '成就' },
  ];

  function renderCodex() {
    var f = facade();
    var view = null;
    try { view = f && f.queryCodex ? f.queryCodex(_codexTab) : null; } catch (e) { view = null; }
    if (!view) return emptyState('📚', '图鉴', '图鉴数据未就绪');
    var tabs = CODEX_TABS.map(function (t) {
      return '<button class="ux-codex-tab' + (_codexTab === t.id ? ' active' : '') + '" data-codex-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
    var setsHtml = '';
    if (_codexTab === 'EQUIPMENT' && f && typeof f.querySets === 'function') {
      try {
        setsHtml = (f.querySets() || []).map(function (s) {
          var active = s.bonuses.filter(function (b) { return b.active; }).pop();
          var members = s.members.map(function (m) {
            return '<span class="ux-set-member' + (m.owned ? ' owned' : '') + '">' + escHtml(m.id.replace('eq_', '')) + '</span>';
          }).join('');
          return '<div class="ux-set-card' + (active ? ' active' : '') + '">' +
            '<div class="usc-head"><span class="usc-name">' + escHtml(s.name) + '</span>' +
            '<span class="usc-count">' + s.activeCount + '/' + s.members.length + '</span></div>' +
            '<div class="usc-members">' + members + '</div>' +
            (active ? '<div class="usc-bonus">✦ ' + escHtml(active.desc) + '</div>' : '') +
          '</div>';
        }).join('');
        if (setsHtml) setsHtml = '<div class="ux-set-grid">' + setsHtml + '</div>';
      } catch (e) { setsHtml = ''; }
    }
    var entries = view.entries.slice(0, 120).map(function (en) {
      return '<div class="ux-codex-entry' + (en.discovered ? '' : ' unknown') + '">' +
        '<span class="ce-name">' + escHtml(en.name) + '</span>' +
        (en.detail ? '<span class="ce-detail">' + escHtml(en.detail) + '</span>' : '') +
      '</div>';
    }).join('');
    return '' +
      '<div class="ux-codex-progress">已发现 ' + view.discovered + ' / ' + view.total + '</div>' +
      '<div class="ux-codex-tabs">' + tabs + '</div>' +
      setsHtml +
      '<div class="ux-codex-grid">' + entries + '</div>';
  }

  function v57BossDropCardsHtml(done) {
    var f = facade();
    var drops = done && done.bossDrops ? done.bossDrops : [];
    if (!drops.length || !f || typeof f.queryEquipmentCompare !== 'function') return '';
    return drops.map(function (drop) {
      var cmp = null;
      try { cmp = f.queryEquipmentCompare(drop.equipmentId); } catch (e) { cmp = null; }
      if (!cmp) return '';
      var rarityCls = { COMMON: '', UNCOMMON: 'r2', RARE: 'r3', EPIC: 'r4', LEGENDARY: 'r5' }[cmp.next.rarity] || '';
      /* 词缀与基础属性重复的行去重（攻击+12% 出现两次等） */
      var seenLines = {};
      var lines = (cmp.next.lines || []).filter(function (l) {
        if (seenLines[l]) return false;
        seenLines[l] = true;
        return true;
      }).map(function (l) { return '<div class="lc-line">' + escHtml(l) + '</div>'; }).join('');
      var deltas = (cmp.deltas || []).slice(0, 4).map(function (dd) {
        return '<div class="lc-delta ' + (dd.better ? 'up' : 'down') + '">' + escHtml(dd.label) + ' ' + (dd.better ? '+' : '') + dd.delta + '</div>';
      }).join('');
      var setDisplayName = cmp.setName || (function () {
        if (!cmp.next.set || !f.querySets) return cmp.next.set;
        try {
          var hit = (f.querySets() || []).filter(function (s) { return s.id === cmp.next.set; })[0];
          return hit ? hit.name : cmp.next.set;
        } catch (e) { return cmp.next.set; }
      })();
      var setName = setDisplayName ? '<div class="lc-set">套装：' + escHtml(setDisplayName) + '</div>' : '';
      var slot = cmp.slot || 'DESK';
      return '<div class="ux-loot-card ' + rarityCls + '">' +
        '<div class="lc-rarity">' + escHtml((cmp.next.rarity === 'LEGENDARY' ? '仙品' : cmp.next.rarity === 'EPIC' ? '极品' : cmp.next.rarity === 'RARE' ? '上品' : cmp.next.rarity === 'UNCOMMON' ? '良品' : '凡品')) + '</div>' +
        '<div class="lc-name">' + escHtml(cmp.next.name) + '</div>' +
        lines + deltas + setName +
        (drop.viaPity ? '<div class="lc-pity">保底触发</div>' : '') +
        '<button class="ux-loot-equip" data-v57-equip="' + escHtml(drop.equipmentId) + '" data-v57-slot="' + escHtml(slot) + '">装备</button>' +
      '</div>';
    }).join('');
  }

  function v57WeeklySettlementModal() {
    var f = facade();
    if (!f || typeof f.queryWeeklySettlement !== 'function') return;
    var view = null;
    try { view = f.queryWeeklySettlement(); } catch (e) { view = null; }
    if (!view) return;
    var stamp = 'w' + view.weekIndex;
    if (_weekSettlementShownFor === stamp) return;
    _weekSettlementShownFor = stamp;
    var row = function (label, val) {
      return '<div class="ux-off-row"><span class="rl">' + escHtml(label) + '</span><span class="rv">' + escHtml(String(val)) + '</span></div>';
    };
    var goalRows = (view.goals || []).map(function (g) {
      return '<div class="ux-goal-row' + (g.done ? ' done' : '') + '"><span class="gr-name">' + escHtml(g.name) + '</span><span class="gr-progress">' + g.progress + '/' + g.target + '</span></div>';
    }).join('');
    var hookLines = (view.nextWeekHooks || []).map(function (h) { return '<div class="ux-hook-line">「' + escHtml(h) + '」</div>'; }).join('');
    var layer = popupLayer();
    if (!layer) return;
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup ux-weekly-popup">' +
          '<div class="ux-header" style="height:70px;border-radius:16px 16px 0 0;margin:0 -18px 14px"><span class="ux-header-title">第 ' + view.weekIndex + ' 周 · 牛马周报</span></div>' +
          '<div class="ux-popup-card">' +
            '<div class="ux-week-sec">本周概览</div>' +
            '<div class="ux-off-rows">' +
              row('工作', Math.floor(view.workMinutes / 60) + 'h' + (view.workMinutes % 60) + 'm') +
              row('加班', Math.floor(view.overtimeMinutes / 60) + 'h' + (view.overtimeMinutes % 60) + 'm') +
              row('免费加班', Math.floor(view.freeOvertimeMinutes / 60) + 'h' + (view.freeOvertimeMinutes % 60) + 'm') +
              row('摸鱼', Math.floor(view.fishingMinutes / 60) + 'h' + (view.fishingMinutes % 60) + 'm') +
              row('修炼', Math.floor(view.cultivationMinutes / 60) + 'h' + (view.cultivationMinutes % 60) + 'm') +
              row('准点下班', view.ontimeDays + ' / ' + view.ontimeTarget) +
              row('被甩锅', view.blamedCount + ' 次 · 反杀 ' + view.blameReturned + ' 次') +
              row('Boss 讨伐', view.bossKills + ' 次') +
            '</div>' +
            '<div class="ux-week-sec">本周称号</div>' +
            '<div class="ux-week-title">' + escHtml(view.weekTitle) + '</div>' +
            (goalRows ? '<div class="ux-week-sec">周目标</div>' + goalRows +
              '<button class="ux-goal-claim" data-v57-claim-weekly="' + (view.goals.every(function (g) { return g.done; }) ? '1' : '0') + '">领取周目标奖励</button>' : '') +
            '<div class="ux-week-sec">下周预告</div>' + hookLines +
            '<button class="ux-week-close" data-v57-close-weekly>收下，下周继续</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    layer.querySelector('[data-v57-close-weekly]').addEventListener('click', function () {
      layer.innerHTML = '';
      refresh();
    });
    var claimBtn = layer.querySelector('[data-v57-claim-weekly]');
    if (claimBtn) {
      claimBtn.addEventListener('click', function () {
        try {
          var r = f.claimWeeklyReward();
          toast(r.success ? ('周目标奖励：职业经验 +' + (r.professionExp || 0)) : (r.reason || '领取失败'), r.success ? 'success' : 'error');
          layer.innerHTML = '';
          refresh();
        } catch (e) { toast(errMsg(e), 'error'); }
      });
    }
  }

  function v57BindExtra(el) {
    if (!el) return;
    var restBtn = el.querySelector('[data-v57-rest]');
    if (restBtn && !restBtn.dataset.bound) {
      restBtn.dataset.bound = '1';
      restBtn.addEventListener('click', function () {
        var f = facade();
        try {
          var hours = Number(restBtn.getAttribute('data-v57-rest')) || 4;
          f.takeRest(hours);
          toast('休息了一会儿，身体轻松了些。', 'success');
          refresh();
        } catch (e) { toast(errMsg(e), 'error'); }
      });
    }
    var equipBtns = el.querySelectorAll('[data-v57-equip]');
    equipBtns.forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var f = facade();
        try {
          var slot = btn.getAttribute('data-v57-slot') || 'DESK';
          var id = btn.getAttribute('data-v57-equip');
          f.v2EquipItem(slot, id);
          toast('装备完毕。', 'success');
          btn.disabled = true;
        } catch (e) { toast(errMsg(e), 'error'); }
      });
    });
  }

  function renderCurrent() {
    var page = currentPage();
    switch (page) {
      case 'HOME': return renderHome();
      case 'TASKS': return renderTasks();
      case 'PROJECT': return renderProject();
      case 'CULTIVATION': return renderCultivation();
      case 'MESSENGER': return renderMessenger();
      case 'CRAFT': return renderCraft();
      case 'PROMOTION': {
        var hudP = readHUD();
        var v2Html = V2 && hudP ? V2.promotionPageHtml(hudP, readKpi(), readCareerAt(hudP.careerLevel + 1)) : null;
        if (v2Html) return v2Html;
        return renderPromotion();
      }
      case 'TECHNIQUES': return V2 ? V2.renderTechniques() : emptyState('📖', '功法', 'V2 数据未就绪');
      case 'EQUIPMENT': return V2 ? V2.renderEquipment() : emptyState('🎽', '法宝', 'V2 数据未就绪');
      case 'NPC': return V2 ? V2.renderNpc() : emptyState('🧑‍🤝‍🧑', '人际', 'V2 数据未就绪');
      case 'SETTLEMENT': return V2 ? V2.renderSettlementPage() : emptyState('🌇', '结算', 'V2 数据未就绪');
      case 'DEV': return V2 ? V2.renderDev() : emptyState('🚫', 'DEV', 'V2 数据未就绪');
      case 'MORE': return renderMore();
      case 'PROFESSION': return renderProfession();
      case 'CODEX': return renderCodex();
      case 'SECT': return renderSect();
      case 'LEADERBOARD': return renderLeaderboard();
      case 'FRIENDS': return renderFriends();
      case 'ACHIEVEMENTS': return renderAchievements();
      case 'SETTINGS': return renderSettings();
      default: return renderHome();
    }
  }

  function renderShell() {
    var overlay = $('#UiOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'UiOverlay';
      // 挂 body 而非 GameDiv: GameDiv 会被 Cocos 侧 resize 逻辑缩小,
      // overlay 需要铺满整个视口。
      document.body.appendChild(overlay);
    }
    var page = currentPage();
    var isHome = page === 'HOME';
    var isSub = !!_subPage;

    var header;
    if (isHome) {
      header = '';
    } else {
      header =
        '<div class="ux-header">' +
          '<button class="ux-back" data-action="back">‹</button>' +
          '<span class="ux-header-title">' + escHtml(PAGE_TITLES[page] || '') + '</span>' +
        '</div>';
    }

    var nav = '<div class="ux-nav">' + NAV_TABS.map(function (t) {
      var active = !isSub && _screen === t.id;
      var art = t.emoji
        ? '<span class="ux-nav-emoji">' + t.emoji + '</span>'
        : img(active && t.active ? t.active : t.icon);
      return '<button class="ux-nav-item' + (active ? ' ux-nav-item--active' : '') + '" data-nav="' + t.id + '">' +
        art + '<span>' + t.label + '</span></button>';
    }).join('') +
      '<div class="ux-nav-slogan">工作即修行<span>加班是磨砺</span></div>' +
      '</div>';

    overlay.innerHTML =
      '<div class="ux-screen">' +
        header +
        '<div class="ux-body' + (isHome ? ' ux-body--home' : '') + '" id="UiBody">' + renderCurrent() + '</div>' +
        nav +
      '</div>' +
      '<div id="PopupLayer"></div>' +
      '<div class="ux-toast-container" id="ToastBox"></div>';

    bindEvents();
  }

  function refresh() {
    var overlay = $('#UiOverlay');
    if (!overlay || !$('#UiBody')) { renderShell(); return; }
    var body = $('#UiBody');
    var scrollTop = body.scrollTop;
    /* 首页禁纵向滚动（§134）：加 home 修饰类，其余页面保持可滚动。 */
    body.classList.toggle('ux-body--home', currentPage() === 'HOME');
    /* 只重绘 body + header 内容，保持弹窗/toast 层不被打断 */
    body.innerHTML = renderCurrent();
    body.scrollTop = scrollTop;
    bindEvents();
    if (currentPage() === 'PROJECT') spawnBattleFloats();
  }

  function fullRefresh() { renderShell(); }

  /* ── 事件绑定 (委托) ── */

  var _settings = { sfx: true, bgm: true, notify: false };


  /* V5.5 §18：战斗飘字——从新增日志行提取伤害数字，向敌人卡注入上飘淡出元素。 */
  var _battleLogSeen = 0;
  function spawnBattleFloats() {
    var f = facade();
    if (!f || typeof f.queryBattle !== 'function') return;
    var run = null;
    try { run = f.queryBattle(); } catch (e) { return; }
    if (!run || !run.log) { _battleLogSeen = 0; return; }
    var log = run.log;
    if (log.length <= _battleLogSeen) { _battleLogSeen = log.length; return; }
    var fresh = log.slice(_battleLogSeen);
    _battleLogSeen = log.length;
    var cards = document.querySelectorAll('.ux-bt-enemy');
    if (!cards.length) return;
    var idx = 0;
    fresh.forEach(function (line) {
      var m = line.match(/造成 (d+) 点伤害/);
      var heal = line.match(/回复 (d+)/);
      var crit = /暴击/.test(line);
      if (!m && !heal) return;
      var card = cards[idx % cards.length];
      idx += 1;
      var layer = card.querySelector('.ux-float-layer');
      if (!layer) return;
      var el = document.createElement('span');
      el.className = 'ux-bt-float' + (crit ? ' crit' : '') + (heal ? ' heal' : '');
      el.textContent = crit ? '-' + m[1] + '!' : (heal ? '+' + heal[1] : '-' + m[1]);
      layer.appendChild(el);
      setTimeout(function () { el.remove(); }, 800);
    });
  }

  function bindEvents() {
    var overlay = $('#UiOverlay');
    if (!overlay) return;

    overlay.onclick = function (e) {
      var el = e.target.closest ? e.target.closest('[data-action],[data-nav],[data-select-action],[data-open-conversation],[data-reply],[data-choose-profession],[data-goto-page],[data-tasktab],[data-crafttab],[data-lbtab],[data-ftab],[data-achtab],[data-codex-tab]') : null;
      if (!el) return;

      if (el.dataset.gotoPage) {
        _screen = el.dataset.gotoPage;
        _subPage = null;
        fullRefresh();
        return;
      }
      if (el.dataset.chooseProfession) {
        var fProf = facade();
        if (fProf && typeof fProf.chooseProfession === 'function') {
          try {
            var profResult = fProf.chooseProfession(el.dataset.chooseProfession);
            if (profResult.success) {
              toast('道途已定！开始你的牛马修仙之旅。', 'success');
              fullRefresh();
            } else {
              toast(profResult.reason || '选择失败', 'error');
            }
          } catch (err) { toast(errMsg(err), 'error'); }
        }
        return;
      }
      if (el.dataset.reply) {
        var fReply = facade();
        if (fReply && typeof fReply.replyToMessage === 'function') {
          try {
            var replyResult = fReply.replyToMessage(el.dataset.message, el.dataset.reply);
            if (replyResult && replyResult.ok) {
              toast('已回复。灵网归于平静。', 'success');
              _messengerReplyMessageId = null;
            } else {
              toast((replyResult && replyResult.reason) || '回复失败', 'error');
            }
          } catch (err) { toast(errMsg(err), 'error'); }
        }
        refresh();
        return;
      }
      if (el.dataset.openConversation) {
        _messengerActiveConversation = el.dataset.openConversation;
        _messengerReplyMessageId = null;
        var fOpen = facade();
        if (fOpen && typeof fOpen.markConversationRead === 'function') {
          try { fOpen.markConversationRead(_messengerActiveConversation); } catch (err) { /* noop */ }
        }
        refresh();
        return;
      }
      if (el.dataset.selectAction) {
        /* 动作选择器：只切换详情，不发命令（§28） */
        _selectedAction = el.dataset.selectAction;
        refresh();
        return;
      }
      if (el.dataset.nav) {
        var tab = el.dataset.nav;
        _subPage = null;
        if (_screen !== tab) { _screen = tab; fullRefresh(); }
        return;
      }
      var act = el.dataset.action;
      if (!act) {
        /* 页内 tab 切换 */
        if (el.dataset.tasktab) { _taskTab = el.dataset.tasktab; refresh(); }
        else if (el.dataset.crafttab) { _craftTab = el.dataset.crafttab; refresh(); }
        else if (el.dataset.lbtab) { _lbTab = el.dataset.lbtab; refresh(); }
        else if (el.dataset.ftab) { _friendTab = el.dataset.ftab; refresh(); }
        else if (el.dataset.achtab) { _achTab = el.dataset.achtab; refresh(); }
        else if (el.dataset.codexTab) { _codexTab = el.dataset.codexTab; refresh(); }
        return;
      }

      switch (act) {
        case 'back':
          _subPage = null;
          fullRefresh();
          break;
        case 'goto':
          _subPage = (el.dataset.page || '').toUpperCase();
          if (_subPage === 'SETTINGS') _subPage = 'SETTINGS';
          fullRefresh();
          break;
        case 'settings':
          _subPage = 'SETTINGS';
          fullRefresh();
          break;
        case 'openMessenger':
          _subPage = 'MESSENGER';
          _messengerActiveConversation = null;
          _messengerReplyMessageId = null;
          fullRefresh();
          break;
        case 'gotoTasks':
          _screen = 'TASKS';
          _subPage = null;
          fullRefresh();
          break;
        case 'openPending': {
          var pendingOpened = dispatchNextModal();
          if (!pendingOpened) toast('暂无待处理的破事，安心搬砖。', 'info');
          refresh();
          break;
        }
        case 'cultivate': {
          var fCult = facade();
          if (!fCult || typeof fCult.cultivate !== 'function') { console.warn('[overlay] cultivate unavailable'); break; }
          try {
            var rCult = fCult.cultivate();
            _cultivateFx = {
              exp: rCult && rCult.cultivationExp !== undefined ? rCult.cultivationExp : 0,
              mind: rCult && rCult.mindEfficiency ? Math.max(1, Math.round(rCult.mindEfficiency)) : 1,
              at: Date.now(),
            };
            toast('修炼成功，修为 +' + (_cultivateFx.exp || 0), 'success');
          } catch (e) { toast(errMsg(e), 'error'); }
          refresh();
          break;
        }
        case 'mode':
          cmdResult('changeWorkMode', '切换成功', el.dataset.mode);
          break;
        case 'voluntaryOvertime': {
          var fOvertime = facade();
          try {
            if (!fOvertime) throw new Error('游戏尚未就绪');
            fOvertime.startVoluntaryOvertime(2 * 3600, false);
            toast('已开启 2 小时自愿奋斗：本次没有工资补偿。', 'info');
            refresh();
          } catch (e) { toast(errMsg(e), 'error'); }
          break;
        }
        case 'requestFreeOvertime': {
          var fRequestOvertime = facade();
          try {
            if (!fRequestOvertime) throw new Error('游戏尚未就绪');
            fRequestOvertime.offerOvertime('REQUESTED', true, 2 * 3600);
            toast('老板的免费加班询问已摆到桌面上，选择权在你。', 'info');
            refresh();
          } catch (e) { toast(errMsg(e), 'error'); }
          break;
        }
        case 'acceptFreeOvertime': {
          var fAcceptOvertime = facade();
          try {
            if (!fAcceptOvertime) throw new Error('游戏尚未就绪');
            var currentMode = fAcceptOvertime.snapshot().workMode;
            fAcceptOvertime.acceptOvertime(currentMode);
            toast('已接受免费加班。额外工资 ¥0.00。', 'info');
            refresh();
          } catch (e) { toast(errMsg(e), 'error'); }
          break;
        }
        case 'declineOvertime': {
          var fDeclineOvertime = facade();
          try {
            if (!fDeclineOvertime) throw new Error('游戏尚未就绪');
            var declineResult = fDeclineOvertime.declineOvertime();
            if (!declineResult.success) throw new Error(declineResult.reason || '当前无法拒绝');
            toast('已婉拒免费加班。准时下班也是一种修行。', 'success');
            refresh();
          } catch (e) { toast(errMsg(e), 'error'); }
          break;
        }
        case 'finishOvertime': {
          var fFinish = facade();
          try {
            if (!fFinish) throw new Error('游戏尚未就绪');
            fFinish.finishOvertime();
            toast('加班已结束，记得把自己也保存一下。', 'success');
            refresh();
          } catch (e) { toast(errMsg(e), 'error'); }
          break;
        }
        case 'openModal':
          openHomeModal(el.dataset.modal);
          break;
        case 'projectEntry':
          openBuildSelectModal();
          break;
        case 'openIncidentDungeon': {
          var fDungeon = facade();
          if (!fDungeon || typeof fDungeon.startIncidentDungeon !== 'function') { toast('线上禁地未就绪', 'error'); break; }
          try {
            fDungeon.startIncidentDungeon(el.dataset.incident || '');
            toast('进入线上禁地！Boss 已现身。', 'success');
            _screen = 'PROJECT';
            _subPage = null;
            fullRefresh();
          } catch (e) { toast(errMsg(e), 'error'); }
          break;
        }
        case 'battleSkill': {
          var fSkill = facade();
          if (!fSkill || typeof fSkill.castBattleSkill !== 'function') break;
          try {
            fSkill.castBattleSkill(el.dataset.skill);
            refresh();
          } catch (eSkill) { toast(errMsg(eSkill), 'error'); }
          break;
        }
        case 'abandonBattle': {
          var fAbandon = facade();
          if (fAbandon) {
            try { fAbandon.abandonBattleRun(); toast('你退出了项目。', 'info'); } catch (e) { toast(errMsg(e), 'error'); }
            refresh();
          }
          break;
        }
        case 'closePopup':
          closePopup();
          refresh();
          break;
        case 'assignedDone': {
          var fDone = facade();
          if (!fDone) break;
          try {
            var done = fDone.completeAssignedTask(el.dataset.id);
            toast(done && done.summary ? done.summary : '任务完成。', 'success');
          } catch (e) { toast(errMsg(e), 'error'); }
          closePopup();
          refresh();
          break;
        }
        case 'assignedRefuse': {
          var fRefuse = facade();
          if (!fRefuse) break;
          try {
            var refused = fRefuse.refuseAssignedTask(el.dataset.id);
            toast(refused && refused.summary ? refused.summary : '已搁置。', 'info');
          } catch (e) { toast(errMsg(e), 'error'); }
          closePopup();
          refresh();
          break;
        }
        case 'startDefense':
          if (V2) {
            var fPromotion = facade();
            var promotionProjection = null;
            try { promotionProjection = fPromotion && fPromotion.queryPromotionCheckV2 ? fPromotion.queryPromotionCheckV2() : null; } catch (e) { promotionProjection = null; }
            dispatchNextModal({
              id: 'promotion:requested', kind: 'PROMOTION', projection: promotionProjection,
              open: function () { V2.showDefenseModal(); },
            });
          }
          break;
        case 'doSettle': {
          var fSettle = facade();
          if (fSettle) {
            try {
              var view = fSettle.settleDay();
              toast('结算完成：' + view.title + ' · 评级 ' + view.rank, 'success');
            } catch (e) { toast(errMsg(e), 'error'); }
            fullRefresh();
          }
          break;
        }
        case 'devAdvance':
          cmd('devAdvanceTime', Number(el.dataset.arg));
          toast('DEV: 时间已推进', 'info');
          break;
        case 'devJump':
          cmd('devJumpToHour', Math.floor(Number(el.dataset.arg) / 60), Number(el.dataset.arg) % 60);
          toast('DEV: 已跳转', 'info');
          break;
        case 'devNextDay':
          cmd('devJumpToHour', 9, 0);
          toast('DEV: 次日 09:00', 'info');
          break;
        case 'devMind':
          cmd('devSetMind', Number(el.dataset.arg));
          break;
        case 'devDemon':
          cmd('devSetDemon', Number(el.dataset.arg));
          break;
        case 'devMaterial': {
          var matId = el.dataset.arg === '10' ? 'mat_lingcao' : 'mat_page';
          var n = el.dataset.arg === '10' ? 10 : 5;
          cmd('devGrantMaterial', matId, n);
          break;
        }
        case 'devEvent': {
          var fDev = facade();
          if (fDev && fDev.devForceEvent(el.dataset.arg)) toast('DEV: 事件已触发', 'info');
          else toast('触发失败', 'error');
          break;
        }
        case 'techEquip': {
          var fT = facade();
          if (fT) {
            var owned = fT.queryOwnedTechniques();
            var eqd = fT.queryEquippedTechniques();
            var slot = -1;
            for (var si = 0; si < 3; si++) {
              if (eqd[si] === el.dataset.id) { slot = -2; break; }
              if (eqd[si] === null && slot === -1) slot = si;
            }
            if (slot === -2) { toast('已装备该功法', 'info'); break; }
            if (slot === -1) slot = 2;
            cmdResult('v2EquipTechnique', '装备成功', slot, el.dataset.id);
          }
          break;
        }
        case 'techUnequip':
          cmd('v2EquipTechnique', Number(el.dataset.slot), null);
          break;
        case 'techUpgrade':
          cmdResult('v2UpgradeTechnique', '升级成功', el.dataset.id);
          break;
        case 'equipItem': {
          var fE = facade();
          if (fE) {
            var slotMap = { DESK: 'DESK', BADGE: 'BADGE', ACCESSORY: 'ACCESSORY' };
            var slotGuess = el.dataset.slot && el.dataset.slot !== 'DESK' ? el.dataset.slot : guessSlot(fE, el.dataset.id);
            cmdResult('v2EquipItem', '装备成功', slotGuess, el.dataset.id);
          }
          break;
        }
        case 'equipUnequip':
          cmd('v2EquipItem', el.dataset.slot, null);
          break;
        case 'start':
          cmdResult('startTask', '任务已开始', el.dataset.id);
          break;
        case 'claim':
          cmdResult('claimTask', '任务奖励已领取', el.dataset.id);
          cmd('cleanupClaimedTasks');
          break;
        case 'craft':
          cmdResult('craft', '炼制成功！', el.dataset.id);
          break;
        case 'promote': {
          var promo = readPromotion();
          var f = facade();
          if (!f) { console.warn('[overlay] promote unavailable'); break; }
          try {
            var r = f.promote(promo.optionId);
            if (r.success) toast('渡劫成功！晋升 ' + (r.newLevel ? 'Lv.' + r.newLevel : ''), 'success');
            else toast(r.reason || '渡劫失败', 'error');
          } catch (e) { toast(errMsg(e), 'error'); }
          refresh();
          break;
        }
        case 'promoRetry': {
          var pf = facade();
          if (!pf) { console.warn('[overlay] promo retry unavailable'); break; }
          showAdPopup({
            onComplete: function () {
              try {
                pf.showRewardedAdSync('PROMOTION_RETRY', 'PROMOTION_RETRY');
                toast('重试机会已获得', 'success');
              } catch (e) { toast(errMsg(e), 'error'); }
              refresh();
            },
          });
          break;
        }
        case 'sect': {
          var cur = readSects().currentId;
          var sectId = el.dataset.id;
          var sectName = (readSects().sects.filter(function (s) { return s.id === sectId; })[0] || {}).name || '新宗门';
          if (!cur) {
            cmdResult('changeSect', '已拜入' + sectName, sectId);
          } else {
            showDialog('转宗确认', '转宗需要 <b>24 小时</b>冷却，确定要转投 ' + escHtml(sectName) + ' 吗？', [
              { label: '取消', cls: 'gray' },
              { label: '确定转宗', cls: 'gold', onClick: function () { cmdResult('changeSect', '已转投新宗门', sectId); } },
            ]);
          }
          break;
        }
        case 'visit':
          cmdResult('sendFriendGift', '拜访成功，已赠送好友灵石', el.dataset.id);
          break;
        case 'copyInvite':
          copyText('NM-2026-XX88');
          toast('邀请码已复制', 'success');
          break;
        case 'claimAch':
          cmd('claimAchievement', el.dataset.id);
          toast('成就奖励已领取', 'success');
          break;
        case 'toggle': {
          var key = el.dataset.key;
          _settings[key] = !_settings[key];
          el.className = 'ux-btn ux-btn--' + (_settings[key] ? 'gold' : 'gray') + ' ux-btn--sm';
          el.textContent = _settings[key] ? '开' : '关';
          break;
        }
        case 'clearSave':
          showDialog('清空存档', '确定要<b style="color:var(--neg)">删除全部存档</b>吗？此操作不可恢复。', [
            { label: '取消', cls: 'gray' },
            {
              label: '确定清空', cls: 'blue', onClick: function () {
                try { facade() && facade().clearSave(); toast('存档已清空', 'success'); }
                catch (e) { toast(errMsg(e), 'error'); }
                refresh();
              },
            },
          ]);
          break;
      }
    };
  }

  function guessSlot(f, equipmentId) {
    // 兜底按 id 关键词猜槽位（按钮未携带 data-slot 时）。
    if (/keyboard|monitor|cup|chair|cactus|pillow|desk|filter|mug|plant|hoodie|thinkpad|lunch|footrest|stand/i.test(equipmentId)) return 'DESK';
    if (/badge|usb|token|doc|book|cable/i.test(equipmentId)) return 'BADGE';
    return 'ACCESSORY';
  }

  function copyText(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch (e) { /* noop */ }
  }

  /* ═════════════════════════════════════════════════════════
     §8. Hide Cocos canvas (overlay replaces native UI)
     ═════════════════════════════════════════════════════════ */

  function hideCocosUI() {
    var canvas = document.querySelector('#GameDiv canvas');
    if (canvas) { canvas.style.opacity = '0'; canvas.style.pointerEvents = 'none'; }
    var container = document.getElementById('Cocos3dGameContainer');
    if (container) { container.style.opacity = '0'; container.style.pointerEvents = 'none'; }
  }

  /* ═════════════════════════════════════════════════════════
     §9. Public API
     ═════════════════════════════════════════════════════════ */

  window.UiOverlay = {
    cmd: cmd,
    toast: toast,
    refresh: refresh,
    fullRefresh: fullRefresh,
    goto: function (page) { _subPage = String(page || '').toUpperCase(); fullRefresh(); },
    openMessenger: function (conversationId) {
      _screen = 'HOME'; _subPage = 'MESSENGER';
      _messengerActiveConversation = conversationId || null;
      _messengerReplyMessageId = null;
      fullRefresh();
    },
    showAdPopup: showAdPopup,
    showOfflinePopup: function () {
      var f = facade();
      if (!f || typeof f.prepareWelcomeBack !== 'function') return;
      var welcome = f.prepareWelcomeBack();
      showOfflinePopup(welcome.settlementId);
    },
    showWelcomeBackPopup: showWelcomeBackPopup,
    showDialog: showDialog,
    closePopup: closePopup,
    dispatchNextModal: dispatchNextModal,
    /* DEV/测试直连：绕过仲裁器优先级，直接渲染战斗结算/技能三选一 */
    showBattleOutcome: function () { maybeShowBattleModals(); },
  };

  /* ═════════════════════════════════════════════════════════
     §10. Init
     ═════════════════════════════════════════════════════════ */

  function init() {
    console.log('[UI] Web V1 overlay initializing...');
    hideCocosUI();
    fullRefresh();

    /* 轮询 Facade — 就绪后切真实数据 + 离线收益检查 */
    var attempts = 0;
    var poll = setInterval(function () {
      attempts += 1;
      if (facade()) {
        clearInterval(poll);
        console.log('[UI] GameFacade ready — switching to live data');
        _demoMode = false;
        subscribeEvents();
        setTimeout(function () {
          _startupWelcomePending = true;
          dispatchNextModal();
        }, 1200);
        refresh();
      } else if (attempts >= 100) {
        clearInterval(poll);
        console.warn('[UI] GameFacade not found — staying in demo mode');
      }
    }, 300);

    /* V2 UI 桥接初始化 */
    function initV2Bridge() {
      if (!window.V2UI) return false;
      window.V2UI.init({
        facade: facade,
        $: $, $$: $$, escHtml: escHtml, img: img, icon: icon, fmtNum: fmtNum, hms: hms,
        emptyState: emptyState, reqRow: reqRow, kpiShortLabel: kpiShortLabel,
        popupLayer: popupLayer, closePopup: closePopup, popupOpen: popupOpen,
        toast: toast, errMsg: errMsg, refresh: refresh,
      });
      V2 = window.V2UI;
      fullRefresh();
      return true;
    }
    if (!initV2Bridge()) {
      var v2Poll = setInterval(function () {
        if (initV2Bridge()) clearInterval(v2Poll);
      }, 500);
    }

    /* 主刷新循环: 倒计时/冷却/事件/V2 弹窗/V4 战斗弹窗 */
    setInterval(function () {
      _cdCache = {};
      if (!popupOpen()) {
        refresh();
        dispatchNextModal();
      }
    }, 1000);
  }

  function subscribeEvents() {
    var f = facade();
    if (!f || !f.onUiEvent) return;
    ['STATE_CHANGED', 'RESOURCE_CHANGED', 'WORK_MODE_CHANGED', 'CAREER_CHANGED', 'BUFF_CHANGED'].forEach(function (cat) {
      try {
        var unsub = f.onUiEvent(cat, function (ev) {
          /* V5.7：周日结算就绪 → 牛马周报弹窗 */
          if (ev && ev.source === 'weekSettlementReady') {
            setTimeout(v57WeeklySettlementModal, 400);
          }
          if (ev && ev.source === 'secretEventFired' && ev.detail && ev.detail.name) {
            toast('隐藏事件触发：' + ev.detail.name, 'success');
          }
          if (ev && ev.source === 'fatigueCritical' && ev.detail && ev.detail.text) {
            toast(ev.detail.text, 'error');
          }
          setTimeout(refresh, 60);
        });
        if (typeof unsub === 'function') _unsubs.push(unsub);
      } catch (e) { /* noop */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
