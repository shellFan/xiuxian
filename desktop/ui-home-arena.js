/* Persistent DOM view over the authoritative home campaign. No combat timers. */
;(function () {
  'use strict';
  if (window.__HOME_ARENA__) return;
  var sequence = 0, frame = null, lastPaint = 0, paused = false, journalOpen = false, pool = [], poolIndex = 0, lastEnemy = null, soundFacade = null, audio = null, lastFateSignature = '', lastFateChoiceHost = null;
  var options = { reduced: false, shake: true, sound: true };
  try { Object.assign(options, JSON.parse(localStorage.getItem('home-arena-options') || '{}')); } catch (_) {}
  function facade() { return window.__GAME_FACADE__; }
  function read() { var f = facade(); return f && f.queryHomeArena ? f.queryHomeArena() : null; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function visible() { return !!document.querySelector('#HomeArena') && !document.hidden && document.hasFocus() && !paused && !document.querySelector('#PopupLayer .ux-modal-layer'); }
  function active() { var v = read(); return visible() && v && v.ready && !v.complete; }
  function text(id, s) { var e = document.getElementById(id); if (e && e.textContent !== String(s)) e.textContent = String(s); }
  function flash(e, name) { if (!e || options.reduced) return; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = name; }
  function play(event) {
    if (!options.sound || !audio || !/^HOME_|CRITICAL_HIT|CODE_STORM$/.test(event)) return;
    try {
      var oscillator = audio.createOscillator(), gain = audio.createGain(), crit = event === 'CRITICAL_HIT', victory = event === 'HOME_VICTORY';
      oscillator.type = victory ? 'sine' : crit ? 'triangle' : 'square';
      oscillator.frequency.setValueAtTime(victory ? 660 : crit ? 900 : 230, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(victory ? 1320 : 90, audio.currentTime + 0.1);
      gain.gain.setValueAtTime(0.045, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.13);
      oscillator.onended = function () { oscillator.disconnect(); gain.disconnect(); };
    } catch (_) {}
  }
  function audioUnlock() {
    try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (_) {}
  }
  function poolFor(root) {
    var layer = root.querySelector('.arena-floats');
    if (!layer || (pool.length && pool[0].parentNode === layer)) return;
    pool = []; poolIndex = 0;
    for (var i = 0; i < 24; i++) {
      var e = document.createElement('span'); e.className = 'arena-float'; e.hidden = true;
      e.addEventListener('animationend', function () { this.hidden = true; });
      layer.appendChild(e); pool.push(e);
    }
  }
  function hitFx(root, hit) {
    poolFor(root);
    var e = pool[poolIndex++ % pool.length];
    e.hidden = false; e.className = 'arena-float' + (hit.critical ? ' arena-float--crit' : '') + (hit.kind === 'AUTO' ? ' arena-float--auto' : '');
    e.textContent = (hit.critical ? '暴击！ ' : hit.kind === 'AUTO' ? '自动 ' : '') + '-' + hit.damage;
    e.style.left = (38 + poolIndex % 5 * 6) + '%';
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = 'arena-float 850ms ease-out forwards';
    var bug = root.querySelector('.arena-bug');
    flash(root.querySelector('.arena-player'), 'arena-strike 180ms ease-out');
    flash(bug, hit.killed ? 'arena-death 260ms ease-out' : 'arena-hit 160ms ease-out');
    if (hit.critical && options.shake) flash(root.querySelector('.arena-scene'), 'arena-shake 180ms ease-out');
    if (hit.kind === 'STORM') flash(root.querySelector('.arena-code-rain'), 'arena-storm 850ms ease-out');
    if (hit.killed) {
      text('ArenaReward', hit.reward.length ? hit.reward.join(' · ') : '演练击杀 · 首通奖励已领取');
      flash(root.querySelector('.arena-reward'), 'arena-reward 700ms ease-out');
    }
    if (hit.stageCleared) {
      text('ArenaVictory', '第 ' + hit.stageCleared + ' 关通关！' + (hit.stageCleared === 2 ? ' 自动攻击已解锁' : hit.stageCleared === 3 ? ' 代码风暴已解锁' : ' 战力成长！'));
      flash(root.querySelector('.arena-victory'), 'arena-victory 2400ms ease-out forwards');
    }
  }
  function updateFateCard(f) {
    var card = document.getElementById('FateEventCard');
    var panel = document.getElementById('FateRunPanel');
    if (!card || !panel || !f.queryFateEvent || !f.queryFateEventOptions) return;
    var run = f.queryFateRun ? f.queryFateRun() : null;
    var hasChallenge = !!(run && run.activeChallengeId);
    var isEnded = !!(run && run.status === 'ENDED');
    panel.hidden = !hasChallenge && !isEnded && !journalOpen;
    var challenge = document.getElementById('FateChallengeControls');
    var talents = document.getElementById('FateTalentList');
    var meta = f.queryFateMeta ? f.queryFateMeta() : { karma: 0, settledRunIds: [], unlockedEndings: [] };
    var npcViews = f.queryFateNPCs ? f.queryFateNPCs() : [];
    text('FateNpcRelations', npcViews.map(function (npc) { return npc.name + '·' + npc.role + ' ' + npc.relationship; }).join('　'));
    if (run && !isEnded && !hasChallenge) {
      text('FateRunSummary', '本轮阶段 ' + run.stage + ' · 生命 ' + run.health + '/' + run.maxHealth + ' · 已完成事件 ' + run.eventHistory.length);
      text('FateRunKarma', '轮回功德 ' + meta.karma + ' · 选项会持续改变后续剧情');
      challenge.replaceChildren();
      talents.replaceChildren();
    }
    if (run && isEnded) {
      text('FateRunSummary', '本轮结束：' + (run.terminalOutcomeId || '命运落幕') + ' · 最高阶段 ' + run.stage + ' · 完成事件 ' + run.eventHistory.length);
      text('FateRunKarma', '轮回功德 ' + meta.karma + (meta.settledRunIds.indexOf(run.runId) >= 0 ? ' · 本轮已结算' : ''));
      challenge.replaceChildren();
      challenge.innerHTML = '<button type="button" data-fate-settle>结算本轮功德</button><button type="button" data-fate-rebirth>开始下一世</button>';
      var options = f.queryFateTalentOptions ? f.queryFateTalentOptions() : [];
      talents.replaceChildren();
      options.forEach(function (talent) {
        var button = document.createElement('button');
        button.type = 'button'; button.dataset.fateTalent = talent.id;
        button.disabled = talent.nextCost === null || meta.karma < talent.nextCost;
        button.textContent = talent.name + ' Lv.' + talent.rank + '/' + talent.maxRank + (talent.nextCost === null ? ' · 已满级' : ' · ' + talent.nextCost + '功德');
        talents.appendChild(button);
      });
    } else if (run && hasChallenge) {
      text('FateRunSummary', '特殊挑战：' + run.activeChallengeId + ' · 生命 ' + run.health + '/' + run.maxHealth);
      text('FateRunKarma', '挑战使用真实战斗结算，180 秒限时');
      talents.replaceChildren();
      challenge.replaceChildren();
      var start = document.createElement('button'); start.type = 'button'; start.dataset.fateChallenge = 'start';
      if (run.activeChallengeBattleRunId) { start.disabled = true; start.textContent = '挑战进行中'; }
      else start.textContent = '进入特殊战斗';
      challenge.appendChild(start);
    }
    var event = f.queryFateEvent();
    card.hidden = !event;
    if (!event) { lastFateSignature = ''; lastFateChoiceHost = null; return; }
    card.dataset.eventId = event.id;
    text('FateEventTitle', event.title);
    text('FateEventDescription', event.description);
    var choices = f.queryFateEventOptions();
    var signature = event.id + ':' + choices.map(function (choice) { return choice.id; }).join(',');
    var host = document.getElementById('FateEventChoices');
    if (!host) return;
    var choicesMatch = host.children.length === choices.length && choices.every(function (choice, index) {
      return host.children[index].dataset.fateChoice === choice.id;
    });
    if (signature === lastFateSignature && host === lastFateChoiceHost && choicesMatch) return;
    lastFateSignature = signature;
    lastFateChoiceHost = host;
    host.replaceChildren();
    choices.forEach(function (choice) {
      var button = document.createElement('button');
      button.type = 'button';
      button.dataset.fateChoice = choice.id;
      button.textContent = choice.text;
      button.setAttribute('aria-label', '选择：' + choice.text);
      host.appendChild(button);
    });
    text('FateEventCount', run ? '命运待选 · ' + run.eventQueue.length : '命运事件');
  }
  function update() {
    var f = facade(), root = document.getElementById('HomeArena');
    if (!f) return;
    if (f.setHomeArenaActive) f.setHomeArenaActive(false);
    if (!root) { pool = []; lastFateChoiceHost = null; return; }
    var cardBattle = null;
    try { cardBattle = f.queryCardBattle ? f.queryCardBattle() : null; } catch (_) {}
    updateFateCard(f);
    text('ArenaStage', '常规战斗');
    text('ArenaTitle', cardBattle ? '卡牌战斗进行中' : '回合制卡牌攻坚');
    text('ArenaPower', '每回合 3 点能量 · 抽取 5 张手牌');
    text('ArenaProgress', cardBattle ? '你的卡牌战斗已保存，可继续出牌或结束回合。' : '攻击、防御与技能卡均通过出牌产生效果。');
    var attack = document.getElementById('ArenaAttack');
    if (attack) attack.textContent = cardBattle ? '继续卡牌战斗' : '⚔️ 开始卡牌战斗';
  }
  function loop(now) { if (now - lastPaint >= 100) { lastPaint = now; update(); } frame = requestAnimationFrame(loop); }
  function render() {
    return '<section id="HomeArena" class="home-arena home-arena--card-entry" aria-label="主页常规战斗入口">' +
      '<header class="arena-heading"><span id="ArenaStage"></span><b id="ArenaTitle"></b><small id="ArenaPower"></small></header>' +
      '<section id="FateEventCard" class="fate-event-card" aria-label="命运事件" aria-live="polite" hidden><small id="FateEventCount">命运事件</small><strong id="FateEventTitle"></strong><p id="FateEventDescription"></p><div id="FateEventChoices" class="fate-event-choices"></div><p id="FateEventResult" aria-live="polite"></p></section>' +
      '<section id="FateRunPanel" class="fate-run-panel" aria-label="本轮命运状态" hidden><strong id="FateRunSummary"></strong><small id="FateRunKarma"></small><small id="FateNpcRelations"></small><div id="FateChallengeControls"></div><div id="FateTalentList"></div></section>' +
      '<div class="arena-progress" id="ArenaProgress"></div>' +
      '<div class="arena-card-entry-art" aria-hidden="true"><span>⚔️</span><b>出牌决胜</b><i>观察敌方意图，分配能量，构筑你的回合</i></div>' +
      '<button id="ArenaAttack" class="arena-attack arena-card-entry-button" data-action="homeCardBattle">⚔️ 开始卡牌战斗</button>' +
      '<div class="arena-card-entry-meta"><span>攻击牌 · 防御牌 · 职业技能</span><span>抽牌堆 · 弃牌堆 · 战斗奖励</span></div>' +
      '<footer class="arena-options"><button data-fate-journal>命运记录</button></footer></section>';
  }
  document.addEventListener('click', function (event) {
    var settleButton = event.target.closest('[data-fate-settle]');
    var rebirthButton = event.target.closest('[data-fate-rebirth]');
    var talentButton = event.target.closest('[data-fate-talent]');
    var challengeButton = event.target.closest('[data-fate-challenge]');
    var journalButton = event.target.closest('[data-fate-journal]');
    if (settleButton || rebirthButton || talentButton || challengeButton || journalButton) {
      event.preventDefault(); event.stopImmediatePropagation();
      var service = facade();
      try {
        if (journalButton) journalOpen = !journalOpen;
        else if (settleButton) service.settleFateRun();
        else if (rebirthButton) service.rebirthFateRun(Date.now() >>> 0);
        else if (talentButton) service.purchaseFateTalent(talentButton.dataset.fateTalent);
        else if (challengeButton) {
          var builds = service.queryBattleBuildOptions ? service.queryBattleBuildOptions() : [];
          if (!builds.length) throw new Error('没有可用战斗流派');
          service.startFateChallenge(builds[0].id);
        }
        update();
      } catch (error) { text('FateEventResult', '操作未完成：' + error.message); }
      return;
    }
    var fateButton = event.target.closest('[data-fate-choice]');
    if (fateButton && !fateButton.disabled) {
      event.preventDefault(); event.stopImmediatePropagation();
      var fateFacade = facade(), fateCard = document.getElementById('FateEventCard');
      if (!fateFacade || !fateFacade.resolveFateEvent || !fateCard) return;
      var eventId = fateCard.dataset.eventId, optionId = fateButton.dataset.fateChoice;
      fateButton.disabled = true;
      try {
        var result = fateFacade.resolveFateEvent(eventId, optionId);
        text('FateEventResult', (result.success ? '結果：' : '未成功：') + result.outcomeText);
        update();
      } catch (error) {
        fateButton.disabled = false;
        text('FateEventResult', '選擇未保存：' + error.message);
      }
      return;
    }
  }, true);
  document.addEventListener('visibilitychange', update); window.addEventListener('blur', update); window.addEventListener('focus', update);
  window.__HOME_ARENA__ = { render: render, update: update, active: active, deferAutomaticModals: function () { var v = read(); return !!document.querySelector('#HomeArena') && !paused && v && v.ready; }, diagnostics: function () { return { floatingNodes: pool.length, animationLoops: frame === null ? 0 : 1, registeredGlobalListeners: 4, options: options }; } };
  frame = requestAnimationFrame(loop);
})();
