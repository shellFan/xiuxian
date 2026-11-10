/**
 * V6.6 Sprite动画播放器 (desktop DOM Overlay 扩展)
 *
 * 通过CSS background-position切换sprite sheet帧，实现真实2D角色动画。
 * 敌人状态机：IDLE → ATTACK → HIT → DEATH（优先级 DEATH > HIT > ATTACK > IDLE）
 * 小队成员：IDLE循环动画 + 攻击触发
 * Boss登场：缩放+震动+暗幕演出
 *
 * 由 ui-auto-battle.js 调用，sprite资源位于 assets/sprites/
 */
;(function () {
  'use strict';

  var SPRITE_BASE = 'assets/sprites/sheets/';
  var FRAME_W = 128;
  var FRAME_H = 128;

  /* ── 动画配置（与manifest.json一致）── */
  var ANIM_CFG = {
    idle:    { frames: 4, fps: 4,  loop: true },
    attack:  { frames: 4, fps: 8,  loop: false, next: 'idle' },
    hit:     { frames: 3, fps: 10, loop: false, next: 'idle' },
    death:   { frames: 4, fps: 6,  loop: false, next: null },
    victory: { frames: 4, fps: 4,  loop: true },
  };

  /* ── 敌人sprite映射（按关卡循环） ── */
  var NORMAL_ENEMY_SPRITES = ['requirement', 'bug', 'debt', 'overtime', 'kpi'];
  var BOSS_SPRITES = ['client', 'incident', 'kpiLord'];

  /* ── 职业sprite映射 ── */
  var PROF_SPRITES = {
    JAVA_BACKEND: 'javabackend',
    FRONTEND: 'frontend',
    QA: 'qa',
    DEVOPS: 'devops',
  };

  /* ── 场景映射 ── */
  function sceneThemeFor(v) {
    if (v.towerFloor > 0) return 'tower';
    var st = v.stage || 1;
    if (st <= 10) return 'office';
    if (st <= 25) return 'mountain';
    if (st <= 50) return 'heaven';
    return 'void';
  }

  /* ── 敌人sprite名称解析 ── */
  function enemySpriteName(v) {
    if (!v || !v.enemy) return 'requirement';
    var e = v.enemy;
    if (e.isCardBoss) return 'kpiLord';
    if (e.isBoss) {
      var idx = Math.floor((v.stage || 5) / 5) - 1;
      if (v.towerFloor > 0) idx = Math.floor(v.towerFloor / 10);
      return BOSS_SPRITES[idx % BOSS_SPRITES.length] || 'client';
    }
    var nIdx = (v.stage - 1) % NORMAL_ENEMY_SPRITES.length;
    return NORMAL_ENEMY_SPRITES[nIdx] || 'requirement';
  }

  /* ── 职业sprite名称解析 ── */
  function profSpriteName(professionId) {
    return PROF_SPRITES[professionId] || 'javabackend';
  }

  /* ═══════════════════════════════════════════════
   *  SpriteAnimPlayer — 单个sprite元素的动画控制器
   * ═══════════════════════════════════════════════ */

  function SpriteAnimPlayer(el, spriteName, scale) {
    this.el = el;
    this.spriteName = spriteName;
    this.scale = scale || 1;
    this.currentAnim = 'idle';
    this.frameIdx = 0;
    this.timer = null;
    this.stateQueue = []; // 状态机队列
    this.dead = false;
    this._setupEl();
    this.play('idle');
  }

  SpriteAnimPlayer.prototype._setupEl = function () {
    var el = this.el;
    if (!el) return;
    el.style.backgroundImage = 'url(' + SPRITE_BASE + this.spriteName + '_idle.png)';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.width = (FRAME_W * this.scale) + 'px';
    el.style.height = (FRAME_H * this.scale) + 'px';
    el.style.backgroundSize = (FRAME_W * this.scale * 4) + 'px ' + (FRAME_H * this.scale) + 'px';
    el.style.imageRendering = 'auto';
    el.classList.add('ux66-sprite');
  };

  SpriteAnimPlayer.prototype._applyFrame = function () {
    var cfg = ANIM_CFG[this.currentAnim];
    if (!cfg) return;
    var el = this.el;
    if (!el) return;
    // 更新background-image（切换动画sheet）
    var expectedUrl = 'url(' + SPRITE_BASE + this.spriteName + '_' + this.currentAnim + '.png)';
    if (el.style.backgroundImage !== expectedUrl) {
      el.style.backgroundImage = expectedUrl;
      el.style.backgroundSize = (FRAME_W * this.scale * cfg.frames) + 'px ' + (FRAME_H * this.scale) + 'px';
    }
    // 切换帧
    var x = -this.frameIdx * FRAME_W * this.scale;
    el.style.backgroundPosition = x + 'px 0';
  };

  SpriteAnimPlayer.prototype.play = function (animName, opts) {
    if (this.dead && animName !== 'death') return;
    var cfg = ANIM_CFG[animName];
    if (!cfg) return;
    this.currentAnim = animName;
    this.frameIdx = 0;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this._applyFrame();
    var self = this;
    var intervalMs = 1000 / cfg.fps;
    this.timer = setInterval(function () {
      self.frameIdx++;
      if (self.frameIdx >= cfg.frames) {
        if (cfg.loop) {
          self.frameIdx = 0;
        } else {
          self.frameIdx = cfg.frames - 1;
          if (self.timer) { clearInterval(self.timer); self.timer = null; }
          if (animName === 'death') {
            self.dead = true;
          } else if (cfg.next) {
            self.play(cfg.next);
            return;
          }
        }
      }
      self._applyFrame();
    }, intervalMs);
  };

  /* 状态机：受击 */
  SpriteAnimPlayer.prototype.playHit = function () {
    if (this.dead) return;
    this.play('hit');
  };

  /* 状态机：攻击 */
  SpriteAnimPlayer.prototype.playAttack = function () {
    if (this.dead) return;
    this.play('attack');
  };

  /* 状态机：死亡 */
  SpriteAnimPlayer.prototype.playDeath = function () {
    this.play('death');
  };

  /* 状态机：胜利 */
  SpriteAnimPlayer.prototype.playVictory = function () {
    if (this.dead) return;
    this.play('victory');
  };

  SpriteAnimPlayer.prototype.destroy = function () {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.el = null;
  };

  /* ═══════════════════════════════════════════════
   *  敌人状态管理器 — 管理敌人sprite的整个生命周期
   * ═══════════════════════════════════════════════ */

  var enemyPlayer = null;
  var enemyCurrentSprite = '';
  var bossEntranceActive = false;

  /* 初始化/更新敌人sprite（每次战斗区渲染后调用） */
  function mountEnemy(containerEl, v) {
    if (!containerEl) return;
    var spriteName = enemySpriteName(v);
    var isBoss = v && v.enemy && (v.enemy.isBoss || v.enemy.isCardBoss);
    var scale = isBoss ? 1.5 : 1.2;
    var status = v ? v.status : '';

    // 如果sprite名称变了、player不存在、或元素引用变了（DOM重建），重建
    if (!enemyPlayer || enemyCurrentSprite !== spriteName || enemyPlayer.el !== containerEl) {
      if (enemyPlayer) enemyPlayer.destroy();
      enemyCurrentSprite = spriteName;
      enemyPlayer = new SpriteAnimPlayer(containerEl, spriteName, scale);
    }

    // 根据状态设置动画
    if (status === 'VICTORY') {
      enemyPlayer.playDeath();
    } else if (status === 'DEFEAT') {
      enemyPlayer.playVictory();
    } else if (isBoss && !bossEntranceActive) {
      // Boss登场演出
      playBossEntrance(containerEl, v);
    } else if (!bossEntranceActive) {
      enemyPlayer.play('idle');
    }
  }

  /* Boss登场演出 */
  function playBossEntrance(el, v) {
    if (!el || bossEntranceActive) return;
    bossEntranceActive = true;
    el.classList.add('ux66-boss-enter');
    // 暗幕闪烁
    var stage = document.getElementById('Ux63BattleArea');
    if (stage) {
      var flash = document.createElement('div');
      flash.className = 'ux66-boss-flash';
      stage.appendChild(flash);
      setTimeout(function () {
        if (flash.parentNode) flash.parentNode.removeChild(flash);
      }, 1200);
    }
    // Boss名称横幅
    var arena = el.closest('.ux65-arena');
    if (arena) {
      var banner = document.createElement('div');
      banner.className = 'ux66-boss-banner';
      var bossName = v && v.enemy ? v.enemy.name : 'Boss';
      banner.innerHTML = '<span class="ux66-boss-banner-text">⚠ ' + bossName + ' 降临 ⚠</span>';
      arena.appendChild(banner);
      setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 2000);
    }
    setTimeout(function () {
      el.classList.remove('ux66-boss-enter');
      bossEntranceActive = false;
      if (enemyPlayer) enemyPlayer.play('idle');
    }, 1500);
  }

  /* 敌人受击（由showHitEffect调用） */
  function onEnemyHit() {
    if (enemyPlayer && !bossEntranceActive) {
      enemyPlayer.playHit();
    }
  }

  /* 敌人死亡（由doTapAttack/技能击杀调用） */
  function onEnemyDeath() {
    if (enemyPlayer) {
      enemyPlayer.playDeath();
    }
  }

  /* 敌人攻击（由tick检测敌人攻击事件调用） */
  function onEnemyAttack() {
    if (enemyPlayer && !bossEntranceActive && !enemyPlayer.dead) {
      enemyPlayer.playAttack();
    }
  }

  /* ═══════════════════════════════════════════════
   *  小队成员sprite管理
   * ═══════════════════════════════════════════════ */

  var squadPlayers = {};

  function mountSquadMember(containerEl, professionId) {
    if (!containerEl) return null;
    var spriteName = profSpriteName(professionId);
    var key = containerEl.dataset.slot || professionId;
    var player = squadPlayers[key];
    if (!player || player.spriteName !== spriteName || player.el !== containerEl) {
      if (player) player.destroy();
      player = new SpriteAnimPlayer(containerEl, spriteName, 0.45);
      squadPlayers[key] = player;
    }
    return player;
  }

  function onSquadAttack(professionId) {
    var player = squadPlayers[professionId];
    if (player) player.playAttack();
  }

  function destroyAllSquad() {
    for (var k in squadPlayers) {
      if (squadPlayers[k]) squadPlayers[k].destroy();
    }
    squadPlayers = {};
  }

  /* ═══════════════════════════════════════════════
   *  场景背景
   * ═══════════════════════════════════════════════ */

  function sceneBgUrl(v) {
    var theme = sceneThemeFor(v);
    return SPRITE_BASE + 'scene_' + theme + '.png';
  }

  /* ═══════════════════════════════════════════════
   *  导出
   * ═══════════════════════════════════════════════ */

  window.__V66_SPRITE__ = {
    mountEnemy: mountEnemy,
    onEnemyHit: onEnemyHit,
    onEnemyDeath: onEnemyDeath,
    onEnemyAttack: onEnemyAttack,
    mountSquadMember: mountSquadMember,
    onSquadAttack: onSquadAttack,
    destroyAllSquad: destroyAllSquad,
    sceneBgUrl: sceneBgUrl,
    enemySpriteName: enemySpriteName,
    profSpriteName: profSpriteName,
    sceneThemeFor: sceneThemeFor,
    SpriteAnimPlayer: SpriteAnimPlayer,
  };
})();