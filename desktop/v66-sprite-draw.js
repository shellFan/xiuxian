/**
 * V6.6 Sprite绘制库 (浏览器端)
 * 在Canvas上绘制Q版角色/敌人/Boss的各动画帧
 * 由 v66-sprite-gen.cjs 通过Electron加载并调用
 */
;(function () {
  'use strict';

  var FRAME_W = 128;
  var FRAME_H = 128;

  // ── 工具 ──
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── 眼睛绘制 ──
  function drawEyes(ctx, cfg, state) {
    var eyeY = 2, eyeDX = 8;
    if (state === 'x') {
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2;
      [-eyeDX, eyeDX].forEach(function (sx) {
        ctx.beginPath();
        ctx.moveTo(sx - 3, eyeY - 3); ctx.lineTo(sx + 3, eyeY + 3);
        ctx.moveTo(sx + 3, eyeY - 3); ctx.lineTo(sx - 3, eyeY + 3);
        ctx.stroke();
      });
      return;
    }
    if (state === 'hurt') {
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2;
      [-eyeDX, eyeDX].forEach(function (sx) {
        ctx.beginPath();
        ctx.moveTo(sx - 4, eyeY - 2); ctx.lineTo(sx, eyeY); ctx.lineTo(sx - 4, eyeY + 2);
        ctx.stroke();
      });
      return;
    }
    if (state === 'happy') {
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2;
      [-eyeDX, eyeDX].forEach(function (sx) {
        ctx.beginPath();
        ctx.arc(sx, eyeY + 2, 4, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
      });
      return;
    }
    if (state === 'angry') {
      [-eyeDX, eyeDX].forEach(function (sx) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(sx, eyeY, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cfg.eyeColor || '#2a2a2a';
        ctx.beginPath(); ctx.arc(sx, eyeY + 1, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - 5, eyeY - 6); ctx.lineTo(sx + 2, eyeY - 4);
        ctx.stroke();
      });
      return;
    }
    // 普通大眼
    [-eyeDX, eyeDX].forEach(function (sx) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(sx, eyeY, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cfg.eyeColor || '#2a2a2a';
      ctx.beginPath(); ctx.arc(sx, eyeY + 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx - 1, eyeY - 1, 1.2, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawMouth(ctx, state) {
    ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1.5;
    var my = 12;
    if (state === 'happy') {
      ctx.beginPath(); ctx.arc(0, my - 2, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    } else if (state === 'hurt' || state === 'x') {
      ctx.beginPath(); ctx.ellipse(0, my, 4, 3, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (state === 'angry') {
      ctx.beginPath(); ctx.moveTo(-4, my); ctx.lineTo(4, my); ctx.stroke();
      ctx.fillStyle = '#5a2a2a';
      ctx.beginPath(); ctx.ellipse(0, my + 2, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, my - 1, 3, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
  }

  function drawAccessory(ctx, type) {
    ctx.save();
    switch (type) {
      case 'keyboard':
        ctx.translate(14, 18);
        ctx.fillStyle = '#2a2a3a';
        roundRect(ctx, 0, 0, 14, 8, 2); ctx.fill();
        ctx.fillStyle = '#8a6adf';
        for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) ctx.fillRect(2 + c * 3, 2 + r * 3, 2, 2);
        break;
      case 'palette':
        ctx.translate(-14, 18);
        ctx.fillStyle = '#f0e8d8';
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(-3, -2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(3, -1, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#60a5fa'; ctx.beginPath(); ctx.arc(0, 3, 2, 0, Math.PI * 2); ctx.fill();
        break;
      case 'magnifier':
        ctx.translate(14, 16);
        ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#5a3a1a';
        ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(9, 9); ctx.stroke();
        ctx.fillStyle = 'rgba(245,158,11,0.2)';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'shield':
        ctx.translate(-14, 14);
        ctx.fillStyle = '#3a6a5a';
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(7, -4); ctx.lineTo(7, 4);
        ctx.lineTo(0, 9); ctx.lineTo(-7, 4); ctx.lineTo(-7, -4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6cc3a5'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#6cc3a5';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'sword':
        ctx.translate(-2, -30); ctx.rotate(-0.5);
        ctx.fillStyle = '#c0c8d0';
        ctx.beginPath();
        ctx.moveTo(0, -18); ctx.lineTo(3, -14); ctx.lineTo(3, 8);
        ctx.lineTo(-3, 8); ctx.lineTo(-3, -14);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd700'; ctx.fillRect(-5, 8, 10, 3);
        ctx.fillStyle = '#8a6a2a'; ctx.fillRect(-2, 11, 4, 8);
        break;
    }
    ctx.restore();
  }

  // ── Q版角色绘制 ──
  function drawChar(ctx, cfg, animType, frameIdx, totalFrames) {
    var cx = FRAME_W / 2;
    var t = frameIdx / Math.max(1, totalFrames - 1);

    ctx.clearRect(0, 0, FRAME_W, FRAME_H);

    var bodyY = 0, armAngle = 0, headTilt = 0, eyeState = 'normal', opacity = 1, squash = 1;

    switch (animType) {
      case 'idle':
        bodyY = Math.sin(t * Math.PI * 2) * 3;
        armAngle = Math.sin(t * Math.PI * 2) * 0.1;
        break;
      case 'attack':
        if (t < 0.3) { armAngle = -0.5 * (t / 0.3); bodyY = -2 * (t / 0.3); }
        else if (t < 0.6) { armAngle = 0.8 * ((t - 0.3) / 0.3); bodyY = 4 * ((t - 0.3) / 0.3); }
        else { armAngle = 0.8 * (1 - (t - 0.6) / 0.4); bodyY = 4 * (1 - (t - 0.6) / 0.4); }
        eyeState = (t > 0.3 && t < 0.7) ? 'angry' : 'normal';
        break;
      case 'hit':
        bodyY = 4 * t; headTilt = 0.2 * t;
        eyeState = t < 0.5 ? 'hurt' : 'normal';
        squash = 1 - 0.1 * Math.sin(t * Math.PI);
        break;
      case 'death':
        bodyY = 10 * t; opacity = 1 - 0.7 * t; headTilt = 0.5 * t;
        eyeState = t > 0.3 ? 'x' : 'hurt';
        squash = 1 - 0.2 * t;
        break;
      case 'victory':
        bodyY = -Math.abs(Math.sin(t * Math.PI * 2)) * 6;
        armAngle = 0.6 + Math.sin(t * Math.PI * 2) * 0.2;
        eyeState = 'happy';
        break;
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(cx, 78 + bodyY);
    ctx.scale(squash, 2 - squash);
    ctx.rotate(headTilt);

    // 阴影
    ctx.save();
    ctx.globalAlpha = 0.3 * opacity;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 48 - bodyY, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 光环
    if (cfg.aura) {
      ctx.save();
      ctx.globalAlpha = 0.5 * opacity;
      var grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 45);
      grad.addColorStop(0, cfg.aura);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 身体
    ctx.fillStyle = cfg.outfit || cfg.body;
    ctx.strokeStyle = cfg.outfitDark || cfg.bodyDark;
    ctx.lineWidth = 2;
    roundRect(ctx, -16, -5, 32, 38, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cfg.outfitDark || cfg.bodyDark;
    roundRect(ctx, -16, 12, 32, 6, 2); ctx.fill();

    // 手臂
    ctx.save();
    ctx.fillStyle = cfg.outfit || cfg.body;
    ctx.strokeStyle = cfg.outfitDark || cfg.bodyDark;
    ctx.lineWidth = 1.5;
    // 左臂
    ctx.save();
    ctx.translate(-16, 2); ctx.rotate(-0.3 + armAngle);
    roundRect(ctx, -5, 0, 8, 22, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cfg.skin || cfg.body;
    ctx.beginPath(); ctx.arc(-1, 24, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 右臂
    ctx.save();
    ctx.translate(16, 2); ctx.rotate(0.3 - armAngle);
    roundRect(ctx, -3, 0, 8, 22, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cfg.skin || cfg.body;
    ctx.beginPath(); ctx.arc(1, 24, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();

    // 腿
    ctx.fillStyle = cfg.outfitDark || cfg.bodyDark;
    roundRect(ctx, -12, 32, 9, 14, 3); ctx.fill();
    roundRect(ctx, 3, 32, 9, 14, 3); ctx.fill();

    // 头
    ctx.save();
    ctx.translate(0, -22);
    ctx.fillStyle = cfg.skin || cfg.body;
    ctx.strokeStyle = cfg.outfitDark || cfg.bodyDark;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // 头发
    ctx.fillStyle = cfg.hair || cfg.bodyDark;
    ctx.beginPath(); ctx.arc(0, -4, 22, Math.PI * 1.1, Math.PI * 1.9); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-8, -14, 8, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8, -14, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill();

    drawEyes(ctx, cfg, eyeState);
    drawMouth(ctx, eyeState);

    // 腮红
    if (eyeState === 'happy' || animType === 'victory') {
      ctx.fillStyle = 'rgba(255,150,150,0.4)';
      ctx.beginPath(); ctx.ellipse(-14, 6, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(14, 6, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }

    drawAccessory(ctx, cfg.accessory);
    ctx.restore(); // head
    ctx.restore(); // main
  }

  // ── 敌人眼睛 ──
  function drawEnemyEyes(ctx, cfg, state) {
    var eyeY = -5, eyeDX = 7;
    if (state === 'x') {
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2;
      [-eyeDX, eyeDX].forEach(function (sx) {
        ctx.beginPath();
        ctx.moveTo(sx - 3, eyeY - 3); ctx.lineTo(sx + 3, eyeY + 3);
        ctx.moveTo(sx + 3, eyeY - 3); ctx.lineTo(sx - 3, eyeY + 3);
        ctx.stroke();
      });
      return;
    }
    if (state === 'hurt') {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      [-eyeDX, eyeDX].forEach(function (sx) {
        ctx.beginPath();
        ctx.moveTo(sx - 4, eyeY - 2); ctx.lineTo(sx, eyeY); ctx.lineTo(sx - 4, eyeY + 2);
        ctx.stroke();
      });
      return;
    }
    [-eyeDX, eyeDX].forEach(function (sx) {
      ctx.fillStyle = cfg.eye;
      ctx.beginPath(); ctx.ellipse(sx, eyeY, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(sx - 1, eyeY - 1, 1.5, 0, Math.PI * 2); ctx.fill();
    });
    if (state === 'angry') {
      ctx.strokeStyle = cfg.eye; ctx.lineWidth = 2;
      [-eyeDX, eyeDX].forEach(function (sx) {
        ctx.beginPath();
        ctx.moveTo(sx - 5, eyeY - 7); ctx.lineTo(sx + 3, eyeY - 5);
        ctx.stroke();
      });
    }
  }

  // ── 敌人绘制 ──
  function drawEnemy(ctx, cfg, animType, frameIdx, totalFrames) {
    var cx = FRAME_W / 2;
    var t = frameIdx / Math.max(1, totalFrames - 1);

    ctx.clearRect(0, 0, FRAME_W, FRAME_H);

    var bodyY = 0, wobble = 0, opacity = 1, squash = 1, eyeState = 'normal';

    switch (animType) {
      case 'idle':
        bodyY = Math.sin(t * Math.PI * 2) * 4;
        wobble = Math.sin(t * Math.PI * 2) * 0.08;
        break;
      case 'attack':
        bodyY = -6 * Math.sin(t * Math.PI);
        wobble = 0.2 * Math.sin(t * Math.PI);
        eyeState = (t > 0.2 && t < 0.8) ? 'angry' : 'normal';
        break;
      case 'hit':
        bodyY = 5 * t; wobble = 0.3 * t; eyeState = 'hurt';
        squash = 1 - 0.1 * Math.sin(t * Math.PI);
        break;
      case 'death':
        bodyY = 15 * t; opacity = 1 - 0.8 * t; wobble = 0.5 * t;
        eyeState = 'x'; squash = 1 - 0.25 * t;
        break;
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(cx, 72 + bodyY);
    ctx.rotate(wobble);
    ctx.scale(squash, 2 - squash);

    // 阴影
    ctx.save();
    ctx.globalAlpha = 0.25 * opacity;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 42 - bodyY, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    var shape = cfg.shape || 'blob';
    ctx.fillStyle = cfg.body;
    ctx.strokeStyle = cfg.bodyDark;
    ctx.lineWidth = 2.5;

    if (shape === 'paper') {
      // 需求变更怪
      ctx.save(); ctx.translate(-4, 0);
      for (var i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(i * 6, -i * 10); ctx.rotate((i - 1) * 0.15);
        ctx.fillStyle = i === 1 ? cfg.body : cfg.bodyDark;
        roundRect(ctx, -12, -16, 24, 32, 3); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        for (var l = 0; l < 3; l++) {
          ctx.beginPath(); ctx.moveTo(-8, -10 + l * 7); ctx.lineTo(8, -10 + l * 7); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.fillStyle = '#ff4444';
      ctx.beginPath(); ctx.arc(10, -5, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (shape === 'bug') {
      // Bug小妖
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cfg.bodyDark; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -20); ctx.quadraticCurveTo(-14, -30, -10, -34);
      ctx.moveTo(8, -20); ctx.quadraticCurveTo(14, -30, 10, -34);
      ctx.stroke();
      ctx.fillStyle = cfg.body;
      ctx.beginPath(); ctx.arc(-10, -34, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, -34, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cfg.bodyDark;
      ctx.beginPath(); ctx.ellipse(0, 5, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'tower') {
      // 技术债怪
      for (var i2 = 0; i2 < 4; i2++) {
        ctx.save(); ctx.translate(Math.sin(i2 * 1.7) * 3, -i2 * 12);
        ctx.fillStyle = i2 % 2 === 0 ? cfg.body : cfg.bodyDark;
        roundRect(ctx, -16 + i2 * 2, 0, 32 - i2 * 4, 12, 2); ctx.fill(); ctx.stroke();
        if (i2 === 1) {
          ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-4, 6); ctx.lineTo(-6, 10); ctx.stroke();
        }
        ctx.restore();
      }
    } else if (shape === 'ghost') {
      // 加班怨灵
      ctx.beginPath();
      ctx.arc(0, -8, 20, Math.PI, 0);
      ctx.lineTo(20, 18);
      for (var g = 0; g < 4; g++) ctx.quadraticCurveTo(15 - g * 10, 24, 10 - g * 10, 18);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(14, 8);
      ctx.fillStyle = '#d4c0a0';
      roundRect(ctx, -4, -5, 8, 10, 1); ctx.fill();
      ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(6, 0, 3, -1, 1); ctx.stroke();
      ctx.restore();
    } else if (shape === 'puppet') {
      // KPI傀儡
      roundRect(ctx, -18, -20, 36, 40, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      roundRect(ctx, -12, -12, 24, 14, 2); ctx.fill();
      ctx.fillStyle = '#ff6600';
      ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('996', 0, -2);
      ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 2;
      for (var p = 0; p < 3; p++) {
        ctx.beginPath(); ctx.arc(-20 + p * 3, 10 + p * 4, 2.5, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (shape === 'demon') {
      // Boss
      var s = cfg.scale || 1.3;
      ctx.scale(s, s);
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cfg.bodyDark;
      ctx.beginPath();
      ctx.moveTo(-14, -20); ctx.quadraticCurveTo(-22, -34, -16, -36);
      ctx.quadraticCurveTo(-12, -30, -8, -22);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, -20); ctx.quadraticCurveTo(22, -34, 16, -36);
      ctx.quadraticCurveTo(12, -30, 8, -22);
      ctx.closePath(); ctx.fill();
      if (cfg.accessory === 'fire') {
        ctx.fillStyle = '#ff6600';
        ctx.beginPath(); ctx.ellipse(0, 10, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (cfg.accessory === 'lightning') {
        ctx.fillStyle = '#cc44ff';
        ctx.beginPath();
        ctx.moveTo(-3, 4); ctx.lineTo(2, 8); ctx.lineTo(-1, 8); ctx.lineTo(3, 14);
        ctx.lineTo(-2, 10); ctx.lineTo(1, 10); ctx.lineTo(-3, 4);
        ctx.closePath(); ctx.fill();
      }
      if (cfg.accessory === 'contract') {
        ctx.fillStyle = '#ffdddd';
        ctx.save(); ctx.translate(12, 6); ctx.rotate(0.3);
        roundRect(ctx, -5, -7, 10, 14, 1); ctx.fill();
        ctx.strokeStyle = '#aa3333'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(3, -4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
        ctx.restore();
      }
    }

    drawEnemyEyes(ctx, cfg, eyeState);
    ctx.restore();
  }

  // ── 场景背景绘制 ──
  function drawScene(ctx, theme, w, h) {
    ctx.clearRect(0, 0, w, h);
    var sky, mtnFar, mtnNear, ground, accent;

    switch (theme) {
      case 'office':
        sky = ['#0e1e30', '#162840', '#1a3050'];
        mtnFar = '#1a2c44'; mtnNear = '#0e1a2c'; ground = '#142840';
        accent = '#4a90b8';
        break;
      case 'mountain':
        sky = ['#0a1828', '#122838', '#1a3848'];
        mtnFar = '#1a3a4a'; mtnNear = '#0e2838'; ground = '#143028';
        accent = '#4aae8e';
        break;
      case 'heaven':
        sky = ['#1a1430', '#2a2048', '#3a2c58'];
        mtnFar = '#3a2c58'; mtnNear = '#2a1c40'; ground = '#2a2040';
        accent = '#ffd700';
        break;
      case 'void':
        sky = ['#180a14', '#2a1020', '#381828'];
        mtnFar = '#381828'; mtnNear = '#200a18'; ground = '#200a18';
        accent = '#cc44ff';
        break;
      case 'tower':
        sky = ['#1a0a0a', '#2a1218', '#301820'];
        mtnFar = '#301820'; mtnNear = '#1a0a10'; ground = '#1a0a10';
        accent = '#ff6b6b';
        break;
      default:
        sky = ['#0e1e30', '#162840', '#1a3050'];
        mtnFar = '#1a2c44'; mtnNear = '#0e1a2c'; ground = '#142840';
        accent = '#4a90b8';
    }

    // 天空渐变
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(0.5, sky[1]);
    grad.addColorStop(1, sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 星星
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    var stars = [[0.1, 0.1], [0.25, 0.05], [0.4, 0.12], [0.55, 0.08], [0.7, 0.15], [0.85, 0.06], [0.15, 0.2], [0.5, 0.18], [0.8, 0.22]];
    stars.forEach(function (s) {
      ctx.beginPath(); ctx.arc(s[0] * w, s[1] * h, 1.5, 0, Math.PI * 2); ctx.fill();
    });

    // 月亮
    var moonX = w * 0.82, moonY = h * 0.12, moonR = h * 0.06;
    var mg = ctx.createRadialGradient(moonX - moonR * 0.3, moonY - moonR * 0.3, 1, moonX, moonY, moonR);
    mg.addColorStop(0, '#fff8e0');
    mg.addColorStop(0.6, accent === '#ffd700' ? '#f0d890' : '#e8d8a0');
    mg.addColorStop(1, accent === '#ffd700' ? '#d4b860' : '#c8a870');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2); ctx.fill();

    // 远山
    ctx.fillStyle = mtnFar;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.55);
    ctx.quadraticCurveTo(w * 0.2, h * 0.35, w * 0.4, h * 0.5);
    ctx.quadraticCurveTo(w * 0.6, h * 0.3, w * 0.8, h * 0.48);
    ctx.quadraticCurveTo(w * 0.9, h * 0.4, w, h * 0.52);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // 近山
    ctx.fillStyle = mtnNear;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.68);
    ctx.quadraticCurveTo(w * 0.15, h * 0.5, w * 0.35, h * 0.65);
    ctx.quadraticCurveTo(w * 0.55, h * 0.45, w * 0.75, h * 0.62);
    ctx.quadraticCurveTo(w * 0.9, h * 0.55, w, h * 0.65);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // 地面
    ctx.fillStyle = ground;
    ctx.fillRect(0, h * 0.82, w, h * 0.18);

    // 地面分界线
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.05, h * 0.82);
    ctx.quadraticCurveTo(w * 0.5, h * 0.80, w * 0.95, h * 0.82);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 场景特定装饰
    if (theme === 'office') {
      // 窗户和电脑
      ctx.fillStyle = 'rgba(74,144,184,0.15)';
      ctx.fillRect(w * 0.1, h * 0.15, w * 0.15, h * 0.2);
      ctx.strokeStyle = 'rgba(74,144,184,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(w * 0.1, h * 0.15, w * 0.15, h * 0.2);
      ctx.beginPath(); ctx.moveTo(w * 0.175, h * 0.15); ctx.lineTo(w * 0.175, h * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.25); ctx.lineTo(w * 0.25, h * 0.25); ctx.stroke();
    } else if (theme === 'mountain') {
      // 灵气粒子
      ctx.fillStyle = 'rgba(74,174,142,0.3)';
      for (var m = 0; m < 8; m++) {
        ctx.beginPath();
        ctx.arc(w * (0.1 + m * 0.1), h * (0.4 + Math.sin(m) * 0.15), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'heaven') {
      // 祥云
      ctx.fillStyle = 'rgba(255,215,0,0.15)';
      for (var c = 0; c < 3; c++) {
        var cx2 = w * (0.15 + c * 0.3), cy2 = h * (0.2 + c * 0.08);
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, w * 0.08, h * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx2 + w * 0.04, cy2 - h * 0.02, w * 0.05, h * 0.02, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'void') {
      // 裂缝
      ctx.strokeStyle = 'rgba(204,68,255,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.3, h * 0.1);
      ctx.lineTo(w * 0.35, h * 0.2);
      ctx.lineTo(w * 0.32, h * 0.3);
      ctx.lineTo(w * 0.38, h * 0.4);
      ctx.stroke();
      // 能量球
      ctx.fillStyle = 'rgba(204,68,255,0.2)';
      ctx.beginPath(); ctx.arc(w * 0.15, h * 0.5, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.7, h * 0.3, 6, 0, Math.PI * 2); ctx.fill();
    } else if (theme === 'tower') {
      // 石柱
      ctx.fillStyle = 'rgba(48,24,32,0.6)';
      ctx.fillRect(w * 0.05, h * 0.3, w * 0.06, h * 0.5);
      ctx.fillRect(w * 0.89, h * 0.3, w * 0.06, h * 0.5);
      // 符文
      ctx.fillStyle = 'rgba(255,107,107,0.4)';
      ctx.font = 'bold 8px serif'; ctx.textAlign = 'center';
      ctx.fillText('封', w * 0.08, h * 0.4);
      ctx.fillText('塔', w * 0.92, h * 0.4);
    }
  }

  // ── 导出 ──
  window.__SPRITE_DRAW__ = {
    drawChar: drawChar,
    drawEnemy: drawEnemy,
    drawScene: drawScene,
    roundRect: roundRect,
    FRAME_W: FRAME_W,
    FRAME_H: FRAME_H,
  };
})();