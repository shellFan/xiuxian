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
      '<div class="ux63-ai-bubble" id="Ux63AiBubble" style="display:none"></div>' +
      stageHeaderHtml(v) +
      enemyZoneHtml(v) +
      squadZoneHtml(v) +
      skillBarHtml(v) +
      actionBarHtml(v) +
    '</section>';
  }

  /* ── V6.4 主动技能栏 ── */

  function skillBarHtml(v) {
    var skills = v.activeSkills || [];
    if (!skills.length) return '';
    var speed = v.speedMultiplier || 1;
    var html = '<div class="ux64-skillbar">';
    for (var i = 0; i < skills.length; i++) {
      var s = skills[i];
      var locked = !s.unlocked;
      var cdCls = s.cooldownRemaining > 0 ? ' ux64-skill-btn--cd' : '';
      var lockCls = locked ? ' ux64-skill-btn--locked' : ' ux64-skill-btn--ready';
      var cdPct = s.cooldownMax > 0 ? Math.round((s.cooldownRemaining / s.cooldownMax) * 100) : 0;
      html += '<button class="ux64-skill-btn' + lockCls + cdCls + '"' +
        (locked ? '' : ' data-action="v64-useSkill" data-skill="' + s.id + '"') +
        ' title="' + H.escHtml(s.name) + '：' + H.escHtml(s.desc || '') + '&#10;冷却' + s.cooldownMax + 's">' +
        '<span class="ux64-skill-emoji">' + H.escHtml(s.emoji) + '</span>' +
        '<span class="ux64-skill-name">' + H.escHtml(s.name) + '</span>' +
        (locked ? '<span class="ux64-skill-lock">🔒' + s.unlockStage + '关</span>'
          : s.cooldownRemaining > 0 ? '<span class="ux64-skill-cd" id="Ux64SkillCd_' + s.id + '">' + Math.ceil(s.cooldownRemaining) + 's</span>'
          : '<span class="ux64-skill-cd ux64-skill-cd--ok" id="Ux64SkillCd_' + s.id + '">✨</span>') +
        '<span class="ux64-skill-cdmask" style="height:' + cdPct + '%"></span>' +
      '</button>';
    }
    html += '<button class="ux64-speed-btn' + (speed > 1 ? ' is-on' : '') + '" data-action="v64-toggleSpeed" title="切换战斗倍速">' +
      '<span class="ux64-speed-icon">⚡</span><span class="ux64-speed-val">' + speed + 'x</span></button>';
    html += '</div>';
    return html;
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
    /* V6.4: 战力分 + 推荐战力 */
    var powerTag = '';
    if (v.powerScore !== undefined && v.powerScore !== null) {
      var recTag = (v.recommendedPower && v.powerScore < v.recommendedPower)
        ? '<small class="ux63-power-warn">推荐' + fmtNum(v.recommendedPower) + '</small>'
        : '';
      powerTag = '<span class="ux63-tag ux63-tag--power">⚡ 战力 ' + fmtNum(v.powerScore) + recTag + '</span>';
    }
    var traitTag = v.bossTraitLabel ? '<span class="ux63-tag ux64-tag--trait">' + H.escHtml(v.bossTraitLabel) + '</span>' : '';
    var typeTag = v.enemyTypeLabel ? '<span class="ux63-tag ux64-tag--etype">' + H.escHtml(v.enemyTypeLabel) + '</span>' : '';
    return '<div class="ux63-stage-header">' +
      '<div class="ux63-stage-info">' +
        '<span class="ux63-chapter">' + H.escHtml(v.chapterEmoji) + ' ' + H.escHtml(v.chapterTitle) + '</span>' +
        '<b class="ux63-stage-num">第' + v.stage + '关</b>' +
        '<span class="ux63-stage-progress">' + H.escHtml(v.stageProgress) + '</span>' +
      '</div>' +
      '<div class="ux63-stage-tags">' + traitTag + typeTag + powerTag + towerTag + chestTag + bossTag + '</div>' +
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
    var detailMap = {};
    var details = v.squadDetail || [];
    for (var d = 0; d < details.length; d++) detailMap[details[d].id] = details[d];
    var html = '<div class="ux63-squad">';
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var det = detailMap[m.id] || {};
      var rarity = det.rarity || 0;
      var rarityCls = ['ux64-r0', 'ux64-r1', 'ux64-r2', 'ux64-r3', 'ux64-r4'][rarity] || 'ux64-r0';
      var stars = det.stars || 1;
      var starStr = '';
      for (var st = 0; st < stars; st++) starStr += '⭐';
      var skillCls = m.skillReady ? 'ux63-skill--ready' : 'ux63-skill--cd';
      var tipTitle = H.escHtml(m.name) + ' · ' + H.escHtml(det.rarityLabel || m.professionLabel) + ' ' + starStr + '&#10;' +
        H.escHtml(m.professionLabel) + ' Lv.' + m.level + '&#10;攻击: ' + m.attack +
        (det.starUpCost ? '&#10;升星需: 碎片×' + det.starUpCost.fragments + ' 灵石×' + det.starUpCost.spiritStones : '') +
        '&#10;技能: ' + H.escHtml(m.skillName);
      html += '<div class="ux63-member ' + rarityCls + '" title="' + tipTitle + '">' +
        '<div class="ux63-member-avatar">' + H.escHtml(m.professionEmoji) + '</div>' +
        '<div class="ux63-member-info">' +
          '<span class="ux63-member-name">' + H.escHtml(m.name.length > 4 ? m.name.slice(0, 4) : m.name) + '</span>' +
          '<span class="ux63-member-lv">Lv.' + m.level + (stars > 1 ? ' ' + starStr : '') + '</span>' +
        '</div>' +
        '<div class="ux63-skill ' + skillCls + '" style="--cd:' + m.skillCooldownPct + '%">' + (m.skillReady ? '✨' : '⏳') + '</div>' +
      '</div>';
    }
    // 空位招募按钮
    if (members.length < 5) {
      html += '<button class="ux63-member ux63-member--empty" data-action="v63-hireMenu" title="招募队员">＋</button>';
    }
    html += '</div>';
    // V6.4 羁绊徽章
    var syns = v.synergies || [];
    if (syns.length) {
      html += '<div class="ux64-synergy-row">';
      for (var si = 0; si < syns.length; si++) {
        html += '<span class="ux64-synergy-badge" title="' + H.escHtml(syns[si].desc) + '">' +
          syns[si].emoji + ' ' + H.escHtml(syns[si].name) + '</span>';
      }
      html += '</div>';
    }
    return html;
  }

  function actionBarHtml(v) {
    var autoOn = v.autoEnabled;
    var equipDrops = (v.pendingEquipDrops && v.pendingEquipDrops.length) ? v.pendingEquipDrops.length : 0;
    return '<div class="ux63-actions">' +
      '<button class="ux63-btn ux63-btn--tap" data-action="v63-tapAttack">👊 点击攻击 <small>' + fmtNum(v.clickDamage) + '</small></button>' +
      '<button class="ux63-btn ux63-btn--auto' + (autoOn ? ' is-on' : '') + '" data-action="v63-toggleAuto">' + (autoOn ? '🤖 自动中' : '💤 已暂停') + '</button>' +
      '<button class="ux63-btn ux63-btn--upgrade" data-action="v63-upgradeClick">⬆️ 升级点击</button>' +
      (v.towerFloor > 0
        ? '<button class="ux63-btn ux63-btn--tower-exit" data-action="v63-exitTower">↩️ 退出塔</button>'
        : '<button class="ux63-btn ux63-btn--tower" data-action="v63-enterTower">🗼 996塔</button>') +
      '<button class="ux63-btn ux64-btn--equip" data-action="v64-openEquip">⚔️ 装备' + (equipDrops > 0 ? '<span class="ux64-badge">' + equipDrops + '</span>' : '') + '</button>' +
      '<button class="ux63-btn ux64-btn--goals" data-action="v64-openGoals">📋 目标</button>' +
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

  /* ── V6.4 装备面板 ── */

  var equipPanelOpen = false;
  var goalsPanelOpen = false;

  var RARITY_COLORS = ['#9ca3af', '#4ade80', '#60a5fa', '#c084fc', '#fbbf24'];
  var RARITY_NAMES = ['普通', '优秀', '精英', '史诗', '传说'];
  var SLOT_NAMES = { WEAPON: '武器', ARMOR: '护甲', ACCESSORY: '饰品', RELIC: '法宝' };
  var SLOT_EMOJIS = { WEAPON: '⌨️', ARMOR: '🛡️', ACCESSORY: '💍', RELIC: '📿' };

  function equipPanelHtml() {
    var ev = fQuery('queryEquipView');
    if (!ev) return '';
    var html = '<div class="ux63-hire-overlay" data-action="v64-closeEquip">' +
      '<div class="ux63-hire-panel ux64-equip-panel" onclick="event.stopPropagation()">' +
        '<div class="ux63-hire-title">⚔️ 战斗装备</div>';
    // 已装备槽位
    html += '<div class="ux64-equip-slots">';
    var slots = ['WEAPON', 'ARMOR', 'ACCESSORY', 'RELIC'];
    for (var si = 0; si < slots.length; si++) {
      var slot = slots[si];
      var eq = ev.equipped && ev.equipped[slot];
      if (eq) {
        var rc = RARITY_COLORS[eq.rarity] || RARITY_COLORS[0];
        html += '<div class="ux64-equip-slot is-filled" style="border-color:' + rc + '">' +
          '<span class="ux64-equip-slot-emoji">' + (SLOT_EMOJIS[slot] || '') + '</span>' +
          '<span class="ux64-equip-slot-name" style="color:' + rc + '">' + H.escHtml(eq.name) + '</span>' +
          '<span class="ux64-equip-slot-stat">攻+' + fmtNum(eq.atk) + (eq.critRate > 0 ? ' 暴击' + Math.round(eq.critRate * 100) + '%' : '') + '</span>' +
          (eq.level > 1 ? '<span class="ux64-equip-slot-lv">+' + eq.level + '</span>' : '') +
          '<button class="ux64-equip-mini-btn" data-action="v64-unequipItem" data-slot="' + slot + '">卸</button>' +
        '</div>';
      } else {
        html += '<div class="ux64-equip-slot is-empty">' +
          '<span class="ux64-equip-slot-emoji">' + (SLOT_EMOJIS[slot] || '') + '</span>' +
          '<span class="ux64-equip-slot-name">' + (SLOT_NAMES[slot] || slot) + '</span>' +
          '<span class="ux64-equip-slot-stat">空</span>' +
        '</div>';
      }
    }
    html += '</div>';
    // 背包
    var bag = ev.bag || [];
    if (bag.length) {
      html += '<div class="ux64-equip-bag-title">背包 (' + bag.length + ')</div>';
      html += '<div class="ux64-equip-bag">';
      for (var bi = 0; bi < bag.length; bi++) {
        var item = bag[bi];
        var irc = RARITY_COLORS[item.rarity] || RARITY_COLORS[0];
        var cost = item.enhanceCost;
        html += '<div class="ux64-equip-item" style="border-color:' + irc + '">' +
          '<span class="ux64-equip-item-name" style="color:' + irc + '">' + H.escHtml(item.name) + (item.level > 1 ? ' +' + item.level : '') + '</span>' +
          '<span class="ux64-equip-item-stat">攻+' + fmtNum(item.atk) + (item.critRate > 0 ? ' 暴' + Math.round(item.critRate * 100) + '%' : '') + '</span>' +
          '<div class="ux64-equip-item-btns">' +
            '<button class="ux64-equip-mini-btn" data-action="v64-equipItem" data-inst="' + item.id + '">穿</button>' +
            (item.level < 10 && cost
              ? '<button class="ux64-equip-mini-btn ux64-equip-mini-btn--enh" data-action="v64-enhanceEquip" data-inst="' + item.id + '">强化' + fmtNum(cost.spiritStones) + '石</button>'
              : '') +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="ux64-equip-bag-empty">背包为空，击杀敌人掉落装备</div>';
    }
    if (ev.fragments) {
      html += '<div class="ux64-equip-frag">🔩 装备碎片: ' + fmtNum(ev.fragments) + '</div>';
    }
    html += '<button class="ux63-hire-close" data-action="v64-closeEquip">关闭</button>' +
      '</div></div>';
    return html;
  }

  /* ── V6.4 目标面板（每日+七日+成就） ── */

  function goalsPanelHtml() {
    var dg = fQuery('queryDailyGoals');
    var sd = fQuery('querySevenDayGoals');
    var ach = fQuery('queryV64Achievements');
    var html = '<div class="ux63-hire-overlay" data-action="v64-closeGoals">' +
      '<div class="ux63-hire-panel ux64-goals-panel" onclick="event.stopPropagation()">' +
        '<div class="ux63-hire-title">📋 每日目标</div>';
    // 每日目标
    if (dg && dg.length) {
      html += '<div class="ux64-goals-list">';
      for (var di = 0; di < dg.length; di++) {
        var g = dg[di];
        var pct = g.target > 0 ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
        var done = g.progress >= g.target;
        html += '<div class="ux64-goal-item' + (done ? ' is-done' : '') + (g.claimed ? ' is-claimed' : '') + '">' +
          '<span class="ux64-goal-emoji">' + g.emoji + '</span>' +
          '<div class="ux64-goal-body">' +
            '<span class="ux64-goal-name">' + H.escHtml(g.name) + '</span>' +
            '<div class="ux64-goal-bar"><div class="ux64-goal-fill" style="width:' + pct + '%"></div></div>' +
            '<span class="ux64-goal-prog">' + g.progress + '/' + g.target + '</span>' +
          '</div>' +
          (done && !g.claimed
            ? '<button class="ux64-goal-claim" data-action="v64-claimDailyGoal" data-idx="' + di + '">领取</button>'
            : g.claimed ? '<span class="ux64-goal-claimed">✅</span>' : '') +
        '</div>';
      }
      html += '</div>';
    }
    // 七日目标
    if (sd && sd.length) {
      html += '<div class="ux63-hire-title ux64-goals-subtitle">🗓️ 七日成长</div>';
      html += '<div class="ux64-goals-list">';
      for (var si2 = 0; si2 < sd.length; si2++) {
        var sg = sd[si2];
        html += '<div class="ux64-goal-item' + (sg.claimed ? ' is-claimed' : '') + '">' +
          '<span class="ux64-goal-emoji">' + sg.emoji + '</span>' +
          '<div class="ux64-goal-body">' +
            '<span class="ux64-goal-name">Day' + sg.day + ' ' + H.escHtml(sg.name) + '</span>' +
            '<span class="ux64-goal-prog">' + H.escHtml(sg.desc) + '</span>' +
          '</div>' +
          (sg.claimed
            ? '<span class="ux64-goal-claimed">✅</span>'
            : '<button class="ux64-goal-claim" data-action="v64-claimSevenDay" data-day="' + sg.day + '">领取</button>') +
        '</div>';
      }
      html += '</div>';
    }
    // 成就
    if (ach && ach.length) {
      var claimed = 0;
      for (var ci = 0; ci < ach.length; ci++) {
        if (ach[ci].claimed) claimed++;
      }
      html += '<div class="ux63-hire-title ux64-goals-subtitle">🏆 成就 (' + claimed + '/' + ach.length + ')</div>';
      html += '<div class="ux64-ach-grid">';
      for (var ai = 0; ai < ach.length; ai++) {
        var a = ach[ai];
        html += '<div class="ux64-ach-item' + (a.claimed ? ' is-claimed' : '') + '" title="' + H.escHtml(a.desc) + '">' +
          (a.claimed ? '🏆' : '🔒') + ' ' + H.escHtml(a.name) +
        '</div>';
      }
      html += '</div>';
    }
    html += '<button class="ux63-hire-close" data-action="v64-closeGoals">关闭</button>' +
      '</div></div>';
    return html;
  }

  /* ── 点击处理 ── */

  function handleClick(el, act) {
    if (!act) return false;
    if (act.indexOf('v64-') === 0) {
      return handleV64Click(el, act.slice(4));
    }
    if (act.indexOf('v63-') !== 0) return false;
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
        if (typeof H.goto === 'function') { H.goto('project'); H.toast('⚔️ 选择Build开始卡牌战斗，击败Boss推进章节'); }
        else H.toast('⚔️ 请通过「项目」页进入卡牌战斗击败Boss');
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
      showChestModal(r.reward);
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

  /* ── V6.4 点击处理 ── */

  function handleV64Click(el, action) {
    switch (action) {
      case 'useSkill':
        return doUseSkill(el);
      case 'toggleSpeed':
        return doToggleSpeed();
      case 'openEquip':
        equipPanelOpen = true;
        H.refresh();
        return true;
      case 'closeEquip':
        equipPanelOpen = false;
        H.refresh();
        return true;
      case 'equipItem':
        return doEquipItem(el);
      case 'unequipItem':
        return doUnequipItem(el);
      case 'enhanceEquip':
        return doEnhanceEquip(el);
      case 'openGoals':
        goalsPanelOpen = true;
        H.refresh();
        return true;
      case 'closeGoals':
        goalsPanelOpen = false;
        H.refresh();
        return true;
      case 'claimDailyGoal':
        return doClaimDailyGoal(el);
      case 'claimSevenDay':
        return doClaimSevenDay(el);
      default:
        return false;
    }
  }

  function doUseSkill(el) {
    var skillId = el.getAttribute('data-skill');
    if (!skillId) return true;
    var r = fQuery('useActiveSkill', skillId);
    if (!r) return true;
    if (r.ok) {
      var msg = '✨ ' + skillId + ' 释放！';
      if (r.totalDamage) msg = '💥 伤害 ' + fmtNum(r.totalDamage);
      if (r.shieldGained) msg = '🛡️ 护盾 +' + fmtNum(r.shieldGained);
      if (r.enemyDefeated) msg += ' ✅ 击杀！';
      H.toast(msg);
      if (r.enemyDefeated) H.refresh();
    } else {
      H.toast(r.reason || '技能不可用');
    }
    return true;
  }

  function doToggleSpeed() {
    var speed = fQuery('toggleBattleSpeed');
    H.toast(speed > 1 ? '⚡ 倍速 2x 开启' : '▶️ 倍速恢复 1x');
    H.refresh();
    return true;
  }

  function doEquipItem(el) {
    var instId = el.getAttribute('data-inst');
    if (!instId) return true;
    var r = fQuery('equipItem', instId);
    if (!r) return true;
    H.toast(r.ok ? '⚔️ 装备成功' : (r.reason || '装备失败'));
    H.refresh();
    return true;
  }

  function doUnequipItem(el) {
    var slot = el.getAttribute('data-slot');
    if (!slot) return true;
    var r = fQuery('unequipItem', slot);
    if (!r) return true;
    H.toast(r.ok ? '📤 已卸下' : (r.reason || '卸下失败'));
    H.refresh();
    return true;
  }

  function doEnhanceEquip(el) {
    var instId = el.getAttribute('data-inst');
    if (!instId) return true;
    var r = fQuery('enhanceEquip', instId);
    if (!r) return true;
    if (r.ok) {
      H.toast('⬆️ 强化到 Lv.' + r.newLevel);
    } else {
      H.toast(r.reason || '强化失败');
    }
    H.refresh();
    return true;
  }

  function doClaimDailyGoal(el) {
    var idx = el.getAttribute('data-idx');
    if (idx === null || idx === undefined) return true;
    var r = fQuery('claimDailyGoal', parseInt(idx, 10));
    if (!r) return true;
    H.toast(r.ok ? '🎉 目标完成！奖励已领取' : (r.reason || '未完成'));
    H.refresh();
    return true;
  }

  function doClaimSevenDay(el) {
    var day = el.getAttribute('data-day');
    if (day === null || day === undefined) return true;
    var r = fQuery('claimSevenDayGoal', parseInt(day, 10));
    if (!r) return true;
    H.toast(r.ok ? '🎉 七日目标完成！' : (r.reason || '未完成'));
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
    // V6.4 技能冷却局部更新
    var skills = v.activeSkills || [];
    for (var i = 0; i < skills.length; i++) {
      var s = skills[i];
      var cdEl = document.getElementById('Ux64SkillCd_' + s.id);
      if (cdEl) {
        if (s.cooldownRemaining > 0) {
          cdEl.textContent = Math.ceil(s.cooldownRemaining) + 's';
          cdEl.className = 'ux64-skill-cd';
        } else {
          cdEl.textContent = '✨';
          cdEl.className = 'ux64-skill-cd ux64-skill-cd--ok';
        }
      }
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

  /* ── AI点评气泡 ── */

  var aiBubbleTimer = null;

  function showAiBubble(comment) {
    if (!comment || !comment.text) return;
    var bubble = document.getElementById('Ux63AiBubble');
    if (!bubble) return;
    var moodClass = { praise: 'ux63-ai-bubble--praise', sarcasm: 'ux63-ai-bubble--sarcasm', warn: 'ux63-ai-bubble--warn', cheer: 'ux63-ai-bubble--cheer' }[comment.mood] || '';
    bubble.className = 'ux63-ai-bubble ' + moodClass;
    bubble.innerHTML = '<span class="ux63-ai-emoji">' + H.escHtml(comment.emoji || '🤖') + '</span>' +
      '<span class="ux63-ai-text">' + H.escHtml(comment.text) + '</span>';
    bubble.style.display = 'flex';
    if (aiBubbleTimer) clearTimeout(aiBubbleTimer);
    aiBubbleTimer = setTimeout(function () {
      bubble.style.display = 'none';
    }, 4000);
  }

  /* ── 宝箱开箱弹窗 ── */

  function showChestModal(reward) {
    if (!reward) return;
    var overlay = document.createElement('div');
    overlay.className = 'ux63-chest-overlay';
    overlay.innerHTML =
      '<div class="ux63-chest-modal">' +
        '<div class="ux63-chest-glow">🎁</div>' +
        '<div class="ux63-chest-title">宝箱开启！</div>' +
        '<div class="ux63-chest-reward">' + H.escHtml(reward.label) + ' ×' + fmtNum(reward.amount) + '</div>' +
        '<button class="ux63-chest-close">收下</button>' +
      '</div>';
    overlay.querySelector('.ux63-chest-close').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    document.body.appendChild(overlay);
  }

  /* ── 导出 ── */

  function init(host) {
    H = host;
    /* 订阅AI点评事件（经宿主onUiEvent桥接，v63AiComment以STATE_CHANGED转发） */
    if (typeof H.onUiEvent === 'function') {
      try {
        H.onUiEvent('STATE_CHANGED', function (ev) {
          if (ev && ev.source === 'v63AiComment' && ev.detail) {
            showAiBubble(ev.detail);
          }
        });
      } catch (e) { /* 事件订阅失败不影响战斗 */ }
    }
  }

  window.__V63__ = {
    init: init,
    battleAreaHtml: battleAreaHtml,
    hireMenuHtml: function () { return hireMenuOpen ? hireMenuHtml() : ''; },
    equipPanelHtml: function () { return equipPanelOpen ? equipPanelHtml() : ''; },
    goalsPanelHtml: function () { return goalsPanelOpen ? goalsPanelHtml() : ''; },
    handleClick: handleClick,
    tick: tick,
    isHireMenuOpen: function () { return hireMenuOpen; },
    isEquipPanelOpen: function () { return equipPanelOpen; },
    isGoalsPanelOpen: function () { return goalsPanelOpen; },
  };
})();