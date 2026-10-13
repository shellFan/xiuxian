/**
 * 牛马修仙传 — V5.9-F-Z 主页面可玩性组件（desktop DOM Overlay 扩展）
 *
 * 五区域：A 今日工作 / B 今日修仙目标 / C 当前建议行动 / D 玩法入口 / E 生活行为。
 * 所有数据来自 GameFacade.queryHomeSnapshot()（权威业务快照），不建第二套状态。
 * 每一次点击都回显真实结算（任务进度/扣款/目标奖励），失败如实 toast，不伪造成功。
 *
 * 由 ui-overlay.js 在首页渲染时调用（经 window.__V59F__ 桥接注入宿主工具）。
 */
;(function () {
  'use strict';

  var H = {}; // 宿主工具句柄（init 时注入：facade/escHtml/toast/refresh/errMsg）

  function fQuery(name) {
    var f = H.facade();
    if (!f || typeof f[name] !== 'function') return null;
    try { return f[name](); } catch (e) { return null; }
  }

  function readSnapshot() { return fQuery('queryHomeSnapshot'); }

  /* ── A. 今日工作 ── */

  function todayWorkHtml(work) {
    if (!work) return '';
    var taskHtml;
    if (work.currentTask) {
      var t = work.currentTask;
      taskHtml = '<div class="ux59f-task">' +
        '<div class="ux59f-task-head"><b>' + H.escHtml(t.name) + '</b>' +
          (t.completed
            ? '<span class="ux59f-tag ux59f-tag--gold">已完成 · 可领取</span>'
            : '<span class="ux59f-tag">进行中 ' + t.progressPct + '%</span>') +
        '</div>' +
        '<div class="ux59f-task-desc">' + H.escHtml(t.description) + '</div>' +
        '<div class="ux59f-task-bar"><div class="ux59f-task-bar-fill" style="width:' + t.progressPct + '%"></div></div>' +
        '<div class="ux59f-task-reward">预计奖励：' + H.escHtml(t.rewardText) + '</div>' +
        '<div class="ux59f-task-ops">' +
          (t.completed
            ? '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="claim" data-id="' + H.escHtml(t.taskId) + '">领取奖励</button>'
            : '<button class="ux-btn ux-btn--blue ux-btn--sm" data-action="gotoTasks">查看/推进任务</button>') +
          '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="gotoTasks">任务详情</button>' +
        '</div>' +
      '</div>';
    } else {
      taskHtml = '<div class="ux59f-task ux59f-task--empty">' +
        '<div class="ux59f-task-desc">手头没有任务。牛马不接活，仙途就要断。</div>' +
        '<div class="ux59f-task-ops"><button class="ux-btn ux-btn--gold ux-btn--sm" data-action="gotoTasks">去领取任务</button></div>' +
      '</div>';
    }
    var onboardingHtml = work.onboardingTask
      ? '<div class="ux59f-onboarding">🧭 入职任务：<b>' + H.escHtml(work.onboardingTask.title) + '</b>' +
        '<button class="ux-btn ux-btn--blue ux-btn--sm" data-action="assignedDone" data-id="' + H.escHtml(work.onboardingTask.id) + '">完成入职任务</button></div>'
      : '';
    return '<section class="ux-card ux59f-work">' +
      '<div class="ux-card-title">今日工作' +
        '<span class="ux59f-work-meta">' + H.escHtml(work.professionName) + ' · 第' + work.dayIndex + '天(' + H.escHtml(work.weekdayName || '') + ') · ' + H.escHtml(work.clockText) +
        ' · <b class="ux59f-state-' + work.workState + '">' + H.escHtml(work.workStateText) + '</b> · ' + H.escHtml(work.workModeText) + '</span>' +
      '</div>' +
      '<div class="ux59f-work-stats">' +
        '<span>今日已赚 <b>¥' + work.todayEarned + '</b></span>' +
        '<span>今日修为 <b>+' + work.todayCultivation + '</b></span>' +
        '<span>余额 <b>¥' + work.salaryBalance + '</b></span>' +
        '<span>疲劳 <b>' + work.fatigue + '</b></span>' +
      '</div>' +
      taskHtml + onboardingHtml +
    '</section>';
  }

  /* ── B. 今日修仙目标 ── */

  var GOAL_LABEL = { WORK: '工作', GROWTH: '成长', LIFE: '生活·社交' };

  function goalsHtml(goals) {
    if (!goals || !goals.length) return '';
    var items = goals.map(function (g) {
      var pctNum = g.target > 0 ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
      var status;
      if (g.claimed) status = '<span class="ux59f-tag">已领取 ✓</span>';
      else if (g.completed) status = '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="claimGoal" data-kind="' + g.kind + '">领取奖励</button>';
      else status = '<span class="ux59f-tag">' + g.progress + '/' + g.target + '</span>';
      var reward = [];
      if (g.reward.salary > 0) reward.push('¥' + g.reward.salary);
      if (g.reward.cultivation > 0) reward.push('修为+' + g.reward.cultivation);
      if (g.reward.mind > 0) reward.push('道心+' + g.reward.mind);
      return '<div class="ux59f-goal' + (g.completed && !g.claimed ? ' ux59f-goal--done' : '') + (g.claimed ? ' ux59f-goal--claimed' : '') + '">' +
        '<div class="ux59f-goal-head"><span class="ux59f-goal-kind">' + (GOAL_LABEL[g.kind] || g.kind) + '</span>' +
          '<b>' + H.escHtml(g.title) + '</b>' + status + '</div>' +
        '<div class="ux59f-goal-desc">' + H.escHtml(g.description) + ' · 奖励 ' + reward.join(' ') + '</div>' +
        '<div class="ux59f-task-bar"><div class="ux59f-task-bar-fill ux59f-task-bar-fill--gold" style="width:' + pctNum + '%"></div></div>' +
      '</div>';
    }).join('');
    return '<section class="ux-card ux59f-goals"><div class="ux-card-title">今日修仙目标</div>' + items + '</section>';
  }

  /* ── C. 当前建议行动 ── */

  function nextActionHtml(action) {
    if (!action) return '';
    var attrs = '';
    if (action.command === 'setMode') attrs = 'data-action="mode" data-mode="' + H.escHtml(action.commandArg || 'WORK') + '"';
    else if (action.command === 'openSettlement') attrs = 'data-goto-page="SETTLEMENT"';
    else if (action.command === 'openPending') attrs = 'data-action="openPending"';
    else if (action.page) attrs = 'data-goto-page="' + H.escHtml(action.page) + '"';
    var body = '<span class="jg-icon">' + action.icon + '</span>' +
      '<span class="jg-main"><b>' + H.escHtml(action.text) + '</b><i>' + H.escHtml(action.sub) + '</i></span>' +
      '<span class="jg-btn">' + H.escHtml(action.btn) + ' ›</span>';
    if (!attrs) return '<div class="ux59f-action ux59f-action--static">' + body + '</div>';
    return '<button class="ux59f-action" ' + attrs + '>' + body + '</button>';
  }

  /* ── D. 玩法入口（工作/战斗/技能/装备/项目/职业成长） ── */

  function entriesHtml() {
    var entries = [
      { page: 'TASKS', icon: '📋', label: '任务' },
      { page: 'PROJECT', icon: '⚔️', label: '项目·战斗' },
      { page: 'CULTIVATION', icon: '🧘', label: '修炼' },
      { page: 'TECHNIQUES', icon: '📖', label: '技能·功法' },
      { page: 'EQUIPMENT', icon: '🎽', label: '装备' },
      { page: 'PROMOTION', icon: '🔺', label: '职业成长' },
    ];
    return '<div class="ux59f-entries">' + entries.map(function (e) {
      return '<button class="ux59f-entry" data-goto-page="' + e.page + '"><span>' + e.icon + '</span><b>' + e.label + '</b></button>';
    }).join('') + '</div>';
  }

  /* ── E. 生活行为 ── */

  function lifeHtml(life) {
    if (!life || !life.length) return '';
    var balance = null;
    try { var work = fQuery('queryHomeTodayWork'); balance = work ? work.salaryBalance : null; } catch (e) { balance = null; }
    var items = life.map(function (it) {
      var disabled = !it.available;
      var btn = '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="lifeConsume" data-kind="' + it.kind + '"' + (disabled ? ' disabled' : '') + '>消费 ¥' + it.price + '</button>';
      var reason = it.reason ? '<div class="ux59f-life-reason">' + H.escHtml(it.reason) + '</div>' : '';
      return '<div class="ux59f-life-item' + (disabled ? ' ux59f-life-item--off' : '') + '">' +
        '<div class="ux59f-life-head"><span>' + it.icon + ' ' + H.escHtml(it.label) + '</span><span class="ux59f-tag">剩 ' + it.remaining + '/' + (it.remaining + it.used) + '</span></div>' +
        '<div class="ux59f-life-effect">' + H.escHtml(it.effectText) + '</div>' +
        btn + reason +
      '</div>';
    }).join('');
    return '<section class="ux-card ux59f-life-card"><div class="ux-card-title">生活行为' +
      (balance != null ? '<span class="ux59f-work-meta">余额 ¥' + balance + '</span>' : '') + '</div>' +
      '<div class="ux59f-life-grid">' + items + '</div></section>';
  }

  /* ── 轻量引导（首次进入主页面；可跳过；不重复） ── */

  var GUIDE_KEY = 'v59f_home_guide_done';

  function guideHtml() {
    var f = H.facade();
    var done = false;
    try { done = !!(f && f.queryPlayerFlag && f.queryPlayerFlag(GUIDE_KEY)); } catch (e) { done = false; }
    // 存档 flag 不可用时退回 sessionStorage（同一会话不重复弹）。
    if (!done) { try { done = sessionStorage.getItem(GUIDE_KEY) === '1'; } catch (e) { done = false; } }
    if (done) return '';
    var steps = [
      ['1️⃣', '这是你的今日工作', '接任务、推任务、领奖励都在这一块。'],
      ['2️⃣', '点击「开始工作」', '切换到工作状态，工资/修为/绩效随时间入账。'],
      ['3️⃣', '完成工作任务', '领取工资、修为与绩效——今日目标同步推进。'],
      ['4️⃣', '疲劳高了就消费', '喝杯咖啡、吃顿饭，真实扣款真实回血。'],
      ['5️⃣', '下班后今日结算', '18:00 结算今天的账，进入下一天循环。'],
    ];
    return '<div class="ux59f-guide" id="V59fHomeGuide">' +
      '<div class="ux59f-guide-head"><b>✦ 新牛马入职指南</b>' +
        '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="guideSkip">跳过</button></div>' +
      steps.map(function (s) { return '<div class="ux59f-guide-step"><span>' + s[0] + '</span><b>' + H.escHtml(s[1]) + '</b><i>' + H.escHtml(s[2]) + '</i></div>'; }).join('') +
      '<button class="ux-btn ux-btn--gold ux-btn--sm ux59f-guide-ok" data-action="guideSkip">知道了，开工！</button>' +
    '</div>';
  }

  /* ── 聚合（ui-overlay.js 的 renderHome 调用） ── */

  function homePanelHtml() {
    var snap = readSnapshot();
    if (!snap || !snap.work) return '';
    return '<div class="ux59f-home-panel">' +
      nextActionHtml(snap.nextAction) +
      todayWorkHtml(snap.work) +
      goalsHtml(snap.goals) +
      entriesHtml() +
      lifeHtml(snap.life) +
      guideHtml() +
    '</div>';
  }

  /* ── 命令处理（ui-overlay.js 的 click 委托调用） ── */

  function handleClick(el, action) {
    var f = H.facade();
    if (!f) return true; // 未消费，走宿主后续逻辑
    if (action === 'claimGoal') {
      var kind = el.dataset.kind;
      try {
        var r = f.claimHomeGoal(kind);
        if (r && r.ok) {
          var reward = r.reward || {};
          H.toast('目标达成！工资 +¥' + (reward.salary || 0) + ' 修为 +' + (reward.cultivation || 0) + (reward.mind ? ' 道心 +' + reward.mind : ''), 'success');
        } else H.toast((r && r.reason) || '领取失败', 'error');
      } catch (e) { H.toast(H.errMsg(e), 'error'); }
      H.refresh();
      return true;
    }
    if (action === 'lifeConsume') {
      var lifeKind = el.dataset.kind;
      try {
        var lr = f.consumeHomeLife(lifeKind);
        if (lr && lr.ok) {
          H.toast(lr.label + '：-¥' + lr.cost + (lr.fatigueDelta ? ' 疲劳 ' + lr.fatigueDelta : '') + (lr.mindDelta ? ' 道心 +' + lr.mindDelta : '') + ' · 余额 ¥' + lr.balanceAfter, 'success');
        } else H.toast((lr && lr.reason) || '消费失败', 'error');
      } catch (e) { H.toast(H.errMsg(e), 'error'); }
      H.refresh();
      return true;
    }
    if (action === 'gotoTasks') {
      gotoPage('TASKS');
      return true;
    }
    if (action === 'guideSkip') {
      try { sessionStorage.setItem(GUIDE_KEY, '1'); } catch (e) { /* private mode */ }
      try { if (f.markPlayerFlag) f.markPlayerFlag(GUIDE_KEY, true); } catch (e) { /* flag unavailable */ }
      H.refresh();
      return true;
    }
    return false; // 未消费
  }

  /** 导航：派发一个可被宿主委托捕获的 data-goto-page 按钮。
   *  必须挂在 #UiOverlay 内 —— 宿主委托监听在 overlay 上，body 上的点击不会冒泡过去。 */
  function gotoPage(page) {
    var host = document.getElementById('UiOverlay') || document.body;
    var btn = document.createElement('button');
    btn.setAttribute('data-goto-page', page);
    btn.style.display = 'none';
    host.appendChild(btn);
    btn.click();
    btn.remove();
  }

  function init(host) {
    H = host;
  }

  window.__V59F__ = {
    init: init,
    homePanelHtml: homePanelHtml,
    handleClick: handleClick,
  };
})();
