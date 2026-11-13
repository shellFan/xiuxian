/**
 * V5.9-O.2 回合制卡牌战斗 UI 模块（battle-hand / battle-card / battle-intent /
 * battle-reward / battle-status / battle-screen 拆分，§32）。
 *
 * 只做渲染与命令转发：一切数值来自 facade.queryBattleCard()（引擎权威状态），
 * 一切变更经 facade.playBattleCard / endBattleTurn / claimBattleCardReward /
 * upgradeBattleCard。UI 不直接改写生命/能量/牌堆。
 *
 * 挂载：window.__BATTLE_CARD__（由 patch-html.cjs 注入，ui-overlay.js 调用）。
 */
(function () {
  'use strict';

  var selectedCardUid = null;   // 目标选择态：已选中待指定敌人的手牌
  var tutorialStep = -1;        // 首战引导步（-1 = 未激活）
  var tutorialSteps = [
    '这是你的生命与格挡 —— 归零就失败了。',
    '这是敌人生命与它的意图（下一步行动）。',
    '每回合有 3 点能量，卡牌需要消耗能量。',
    '点击一张攻击卡，再点敌人即可出牌。',
    '点击【结束回合】后敌人行动，然后开始你的下一回合。',
    '胜利后可以选择一张卡牌加入你的卡组。',
  ];

  function facade() {
    return (typeof window !== 'undefined' && window.__GAME_FACADE__) || null;
  }

  function tryGet(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── 文案 ────────────────────────────────────────────────────────────────────

  var TYPE_CN = { ATTACK: '攻击', DEFENSE: '防御', SKILL: '技能', PROFESSION: '职业', FATE: '命格', SPECIAL: '特殊' };
  var RARITY_CN = { BASIC: '基础', COMMON: '普通', RARE: '稀有', EPIC: '史诗' };
  var STATUS_CN = { STRENGTH: '力量', WEAK: '虚弱', VULNERABLE: '易伤', DODGE: '闪避', BLIND: '失明', POISON: '中毒', REGEN: '回气', COST_DOWN: '降费', INTANGIBLE: '虚境' };
  var INTENT_CN = {
    ATTACK: '攻击', ATTACK_DEBUFF: '攻击+削弱', BLOCK: '防御', BUFF: '强化',
    DEBUFF: '削弱', SUMMON: '召唤', SPECIAL: '特殊行动', SLEEP: '蓄力',
  };
  var MECH_CN = {
    SUMMON: '召唤', RAGE: '蓄怒', ENRAGE: '狂暴', LOCK_SKILL: '封技',
    ATTACK_SPEED_DEBUFF: '减速', HP_DRAIN: '吞噬', PROMOTE_MINION: '强化爪牙',
    DODGE: '闪避', BLIND: '致盲', RANDOM: '诡变',
  };

  /** 手牌内实际费用（与引擎 effectiveCost 同口径）。 */
  function effectiveCost(card, instance) {
    var def = instance.def();
    var costDown = (card.player.statuses && card.player.statuses.COST_DOWN) || 0;
    return Math.max(0, def.cost + (instance.turnCostDelta || 0) - costDown);
  }

  // ── 手牌（battle-hand / battle-card） ───────────────────────────────────────

  function handHtml(card) {
    var f = facade();
    var defs = tryGet(function () { return f.queryCardCatalog(); }, []) || [];
    var defMap = {};
    defs.forEach(function (d) { defMap[d.id] = d; });
    var selecting = !!selectedCardUid;
    var html = (card.hand || []).map(function (instance) {
      var def = defMap[instance.defId];
      if (!def) return '';
      var upgradedDef = instance.upgraded > 0 ? (defMap[def.id + '_up' + instance.upgraded] || def) : def;
      var cost = effectiveCost(card, { def: function () { return upgradedDef; }, turnCostDelta: instance.turnCostDelta });
      var usable = card.phase === 'PLAYER_TURN' && !def.unplayable && cost <= card.player.energy;
      var isSelected = selectedCardUid === instance.uid;
      var needsTarget = upgradedDef.target === 'ENEMY';
      var disabledReason = '';
      if (card.phase !== 'PLAYER_TURN') disabledReason = '非出牌阶段';
      else if (def.unplayable) disabledReason = '无法打出';
      else if (cost > card.player.energy) disabledReason = '能量不足';
      var cls = 'ux-bc-card' +
        (upgradedDef.type === 'ATTACK' ? ' is-attack' : '') +
        (upgradedDef.type === 'DEFENSE' ? ' is-defense' : '') +
        (upgradedDef.type === 'SKILL' ? ' is-skill' : '') +
        (upgradedDef.type === 'PROFESSION' || upgradedDef.type === 'FATE' ? ' is-profession' : '') +
        (upgradedDef.unplayable ? ' is-unplayable' : '') +
        (upgradedDef.exhaust ? ' is-exhaust' : '') +
        (usable ? ' is-usable' : ' is-disabled') +
        (isSelected ? ' is-selected' : '');
      return '<button class="' + cls + '" data-action="battlePlayCard" data-card="' + esc(instance.uid) + '"' +
        (disabledReason ? ' data-reason="' + esc(disabledReason) + '"' : '') +
        ' title="' + esc(upgradedDef.desc) + (upgradedDef.exhaust ? '（消耗）' : '') + (upgradedDef.retain ? '（保留）' : '') + '">' +
        '<span class="ux-bc-cost">' + cost + '</span>' +
        '<span class="ux-bc-name">' + esc(upgradedDef.name) + (instance.upgraded > 0 ? '<b>+' + instance.upgraded + '</b>' : '') + '</span>' +
        '<span class="ux-bc-type">' + esc(TYPE_CN[upgradedDef.type] || upgradedDef.type) + ' · ' + esc(RARITY_CN[upgradedDef.rarity] || upgradedDef.rarity) + '</span>' +
        '<span class="ux-bc-desc">' + esc(upgradedDef.desc) + '</span>' +
        (needsTarget ? '<span class="ux-bc-target">' + (isSelected ? '◀ 点击敌人施放' : '需选择目标') + '</span>' : '') +
        '</button>';
    }).join('');
    var hint = selecting
      ? '<span class="ux-bc-hint ux-bc-hint--active">选择目标中：点击敌人施放，再点一次卡牌取消</span>'
      : '<span class="ux-bc-hint">点击卡牌出牌 · 悬停查看详情</span>';
    return '<div class="ux-bc-hand" id="BattleHand">' + html + '</div>' +
      '<div class="ux-bc-handrow">' + hint + handMetaHtml(card) + endTurnHtml(card) + '</div>';
  }

  function handMetaHtml(card) {
    return '<span class="ux-bc-piles">' +
      '<span title="抽牌堆">🂠 ' + card.drawPile.length + '</span>' +
      '<span title="弃牌堆">♻ ' + card.discardPile.length + '</span>' +
      (card.exhaustPile.length ? '<span title="消耗堆">✖ ' + card.exhaustPile.length + '</span>' : '') +
      '</span>';
  }

  function endTurnHtml(card) {
    var disabled = card.phase !== 'PLAYER_TURN';
    return '<button class="ux-bc-endturn' + (disabled ? ' is-disabled' : '') + '" data-action="battleEndTurn"' +
      (disabled ? ' disabled' : '') + '>结束回合</button>';
  }

  // ── 能量与回合（battle-status） ─────────────────────────────────────────────

  function energyHtml(card) {
    var total = Math.max(card.player.energy, card.baseEnergy);
    var orbs = '';
    for (var i = 0; i < total; i += 1) {
      orbs += '<i class="' + (i < card.player.energy ? 'is-on' : '') + '"></i>';
    }
    return '<div class="ux-bc-energy" title="能量">' + orbs + '<span>' + card.player.energy + '/' + card.baseEnergy + '</span></div>';
  }

  function statusesHtml(statuses) {
    var chips = [];
    Object.keys(statuses || {}).forEach(function (id) {
      if (!statuses[id] || !STATUS_CN[id]) return;
      chips.push('<span class="ux-bc-status is-' + id.toLowerCase() + '">' + STATUS_CN[id] + (statuses[id] > 1 ? '×' + statuses[id] : '') + '</span>');
    });
    return chips.length ? '<div class="ux-bc-statuses">' + chips.join('') + '</div>' : '';
  }

  // ── 敌人意图（battle-intent） ───────────────────────────────────────────────

  function intentHtml(card, enemyUid) {
    var enemy = null;
    (card.enemies || []).forEach(function (e) { if (e.uid === enemyUid) enemy = e; });
    if (!enemy || !enemy.intent || enemy.hp <= 0) return '';
    var intent = enemy.intent;
    var label = INTENT_CN[intent.kind] || intent.kind;
    var detail = '';
    if (intent.kind === 'ATTACK') detail = ' ' + intent.damage + (intent.hits > 1 ? '×' + intent.hits : '');
    else if (intent.kind === 'ATTACK_DEBUFF') detail = ' ' + intent.damage + ' + ' + (STATUS_CN[intent.status] || intent.status);
    else if (intent.kind === 'BLOCK') detail = ' +' + intent.amount;
    else if (intent.kind === 'BUFF' || intent.kind === 'DEBUFF') detail = ' ' + (STATUS_CN[intent.status] || intent.status) + '×' + intent.stacks;
    else if (intent.kind === 'SUMMON') detail = '';
    else if (intent.kind === 'SPECIAL') detail = ' ' + (MECH_CN[intent.mechanic] || intent.mechanic);
    var cls = intent.kind === 'ATTACK' || intent.kind === 'ATTACK_DEBUFF' ? ' is-hostile' : ' is-neutral';
    var telegraph = '';
    Object.keys(enemy.telegraphed || {}).forEach(function (mk) {
      if (enemy.telegraphed[mk] && MECH_CN[mk]) telegraph = '⚠ ' + MECH_CN[mk];
    });
    return '<span class="ux-bc-intent' + cls + '">' + esc(label + detail) + '</span>' +
      (telegraph ? '<span class="ux-bc-telegraph">' + esc(telegraph) + '</span>' : '');
  }

  // ── 整屏（battle-screen）：挂到 battleHtml 的扩展点 ─────────────────────────

  /** 卡牌战斗侧栏扩展（能量/回合/手牌行/结束回合），ui-overlay.battleHtml 调用。 */
  function battlePanelHtml(card) {
    if (!card) return '';
    var runInfo = '<div class="ux-bc-turnbar"><span>回合 ' + card.turn + '</span>' + energyHtml(card) + '</div>';
    if (card.phase === 'REWARD_SELECTION') return runInfo;
    if (card.phase === 'FINISHED') return runInfo;
    return runInfo + handHtml(card);
  }

  /** 玩家状态条扩展（statuses）。 */
  function playerStatusHtml(card) {
    if (!card) return '';
    return statusesHtml(card.player.statuses);
  }

  // ── 奖励弹窗（battle-reward） ───────────────────────────────────────────────

  function rewardModalHtml(card) {
    if (!card || !card.reward || card.reward.claimed) return '';
    var f = facade();
    var defs = tryGet(function () { return f.queryCardCatalog(); }, []) || [];
    var defMap = {};
    defs.forEach(function (d) { defMap[d.id] = d; });
    var cards = (card.reward.candidates || []).map(function (id) {
      var def = defMap[id];
      if (!def) return '';
      return '<button class="ux-bc-card is-usable is-reward" data-action="battleRewardPick" data-card="' + esc(id) + '" title="' + esc(def.desc) + '">' +
        '<span class="ux-bc-cost">' + def.cost + '</span>' +
        '<span class="ux-bc-name">' + esc(def.name) + '</span>' +
        '<span class="ux-bc-type">' + esc(TYPE_CN[def.type] || def.type) + ' · ' + esc(RARITY_CN[def.rarity] || def.rarity) + '</span>' +
        '<span class="ux-bc-desc">' + esc(def.desc) + '</span>' +
        '</button>';
    }).join('');
    return '<div class="ux-modal-mask" data-modal="battleReward"><div class="ux-bc-reward">' +
      '<h3>🎉 项目交付！选择一张卡牌加入卡组</h3>' +
      '<div class="ux-bc-reward-row">' + cards + '</div>' +
      '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="battleRewardSkip">放弃奖励</button>' +
      '</div></div>';
  }

  // ── 卡组页（战斗外） ────────────────────────────────────────────────────────

  function deckPageHtml() {
    var f = facade();
    var deck = tryGet(function () { return f.queryCardDeck(); }, null);
    var catalog = tryGet(function () { return f.queryCardCatalog(); }, []) || [];
    if (!deck) return '';
    var stones = tryGet(function () { return f.queryPlayer().spiritStones; }, 0);
    var rows = catalog.filter(function (d) { return !d.unplayable && d.type !== 'SPECIAL' || d.id === 'card_overtime'; }).map(function (def) {
      var count = deck.manifest[def.id] || 0;
      if (!count) return '';
      var upLevel = deck.upgrades[def.id] || 0;
      var currentDef = upLevel > 0 ? (catalog.filter(function (c) { return c.id === def.id + '_up' + upLevel; })[0] || def) : def;
      var canUp = !!currentDef.upgradeTo;
      var costByRarity = { BASIC: 20, COMMON: 30, RARE: 60, EPIC: 100 };
      var cost = costByRarity[def.rarity] || 30;
      return '<div class="ux-bc-deckrow' + (count ? '' : ' is-empty') + '">' +
        '<span class="ux-bc-deckname">' + esc(currentDef.name) + (upLevel ? '<b>+' + upLevel + '</b>' : '') + ' <small>×' + count + '</small></span>' +
        '<span class="ux-bc-deckmeta">' + esc(TYPE_CN[def.type] || def.type) + ' · ' + esc(RARITY_CN[def.rarity] || def.rarity) + ' · 费用 ' + currentDef.cost + '</span>' +
        '<span class="ux-bc-deckdesc">' + esc(currentDef.desc) + '</span>' +
        (canUp
          ? '<button class="ux-btn ux-btn--sm' + (stones >= cost ? '' : ' ux-btn--gray') + '" data-action="battleUpgradeCard" data-card="' + esc(def.id) + '">升级（💎' + cost + '）</button>'
          : '<span class="ux-bc-maxed">已满级</span>') +
        '</div>';
    }).join('');
    return '<section class="ux-bc-deckpage">' +
      '<div class="ux-bc-deckhead"><b>卡组（' + deck.total + ' 张）</b><span>💎 ' + stones + ' 灵石 · 胜利后可收新卡</span></div>' +
      (rows || '<div class="ux-bc-empty">卡组为空</div>') +
      '</section>';
  }

  // ── 首战引导（P2，可跳过、状态持久化） ──────────────────────────────────────

  function tutorialHtml() {
    var f = facade();
    var done = tryGet(function () { return f.queryPlayerFlags && f.queryPlayerFlags()['v59o_battle_tutorial_done']; }, true);
    if (done) return '';
    if (tutorialStep < 0) tutorialStep = 0;
    var text = tutorialSteps[tutorialStep] || '';
    return '<div class="ux-bc-tutorial">' +
      '<span>' + esc(text) + '</span>' +
      '<button class="ux-btn ux-btn--sm" data-action="battleTutorialNext">下一步</button>' +
      '<button class="ux-btn ux-btn--gray ux-btn--sm" data-action="battleTutorialSkip">跳过引导</button>' +
      '</div>';
  }

  // ── 动作处理 ────────────────────────────────────────────────────────────────

  function toast(msg) {
    var overlay = window.__UI_OVERLAY__;
    if (overlay && typeof overlay.toast === 'function') overlay.toast(msg);
  }

  // ── V6.1 Game Feel 辅助 ──────────────────────────────────────────────────────

  function gf() { return (typeof window !== 'undefined' && window.__GAME_FEEL__) || null; }

  /** 快照战斗状态（用于动作前后对比，检测伤害/治疗/胜负） */
  function snapshotBattle(f) {
    var c = tryGet(function () { return f.queryBattleCard(); }, null);
    if (!c) return null;
    var enemies = {};
    (c.enemies || []).forEach(function (e) { enemies[e.uid] = { hp: e.hp, maxHp: e.maxHp }; });
    return { phase: c.phase, playerHp: c.player ? c.player.hp : 0, enemies: enemies };
  }

  /** 对比前后快照，触发对应的 Game Feel 特效 */
  function diffAndFeel(before, after, opts) {
    var G = gf();
    if (!G || !before || !after) return;
    opts = opts || {};
    try {
      // 胜负检测
      if (after.phase === 'FINISHED' || after.phase === 'REWARD_SELECTION') {
        var allDead = true;
        Object.keys(after.enemies).forEach(function (uid) { if (after.enemies[uid].hp > 0) allDead = false; });
        if (allDead && (before.phase === 'PLAYER_TURN' || before.phase === 'ENEMY_TURN')) {
          G.battle('victory', {});
          return;
        }
      }
      if (after.playerHp <= 0 && before.playerHp > 0) {
        G.battle('defeat', {});
        return;
      }
      // 敌人受击检测
      var totalDamage = 0;
      Object.keys(before.enemies).forEach(function (uid) {
        var b = before.enemies[uid], a = after.enemies[uid];
        if (a && b && b.hp > a.hp) totalDamage += (b.hp - a.hp);
      });
      if (totalDamage > 0) {
        var enemyEl = opts.enemyEl || null;
        G.battle('enemyHit', { value: totalDamage, targetEl: enemyEl });
      }
      // 玩家受击检测
      if (before.playerHp > after.playerHp) {
        G.battle('damageToPlayer', { value: before.playerHp - after.playerHp });
      }
      // 玩家治疗检测
      if (after.playerHp > before.playerHp) {
        G.battle('heal', { value: after.playerHp - before.playerHp });
      }
    } catch (eGF) { /* 特效失败不影响游戏 */ }
  }

  function handlePlayCard(cardUid) {
    var f = facade();
    if (!f) return;
    var card = tryGet(function () { return f.queryBattleCard(); }, null);
    if (!card) return;
    // V8.0 V7.4：陈旧选择清理 — 若已选卡不在当前手牌中（换波/回合刷新），
    // 先复位，避免"选中态存在但出牌必失败"的死状态。
    if (selectedCardUid) {
      var stillHeld = (card.hand || []).some(function (c) { return c.uid === selectedCardUid; });
      if (!stillHeld) selectedCardUid = null;
    }
    if (selectedCardUid === cardUid) {
      selectedCardUid = null; // 再点取消选择
        if (window.__UI_OVERLAY__ && window.__UI_OVERLAY__.refresh) window.__UI_OVERLAY__.refresh();
      return;
    }
    var def = null;
    (card.hand || []).forEach(function (c) { if (c.uid === cardUid) def = c; });
    var catalog = tryGet(function () { return f.queryCardCatalog(); }, []) || [];
    var defMap = {};
    catalog.forEach(function (d) { defMap[d.id] = d; });
    var instance = def;
    var defData = instance ? defMap[instance.defId] : null;
    if (!instance || !defData) {
        return;
    }
    var upgradedDef = instance.upgraded > 0 ? (defMap[instance.defId + '_up' + instance.upgraded] || defData) : defData;
    if (upgradedDef.target === 'ENEMY') {
      selectedCardUid = cardUid; // 进入目标选择
      if (window.__UI_OVERLAY__ && window.__UI_OVERLAY__.refresh) window.__UI_OVERLAY__.refresh();
      return;
    }
    selectedCardUid = null;
    var before = snapshotBattle(f);
    try {
      f.playBattleCard(cardUid, null);
      // V6.1 Game Feel：出牌特效
      try {
        var G = gf();
        if (G) {
          var cardEl = document.querySelector('[data-card="' + cardUid + '"]');
          G.battle('playCard', { cardEl: cardEl });
          if (upgradedDef.type === 'DEFENSE') G.battle('block', { value: 0 });
          var after = snapshotBattle(f);
          diffAndFeel(before, after, {});
        }
      } catch (eGF) { /* 特效失败不影响游戏 */ }
    } catch (e) {
      toast(e && e.message ? e.message : '出牌失败');
    }
  }

  function handleEnemyClick(enemyUid) {
    if (!selectedCardUid) return false; // 未选卡：交给默认敌人交互
    var f = facade();
    if (!f) return false;
    var uid = selectedCardUid;
    selectedCardUid = null;
    var before = snapshotBattle(f);
    try {
      f.playBattleCard(uid, enemyUid);
      // V6.1 Game Feel：对敌出牌特效
      try {
        var G = gf();
        if (G) {
          var cardEl = document.querySelector('[data-card="' + uid + '"]');
          var enemyEl = document.querySelector('[data-enemy-uid="' + enemyUid + '"]');
          G.battle('playCard', { cardEl: cardEl });
          var after = snapshotBattle(f);
          diffAndFeel(before, after, { enemyEl: enemyEl });
        }
      } catch (eGF) { /* 特效失败不影响游戏 */ }
    } catch (e) {
      toast(e && e.message ? e.message : '出牌失败');
    }
    return true;
  }

  function handleEndTurn() {
    var f = facade();
    if (!f) return;
    var before = snapshotBattle(f);
    try {
      f.endBattleTurn();
      // V6.1 Game Feel：结束回合 → 敌人行动特效
      try {
        var G = gf();
        if (G) {
          var after = snapshotBattle(f);
          diffAndFeel(before, after, {});
        }
      } catch (eGF) { /* 特效失败不影响游戏 */ }
    } catch (e) {
      toast(e && e.message ? e.message : '无法结束回合');
    }
  }

  function handleRewardPick(cardId) {
    var f = facade();
    if (!f) return;
    try {
      f.claimBattleCardReward(cardId);
      // V6.1 Game Feel：奖励领取特效
      try { if (gf()) gf().battle('reward', {}); } catch (eGF) { /* 特效失败不影响游戏 */ }
      toast('已收入卡组：' + cardId);
    } catch (e) {
      toast(e && e.message ? e.message : '领取失败');
    }
  }

  function handleRewardSkip() {
    var f = facade();
    if (!f) return;
    try {
      f.claimBattleCardReward(null);
      toast('已放弃卡牌奖励');
    } catch (e) {
      toast(e && e.message ? e.message : '操作失败');
    }
  }

  function handleUpgrade(cardId) {
    var f = facade();
    if (!f) return;
    try {
      var level = f.upgradeBattleCard(cardId);
      toast(cardId + ' 升级到 +' + level);
    } catch (e) {
      toast(e && e.message ? e.message : '升级失败');
    }
  }

  function handleTutorialNext() {
    tutorialStep += 1;
    if (tutorialStep >= tutorialSteps.length) {
      finishTutorial();
      return;
    }
    if (window.__UI_OVERLAY__ && window.__UI_OVERLAY__.refresh) window.__UI_OVERLAY__.refresh();
  }

  function handleTutorialSkip() {
    finishTutorial();
  }

  function finishTutorial() {
    tutorialStep = -1;
    var f = facade();
    if (f && typeof f.markPlayerFlag === 'function') {
      try { f.markPlayerFlag('v59o_battle_tutorial_done', true); } catch (e) { /* 引导标记失败不阻塞 */ }
    }
    if (window.__UI_OVERLAY__ && window.__UI_OVERLAY__.refresh) window.__UI_OVERLAY__.refresh();
  }

  // ── 公共 API ────────────────────────────────────────────────────────────────

  window.__BATTLE_CARD__ = {
    battlePanelHtml: battlePanelHtml,
    playerStatusHtml: playerStatusHtml,
    intentHtml: intentHtml,
    rewardModalHtml: rewardModalHtml,
    deckPageHtml: deckPageHtml,
    tutorialHtml: tutorialHtml,
    handlePlayCard: handlePlayCard,
    handleEnemyClick: handleEnemyClick,
    handleEndTurn: handleEndTurn,
    handleRewardPick: handleRewardPick,
    handleRewardSkip: handleRewardSkip,
    handleUpgrade: handleUpgrade,
    handleTutorialNext: handleTutorialNext,
    handleTutorialSkip: handleTutorialSkip,
    isSelecting: function () { return !!selectedCardUid; },
    resetSelection: function () { selectedCardUid = null; },
  };
})();
