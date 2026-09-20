/**
 * 牛马修仙传 — Gameplay V2 UI 扩展（desktop DOM Overlay）
 *
 * 由 ui-overlay.js 在 V2 数据可用时调用；依赖宿主的 $/$$/escHtml/img/icon/fmtNum/hms/
 * emptyState/reqRow/kpiShortLabel/readKpi/readCareerAt/readPromotion/popupLayer/closePopup/
 * popupOpen/toast/errMsg/refresh/facade 等内部工具（通过 window.__V2UI__ 桥接注入）。
 */
;(function () {
  'use strict';

  var H = {}; // 宿主工具句柄（init 时注入）

  function fQuery(name) {
    var f = H.facade();
    if (!f || typeof f[name] !== 'function') return null;
    try { return f[name](); } catch (e) { return null; }
  }

  /* ── 首页 V2 组件 ── */

  function dayStripHtml() {
    var g = fQuery('queryGameClock');
    var day = fQuery('queryGameDay');
    if (!g) return '';
    var weekName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][g.weekday] || '';
    var offMs = fQuery('queryTimeUntilOffWork');
    var offText = offMs != null ? H.hms(offMs / 1000) : '--:--:--';
    return '<div class="ux-day-strip">' +
      '<span class="ds-day">第 <b>' + (day ? day.dayIndex : 1) + '</b> 个牛马修仙日</span>' +
      '<span class="ds-week">' + weekName + '</span>' +
      '<span class="ds-off">距下班 <b>' + offText + '</b></span>' +
      '</div>';
  }

  function situationHtml() {
    var sit = fQuery('queryDailySituation');
    if (!sit || !sit.company) return '';
    function chip(def) {
      return def ? '<span class="ux-sit-chip" title="' + H.escHtml(def.description) + '">' + H.escHtml(def.name) + '</span>' : '';
    }
    return '<div class="ux-situation">' +
      '<div class="ux-sit-label">今日局势</div>' +
      '<div class="ux-sit-chips">' + chip(sit.company) + chip(sit.boss) + chip(sit.project) + chip(sit.personal) + '</div>' +
      '</div>';
  }

  function demonHtml() {
    var d = fQuery('queryInnerDemon');
    if (!d || d.value <= 0) return '';
    return '<div class="ux-demon" title="心魔：长期风险资源，阈值解锁负面效果">😈 心魔 ' + Math.floor(d.value) + '</div>';
  }

  /* ── 功法页（§126） ── */

  function renderTechniques() {
    var owned = fQuery('queryOwnedTechniques') || [];
    var levels = fQuery('queryTechniqueLevels') || {};
    var equipped = fQuery('queryEquippedTechniques') || [null, null, null];
    var slots = ['主修', '辅助·壹', '辅助·贰'];
    var html = '<div class="ux-section-ribbon">功法装配</div><div class="ux-equip-slots">';
    for (var i = 0; i < 3; i++) {
      var eq = equipped[i];
      html += '<div class="ux-card ux-tech-slot' + (eq ? '' : ' ux-tech-slot--empty') + '">' +
        '<div class="ux-task-name">' + slots[i] + '</div>' +
        '<div class="ux-recipe-desc">' + (eq ? H.escHtml(eq) + ' Lv' + (levels[eq] || 1) : '空置') + '</div>' +
        (eq ? '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="techUnequip" data-slot="' + i + '">卸下</button>' : '') +
        '</div>';
    }
    html += '</div><div class="ux-section-ribbon">功法库</div>';
    if (!owned.length) return html + H.emptyState('📖', '尚未习得功法', '完成事件/合成残页获得功法');
    owned.forEach(function (id) {
      html += '<div class="ux-card ux-ach-card">' +
        '<div class="ux-ach-info">' +
          '<div class="ux-ach-name">' + H.escHtml(id) + ' <small style="color:var(--text-ink-muted)">Lv' + (levels[id] || 1) + '</small></div>' +
        '</div>' +
        '<button class="ux-btn ux-btn--blue ux-btn--sm" data-action="techEquip" data-id="' + H.escHtml(id) + '">装备</button>' +
        '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="techUpgrade" data-id="' + H.escHtml(id) + '">升级</button>' +
        '</div>';
    });
    return html;
  }

  /* ── 法宝页（§127） ── */

  function renderEquipment() {
    var owned = fQuery('queryOwnedEquipment') || [];
    var equipped = fQuery('queryEquippedEquipment') || {};
    var slots = ['DESK', 'BADGE', 'ACCESSORY'];
    var slotNames = { DESK: '桌面位', BADGE: '工牌位', ACCESSORY: '配饰位' };
    var html = '<div class="ux-section-ribbon">法宝装配</div><div class="ux-equip-slots">';
    slots.forEach(function (slot) {
      var eq = equipped[slot];
      html += '<div class="ux-card ux-tech-slot' + (eq ? '' : ' ux-tech-slot--empty') + '">' +
        '<div class="ux-task-name">' + slotNames[slot] + '</div>' +
        '<div class="ux-recipe-desc">' + (eq ? H.escHtml(eq) : '空置') + '</div>' +
        (eq ? '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="equipUnequip" data-slot="' + slot + '">卸下</button>' : '') +
        '</div>';
    });
    html += '</div><div class="ux-section-ribbon">法宝库</div>';
    if (!owned.length) return html + H.emptyState('🎽', '尚未获得法宝', '合成/事件/商店可获得');
    var equippedIds = Object.keys(equipped).map(function (k) { return equipped[k]; });
    owned.forEach(function (id) {
      var isEq = equippedIds.indexOf(id) >= 0;
      html += '<div class="ux-card ux-ach-card">' +
        '<div class="ux-ach-info"><div class="ux-ach-name">' + H.escHtml(id) + '</div></div>' +
        '<button class="ux-btn ' + (isEq ? 'ux-btn--gray' : 'ux-btn--blue') + ' ux-btn--sm" data-action="equipItem" data-id="' + H.escHtml(id) + '">' + (isEq ? '已装备' : '装备') + '</button>' +
        '</div>';
    });
    return html;
  }

  /* ── NPC 页（§128） ── */

  function renderNpc() {
    var views = fQuery('queryNpcViews');
    if (!views || !views.length) return H.emptyState('🧑‍🤝‍🧑', '人际网络', 'NPC 关系通过事件选择变化');
    var html = '<div class="ux-section-ribbon">六位核心 NPC</div>';
    views.forEach(function (n) {
      var pct = Math.round((n.value + 100) / 2);
      html += '<div class="ux-card ux-friend-card">' +
        '<div class="ux-friend-info">' +
          '<div class="ux-friend-name">' + H.escHtml(n.name) + ' <small style="color:var(--text-ink-muted)">' + H.escHtml(n.title) + '</small></div>' +
          '<div class="ux-recipe-desc">' + H.escHtml(n.description) + '</div>' +
          '<div class="ux-friend-realm">影响：' + H.escHtml(n.influence) + '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;margin-top:6px">' +
            '<div class="ux-progress" style="flex:1;height:16px"><div class="ux-progress-fill ' +
              (n.value >= 20 ? 'ux-progress-fill--green' : n.value <= -20 ? 'ux-progress-fill--orange' : 'ux-progress-fill--blue') +
              '" style="width:' + pct + '%"></div></div>' +
            '<span style="font-size:20px;font-weight:800;color:var(--text-ink)">' + H.escHtml(n.stageLabel) + ' ' + n.value + '</span>' +
          '</div>' +
        '</div></div>';
    });
    return html;
  }

  /* ── 日结算页（§92/§93 手动入口） ── */

  function renderSettlementPage() {
    var day = fQuery('queryGameDay');
    var canSettle = fQuery('queryCanSettleDay');
    var clock = fQuery('queryGameClock');
    if (!day) return H.emptyState('🌇', '还未开工', '进入工作时段自动开工');
    if (!canSettle) {
      return '<div class="ux-card" style="text-align:center;padding:40px 20px">' +
        '<div style="font-size:56px;margin-bottom:12px">⏳</div>' +
        '<div class="ux-task-name">还没到下班时间</div>' +
        '<div class="ux-recipe-desc" style="margin-top:8px">18:00 后可结算。当前 ' +
        (clock ? clock.hour + ':' + String(clock.minute).padStart(2, '0') : '--:--') + '</div></div>';
    }
    var weekName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day.weekday] || '';
    function dur(sec) { return Math.floor(sec / 3600) + '时' + Math.floor((sec % 3600) / 60) + '分'; }
    return '<div class="ux-card">' +
      '<div class="ux-dialog-title">第 ' + day.dayIndex + ' 个牛马修仙日 · ' + weekName + '</div>' +
      '<div class="ux-req-rows">' +
        H.reqRow('salary', '工资', day.income.salary, 0, day.income.salary > 0, 'blue') +
        H.reqRow('cultivation', '修为', day.income.cultivation, 0, day.income.cultivation > 0, 'blue') +
        H.reqRow('performance', '绩效', day.income.performance, 0, day.income.performance > 0, 'orange') +
      '</div>' +
      '<div class="ux-recipe-desc" style="margin-top:14px;line-height:1.9">' +
        '💼 工作 ' + dur(day.durations.work) + '<br>' +
        '🐟 摸鱼 ' + dur(day.durations.fishing) + '<br>' +
        '🧘 修炼 ' + dur(day.durations.cultivating) + '<br>' +
        '🍵 社交 ' + dur(day.durations.social) + '<br>' +
        '⚡ 处理事件 ' + day.eventsHandled + ' 个 · 获得材料 ' + day.materialsGained + ' 份' +
      '</div>' +
      '<div class="ux-dialog-actions"><button class="ux-btn ux-btn--gold ux-btn--lg" data-action="doSettle">下班结算</button></div>' +
      '</div>';
  }

  /* ── DEV 面板（§169/§170） ── */

  var DEV_VISIBLE = true;

  function renderDev() {
    if (!DEV_VISIBLE) return H.emptyState('🚫', 'DEV 面板未开放', 'Release 构建');
    var timeBtns = [
      ['+1min', 'devAdvance', 60000], ['+10min', 'devAdvance', 600000], ['+30min', 'devAdvance', 1800000], ['+1h', 'devAdvance', 3600000],
      ['11:50', 'devJump', 710], ['12:00', 'devJump', 720], ['13:00', 'devJump', 780], ['17:50', 'devJump', 1070], ['18:00', 'devJump', 1080],
      ['Next Day', 'devNextDay', 0],
    ];
    var html = '<div class="ux-section-ribbon">DEV 时间控制</div><div class="ux-dev-grid">';
    timeBtns.forEach(function (b) {
      html += '<button class="ux-btn ux-btn--blue ux-btn--sm" data-action="' + b[1] + '" data-arg="' + b[2] + '">' + b[0] + '</button>';
    });
    html += '</div>';
    html += '<div class="ux-section-ribbon">DEV 状态注入</div><div class="ux-dev-grid">' +
      '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="devMind" data-arg="100">道心100</button>' +
      '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="devMind" data-arg="10">道心10</button>' +
      '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="devDemon" data-arg="30">心魔+30</button>' +
      '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="devDemon" data-arg="-30">心魔-30</button>' +
      '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="devMaterial" data-arg="10">灵草+10</button>' +
      '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="devMaterial" data-arg="5">残页+5</button>' +
      '</div>';
    html += '<div class="ux-section-ribbon">DEV 事件触发</div><div class="ux-dev-grid">' +
      '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="devEvent" data-arg="legacy_s0">链:祖传屎山</button>' +
      '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="devEvent" data-arg="toilet_s0">链:厕所秘境</button>' +
      '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="devEvent" data-arg="pie_s0">链:老板画饼</button>' +
      '<button class="ux-btn ux-btn--gold ux-btn--sm" data-action="devEvent" data-arg="e_cat">彩蛋:橘猫</button>' +
      '</div>';
    return html;
  }

  /* ── V2 事件 Modal（§125） ── */

  var _v2EventShowing = false;

  function maybeShowV2EventModal() {
    if (H.popupOpen() || _v2EventShowing) return;
    var f = H.facade();
    var def = fQuery('queryV2CurrentEvent');
    if (!def) { _v2EventShowing = false; return; }
    _v2EventShowing = true;
    var choices = fQuery('queryV2CurrentChoices') || [];
    var layer = H.popupLayer();
    var optionsHtml;
    if (choices.length > 0) {
      optionsHtml = '<div class="ux-event-options">' + choices.map(function (c) {
        return '<button class="ux-event-option" data-vevent-choice="' + H.escHtml(c.id) + '">' +
          '<span>' + H.escHtml(c.text) + '</span>' +
          (c.successChance != null && c.successChance < 1 ? '<span class="opt-effects">成功率 ' + Math.round(c.successChance * 100) + '%</span>' : '') +
          '</button>';
      }).join('') + '</div>';
    } else {
      optionsHtml = '<div class="ux-dialog-actions"><button class="ux-btn ux-btn--gold ux-btn--md" data-vevent-choice="__auto">知道了</button></div>';
    }
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">' + H.escHtml(def.title) + '</span>' +
            '<span class="ux-event-tag">' + H.escHtml(def.rarity || '') + '</span>' +
          '</div>' +
          H.img('event-boss', 'ux-event-boss') +
          '<div class="ux-popup-card" style="margin-top:16px">' +
            '<div class="ux-event-bubble">' + H.escHtml(def.description || '') + '</div>' +
            optionsHtml +
          '</div>' +
        '</div>' +
      '</div>';
    H.$$('.ux-event-option[data-vevent-choice]', layer).forEach(function (b) {
      b.addEventListener('click', function () {
        var choiceId = b.getAttribute('data-vevent-choice');
        var result;
        try {
          result = f.resolveV2Event(choiceId === '__auto' ? null : choiceId);
        } catch (e) { H.toast(H.errMsg(e), 'error'); _v2EventShowing = false; return; }
        showV2EventResult(result);
      });
    });
  }

  function showV2EventResult(result) {
    var layer = H.popupLayer();
    var fx = result.effectsApplied || {};
    var lines = [];
    if (fx.salary) lines.push('工资 ' + (fx.salary > 0 ? '+' : '') + fx.salary);
    if (fx.salaryCost) lines.push('工资 -' + fx.salaryCost);
    if (fx.cultivation) lines.push('修为 ' + (fx.cultivation > 0 ? '+' : '') + fx.cultivation);
    if (fx.performance) lines.push('绩效 ' + (fx.performance > 0 ? '+' : '') + fx.performance);
    if (fx.mind) lines.push('道心 ' + (fx.mind > 0 ? '+' : '') + fx.mind);
    if (fx.innerDemon) lines.push('心魔 ' + (fx.innerDemon > 0 ? '+' : '') + fx.innerDemon);
    if (fx.material) {
      Object.keys(fx.material).forEach(function (m) {
        lines.push(m + ' ' + (fx.material[m] > 0 ? '+' : '') + fx.material[m]);
      });
    }
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">事件结果</span>' +
          '</div>' +
          '<div class="ux-popup-card">' +
            '<div class="ux-event-bubble">' + H.escHtml(result.summary || '事了拂衣去。') + '</div>' +
            (result.success !== null ? '<div class="ux-off-sub">' + (result.success ? '✅ 顺利' : '❌ 不顺利') + '</div>' : '') +
            (lines.length ? '<div class="ux-off-rows">' + lines.map(function (l) {
              var neg = l.indexOf('-') >= 0;
              return '<div class="ux-off-row"><span class="rv" style="' + (neg ? 'color:var(--neg)' : '') + '">' + H.escHtml(l) + '</span></div>';
            }).join('') + '</div>' : '') +
            '<div class="ux-dialog-actions"><button class="ux-btn ux-btn--gold ux-btn--md" id="V2EventOk">继续</button></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.getElementById('V2EventOk').addEventListener('click', function () {
      H.closePopup();
      _v2EventShowing = false;
      H.refresh();
      setTimeout(maybeShowV2EventModal, 600);
    });
  }

  /* ── 周末活动弹窗（§12） ── */

  function maybeShowWeekendModal() {
    if (H.popupOpen()) return;
    var clock = fQuery('queryGameClock');
    if (!clock || !clock.isWeekend) return;
    if (fQuery('queryWeekendChosen')) return;
    var options = fQuery('queryWeekendOptions');
    if (!options || !options.length) return;
    var layer = H.popupLayer();
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">周末安排</span>' +
          '</div>' +
          '<div class="ux-popup-card">' +
            '<div class="ux-event-bubble">周末到了。这个双休，你打算怎么过？</div>' +
            '<div class="ux-event-options">' +
              options.map(function (o) {
                return '<button class="ux-event-option" data-weekend="' + o.id + '"><span><b>' + H.escHtml(o.name) + '</b>　' + H.escHtml(o.description) + '</span></button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    H.$$('.ux-event-option[data-weekend]', layer).forEach(function (b) {
      b.addEventListener('click', function () {
        var f = H.facade();
        try {
          var r = f.chooseWeekend(b.getAttribute('data-weekend'));
          H.toast(r.summary, 'success');
        } catch (e) { H.toast(H.errMsg(e), 'error'); }
        H.closePopup();
        H.refresh();
      });
    });
  }

  /* ── 晋升答辩（§78-§82） ── */

  function promotionPageHtml(hud, kpi, next, readCareerAtFn) {
    var check = fQuery('queryPromotionCheckV2');
    if (!check) return null; // 演示模式回退
    var stageHtml =
      '<div class="ux-promo-stage">' +
        '<div class="ux-stage-box">' +
          '<div class="ux-stage-label">当前职级</div>' +
          '<div class="ux-stage-name">' + H.escHtml(hud.careerName) + '</div>' +
          '<div class="ux-stage-realm">' + H.escHtml(hud.realm) + '</div>' +
          H.img('promo-cur', 'ux-stage-img') +
        '</div>' +
        '<div class="ux-promo-arrow">➤</div>' +
        '<div class="ux-stage-box ux-stage-box--next">' +
          '<div class="ux-stage-label">下一阶段</div>' +
          '<div class="ux-stage-name">' + H.escHtml(next ? next.name : '？？？') + '</div>' +
          '<div class="ux-stage-realm">' + H.escHtml(next ? next.realm : '') + '</div>' +
          H.img('promo-next', 'ux-stage-img') +
        '</div>' +
      '</div>';
    var rows = '';
    var reqExp = Math.max(hud.requiredExp, 0);
    rows += H.reqRow('cultivation', '修为', hud.cultivationExp, reqExp, reqExp <= 0 || hud.cultivationExp >= reqExp, 'blue');
    (kpi.items || []).forEach(function (item) {
      var stat = item.type === 'SALARY_EARNED' ? 'salary' : (item.type === 'CULTIVATION' ? 'cultivation' : 'performance');
      rows += H.reqRow(stat, H.kpiShortLabel(item.type), item.progress, item.target, item.completed, item.completed ? 'green' : 'orange');
    });
    rows += H.reqRow('mind', '道心', hud.mind, hud.maxMind, hud.mind >= 30, 'green');
    if (check.workdaysRequired > 0) {
      rows += H.reqRow('performance', '工作天数', check.workdaysCurrent, check.workdaysRequired, check.workdaysOk, 'blue');
    }
    var reqHtml = '<div class="ux-card"><div class="ux-req-rows">' + rows + '</div>' +
      '<div class="ux-promo-note">满足全部条件后开启渡劫答辩 · 3 题随机，60 分通过</div></div>';
    var btn;
    if (check.allowed) {
      btn = '<button class="ux-btn ux-btn--gold ux-btn--lg" data-action="startDefense">开始渡劫答辩</button>';
    } else {
      var reasonText = {
        KPI_INCOMPLETE: 'KPI 未达标', WORKDAYS_SHORT: '工作天数不足（' + check.workdaysCurrent + '/' + check.workdaysRequired + ' 天）',
        MIND_LOW: '道心低于 30', COOLDOWN: '答辩冷却中（次日再试）', MAX_LEVEL: '已是最高职级',
      }[check.reason] || '条件未满足';
      btn = '<button class="ux-btn ux-btn--gray ux-btn--lg" disabled>' + H.escHtml(reasonText) + '</button>';
    }
    return stageHtml + reqHtml + '<div class="ux-promo-action">' + btn + '</div>';
  }

  function showDefenseModal() {
    var f = H.facade();
    if (!f) { H.toast('演示模式：答辩', 'info'); return; }
    var questions;
    try { questions = f.startPromotionDefense(); } catch (e) { H.toast(H.errMsg(e), 'error'); return; }
    var layer = H.popupLayer();
    var body = questions.map(function (q, i) {
      return '<div class="ux-defense-q">' +
        '<div class="ux-task-name">第' + (i + 1) + '题 · ' + H.escHtml(q.question) + '</div>' +
        '<div class="ux-event-options">' + q.options.map(function (o) {
          return '<button class="ux-event-option" data-dq="' + i + '" data-opt="' + H.escHtml(o.id) + '">' + H.escHtml(o.text) + '</button>';
        }).join('') + '</div></div>';
    }).join('');
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">渡劫答辩</span>' +
          '</div>' +
          '<div class="ux-popup-card">' + body + '</div>' +
        '</div>' +
      '</div>';
    var answers = new Array(questions.length).fill(null);
    H.$$('.ux-event-option[data-dq]', layer).forEach(function (b) {
      b.addEventListener('click', function () {
        var qi = Number(b.getAttribute('data-dq'));
        answers[qi] = b.getAttribute('data-opt');
        H.$$('.ux-event-option[data-dq="' + qi + '"]', layer).forEach(function (x) {
          x.style.background = 'linear-gradient(180deg,#f2e4c2,#e9d5a8)';
        });
        b.style.background = 'linear-gradient(180deg,var(--gold-hi),var(--gold))';
        if (answers.every(function (a) { return a !== null; })) {
          setTimeout(function () {
            var score = f.submitPromotionDefense(answers);
            showDefenseResult(score);
          }, 350);
        }
      });
    });
  }

  function showDefenseResult(score) {
    var layer = H.popupLayer();
    var bonusHtml = score.bonuses.map(function (b) {
      return '<span class="ux-sit-chip">' + H.escHtml(b.source) + ' ' + (b.value > 0 ? '+' : '') + b.value + '</span>';
    }).join(' ');
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">答辩结果</span>' +
          '</div>' +
          '<div class="ux-popup-card" style="text-align:center">' +
            '<div style="font-size:64px;margin:10px 0">' + (score.passed ? '🎉' : '💀') + '</div>' +
            '<div class="ux-dialog-title">' + (score.passed ? '渡劫成功！' : '渡劫失败') + '</div>' +
            '<div class="ux-off-duration">' + score.total + '<small style="font-size:22px;color:var(--text-ink-muted)"> / ' + score.passLine + '分</small></div>' +
            '<div style="margin-top:10px">' + bonusHtml + '</div>' +
            '<div class="ux-recipe-desc" style="margin-top:12px">' + (score.passed ? '新职级已生效，倍率提升。' : '心魔 +8。明日再战，渡劫从不一次成功。') + '</div>' +
            '<div class="ux-dialog-actions"><button class="ux-btn ux-btn--gold ux-btn--md" id="DefenseOk">确定</button></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.getElementById('DefenseOk').addEventListener('click', function () {
      H.closePopup();
      H.refresh();
    });
  }

  /* ── 日结算自动弹窗（§92） ── */

  var _settlementShownDay = -1;

  function maybeShowSettlementModal() {
    if (H.popupOpen()) return;
    var canSettle = fQuery('queryCanSettleDay');
    if (!canSettle) return;
    var day = fQuery('queryGameDay');
    if (!day || day.dayIndex === _settlementShownDay) return;
    var f = H.facade();
    var view;
    try { view = f.settleDay(); } catch (e) { return; }
    _settlementShownDay = day.dayIndex;
    var layer = H.popupLayer();
    function dur(sec) { return Math.floor(sec / 3600) + '时' + Math.floor((sec % 3600) / 60) + '分'; }
    layer.innerHTML =
      '<div class="ux-modal-layer">' +
        '<div class="ux-popup">' +
          '<div class="ux-header" style="height:84px;border-radius:16px 16px 0 0;margin:0 -18px 16px">' +
            '<span class="ux-header-title">下班结算</span>' +
          '</div>' +
          '<div class="ux-popup-card">' +
            '<div class="ux-off-title">第 ' + view.dayIndex + ' 个牛马修仙日</div>' +
            '<div class="ux-ad-title" style="margin-top:4px">『 ' + H.escHtml(view.title) + ' 』</div>' +
            '<div class="ux-recipe-desc" style="text-align:center;margin:6px 0 14px">' + H.escHtml(view.titleDesc) + ' · 今日仙评 <b style="color:var(--gold-lo)">' + view.rank + '</b></div>' +
            '<div class="ux-off-rows">' +
              '<div class="ux-off-row">' + H.icon('salary') + '<span class="rn">工资</span><span class="rv">+' + H.fmtNum(view.income.salary) + '</span></div>' +
              '<div class="ux-off-row">' + H.icon('cultivation') + '<span class="rn">修为</span><span class="rv">+' + H.fmtNum(view.income.cultivation) + '</span></div>' +
              '<div class="ux-off-row">' + H.icon('performance') + '<span class="rn">绩效</span><span class="rv">+' + H.fmtNum(view.income.performance) + '</span></div>' +
            '</div>' +
            '<div class="ux-recipe-desc" style="margin-top:12px;line-height:1.9">' +
              '💼 ' + dur(view.durations.work) + ' · 🐟 ' + dur(view.durations.fishing) + '<br>' +
              '🧘 ' + dur(view.durations.cultivating) + ' · 🍵 ' + dur(view.durations.social) + '<br>' +
              (view.durations.overtime ? '⚡ 加班 ' + dur(view.durations.overtime) + (view.freeOvertimeSeconds ? '（免费）' : '（有补偿）') + '<br>' : '') +
              '⚡ 事件 ' + view.eventsHandled + ' · 材料 ' + view.materialsGained + ' 份' +
            '</div>' +
            ((view.paidFishingSalary || view.blamesTaken || view.blameCounters || view.incidents || view.assignedTasksDone) ?
              '<div class="ux-recipe-desc" style="margin-top:8px;line-height:1.9">' +
                (view.paidFishingSalary ? '🐟 带薪摸鱼收入 <b style="color:var(--green-lo)">¥' + Number(view.paidFishingSalary).toFixed(2) + '</b><br>' : '') +
                (view.assignedTasksDone || view.assignedTasksRefused ? '📋 塞来的活：完成 ' + (view.assignedTasksDone || 0) + ' · 拒绝 ' + (view.assignedTasksRefused || 0) + '<br>' : '') +
                (view.blamesTaken || view.blameCounters ? '🛡️ 背锅 ' + (view.blamesTaken || 0) + ' 次 · 成功反击 ' + (view.blameCounters || 0) + ' 次<br>' : '') +
                (view.incidents ? '🔥 生产事故 ' + view.incidents + ' 次 · 证据 +' + (view.evidenceGained || 0) + '<br>' : '') +
              '</div>' : '') +
            '<div class="ux-work-today__warning">' + H.escHtml(view.statusText || '') + '</div>' +
            '<div class="ux-dialog-actions"><button class="ux-btn ux-btn--gold ux-btn--md" id="SettleOk">明天见</button></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.getElementById('SettleOk').addEventListener('click', function () {
      H.closePopup();
      H.refresh();
    });
    if (view.isWeekly) H.toast('本周结算已生成，周五辛苦了！', 'success');
  }

  /* ── 公共 API：宿主调用 ── */

  window.V2UI = {
    init: function (host) { H = host; },
    __H: function () { return Object.keys(H).map(function (k) { return k + ':' + typeof H[k]; }).join(','); },
    dayStripHtml: dayStripHtml,
    situationHtml: situationHtml,
    demonHtml: demonHtml,
    renderTechniques: renderTechniques,
    renderEquipment: renderEquipment,
    renderNpc: renderNpc,
    renderSettlementPage: renderSettlementPage,
    renderDev: renderDev,
    maybeShowV2EventModal: maybeShowV2EventModal,
    maybeShowWeekendModal: maybeShowWeekendModal,
    maybeShowSettlementModal: maybeShowSettlementModal,
    promotionPageHtml: promotionPageHtml,
    showDefenseModal: showDefenseModal,
  };
})();
