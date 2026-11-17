/**
 * V10 ULTIMATE §16 — 轻量 WebAudio 音效引擎（合成音，无外部资源依赖）。
 *
 * 设计约束：
 *  - 事件→音效映射完整覆盖任务书 14 项；
 *  - 首次交互解锁（pointerdown resume，iOS/Safari/移动端兼容）；
 *  - 每事件冷却防刷屏；音量/静音由设置面板同步（_settings.sfx/_settings.sfxVolume）；
 *  - 合成音仅保证「可听、有区分度」，音色质量需人工试听后才能标记听感 PASS。
 */
(function () {
  'use strict';

  var settings = { sfx: true, volume: 0.5 };
  var audioCtx = null;
  var lastPlayAt = {};
  var COOLDOWN_MS = 70;

  // 事件预设：每个事件一组 [频率Hz, 时长s, 类型, 相对增益, 起始延迟s] 的音符序列。
  var PRESETS = {
    CLICK:      { notes: [[660, 0.05, 'square', 0.5, 0]] },
    ATTACK:     { notes: [[220, 0.08, 'square', 0.7, 0], [180, 0.06, 'square', 0.5, 0.05]] },
    CRIT:       { notes: [[520, 0.05, 'square', 0.8, 0], [780, 0.07, 'square', 0.8, 0.05], [1040, 0.08, 'square', 0.7, 0.1]] },
    HIT:        { notes: [[140, 0.12, 'sawtooth', 0.7, 0]] },
    SKILL:      { notes: [[440, 0.07, 'triangle', 0.7, 0], [660, 0.07, 'triangle', 0.7, 0.06], [880, 0.1, 'triangle', 0.7, 0.12]] },
    CARD_DRAW:  { notes: [[500, 0.06, 'sine', 0.6, 0], [700, 0.06, 'sine', 0.5, 0.05]] },
    CARD_PLAY:  { notes: [[340, 0.07, 'triangle', 0.7, 0], [240, 0.09, 'square', 0.6, 0.06]] },
    BOSS_INTRO: { notes: [[110, 0.18, 'sawtooth', 0.9, 0], [92, 0.18, 'sawtooth', 0.9, 0.18], [110, 0.22, 'sawtooth', 1.0, 0.36]] },
    BOSS_PHASE: { notes: [[160, 0.14, 'sawtooth', 0.9, 0], [220, 0.16, 'sawtooth', 0.8, 0.14]] },
    VICTORY:    { notes: [[523, 0.1, 'triangle', 0.8, 0], [659, 0.1, 'triangle', 0.8, 0.1], [784, 0.1, 'triangle', 0.8, 0.2], [1047, 0.18, 'triangle', 0.9, 0.3]] },
    DEFEAT:     { notes: [[330, 0.16, 'sine', 0.8, 0], [262, 0.16, 'sine', 0.8, 0.16], [196, 0.24, 'sine', 0.8, 0.32]] },
    LEVELUP:    { notes: [[587, 0.07, 'square', 0.7, 0], [740, 0.07, 'square', 0.7, 0.06], [880, 0.12, 'square', 0.8, 0.12]] },
    PROMOTION:  { notes: [[523, 0.09, 'triangle', 0.85, 0], [659, 0.09, 'triangle', 0.85, 0.09], [784, 0.09, 'triangle', 0.85, 0.18], [784, 0.2, 'triangle', 0.9, 0.27]] },
    CLAIM:      { notes: [[880, 0.06, 'sine', 0.7, 0], [1175, 0.09, 'sine', 0.7, 0.06]] },
  };

  function ensureCtx() {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { audioCtx = new AC(); } catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) { /* 保持静默 */ } }
    return audioCtx;
  }

  function tone(freq, dur, type, gain, whenSec) {
    var ctx = ensureCtx();
    if (!ctx) return;
    var t0 = ctx.currentTime + whenSec;
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    var vol = Math.max(0, Math.min(1, settings.volume)) * gain;
    amp.gain.setValueAtTime(vol, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function unlock() { ensureCtx(); }

  function play(eventId) {
    if (!settings.sfx) return;
    var preset = PRESETS[eventId];
    if (!preset) return;
    var now = Date.now();
    if (now - (lastPlayAt[eventId] || 0) < COOLDOWN_MS) return;
    lastPlayAt[eventId] = now;
    for (var i = 0; i < preset.notes.length; i += 1) {
      var n = preset.notes[i];
      tone(n[0], n[1], n[2], n[3], n[4]);
    }
  }

  function setEnabled(on) { settings.sfx = !!on; }
  function setVolume(v) { settings.volume = Math.max(0, Math.min(1, Number(v) || 0)); }
  function isEnabled() { return settings.sfx; }
  function getVolume() { return settings.volume; }

  // 首次交互解锁（移动端 Safari/微信内核要求在手势内 resume AudioContext）。
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', unlock, { once: false, passive: true });
    document.addEventListener('keydown', unlock, { once: false });
  }

  // 战斗状态观察：胜利/失败/受击（读权威 facade，2s 轮询，只对状态迁移发声）。
  var lastStatus = null;
  var lastHp = null;
  if (typeof window !== 'undefined') {
    setInterval(function () {
      try {
        var f = window.__GAME_FACADE__;
        if (!f || typeof f.queryAutoBattle !== 'function') return;
        var ab = f.queryAutoBattle();
        if (!ab) return;
        var status = String(ab.status || '').toUpperCase();
        if (status !== lastStatus) {
          if (status === 'VICTORY') play('VICTORY');
          else if (status === 'DEFEAT') play('DEFEAT');
          lastStatus = status;
        }
        var hp = typeof ab.hp === 'number' ? ab.hp : null;
        if (hp != null && lastHp != null && hp < lastHp) play('HIT');
        lastHp = hp;
      } catch (e) { /* 观察失败静默 */ }
    }, 2000);
  }

  window.__UI_SFX__ = {
    play: play,
    unlock: unlock,
    setEnabled: setEnabled,
    setVolume: setVolume,
    isEnabled: isEnabled,
    getVolume: getVolume,
  };
})();
