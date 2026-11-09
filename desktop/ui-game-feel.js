/**
 * 牛马修仙传 V6.1 — 统一 Game Feel 爽感系统（desktop DOM Overlay 扩展）
 *
 * 设计原则：
 *   1. 特效永不阻塞游戏：所有方法 try/catch 包裹，失败静默降级。
 *   2. 数值权威在 Facade：本模块只做视觉/听觉反馈，绝不发资源、不改状态。
 *   3. 统一入口：window.__GAME_FEEL__，由 ui-overlay.js / ui-merge-home.js /
 *      ui-battle-card.js 调用；在 patch-html.cjs 中先于宿主加载。
 *   4. 性能优先：DOM 元素对象池 + CSS transform 动画（GPU 合成层）+ 粒子上限。
 *
 * 子系统：
 *   - EffectPool      DOM 元素对象池（飘字/粒子复用，减少 GC）
 *   - SfxSynth        Web Audio 程序化音效（无需音频文件，振荡器合成）
 *   - ClickFeedback   点击涟漪 + 按钮缩放反馈
 *   - FloatingNumber  飘字（+5 修为 / +¥130 / 暴击! / 连击 x5）
 *   - ScreenShake     震屏（暴击/合成/Boss 受击）
 *   - ParticleBurst   粒子爆发（合成升阶/暴击/胜利）
 *   - ComboTracker    连击计数（连续操作窗口内累计，显示连击计数器）
 */
