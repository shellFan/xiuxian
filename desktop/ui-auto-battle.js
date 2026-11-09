/**
 * 牛马修仙传 — V6.3 咸鱼式自动战斗区域（desktop DOM Overlay 扩展）
 *
 * 首页常驻战斗：敌人血条 + 项目小队自动攻击 + 玩家点击攻击 + 关卡进度。
 * 数据来自 GameFacade.queryAutoBattle()（权威快照），不建第二套状态。
 *
 * 由 ui-overlay.js 在首页渲染时调用（经 window.__V63__ 桥接注入宿主工具）。
 */
;(function () {
  'use strict';

  var H = {}; // 宿主工具句柄（init 时注入：facade/escHtml/toast/refresh/errMsg）
  var lastView = null; // 缓存上次视图，用于局部刷新
  var floatDmgTimer = null;

  function fQuery(name, arg) {
    var f = H.facade();
    if (!f || typeof f[name] !== 'function') return null;
    try { return arg !== undefined ? f[name](arg) : f[name](); } catch (e) { return null; }
  }

  function readView() {
    var v = fQuery('queryAutoBattle');
    lastView = v;
    return v;
  }

  function fmtNum(n) {
    if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(Math.round(n));
  }

  /* ── 战斗区域 HTML ── */

  function battleAreaHtml() {
    var v = readView();
    if (!v) return '';
    return '<section class="ux63-battle" id="Ux63BattleArea">' +
      stageHeaderHtml(v) +
      enemyZoneHtml(v) +
      squadZoneHtml(v) +
      actionBarHtml(v) +
    '</section>';
  }

  function stageHeaderHtml(v) {
    var towerTag = v.towerFloor > 0
      ? '<span class="ux63-tag ux63-tag--tower">🗼 996通天塔 ' + v.towerFloor + '层</span>'
      : '';
    var chestTag = v.pendingChests > 0
      ? '<button class="ux63-tag ux63-tag--chest" data-action="v63-openChest">🎁 宝箱×' + v.pendingChests + '</button>'
      : '';
    var bossTag = v.status === 'BOSS_PENDING'
      ? '<button class="ux63-tag ux63-tag--boss" data-action="v63-gotoCardBattle">⚔️ Boss待战</button>'
      : '';
    return '<div class="ux63-stage-header">' +
      '<div class="ux63-stage-info">' +
        '<span class="ux63-chapter">' + H.escHtml(v.chapterEmoji) + ' ' + H.escHtml(v.chapterTitle) + '</span>' +
        '<b class="ux63-stage-num">第' + v.stage + '关</b>' +
        '<span class="ux63-stage-progress">' + H.escHtml(v.stageProgress) + '</span>' +
      '</div>' +
      '<div class="ux63-stage-tags">' + towerTag + chestTag + bossTag + '</div>' +
    '</div>';
  }

  function enemyZoneHtml(v) {
    if (!v.enemy) {
      return '<div class="ux63-enemy ux63-enemy--empty"><span>⚔️ 敌人即将出现...</span></div>';
    }
    var e = v.enemy;
    var hpColor = e.isCardBoss ? 'ux63-hp--cardboss' : e.isBoss ? 'ux63-hp--boss' : 'ux63-hp--normal';
    var bossLabel = e.isCardBoss ? ' <span class="ux63-boss-label ux63-boss-label--card">卡牌Boss</span>'
      : e.isBoss ? ' <span class="ux63-boss-label">Boss</span>' : '';
    var statusOverlay = '';
    if (v.status === 'VICTORY') statusOverlay = '<div class="ux63-enemy-status ux63-enemy-status--victory">✅ 击败！</div>';
    else if (v.status === 'DEFEAT') statusOverlay = '<div class="ux63-enemy-status ux63-enemy-status--defeat">💀 重生中...</div>';
    else if (v.status === 'BOSS_PENDING') statusOverlay = '<div class="ux63-enemy-status ux63-enemy-status--boss">⚔️ 进入卡牌战斗</div>';
    return '<div class="ux63-enemy' + (e.isBoss ? ' ux63-enemy--boss' : '') + '" data-action="v63-tapAttack">' +
      '<div class="ux63-enemy-avatar">' + H.escHtml(e.emoji) + '</div>' +
      '<div class="ux63-enemy-body">' +
        '<div class="ux63-enemy-name">' + H.escHtml(e.name) + bossLabel + '</div>' +
        '<div class="ux63-hp-bar"><div class="ux63-hp-fill ' + hpColor + '" id="Ux63HpFill" style="width:' + e.hpPct + '%"></div></div>' +
        '<div class="ux63-hp-text"><span id="Ux63HpNow">' + fmtNum(e.hp) + '</span> / ' + fmtNum(e.maxHp) + '</div>' +
      '</div>' +
      statusOverlay +
    '</div>';
  }

  function squadZoneHtml(v) {
    var members = v.squad || [];
    var html = '<div class="ux63-squad">';
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var skillCls = m.skillReady ? 'ux63-skill--ready' : 'ux63-skill--cd';
      html += '<div class="ux63-member" title="' + H.escHtml(m.name) + ' · ' + H.escHtml(m.professionLabel) + ' Lv.' + m.level + '&#10;攻击: ' + m.attack + '&#10;技能: ' + H.escHtml(m.skillName) + '">' +
        '<div class="ux63-member-avatar">' + H.escHtml(m.professionEmoji) + '</div>' +
        '<div class="ux63-member-info">' +
          '<span class="ux63-member-name">' + H.escHtml(m.name.length > 4 ? m.name.slice(0, 4) : m.name) + '</span>' +
          '<span class="ux63-member-lv">Lv.' + m.level + '</span>' +
        '</div>' +
        '<div class="ux63-skill ' + skillCls + '" style="--cd:' + m.skillCooldownPct + '%">' + (m.skillReady ? '✨' : '⏳') + '</div>' +
      '</div>';
    }
    // 空位招募按钮
    if (members.length < 5) {
      html += '<button class="ux63-member ux63-member--empty" data-action="v63-hireMenu" title="招募队员">＋</button>';
    }
    html += '</div>';
    return html;
  }

  function actionBarHtml(v) {
    var autoOn = v.autoEnabled;
    return '<div class="ux63-actions">' +
      '<button class="ux63-btn ux63-btn--tap" data-action="v63-tapAttack">👊 点击攻击 <small>' + fmtNum(v.clickDamage) + '</small></button>' +
      '<button class="ux63-btn ux63-btn--auto' + (autoOn ? ' is-on' : '') + '" data-action="v63-toggleAuto">' + (autoOn ? '🤖 自动中' : '💤 已暂停') + '</button>' +
      '<button class="ux63-btn ux63-btn--upgrade" data-action="v63-upgradeClick">⬆️ 升级点击</button>' +
      (v.towerFloor > 0
        ? '<button class="ux63-btn ux63-btn--tower-exit" data-action="v63-exitTower">↩️ 退出塔</button>'
        : '<button class="ux63-btn ux63-btn--tower" data-action="v63-enterTower">🗼 996塔</button>') +
      '<span class="ux63-dps">DPS ' + fmtNum(v.dps) + ' · 击杀' + v.totalKills + (v.towerBestFloor > 0 ? ' · 塔最高' + v.towerBestFloor + '层' : '') + '</span>' +
    '</div>';
  }

  /* ── 招募弹窗 ── */

  var hireMenuOpen = false;
  function hireMenuHtml() {
    var profs = [
      { id: 'JAVA_BACKEND', label: 'Java后端', emoji: '☕', desc: '稳定输出·代码暴击' },
      { id: 'FRONTEND', label: '前端', emoji: '🎨', desc: '快速攻击·渲染护盾' },
      { id: 'QA', label: '测试', emoji: '🐛', desc: '弱点识别·全队+50%' },
      { id: 'DEVOPS', label: '运维', emoji: '🔧', desc: '防御恢复·一键回滚' },
    ];
    var html = '<div class="ux63-hire-overlay" data-action="v63-closeHireMenu">' +
      '<div class="ux63-hire-panel" onclick="event.stopPropagation()">' +
        '<div class="ux63-hire-title">招募项目小队</div>';
    for (var i = 0; i < profs.length; i++) {
      var p = profs[i];
      html += '<button class="ux63-hire-option" data-action="v63-hire" data-prof="' + p.id + '">' +
        '<span class="ux63-hire-emoji">' + p.emoji + '</span>' +
        '<span class="ux63-hire-text"><b>' + p.label + '</b><small>' + p.desc + '</small></span>' +
      '</button>';
    }
    html += '<button class="ux63-hire-close" data-action="v63-closeHireMenu">关闭</button>' +
      '</div></div>';
    return html;
  }

  /* ── 点击处理 ── */

  function handleClick(el, act) {
    if (!act || act.indexOf('v63-') !== 0) return false;
    var action = act.slice(4); // 去掉 "v63-" 前缀
    switch (action) {
      case 'tapAttack':
        return doTapAttack(el);
      case 'toggleAuto':
        return doToggleAuto();
      case 'upgradeClick':
        return doUpgradeClick();
      case 'openChest':
        return doOpenChest();
      case 'enterTower':
        return doEnterTower();
      case 'exitTower':
        return doExitTower();
      case 'hireMenu':
        hireMenuOpen = true;
        H.refresh();
        return true;
      case 'closeHireMenu':
        hireMenuOpen = false;
        H.refresh();
        return true;
      case 'hire':
        return doHire(el);
      case 'gotoCardBattle':
        H.toast('⚔️ 请通过「项目」页进入卡牌战斗击败Boss');
        return true;
      default:
        return false;
    }
  }

  function doTapAttack(el) {
    var r = fQuery('tapAttack');
    if (!r) return true;
    if (!r.ok) {
      if (r.reason === 'BOSS_PENDING') H.toast('⚔️ Boss战需要进入卡牌战斗');
      return true;
    }
    // 飘字动画
    showFloatDmg(el, r.damage, r.isCrit);
    // 局部更新血条（不整页刷新，保持流畅）
    updateHpBar(r.enemyHpAfter);
    if (r.enemyDefeated) {
      if (r.stageCleared && r.rewards) {
        H.toast('✅ 第' + (lastView ? lastView.stage : '') + '关通关！+' + r.rewards.salary + '工资 +' + r.rewards.cultivation + '修为');
      }
      H.refresh(); // 敌人死亡→刷新整个战斗区
    }
    return true;
  }

  function doToggleAuto() {
    var on = fQuery('toggleAutoBattle');
    H.toast(on ? '🤖 自动战斗开启' : '💤 自动战斗暂停');
    H.refresh();
    return true;
  }

  function doUpgradeClick() {
    var r = fQuery('upgradeClickDamage');
    if (!r) return true;
    if (r.ok) {
      H.toast('⬆️ 点击伤害升级到 Lv.' + r.newLevel + '（消耗' + r.cost + '灵石）');
    } else {
      H.toast(r.reason || '灵石不足');
    }
    H.refresh();
    return true;
  }

  function doOpenChest() {
    var r = fQuery('openAutoBattleChest');
    if (!r) return true;
    if (r.ok && r.reward) {
      H.toast('🎁 获得：' + r.reward.label + ' ×' + r.reward.amount);
    } else {
      H.toast('没有待领取的宝箱');
    }
    H.refresh();
    return true;
  }

  function doEnterTower() {
    var r = fQuery('enterTower');
    if (!r) return true;
    if (r.ok) {
      H.toast('🗼 进入996通天塔第' + r.floor + '层！');
    } else {
      H.toast(r.reason || '无法进入');
    }
    H.refresh();
    return true;
  }

  function doExitTower() {
    fQuery('exitTower');
    H.toast('↩️ 已退出通天塔，回到主线推关');
    H.refresh();
    return true;
  }

  function doHire(el) {
    var prof = el.getAttribute('data-prof');
    if (!prof) return true;
    var r = fQuery('hireSquadMember', prof);
    if (!r) return true;
    if (r.ok) {
      H.toast('🎉 ' + r.member.name + '（' + prof + '）加入了小队！');
      hireMenuOpen = false;
    } else {
      H.toast(r.reason || '招募失败');
    }
    H.refresh();
    return true;
  }

  /* ── 局部刷新（血条实时更新，不整页重渲染） ── */

  function updateHpBar(hpAfter) {
    var fill = document.getElementById('Ux63HpFill');
    var now = document.getElementById('Ux63HpNow');
    if (!fill || !now || !lastView || !lastView.enemy) return;
    var maxHp = lastView.enemy.maxHp;
    var pct = maxHp > 0 ? Math.max(0, Math.round((hpAfter / maxHp) * 100)) : 0;
    fill.style.width = pct + '%';
    now.textContent = fmtNum(hpAfter);
  }

  /** 每秒由宿主调用：仅更新血条/技能冷却等动态元素，避免整页闪烁。 */
  function tick() {
    var v = readView();
    if (!v || !v.enemy) return;
    var fill = document.getElementById('Ux63HpFill');
    var now = document.getElementById('Ux63HpNow');
    if (fill && now) {
      fill.style.width = v.enemy.hpPct + '%';
      now.textContent = fmtNum(v.enemy.hp);
    }
    // 状态变化时整页刷新
    if (lastView && lastView.status !== v.status) {
      H.refresh();
    }
  }

  /* ── 飘字伤害 ── */

  function showFloatDmg(el, dmg, isCrit) {
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var float = document.createElement('div');
    float.className = 'ux63-float-dmg' + (isCrit ? ' ux63-float-dmg--crit' : '');
    float.textContent = isCrit ? '💥 ' + fmtNum(dmg) : fmtNum(dmg);
    float.style.left = (rect.left + rect.width * (0.3 + Math.random() * 0.4)) + 'px';
    float.style.top = (rect.top + rect.height * 0.2) + 'px';
    document.body.appendChild(float);
    setTimeout(function () { if (float.parentNode) float.parentNode.removeChild(float); }, 800);
  }

  /* ── 导出 ── */

  function init(host) {
    H = host;
  }

  window.__V63__ = {
    init: init,
    battleAreaHtml: battleAreaHtml,
    hireMenuHtml: function () { return hireMenuOpen ? hireMenuHtml() : ''; },
    handleClick: handleClick,
    tick: tick,
    isHireMenuOpen: function () { return hireMenuOpen; },
  };
})();