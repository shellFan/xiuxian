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

  var NAV_TABS = [
    { id: 'HOME',      label: '首页', icon: 'nav-home-active', active: 'nav-home-active' },
    { id: 'TASKS',     label: '任务', icon: 'nav-tasks', active: 'nav-tasks-active' },
    { id: 'CRAFT',     label: '合成', icon: 'nav-craft', active: 'nav-craft-active' },
    { id: 'PROMOTION', label: '晋升', icon: 'nav-promo', active: null },
    { id: 'MORE',      label: '更多', icon: 'nav-more',  active: null },
  ];

  var PLAYER_NAME = '范大牛';

  var TASK_TABS = [
    { type: 'DAILY',       label: '日常任务' },
    { type: 'WORK',        label: '工作任务' },
    { type: 'CULTIVATION', label: '修炼任务' },
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
      toast('演示模式：' + name, 'info');
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
    if (!f || typeof f[name] !== 'function') { toast('演示模式：' + name, 'info'); return; }
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

  function closePopup() {
    var layer = popupLayer();
    if (layer) layer.innerHTML = '';
    _adTimer && clearInterval(_adTimer); _adTimer = null;
  }

  function popupOpen() {
    var layer = popupLayer();
    return !!layer && layer.innerHTML !== '';
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

  /* ═════════════════════════════════════════════════════════
     §6. Page renderers
     ═════════════════════════════════════════════════════════ */

  /* ── 6a. 首页 ── */

  /* V2 UI 桥接（ui-overlay-v2.js） */
  var V2 = null; // 由 initV2Bridge 在注入宿主后赋值（未 init 的 V2UI 缺少 H 工具）

  function renderHome() {
    var hud = readHUD();
    if (!hud) return emptyState('⏳', '加载中...', '正在唤醒游戏数据');
    var quote = QUOTES[Math.floor(Date.now() / 3600000) % QUOTES.length];
    void quote;
    return '' +
      '<div class="ux-home">' +
        homeTopbarHtml(hud) +
        '<aside class="ux-home-col ux-home-left">' + homeLeftHtml(hud) + '</aside>' +
        '<main class="ux-home-col ux-home-center">' + homeCenterHtml(hud) + '</main>' +
        '<aside class="ux-home-col ux-home-right">' + homeRightHtml(hud) + '</aside>' +
      '</div>';
  }

  /* PC 首页顶栏：品牌 / 日期·星期·时钟 / 今日局势 / 设置（§5） */
  function homeTopbarHtml(hud) {
    var g = null;
    var f = facade();
    if (f && typeof f.queryGameClock === 'function') { try { g = f.queryGameClock(); } catch (e) { g = null; } }
    var clockText = '--:--:--';
    var dateText = '';
    var stateText = '准备开工';
    if (g) {
      clockText = String(g.hour).padStart(2, '0') + ':' + String(g.minute).padStart(2, '0');
      var nowDate = new Date();
      dateText = (nowDate.getMonth() + 1) + '月' + nowDate.getDate() + '日';
      var weekName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][g.weekday] || '';
      if (g.isWeekend) stateText = '周末 · 肉身自由';
      else if (g.isWorkingHours) stateText = '上班中';
      else stateText = (g.hour >= 18) ? '已过下班点' : '未开工';
      dateText += ' ' + weekName;
    }
    return '<div class="ux-topbar">' +
      '<div class="ux-brand">' + img('brand-title', 'ux-brand-title') + '</div>' +
      '<div class="ux-topbar-clock"><b>' + clockText + '</b><span>' + dateText + ' · ' + escHtml(stateText) + ' · ' + escHtml(hud.careerName || '') + '</span></div>' +
      (V2 ? '<div class="ux-topbar-sit">' + V2.situationHtml() + '</div>' : '') +
      '<button class="ux-gear" data-action="settings">⚙</button>' +
      '</div>';
  }

  /* 左栏：角色 / 四维 / 证据袋 / NPC 陪伴 */
  function homeLeftHtml(hud) {
    var f = facade();
    var evidence = f && typeof f.queryEvidence === 'function' ? (f.queryEvidence() || []) : [];
    var sect = hud.sectName ? '<div class="ux-player-sect">宗门 · ' + escHtml(hud.sectName) + '</div>' : '';
    return '<div class="ux-card ux-player">' +
        img('home-avatar', 'ux-player-avatar') +
        '<div>' +
          '<div class="ux-player-name">' + PLAYER_NAME + '</div>' +
          '<div class="ux-player-sub">' + escHtml(hud.careerName) + ' · ' + escHtml(hud.realm) + '</div>' +
          sect +
        '</div>' +
      '</div>' +
      '<div class="ux-stats">' +
        statBox('cultivation', '修为', fmtNum(hud.cultivationExp) + (hud.requiredExp > 0 ? '<small> / ' + fmtNum(hud.requiredExp) + '</small>' : '')) +
        statBox('salary', '工资', fmtNum(hud.salary)) +
        statBox('performance', '绩效', fmtNum(hud.performance)) +
        statBox('mind', '道心', fmtNum(hud.mind) + '<small> / ' + fmtNum(hud.maxMind) + '</small>') +
      '</div>' +
      '<button class="ux-card ux-evidence-line" data-action="openModal" data-modal="evidence">' +
        '🧾 证据袋 <b>' + evidence.length + '</b> 件<span class="ux-evidence-hint">点击查看</span>' +
      '</button>' +
      npcCompanionHtml(hud);
  }

  /* 中栏：下班倒计时 / 实时工资 / 进度 / 操作（§9~§13） */
  function homeCenterHtml(hud) {
    var rates = readRates();
    var cd = cooldownOf('cultivate');
    var mode = hud.workMode || 'WORK';
    var MODE_META = {
      WORK: { label: '努力工作', sub: '钱+30%', emoji: '💼', cls: 'blue' },
      FISHING: { label: '带薪摸鱼', sub: '道心回复', emoji: '🐟', cls: 'green' },
      CULTIVATING: { label: '偷偷修炼', sub: '修为×2.0', emoji: '🧘', cls: 'gold' },
      SOCIAL: { label: '社交划水', sub: '关系×2', emoji: '🍵', cls: 'gray' },
    };
    var modeBtns = ['WORK', 'FISHING', 'CULTIVATING', 'SOCIAL'].map(function (m) {
      var meta = MODE_META[m];
      return modeBtn(m, meta.label, meta.sub, meta.emoji, meta.cls, mode === m);
    }).join('');
    return workTodayHtml() +
      '<div class="ux-earned-card" id="EarnedCard">' + earnedCardInner(hud, rates) + '</div>' +
      '<div class="ux-center-actions">' +
        '<button class="ux-btn ux-btn--gold ux-btn--sm ux-cultivate-btn" data-action="cultivate">' +
          '🔥 修炼一次' +
          (cd > 0 ? '<span class="ux-cultivate-cd">' + Math.ceil(cd) + 's</span>' : '<span class="dot"></span>') +
        '</button>' +
        '<div class="ux-mode-row ux-mode-row--4">' + modeBtns + '</div>' +
      '</div>' +
      '<div class="ux-status-line"><span class="ux-status-ribbon">' + escHtml(homeStatusText(hud)) + '</span>' +
        '<span class="ux-idle-timer">今日挂机 <b id="IdleTimer">' + hms(sessionSeconds()) + '</b></span></div>';
  }

  /* 右栏：今日待办 / 购买力 / 黄历 / 最近动态（§34/§51/§53/§58） */
  function homeRightHtml(hud) {
    void hud;
    return agendaHtml() + purchasingPowerHtml() + fortuneHtml() + recentTimelineHtml();
  }

  function statBox(stat, label, value) {
    return '<div class="ux-stat"><div class="ux-stat-label">' + icon(stat) + label + '</div>' +
      '<div class="ux-stat-value">' + value + '</div></div>';
  }

  function modeBtn(mode, label, sub, emoji, cls, active) {
    return '<button class="ux-btn ux-btn--' + cls + ' ux-mode-btn' + (active ? '' : ' ux-mode-btn--off') + '" data-action="mode" data-mode="' + mode + '">' +
      '<span class="m1">' + emoji + ' ' + label + '</span><span class="m2">' + sub + '</span></button>';
  }

  function homeStatusText(hud) {    var tasks = readTasks();
    var running = (tasks.active || []).filter(function (t) { return !t.claimed; }).length > 0;
    var f = facade();
    var ot = null;
    if (f && typeof f.queryOvertime === 'function') { try { ot = f.queryOvertime(); } catch (e) { ot = null; } }
    if (ot && ot.status === 'ACTIVE') return ot.free ? '正在免费燃烧生命...' : '带薪奋斗中...';
    if (running) return '正在偷偷运转周天...';
    if (hud.workMode === 'FISHING') return '带薪摸鱼中，道心平稳...';
    if (hud.workMode === 'CULTIVATING') return '屏息凝神，偷偷修炼...';
    if (hud.workMode === 'SOCIAL') return '茶水间情报交换中...';
    return '努力搬砖中，修为渐长...';
  }

  /* NPC 陪伴：按状态给一句（§54~§55） */
  function npcCompanionHtml(hud) {
    var f = facade();
    var g = f && typeof f.queryGameClock === 'function' ? (function () { try { return f.queryGameClock(); } catch (e) { return null; } })() : null;
    var rels = f && typeof f.queryNpcViews === 'function' ? (function () { try { return f.queryNpcViews(); } catch (e) { return null; } })() : null;
    var hour = g ? g.hour : 12;
    var line;
    if (g && g.isWeekend) {
      line = ['小师妹：周末的云比周一的好看。', '小师妹：别看手机了，企业群不会自己冒红点。', '小师妹：今天的修炼计划是——躺着。'][dayPick(3)];
    } else if (hour >= 18) {
      line = ['小师妹："工资已经下班了，你还没有。"', '小师妹："再不走，保洁阿姨都要赶人了。"', '小师妹："晚风不错，适合御剑（地铁）。"'][dayPick(3)];
    } else if (hour >= 17) {
      line = ['小师妹："正在偷偷收拾东西。"', '小师妹："不要有人叫我。"', '小师妹："还有一会儿，行吧，我陪你。"'][dayPick(3)];
    } else if (hud.workMode === 'FISHING') {
      line = ['小师妹："摸鱼是门手艺，你已经是老师傅了。"', '小师妹："正在屏蔽产品经理的气息。"'][dayPick(2)];
    } else if (hud.workMode === 'CULTIVATING') {
      line = ['小师妹："正在和困意斗法。"', '小师妹："肉身在工位，元神已到食堂。"'][dayPick(2)];
    } else {
      line = ['小师妹："正在炼化老板画的大饼。"', '小师妹："还有几个小时，行吧，我陪你。"', '小师妹："今天也要平安下班哦。"'][dayPick(3)];
    }
    var relText = '';
    if (rels && rels.length) {
      var best = rels.reduce(function (a, b) { return ((b.relationship || 0) > (a.relationship || 0) ? b : a); }, rels[0]);
      if (best && best.name) relText = '<span class="ux-npc-rel">至交：' + escHtml(best.name) + '</span>';
    }
    return '<div class="ux-card ux-npc-line"><div class="ux-npc-quote">' + escHtml(line) + '</div>' + relText + '</div>';
  }

  function dayPick(mod) {
    var day = 0;
    var f = facade();
    if (f && typeof f.queryGameDay === 'function') { try { day = (f.queryGameDay() || {}).dayIndex || 0; } catch (e) { day = 0; } }
    return (day + new Date().getDate()) % mod;
  }

  /* Work Today is a projection only: it never derives time or mutates salary in the UI. */
  function workTodayHtml() {
    var f = facade();
    var view;
    if (f && typeof f.queryWorkToday === 'function') {
      try { view = f.queryWorkToday(); } catch (e) { view = null; }
    }
    if (!view) {
      /* Keep the shipped desktop shell informative while the Cocos facade wakes up. */
      view = { countdownMs: 5 * 60 * 1000, standardWorkSeconds: 7 * 3600 + 55 * 60, overtimeSeconds: 0, freeOvertimeSeconds: 0, timeline: [] };
    }
    var overtime = f && typeof f.queryOvertime === 'function' ? f.queryOvertime() : null;
    var g = f && typeof f.queryGameClock === 'function' ? (function () { try { return f.queryGameClock(); } catch (e) { return null; } })() : null;
    var weekend = !!(g && g.isWeekend);
    var headline;
    if (weekend) {
      headline = '<div class="ux-work-today__headline">距离周一 <b>' + hms(timeUntilMondayMs() / 1000) + '</b><small class="ux-wt-sub">肉身自由。</small></div>';
    } else {
      var pct = Math.max(0, Math.min(100, Math.round((view.standardWorkSeconds || 0) / (8 * 3600) * 100)));
      headline = '<div class="ux-work-today__headline">距离下班 <b id="WorkTodayCountdown">' + hms(view.countdownMs / 1000) + '</b>' +
        '<small class="ux-wt-sub">今天已熬过去 ' + pct + '%</small></div>' +
        '<div class="ux-wt-bar"><i style="width:' + pct + '%"></i></div>';
    }
    var overtimeBit = '';
    var action = '';
    if (overtime && overtime.status === 'ACTIVE') {
      overtimeBit = '<div class="ux-work-today__warning">' + (overtime.free
        ? '免费加班 ' + hms(view.freeOvertimeSeconds || 0) + ' · 额外工资 ¥0.00 —— 工资已经下班了，你还没有。'
        : '带薪加班中 · 1.5×工资结算') + '</div>';
      action = '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="finishOvertime">结束加班</button>';
    } else if (!weekend) {
      overtimeBit = '<div class="ux-work-today__grid"><span>标准工时 ' + hms(view.standardWorkSeconds) + '</span><span>加班 ' + hms(view.overtimeSeconds) + '</span><span>免费加班 ' + hms(view.freeOvertimeSeconds) + '</span></div>';
      action = '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="voluntaryOvertime">今晚再卷 2 小时</button>';
    } else {
      action = '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="voluntaryOvertime">主动渡劫（加班 2h）</button>';
    }
    return '<section class="ux-work-today">' + headline + overtimeBit +
      '<div class="ux-work-today__actions">' + action +
      '<button class="ux-btn ux-btn--sm ux-btn--ghost" data-action="openModal" data-modal="timeline">今日时间线</button></div>' +
      '</section>';
  }

  function timeUntilMondayMs() {
    var now = new Date();
    var next = new Date(now);
    var add = (8 - now.getDay()) % 7 || 7;
    next.setDate(now.getDate() + add);
    next.setHours(9, 0, 0, 0);
    return Math.max(0, next.getTime() - now.getTime());
  }

  /* 实时工资卡：只做 projection（§10/§11） */
  function earnedCardInner(hud, rates) {
    var f = facade();
    var day = f && typeof f.queryGameDay === 'function' ? (function () { try { return f.queryGameDay(); } catch (e) { return null; } })() : null;
    var income = day && day.income ? day.income.salary : hud.salaryToday != null ? hud.salaryToday : 0;
    var fishing = day && day.settlementInputs ? (day.settlementInputs.paidFishingSalary || 0) : 0;
    var g = f && typeof f.queryGameClock === 'function' ? (function () { try { return f.queryGameClock(); } catch (e) { return null; } })() : null;
    var perSec = (rates.salaryPerMin / 60);
    var fishingLine = (hud.workMode === 'FISHING' && fishing > 0)
      ? '<div class="ux-earned-fishing">🐟 本次带薪摸鱼已入账 <b>¥' + fishing.toFixed(2) + '</b></div>' : '';
    var offWork = g && !g.isWeekend && g.hour >= 18;
    return '<div class="ux-earned-main">今日已赚 <b>¥' + (income || 0).toFixed(2) + '</b></div>' +
      (offWork ? '<div class="ux-earned-offwork">额外工资 <b>¥0.00</b> —— 工资已经下班了，你还没有。</div>' : '') +
      fishingLine +
      '<div class="ux-earned-rates"><span>¥' + rates.salaryPerMin.toFixed(2) + '/分钟</span><span>¥' + perSec.toFixed(3) + '/秒</span><span>修为 +' + rates.cultivationPerMin.toFixed(1) + '/分钟</span></div>';
  }

  /* 今日待办：指派任务 top4（§34） */
  function agendaHtml() {
    var f = facade();
    var data = f && typeof f.queryAssignedTasks === 'function' ? (function () { try { return f.queryAssignedTasks(); } catch (e) { return null; } })() : null;
    var top = data ? data.top : [];
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

  /* 今日购买力（§51）：首页只显示 3 项，配置驱动 */
  var POWER_ITEMS = [
    { icon: '☕', name: '咖啡', price: 18 },
    { icon: '🍜', name: '午饭', price: 24 },
    { icon: '🧋', name: '奶茶', price: 15 },
    { icon: '🏠', name: '房租', price: 4200, per: '月' },
  ];
  function purchasingPowerHtml() {
    var f = facade();
    var day = f && typeof f.queryGameDay === 'function' ? (function () { try { return f.queryGameDay(); } catch (e) { return null; } })() : null;
    var income = day && day.income ? day.income.salary : 0;
    var items = POWER_ITEMS.slice(0, 3).map(function (it) {
      var n = it.price > 0 ? income / it.price : 0;
      return '<div class="ux-power-item"><span>' + it.icon + ' ' + it.name + '</span><b>' + (n >= 100 ? Math.floor(n) : n.toFixed(1)) + (it.per || '') + (it.per ? '' : (it.name === '午饭' ? '顿' : '杯')) + '</b></div>';
    }).join('');
    return '<div class="ux-card ux-power"><div class="ux-card-title">今日购买力<button class="ux-card-more" data-action="openModal" data-modal="power">全部</button></div>' + items + '</div>';
  }

  /* 今日黄历（§53）：按日索引确定性挑选 */
  var FORTUNE_DO = ['提交代码', '装忙', '带薪摸鱼', '敷衍评审', '准点下班', '已读不回', '顺水推舟', '摸鱼修炼'];
  var FORTUNE_DONT = ['回复"在"', '周五上线', '接需求', '正面硬刚', '口头答应', '深夜发布', '打开需求文档', '轻信排期'];
  function fortuneHtml() {
    var f = facade();
    var day = f && typeof f.queryGameDay === 'function' ? (function () { try { return f.queryGameDay(); } catch (e) { return null; } })() : null;
    var idx = ((day ? day.dayIndex : 1) * 7 + new Date().getDay() * 3) % FORTUNE_DO.length;
    var idx2 = ((day ? day.dayIndex : 1) * 5 + new Date().getDay() * 2 + 3) % FORTUNE_DONT.length;
    return '<div class="ux-card ux-fortune"><div class="ux-card-title">今日黄历</div>' +
      '<div class="ux-fortune-row"><span class="do">宜</span>' + FORTUNE_DO[idx] + '</div>' +
      '<div class="ux-fortune-row"><span class="dont">忌</span>' + FORTUNE_DONT[idx2] + '</div></div>';
  }

  /* 最近动态（§58）：只显示 2 条，点击看全部 */
  function recentTimelineHtml() {
    var f = facade();
    var view = f && typeof f.queryWorkToday === 'function' ? (function () { try { return f.queryWorkToday(); } catch (e) { return null; } })() : null;
    var tl = view && view.timeline ? view.timeline.slice(-2).reverse() : [];
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
        moreItem('sect', '⚔️', '宗门', '选择你的流派') +
        moreItem('leaderboard', '🏆', '排行榜', '修为职级大比拼') +
        moreItem('friends', '👥', '好友', '拜访好友赠灵石') +
        moreItem('achievements', '📜', '成就', '职场修仙履历') +
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
    HOME: '', TASKS: '任务', CRAFT: '物品合成', PROMOTION: '晋升渡劫', MORE: '更多',
    SECT: '宗门页', LEADERBOARD: '排行榜', FRIENDS: '好友', ACHIEVEMENTS: '成就', SETTINGS: '设置',
    TECHNIQUES: '功法', EQUIPMENT: '法宝', NPC: '人际关系', SETTLEMENT: '下班结算', DEV: 'DEV 面板',
  };

  function currentPage() { return _subPage || _screen; }

  function renderCurrent() {
    var page = currentPage();
    switch (page) {
      case 'HOME': return renderHome();
      case 'TASKS': return renderTasks();
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
      var iconSrc = active && t.active ? t.active : t.icon;
      return '<button class="ux-nav-item' + (active ? ' ux-nav-item--active' : '') + '" data-nav="' + t.id + '">' +
        img(iconSrc) + '<span>' + t.label + '</span></button>';
    }).join('') + '</div>';

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
  }

  function fullRefresh() { renderShell(); }

  /* ── 事件绑定 (委托) ── */

  var _settings = { sfx: true, bgm: true, notify: false };

  function bindEvents() {
    var overlay = $('#UiOverlay');
    if (!overlay) return;

    overlay.onclick = function (e) {
      var el = e.target.closest ? e.target.closest('[data-action],[data-nav],[data-tasktab],[data-crafttab],[data-lbtab],[data-ftab],[data-achtab]') : null;
      if (!el) return;

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
        case 'cultivate':
          cmdResult('cultivate', function (r) {
            return '修炼成功，修为 +' + (r && r.cultivationExp !== undefined ? r.cultivationExp : '?');
          });
          break;
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
          if (V2) V2.showDefenseModal();
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
          if (!f) { toast('演示模式：promote', 'info'); break; }
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
          if (!pf) { toast('演示模式：retry', 'info'); break; }
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
    showAdPopup: showAdPopup,
    showOfflinePopup: function () { showOfflinePopup('offline_' + Date.now()); },
    showDialog: showDialog,
    closePopup: closePopup,
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
        setTimeout(function () { showOfflinePopup('offline_' + Date.now()); }, 1200);
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

    /* 主刷新循环: 倒计时/冷却/事件/V2 弹窗 */
    setInterval(function () {
      _cdCache = {};
      if (!popupOpen()) {
        refresh();
        maybeShowEventPopup();
        if (V2) {
          V2.maybeShowV2EventModal();
          V2.maybeShowWeekendModal();
          V2.maybeShowSettlementModal();
        }
      }
    }, 1000);
  }

  function subscribeEvents() {
    var f = facade();
    if (!f || !f.onUiEvent) return;
    ['STATE_CHANGED', 'RESOURCE_CHANGED', 'WORK_MODE_CHANGED', 'CAREER_CHANGED', 'BUFF_CHANGED'].forEach(function (cat) {
      try {
        var unsub = f.onUiEvent(cat, function () { setTimeout(refresh, 60); });
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