;(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   * 0. 常量与工具
   * ═══════════════════════════════════════════════════════════════════ */

  var MAX_PARTICLES = 60;        // 同屏粒子上限（超出丢弃，保性能）
  var MAX_FLOATING = 20;         // 同屏飘字上限
  var COMBO_WINDOW_MS = 4000;    // 连击窗口：4 秒内连续操作计连击
  var SHAKE_COOLDOWN_MS = 150;   // 震屏冷却（防抖：连击暴击不疯狂抖）

  function rootEl() {
    return document.getElementById('UiOverlay') || document.body;
  }

  function gameDiv() {
    return document.getElementById('GameDiv') || document.getElementById('GameCanvas') || rootEl();
  }

  /** 安全创建带 class 的 div */
  function makeDiv(cls) {
    var d = document.createElement('div');
    if (cls) d.className = cls;
    return d;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 1. EffectPool — DOM 元素对象池
   * ═══════════════════════════════════════════════════════════════════ */

  function EffectPool(cls, max) {
    this._cls = cls;
    this._max = max;
    this._pool = [];
    this._active = 0;
  }
  EffectPool.prototype.acquire = function () {
    var el = this._pool.pop();
    if (!el) el = makeDiv(this._cls);
    else el.className = this._cls;
    this._active++;
    return el;
  };
  EffectPool.prototype.release = function (el) {
    if (!el || !el.parentNode) { this._active = Math.max(0, this._active - 1); return; }
    el.parentNode.removeChild(el);
    // 清除内联样式（保留 class 由 acquire 重置）
    el.removeAttribute('style');
    el.textContent = '';
    el.innerHTML = '';
    this._active--;
    if (this._pool.length < this._max) this._pool.push(el);
  };
  EffectPool.prototype.isFull = function () { return this._active >= this._max; };

  var floatPool = new EffectPool('ux-gf-float', MAX_FLOATING);
  var particlePool = new EffectPool('ux-gf-particle', MAX_PARTICLES);

  /* ═══════════════════════════════════════════════════════════════════════
   * 2. SfxSynth — Web Audio 程序化音效
   *    无需音频文件，用振荡器+包络合成短音效；首次用户交互后初始化。
   * ═══════════════════════════════════════════════════════════════════ */

  var SfxSynth = {
    _ctx: null,
    _enabled: true,
    _master: null,

    _ensure: function () {
      if (this._ctx) return true;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this._ctx = new AC();
        this._master = this._ctx.createGain();
        this._master.gain.value = 0.25;
        this._master.connect(this._ctx.destination);
        return true;
      } catch (e) { return false; }
    },

    /** 通用单音：频率、时长、波形、音量包络 */
    _tone: function (freq, dur, type, vol, slideTo) {
      if (!this._enabled || !this._ensure()) return;
      try {
        var ctx = this._ctx;
        if (ctx.state === 'suspended') ctx.resume();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        var t = ctx.currentTime;
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol || 0.3, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain);
        gain.connect(this._master);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      } catch (e) { /* 音效失败静默 */ }
    },

    /** 噪声脉冲（打击感） */
    _noise: function (dur, vol, filterFreq) {
      if (!this._enabled || !this._ensure()) return;
      try {
        var ctx = this._ctx;
        if (ctx.state === 'suspended') ctx.resume();
        var len = Math.floor(ctx.sampleRate * dur);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq || 800;
        var gain = ctx.createGain();
        gain.gain.value = vol || 0.2;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this._master);
        src.start();
      } catch (e) { /* 静默 */ }
    },

    play: function (name) {
      switch (name) {
        case 'click':
          this._tone(520, 0.06, 'sine', 0.15, 320); break;
        case 'tab':
          this._tone(660, 0.05, 'triangle', 0.12); break;
        case 'cultivate':
          this._tone(440, 0.12, 'sine', 0.18, 660); break;
        case 'crit':
          this._tone(880, 0.08, 'square', 0.12);
          setTimeout(function () { SfxSynth._tone(1320, 0.15, 'sine', 0.2, 1760); }, 60);
          break;
        case 'combo':
          this._tone(600 + Math.random() * 200, 0.06, 'triangle', 0.1); break;
        case 'merge':
          this._noise(0.15, 0.15, 1200);
          this._tone(330, 0.2, 'sine', 0.15, 660); break;
        case 'levelup':
          this._tone(523, 0.1, 'sine', 0.2);
          setTimeout(function () { SfxSynth._tone(659, 0.1, 'sine', 0.2); }, 100);
          setTimeout(function () { SfxSynth._tone(784, 0.25, 'sine', 0.25, 1047); }, 200);
          break;
        case 'battleHit':
          this._noise(0.08, 0.25, 600);
          this._tone(150, 0.08, 'square', 0.15, 80); break;
        case 'battleBlock':
          this._tone(220, 0.1, 'sawtooth', 0.12, 180); break;
        case 'victory':
          this._tone(523, 0.12, 'sine', 0.22);
          setTimeout(function () { SfxSynth._tone(659, 0.12, 'sine', 0.22); }, 120);
          setTimeout(function () { SfxSynth._tone(784, 0.12, 'sine', 0.22); }, 240);
          setTimeout(function () { SfxSynth._tone(1047, 0.3, 'sine', 0.28); }, 360);
          break;
        case 'defeat':
          this._tone(440, 0.2, 'sine', 0.2, 220);
          setTimeout(function () { SfxSynth._tone(330, 0.4, 'sine', 0.18, 165); }, 200);
          break;
        case 'error':
          this._tone(200, 0.12, 'square', 0.1, 150); break;
        case 'reward':
          this._tone(784, 0.08, 'sine', 0.15);
          setTimeout(function () { SfxSynth._tone(1047, 0.15, 'sine', 0.18); }, 80);
          break;
      }
    },

    setEnabled: function (b) { this._enabled = !!b; },
    isEnabled: function () { return this._enabled; },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 3. ClickFeedback — 点击涟漪 + 按钮缩放
   * ═══════════════════════════════════════════════════════════════════ */

  var ClickFeedback = {
    /** 在目标元素位置产生涟漪 + 按钮按下缩放 */
    pulse: function (el, opts) {
      try {
        if (!el || !el.getBoundingClientRect) return;
        var rect = el.getBoundingClientRect();
        var rootRect = rootEl().getBoundingClientRect();
        var x = rect.left + rect.width / 2 - rootRect.left;
        var y = rect.top + rect.height / 2 - rootRect.top;

        // 涟漪
        var ripple = makeDiv('ux-gf-ripple');
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        var size = Math.max(rect.width, rect.height) * 1.6;
        ripple.style.setProperty('--gf-ripple-size', size + 'px');
        rootEl().appendChild(ripple);
        setTimeout(function () { if (ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 600);

        // 按钮缩放（加 class，动画结束移除）
        el.classList.remove('ux-gf-press');
        void el.offsetWidth; // 强制 reflow 重启动画
        el.classList.add('ux-gf-press');
        setTimeout(function () { el.classList.remove('ux-gf-press'); }, 250);

        if (!opts || opts.sfx !== false) SfxSynth.play('click');
      } catch (e) { /* 静默 */ }
    },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 4. FloatingNumber — 飘字
   * ═══════════════════════════════════════════════════════════════════ */

  var FloatingNumber = {
    /**
     * @param {number} x   相对 UiOverlay 的 X
     * @param {number} y   相对 UiOverlay 的 Y
     * @param {string} text  显示文本
     * @param {object} opts { kind: 'gain'|'crit'|'combo'|'info'|'damage'|'heal', dx, dy }
     */
    show: function (x, y, text, opts) {
      try {
        if (floatPool.isFull()) return;
        opts = opts || {};
        var el = floatPool.acquire();
        el.className = 'ux-gf-float is-' + (opts.kind || 'gain');
        el.textContent = text;
        var dx = (opts.dx || 0) + (Math.random() * 24 - 12);
        var dy = (opts.dy || 0);
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.setProperty('--gf-dx', dx + 'px');
        el.style.setProperty('--gf-dy', (dy - 70) + 'px');
        if (opts.scale) el.style.setProperty('--gf-scale', opts.scale);
        rootEl().appendChild(el);
        var life = opts.life || 1100;
        setTimeout(function () { floatPool.release(el); }, life);
      } catch (e) { /* 静默 */ }
    },

    /** 在元素位置飘字 */
    at: function (el, text, opts) {
      try {
        if (!el || !el.getBoundingClientRect) return;
        var rect = el.getBoundingClientRect();
        var rootRect = rootEl().getBoundingClientRect();
        this.show(rect.left + rect.width / 2 - rootRect.left, rect.top - rootRect.top, text, opts);
      } catch (e) { /* 静默 */ }
    },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 5. ScreenShake — 震屏
   * ═══════════════════════════════════════════════════════════════════ */

  var ScreenShake = {
    _lastShake: 0,

    /**
     * @param {string} level 'light'|'medium'|'heavy'
     */
    shake: function (level) {
      try {
        var now = Date.now();
        if (now - this._lastShake < SHAKE_COOLDOWN_MS) return;
        this._lastShake = now;
        var target = gameDiv();
        if (!target) return;
        target.classList.remove('ux-gf-shake-light', 'ux-gf-shake-medium', 'ux-gf-shake-heavy');
        void target.offsetWidth;
        target.classList.add('ux-gf-shake-' + (level || 'light'));
        var dur = level === 'heavy' ? 500 : level === 'medium' ? 350 : 220;
        setTimeout(function () {
          target.classList.remove('ux-gf-shake-light', 'ux-gf-shake-medium', 'ux-gf-shake-heavy');
        }, dur);
      } catch (e) { /* 静默 */ }
    },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 6. ParticleBurst — 粒子爆发
   * ═══════════════════════════════════════════════════════════════════ */

  var ParticleBurst = {
    /**
     * @param {number} x  中心 X（相对 UiOverlay）
     * @param {number} y  中心 Y
     * @param {object} opts { count, color, spread, size, life, gravity }
     */
    burst: function (x, y, opts) {
      try {
        opts = opts || {};
        var count = Math.min(opts.count || 12, MAX_PARTICLES - particlePool._active);
        if (count <= 0) return;
        var color = opts.color || '#ffd700';
        var spread = opts.spread || 80;
        var size = opts.size || 6;
        var life = opts.life || 800;
        for (var i = 0; i < count; i++) {
          if (particlePool.isFull()) break;
          var p = particlePool.acquire();
          p.className = 'ux-gf-particle';
          p.style.left = x + 'px';
          p.style.top = y + 'px';
          p.style.width = size + 'px';
          p.style.height = size + 'px';
          p.style.background = color;
          var angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
          var dist = spread * (0.5 + Math.random() * 0.5);
          var dx = Math.cos(angle) * dist;
          var dy = Math.sin(angle) * dist - (opts.gravity !== false ? 20 : 0);
          p.style.setProperty('--gf-pdx', dx + 'px');
          p.style.setProperty('--gf-pdy', dy + 'px');
          p.style.setProperty('--gf-prot', (Math.random() * 360) + 'deg');
          p.style.animationDuration = (life * (0.7 + Math.random() * 0.6)) + 'ms';
          rootEl().appendChild(p);
          (function (particle, delay) {
            setTimeout(function () { particlePool.release(particle); }, delay);
          })(p, life * 1.4);
        }
      } catch (e) { /* 静默 */ }
    },

    /** 在元素中心爆发 */
    at: function (el, opts) {
      try {
        if (!el || !el.getBoundingClientRect) return;
        var rect = el.getBoundingClientRect();
        var rootRect = rootEl().getBoundingClientRect();
        this.burst(rect.left + rect.width / 2 - rootRect.left, rect.top + rect.height / 2 - rootRect.top, opts);
      } catch (e) { /* 静默 */ }
    },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 7. ComboTracker — 连击计数
   * ═══════════════════════════════════════════════════════════════════ */

  var ComboTracker = {
    _count: 0,
    _lastTime: 0,
    _el: null,
    _hideTimer: null,

    /** 记录一次操作，返回当前连击数（0=窗口外重置） */
    track: function (action) {
      try {
        var now = Date.now();
        if (now - this._lastTime > COMBO_WINDOW_MS) this._count = 0;
        this._lastTime = now;
        this._count++;
        if (this._count >= 2) this._render(action);
        // 连击音效（每 3 连击播一次，避免太吵）
        if (this._count >= 3 && this._count % 3 === 0) SfxSynth.play('combo');
        return this._count;
      } catch (e) { return 0; }
    },

    current: function () { return this._count; },
    reset: function () { this._count = 0; this._hide(); },

    _render: function (action) {
      var root = rootEl();
      if (!root) return;
      // V6.2 修复：fullRefresh/renderShell 会 overlay.innerHTML 重建，
      // _el 可能已脱离 DOM（parentNode===null）。此时必须重新 append，否则连击计数器永久消失。
      if (!this._el || !this._el.parentNode) {
        if (!this._el) this._el = makeDiv('ux-gf-combo');
        root.appendChild(this._el);
      }
      var label = action === 'cultivate' ? '修炼连击' : action === 'merge' ? '合成连锁' : '连击';
      this._el.textContent = label + ' x' + this._count;
      this._el.className = 'ux-gf-combo' + (this._count >= 10 ? ' is-hot' : this._count >= 5 ? ' is-warm' : '');
      // 重启动画
      this._el.classList.remove('is-pop');
      void this._el.offsetWidth;
      this._el.classList.add('is-pop');
      // 3 秒无操作自动隐藏
      var self = this;
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(function () { self._hide(); }, COMBO_WINDOW_MS + 800);
    },

    _hide: function () {
      if (this._el) this._el.classList.add('is-fade');
      var self = this;
      setTimeout(function () { if (self._el) self._el.classList.remove('is-pop', 'is-fade'); }, 300);
    },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 8. 高层组合 API — 面向场景的一键调用
   * ═══════════════════════════════════════════════════════════════════ */

  /**
   * 修炼点击反馈：飘字 + 连击 + 暴击特效
   * @param {HTMLElement} el  点击的按钮
   * @param {object} result  cultivate() 返回值 { cultivationExp, crit, combo, cooldownRemaining }
   */
  function cultivateFeel(el, result) {
    try {
      if (!result) return;
      if (result.cooldownRemaining > 0) {
        FloatingNumber.at(el, '冷却中 ' + Math.ceil(result.cooldownRemaining) + 's', { kind: 'info', life: 700 });
        return;
      }
      var exp = result.cultivationExp || 0;
      if (exp <= 0) return;
      var isCrit = !!result.crit;
      var combo = result.combo || 0;

      // 飘字
      FloatingNumber.at(el, (isCrit ? '暴击! ' : '') + '+' + exp + ' 修为', {
        kind: isCrit ? 'crit' : 'gain',
        scale: isCrit ? 1.4 : 1,
        life: isCrit ? 1400 : 1100,
      });

      // 暴击：粒子 + 震屏 + 音效
      if (isCrit) {
        ParticleBurst.at(el, { count: 14, color: '#ff6b35', spread: 90, size: 7 });
        ScreenShake.shake('light');
        SfxSynth.play('crit');
      } else {
        SfxSynth.play('cultivate');
      }

      // 连击（领域层已算好 combo，这里展示）
      if (combo >= 2) {
        ComboTracker._count = combo;
        ComboTracker._lastTime = Date.now();
        ComboTracker._render('cultivate');
      }
    } catch (e) { /* 静默 */ }
  }

  /**
   * 合成升阶演出：全屏庆祝 + 粒子 + 震屏 + 音效 + 连锁
   * @param {object} opts { level, salaryReward, cultivationReward, isNewMax, chainCount, tierName, tierEmoji }
   */
  function mergeCelebrate(opts) {
    try {
      opts = opts || {};
      var level = opts.level || 1;
      var isNewMax = !!opts.isNewMax;
      var chain = opts.chainCount || 0;
      var root = rootEl();

      // 音效
      SfxSynth.play(isNewMax ? 'levelup' : 'merge');

      // 震屏
      ScreenShake.shake(isNewMax ? 'heavy' : chain >= 2 ? 'medium' : 'light');

      // 中心粒子爆发
      var w = root.offsetWidth || 720;
      var h = root.offsetHeight || 1280;
      var colors = isNewMax ? ['#ffd700', '#ff6b35', '#ff4757'] : ['#ffd700', '#7ec08a'];
      for (var c = 0; c < colors.length; c++) {
        ParticleBurst.burst(w / 2, h * 0.35, {
          count: isNewMax ? 18 : 10, color: colors[c], spread: isNewMax ? 140 : 90, size: 8, life: 1000,
        });
      }

      // 全屏庆祝层（skipDom=true 时跳过，由调用方自行创建 DOM）
      if (!opts.skipDom) {
        var fx = makeDiv('ux-gf-celebrate' + (isNewMax ? ' is-max' : '') + (chain >= 2 ? ' is-chain' : ''));
        fx.innerHTML =
          '<div class="ux-gf-celebrate-rays"></div>' +
          '<div class="ux-gf-celebrate-core">' +
            '<span class="ux-gf-celebrate-emoji">' + (opts.tierEmoji || '✨') + '</span>' +
            '<span class="ux-gf-celebrate-title">升阶！' + escHtml(opts.tierName || '') + ' <b>Lv.' + level + '</b></span>' +
            '<span class="ux-gf-celebrate-rewards">' +
              '<i class="is-salary">工资 +¥' + (opts.salaryReward || 0) + '</i>' +
              '<i class="is-cultivation">修为 +' + (opts.cultivationReward || 0) + '</i>' +
            '</span>' +
            (chain >= 2 ? '<span class="ux-gf-celebrate-chain">连锁 x' + chain + '！</span>' : '') +
            (isNewMax ? '<span class="ux-gf-celebrate-max">✦ 解锁全新最高等级 ✦</span>' : '') +
          '</div>';
        root.appendChild(fx);
        setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, isNewMax ? 2600 : 1800);
      }

      // 连锁计数
      if (chain >= 2) {
        ComboTracker._count = chain;
        ComboTracker._lastTime = Date.now();
        ComboTracker._render('merge');
      }
    } catch (e) { /* 静默 */ }
  }

  /**
   * 卡牌战斗特效
   * @param {string} kind 'playCard'|'hit'|'block'|'enemyHit'|'victory'|'defeat'|'damageToPlayer'
   * @param {object} data { value, targetEl, cardEl }
   */
  function battleFeel(kind, data) {
    try {
      data = data || {};
      switch (kind) {
        case 'playCard':
          if (data.cardEl) {
            ParticleBurst.at(data.cardEl, { count: 8, color: '#a29bfe', spread: 50, size: 5, life: 600 });
            SfxSynth.play('click');
          }
          break;
        case 'hit':
          FloatingNumber.at(data.targetEl || rootEl(), '-' + (data.value || 0), { kind: 'damage', life: 900 });
          if (data.targetEl) {
            data.targetEl.classList.remove('ux-gf-flash');
            void data.targetEl.offsetWidth;
            data.targetEl.classList.add('ux-gf-flash');
          }
          ScreenShake.shake('light');
          SfxSynth.play('battleHit');
          break;
        case 'enemyHit':
          FloatingNumber.at(data.targetEl || rootEl(), '-' + (data.value || 0), { kind: 'damage', life: 900 });
          if (data.targetEl) {
            data.targetEl.classList.remove('ux-gf-flash-red');
            void data.targetEl.offsetWidth;
            data.targetEl.classList.add('ux-gf-flash-red');
          }
          ScreenShake.shake('medium');
          SfxSynth.play('battleHit');
          break;
        case 'block':
          FloatingNumber.at(data.targetEl || rootEl(), '格挡 +' + (data.value || 0), { kind: 'heal', life: 900 });
          SfxSynth.play('battleBlock');
          break;
        case 'damageToPlayer':
          FloatingNumber.at(data.targetEl || rootEl(), '-' + (data.value || 0), { kind: 'damage', life: 900 });
          ScreenShake.shake('medium');
          SfxSynth.play('battleHit');
          break;
        case 'heal':
          FloatingNumber.at(data.targetEl || rootEl(), '+' + (data.value || 0), { kind: 'heal', life: 900 });
          SfxSynth.play('reward');
          break;
        case 'victory':
          SfxSynth.play('victory');
          ScreenShake.shake('medium');
          var w = (rootEl().offsetWidth || 720);
          var h = (rootEl().offsetHeight || 1280);
          for (var i = 0; i < 3; i++) {
            (function (delay, cx) {
              setTimeout(function () {
                ParticleBurst.burst(cx, h * 0.3, { count: 16, color: ['#ffd700', '#7ec08a', '#a29bfe'][i % 3], spread: 120, size: 7, life: 1100 });
              }, delay);
            })(i * 200, w * (0.3 + i * 0.2));
          }
          break;
        case 'defeat':
          SfxSynth.play('defeat');
          ScreenShake.shake('heavy');
          break;
        case 'reward':
          SfxSynth.play('reward');
          if (data.el) ParticleBurst.at(data.el, { count: 12, color: '#ffd700', spread: 70, size: 6, life: 800 });
          else {
            var rw = (rootEl().offsetWidth || 720);
            var rh = (rootEl().offsetHeight || 1280);
            ParticleBurst.burst(rw / 2, rh * 0.3, { count: 14, color: '#ffd700', spread: 100, size: 7, life: 900 });
          }
          break;
        case 'endTurn':
          SfxSynth.play('tab');
          break;
        case 'skill':
          SfxSynth.play('battleHit');
          ScreenShake.shake('light');
          if (data.el) ParticleBurst.at(data.el, { count: 10, color: '#a29bfe', spread: 60, size: 6, life: 700 });
          break;
      }
    } catch (e) { /* 静默 */ }
  }

  /** 资源获得飘字（工资/修为/材料等通用） */
  function gainFeel(el, text, opts) {
    try {
      opts = opts || {};
      FloatingNumber.at(el, text, { kind: opts.kind || 'gain', life: opts.life || 1000 });
      if (opts.burst) ParticleBurst.at(el, { count: opts.burst, color: opts.color || '#ffd700', spread: 60, size: 5 });
      if (opts.sfx) SfxSynth.play(opts.sfx);
    } catch (e) { /* 静默 */ }
  }

  /** 晋升成功大演出 */
  function promotionFeel() {
    try {
      SfxSynth.play('levelup');
      ScreenShake.shake('heavy');
      var root = rootEl();
      var w = root.offsetWidth || 720;
      var h = root.offsetHeight || 1280;
      var colors = ['#ffd700', '#ff6b35', '#a29bfe', '#7ec08a'];
      for (var i = 0; i < colors.length; i++) {
        (function (delay, color) {
          setTimeout(function () {
            ParticleBurst.burst(w / 2, h * 0.3, { count: 20, color: color, spread: 160, size: 9, life: 1200 });
          }, delay);
        })(i * 150, colors[i]);
      }
      var banner = makeDiv('ux-gf-promo-banner');
      banner.innerHTML = '<span>🎉 晋升成功！</span>';
      root.appendChild(banner);
      setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 2500);
    } catch (e) { /* 静默 */ }
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '\u0026amp;')
      .replace(/</g, '\u0026lt;')
      .replace(/>/g, '\u0026gt;')
      .replace(/"/g, '\u0026quot;');
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 9. 导出
   * ═══════════════════════════════════════════════════════════════════ */

  window.__GAME_FEEL__ = {
    // 子系统（高级用法直接访问）
    sfx: SfxSynth,
    combo: ComboTracker,
    // 高层 API（推荐使用）
    click: function (el, opts) { ClickFeedback.pulse(el, opts); },
    float: function (x, y, text, opts) { FloatingNumber.show(x, y, text, opts); },
    floatAt: function (el, text, opts) { FloatingNumber.at(el, text, opts); },
    shake: function (level) { ScreenShake.shake(level); },
    burst: function (x, y, opts) { ParticleBurst.burst(x, y, opts); },
    burstAt: function (el, opts) { ParticleBurst.at(el, opts); },
    cultivate: cultivateFeel,
    mergeCelebrate: mergeCelebrate,
    battle: battleFeel,
    gain: gainFeel,
    promotion: promotionFeel,
    // 连击手动记录
    trackCombo: function (action) { return ComboTracker.track(action); },
    resetCombo: function () { ComboTracker.reset(); },
    // 音效开关
    setSfxEnabled: function (b) { SfxSynth.setEnabled(b); },
    isSfxEnabled: function () { return SfxSynth.isEnabled(); },
    // 版本
    version: '6.1.0',
  };
})();