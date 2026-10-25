/**
 * 牛马修仙传 — 首页合成盘主玩法组件（desktop DOM Overlay 扩展）
 *
 * 主玩法：4×4 合成盘（点选两只同级牛马 → 合成升阶，真实发放工资/修为奖励）。
 * 附带：全屏升阶反馈（新最高等级加强庆祝）、前 60 秒引导（招两只 → 合成一次 → 一键修炼）。
 *
 * 数据全部来自 GameFacade.queryBoard()/recruit()/merge()（权威领域服务），
 * 本模块不建第二套状态；失败如实 toast，不伪造成功。
 * 由 ui-overlay.js 在首页渲染时调用（经 window.__MERGE__ 桥接注入宿主工具）。
 */
;(function () {
  'use strict';

  var H = {}; // 宿主工具句柄（init 时注入：facade/escHtml/toast/refresh/errMsg）

  /* ── 牛马等级表（与 MergeBoard maxWorkerLevel=6 对齐） ── */

  var WORKER_TIERS = [
    { name: '实习牛马', emoji: '🐣', tint: '#9db4c0' },
    { name: '转正牛马', emoji: '🐥', tint: '#7ec08a' },
    { name: '资深牛马', emoji: '🐤', tint: '#5fb5c9' },
    { name: '组长牛马', emoji: '🐔', tint: '#c9a45f' },
    { name: '总监牛马', emoji: '🦅', tint: '#c97f4f' },
    { name: '牛马之祖', emoji: '🐉', tint: '#d8b24a' },
  ];

  function tier(level) { return WORKER_TIERS[Math.min(WORKER_TIERS.length, Math.max(1, level)) - 1]; }

  /* ── 状态（模块内交互态；棋盘真相永远以 facade 为准） ── */

  var _sel = null; // 'r,c' 已点选的牛马格
  var _fxSeq = 0;  // 全屏反馈序号（避免同帧重复动画）

  function fQuery(name) {
    var f = H.facade();
    if (!f || typeof f[name] !== 'function') return null;
    try { return f[name](); } catch (e) { return null; }
  }

  function readBoard() {
    var board = fQuery('queryBoard');
    if (!board || !board.cells || !board.cells.length) return null;
    return board;
  }

  function cellAt(board, row, col) {
    for (var i = 0; i < board.cells.length; i++) {
      var c = board.cells[i];
      if (c.row === row && c.column === col) return c;
    }
    return null;
  }

  function selPos() {
    if (!_sel) return null;
    var parts = _sel.split(',');
    return { row: Number(parts[0]), column: Number(parts[1]) };
  }

  /* 选中格若已失效（被合并/清空）则清除，避免渲染悬空高亮 */
  function ensureSel(board) {
    if (!_sel) return;
    var p = selPos();
    var cell = p ? cellAt(board, p.row, p.column) : null;
    if (!cell || !cell.occupant) _sel = null;
  }

  function hasMergeablePair(board) {
    var byLevel = {};
    for (var i = 0; i < board.cells.length; i++) {
      var w = board.cells[i].occupant;
      if (!w || w.level >= board.maxWorkerLevel) continue;
      byLevel[w.level] = (byLevel[w.level] || 0) + 1;
      if (byLevel[w.level] >= 2) return true;
    }
    return false;
  }

  /* ── 前 60 秒引导（localStorage，可跳过；完成条件来自真实状态） ── */

  var TUT_KEY = 'nmx_merge_tutorial_v1';

  function readTutorial() {
    try {
      var raw = localStorage.getItem(TUT_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* private mode */ }
    return { done: false, merges: 0, modeUsed: false, skipped: false };
  }

  function writeTutorial(state) {
    try { localStorage.setItem(TUT_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  /** 当前引导步骤（null = 不显示）。完成态自动落盘。 */
  function tutorialStep(board) {
    var st = readTutorial();
    if (st.done || st.skipped) return null;
    if (st.modeUsed) { st.done = true; writeTutorial(st); return null; }
    if (st.merges >= 1) return 'MODE';
    if (board && board.occupiedCount >= 2) return 'MERGE';
    return 'RECRUIT';
  }

  var TUT_COPY = {
    RECRUIT: { no: '①', text: '点两次【招个牛马】，凑齐两只实习牛马', target: 'recruit' },
    MERGE: { no: '②', text: '点选两只同级牛马 → 合成升阶，立得工资+修为', target: 'grid' },
    MODE: { no: '③', text: '点下方【修炼一次】，开始挂机成长', target: 'hero' },
  };

  function coachHtml(step) {
    if (!step) return '';
    var c = TUT_COPY[step];
    return '<div class="ux-coach" data-coach-step="' + step + '">' +
      '<span class="ux-coach-no">' + c.no + '</span>' +
      '<span class="ux-coach-text">' + H.escHtml(c.text) + '</span>' +
      '<button class="ux-coach-skip" data-action="mergeTutorialSkip">跳过</button>' +
    '</div>';
  }

  /* ── 合成盘渲染 ── */

  function boardHtml() {
    var board = readBoard();
    if (!board) return '';
    ensureSel(board);
    var sel = selPos();
    var selWorker = sel ? (cellAt(board, sel.row, sel.column) || {}).occupant : null;
    var canPair = hasMergeablePair(board);
    var step = tutorialStep(board);

    var hint;
    if (board.occupiedCount === 0) hint = '空空如也。点【招个牛马】开工，合成升阶工资修为双收。';
    else if (!canPair && !board.isFull) hint = '没有同级牛马可合成 —— 再招一只凑一对。';
    else if (!canPair && board.isFull) hint = '棋盘满了且无可合成的同级牛马。';
    else hint = '点选两只 <b>同级</b> 牛马即可合成升阶。';

    var rowsHtml = '';
    for (var r = 0; r < board.rows; r++) {
      for (var c = 0; c < board.columns; c++) {
        var cell = cellAt(board, r, c);
        var w = cell ? cell.occupant : null;
        var key = r + ',' + c;
        var isSel = !!w && _sel === key;
        var isPairable = !!w && !!selWorker && !isSel && w.level === selWorker.level && w.level < board.maxWorkerLevel;
        if (w) {
          var t = tier(w.level);
          rowsHtml += '<button class="ux-mcell ux-mcell--occ lv' + w.level + (isSel ? ' is-selected' : '') + (isPairable ? ' is-pairable' : '') + '"' +
            ' data-action="mergeCell" data-row="' + r + '" data-col="' + c + '"' +
            ' style="--tier-tint:' + t.tint + '"' +
            ' title="' + H.escHtml(t.name) + ' Lv.' + w.level + '">' +
            '<span class="ux-mcell-emoji">' + t.emoji + '</span>' +
            '<span class="ux-mcell-lv">Lv.' + w.level + '</span>' +
            (isSel ? '<span class="ux-mcell-sel">已选</span>' : '') +
          '</button>';
        } else {
          rowsHtml += '<button class="ux-mcell ux-mcell--empty" data-action="mergeCell" data-row="' + r + '" data-col="' + c + '" aria-label="空工位"></button>';
        }
      }
    }

    var coachTargetRecruit = step === 'RECRUIT' ? ' ux-coach-target' : '';
    var gridCoach = step === 'MERGE' ? ' ux-coach-target' : '';

    return '<section class="ux-merge" id="MergeBoardSection">' +
      '<div class="ux-merge-head">' +
        '<div class="ux-merge-title"><b>合成工位</b><span>' + board.occupiedCount + '/' + board.capacity + ' · 最高 Lv.' + Math.max(1, maxLevelOnBoard(board)) + '</span></div>' +
        '<button class="ux-btn ux-btn--gold ux-btn--sm ux-merge-recruit' + coachTargetRecruit + '" data-action="mergeRecruit"' + (board.isFull ? ' disabled' : '') + '>＋ 招个牛马</button>' +
      '</div>' +
      coachHtml(step) +
      '<div class="ux-merge-grid' + gridCoach + '" style="--grid-cols:' + board.columns + '">' + rowsHtml + '</div>' +
      '<div class="ux-merge-hint">' + hint + '</div>' +
    '</section>';
  }

  function maxLevelOnBoard(board) {
    var max = 0;
    for (var i = 0; i < board.cells.length; i++) {
      var w = board.cells[i].occupant;
      if (w && w.level > max) max = w.level;
    }
    return max;
  }

  /* ── 全屏升阶反馈 ── */

  function celebrate(level, salaryReward, cultivationReward, isNewMax) {
    var root = document.getElementById('UiOverlay');
    if (!root) return;
    _fxSeq += 1;
    var t = tier(level);
    var fx = document.createElement('div');
    fx.className = 'ux-merge-fx' + (isNewMax ? ' is-max' : '');
    fx.id = 'MergeFx' + _fxSeq;
    fx.innerHTML =
      '<div class="ux-merge-fx-rays"></div>' +
      '<div class="ux-merge-fx-core">' +
        '<span class="ux-merge-fx-emoji">' + t.emoji + '</span>' +
        '<span class="ux-merge-fx-title">升阶！' + H.escHtml(t.name) + ' <b>Lv.' + level + '</b></span>' +
        '<span class="ux-merge-fx-rewards">' +
          '<i class="is-salary">工资 +¥' + salaryReward + '</i>' +
          '<i class="is-cultivation">修为 +' + cultivationReward + '</i>' +
        '</span>' +
        (isNewMax ? '<span class="ux-merge-fx-max">✦ 解锁全新最高等级 ✦</span>' : '') +
      '</div>';
    root.appendChild(fx);
    setTimeout(function () { fx.remove(); }, isNewMax ? 2400 : 1700);
  }

  function recruitFx(row, col) {
    var board = readBoard();
    var cell = board ? cellAt(board, row, col) : null;
    if (!cell || !cell.occupant) return;
    var t = tier(cell.occupant.level);
    var grid = document.querySelector('.ux-merge-grid');
    if (!grid) return;
    var pop = document.createElement('span');
    pop.className = 'ux-merge-pop';
    pop.textContent = t.emoji;
    pop.style.setProperty('--pop-row', String(row));
    pop.style.setProperty('--pop-col', String(col));
    grid.appendChild(pop);
    setTimeout(function () { pop.remove(); }, 900);
  }

  /* ── 命令处理（ui-overlay.js 的 click 委托调用） ── */

  function handleClick(el, action) {
    if (action === 'mergeTutorialSkip') {
      var st = readTutorial();
      st.skipped = true;
      writeTutorial(st);
      H.refresh();
      return true;
    }
    if (action === 'mergeRecruit') {
      var f = H.facade();
      if (!f || typeof f.recruit !== 'function') return false;
      try {
        var r = f.recruit();
        if (r && r.success) {
          _sel = null;
          recruitFx(r.position.row, r.position.column);
          H.toast('招到一只 ' + tier(r.worker.level).name + '，安排上工位。', 'success');
        } else {
          H.toast((r && r.message) || '工位满了', 'error');
        }
      } catch (e) { H.toast(H.errMsg(e), 'error'); }
      H.refresh();
      return true;
    }
    if (action === 'mergeCell') {
      var board = readBoard();
      if (!board) return true;
      var row = Number(el.dataset.row);
      var col = Number(el.dataset.col);
      var cell = cellAt(board, row, col);
      var key = row + ',' + col;
      if (!cell || !cell.occupant) { _sel = null; H.refresh(); return true; }
      if (!_sel) { _sel = key; H.refresh(); return true; }
      if (_sel === key) { _sel = null; H.refresh(); return true; }
      var selP = selPos();
      var selCell = selP ? cellAt(board, selP.row, selP.column) : null;
      if (!selCell || !selCell.occupant) { _sel = key; H.refresh(); return true; }
      var sameLevel = selCell.occupant.level === cell.occupant.level && cell.occupant.level < board.maxWorkerLevel;
      if (!sameLevel) { _sel = key; H.refresh(); return true; }
      var ff = H.facade();
      try {
        var prevMax = maxLevelOnBoard(board); // 合并前快照（cells 是活引用，合并后即变）
        var target = { row: row, column: col };
        var mr = ff.merge({ row: selP.row, column: selP.column }, target);
        _sel = null;
        if (mr && mr.success) {
          var isNewMax = mr.worker.level > prevMax;
          celebrate(mr.worker.level, mr.salaryReward || 0, mr.cultivationReward || 0, isNewMax);
          var ts = readTutorial();
          ts.merges = (ts.merges || 0) + 1;
          writeTutorial(ts);
        } else {
          H.toast((mr && mr.message) || '合成失败', 'error');
        }
      } catch (e) { _sel = null; H.toast(H.errMsg(e), 'error'); }
      H.refresh();
      return true;
    }
    return false; // 未消费，走宿主后续逻辑
  }

  /** 修炼/模式一键行为成功后由宿主调用：推进并结算引导。 */
  function noteAction(kind) {
    var st = readTutorial();
    if (st.done || st.skipped) return;
    if (kind === 'mode' || kind === 'cultivate') {
      var wasNotDone = !st.modeUsed;
      st.modeUsed = true;
      writeTutorial(st);
      if (wasNotDone && st.merges >= 1) {
        H.toast('出师了！合成升阶、修炼挂机，工资修为双线成长。', 'success');
      }
    }
  }

  function isTutorialActive() {
    var st = readTutorial();
    return !st.done && !st.skipped;
  }

  function init(host) { H = host; }

  window.__MERGE__ = {
    init: init,
    boardHtml: boardHtml,
    handleClick: handleClick,
    noteAction: noteAction,
    isTutorialActive: isTutorialActive,
  };
})();
