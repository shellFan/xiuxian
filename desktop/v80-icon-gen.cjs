/**
 * V8.0 V7.1/TASK-005 — 统一风格图标生成（Electron 离屏 canvas）。
 *
 * 生成 6 个顶部快捷图标 + 4 个技能图标，统一「墨玉底 + 描金线条」国风风格，
 * 用于替换界面中以 Emoji 充当主视觉的图标位。输出到 desktop/assets/ui-icons/。
 *
 * 运行：powershell -File ai/work/v70-run-play.ps1 -Script v80-icon-gen.cjs ...
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'assets', 'ui-icons');
const SIZE = 96; // 显示 ~40px，2.4x 密度

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(__dirname, '..', 'ai', 'reports', 'v80', 'logs', 'ui', 'icon-gen.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

/* 统一绘制函数：底 = 墨玉圆角方；线条 = 描金 */
function iconDrawCode(ctx, S) {
  const g = S / 2;
  ctx.lineWidth = S / 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f2d998'; ctx.fillStyle = 'rgba(242,217,152,.9)';
  // 竹简底纹
  ctx.globalAlpha = 0.35;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(g - S * 0.26, g - S * 0.24 + i * S * 0.12); ctx.lineTo(g + S * 0.26, g - S * 0.24 + i * S * 0.12); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // 飞剑：斜置短剑 + 光迹
  ctx.save(); ctx.translate(g, g); ctx.rotate(-Math.PI / 4);
  ctx.beginPath(); ctx.moveTo(0, -S * 0.3); ctx.lineTo(0, S * 0.14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-S * 0.12, S * 0.14); ctx.lineTo(S * 0.12, S * 0.14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, S * 0.14); ctx.lineTo(0, S * 0.28); ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.arc(g + S * 0.22, g - S * 0.2, S * 0.045, 0, Math.PI * 2); ctx.fill();
}

function iconTask(ctx, S) {
  const g = S / 2;
  ctx.lineWidth = S / 14; ctx.lineCap = 'round'; ctx.strokeStyle = '#f2d998'; ctx.fillStyle = 'rgba(242,217,152,.9)';
  // 卷轴
  ctx.beginPath(); ctx.roundRect(g - S * 0.24, g - S * 0.28, S * 0.48, S * 0.56, S * 0.05); ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(g - S * 0.14, g - S * 0.14); ctx.lineTo(g + S * 0.1, g - S * 0.14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g - S * 0.14, g); ctx.lineTo(g + S * 0.14, g); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g - S * 0.14, g + S * 0.14); ctx.lineTo(g + S * 0.06, g + S * 0.14); ctx.stroke();
  ctx.globalAlpha = 1;
  // 印章
  ctx.fillRect(g + S * 0.1, g + S * 0.14, S * 0.12, S * 0.12);
}

function iconProject(ctx, S) {
  const g = S / 2;
  ctx.lineWidth = S / 14; ctx.lineCap = 'round'; ctx.strokeStyle = '#f2d998';
  // 交叉双剑
  ctx.beginPath(); ctx.moveTo(g - S * 0.24, g - S * 0.24); ctx.lineTo(g + S * 0.24, g + S * 0.24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g + S * 0.24, g - S * 0.24); ctx.lineTo(g - S * 0.24, g + S * 0.24); ctx.stroke();
  // 剑柄挡
  ctx.beginPath(); ctx.moveTo(g - S * 0.18, g + S * 0.1); ctx.lineTo(g - S * 0.1, g + S * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g + S * 0.1, g + S * 0.1); ctx.lineTo(g + S * 0.18, g + S * 0.18); ctx.stroke();
}

function iconSocial(ctx, S) {
  const g = S / 2;
  ctx.lineWidth = S / 14; ctx.strokeStyle = '#f2d998'; ctx.fillStyle = 'rgba(242,217,152,.9)';
  // 双人
  ctx.beginPath(); ctx.arc(g - S * 0.13, g - S * 0.12, S * 0.1, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(g + S * 0.16, g - S * 0.08, S * 0.09, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(g - S * 0.13, g + S * 0.14, S * 0.15, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(g + S * 0.16, g + S * 0.17, S * 0.13, Math.PI, 0); ctx.stroke();
}

function iconBag(ctx, S) {
  const g = S / 2;
  ctx.lineWidth = S / 14; ctx.strokeStyle = '#f2d998'; ctx.fillStyle = 'rgba(242,217,152,.9)';
  // 褡裢
  ctx.beginPath(); ctx.roundRect(g - S * 0.24, g - S * 0.14, S * 0.48, S * 0.4, S * 0.08); ctx.stroke();
  ctx.beginPath(); ctx.arc(g, g - S * 0.14, S * 0.12, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(g - S * 0.06, g - S * 0.02, S * 0.12, S * 0.1, S * 0.02); ctx.fill();
}

function iconGear(ctx, S) {
  const g = S / 2;
  ctx.lineWidth = S / 14; ctx.strokeStyle = '#f2d998';
  // 齿轮（八卦轮）
  const teeth = 8, r1 = S * 0.24, r2 = S * 0.3;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(g + Math.cos(a) * r1, g + Math.sin(a) * r1);
    ctx.lineTo(g + Math.cos(a) * r2, g + Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(g, g, S * 0.17, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(g, g, S * 0.055, 0, Math.PI * 2); ctx.stroke();
}

/* ── 技能图标：白玉底 + 各自辨识形 ── */
function skillSword(ctx, S) {
  const g = S / 2;
  ctx.strokeStyle = '#ffe9bd'; ctx.lineWidth = S / 12; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(g, g); ctx.rotate(-Math.PI / 4);
  ctx.beginPath(); ctx.moveTo(0, -S * 0.34); ctx.lineTo(0, S * 0.16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-S * 0.14, S * 0.16); ctx.lineTo(S * 0.14, S * 0.16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, S * 0.16); ctx.lineTo(0, S * 0.32); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,233,189,.95)';
  ctx.beginPath(); ctx.arc(g + S * 0.24, g - S * 0.24, S * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(g + S * 0.14, g - S * 0.32, S * 0.03, 0, Math.PI * 2); ctx.fill();
}
function skillBomb(ctx, S) {
  const g = S / 2;
  ctx.strokeStyle = '#ffb37a'; ctx.lineWidth = S / 12; ctx.fillStyle = 'rgba(255,179,122,.9)';
  ctx.beginPath(); ctx.arc(g, g + S * 0.06, S * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(g + S * 0.08, g - S * 0.14); ctx.quadraticCurveTo(g + S * 0.2, g - S * 0.26, g + S * 0.1, g - S * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.arc(g + S * 0.06, g - S * 0.32, S * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(g - S * 0.3, g - S * 0.26); ctx.lineTo(g - S * 0.2, g - S * 0.26); ctx.moveTo(g - S * 0.25, g - S * 0.31); ctx.lineTo(g - S * 0.25, g - S * 0.21); ctx.stroke();
}
function skillCrush(ctx, S) {
  const g = S / 2;
  ctx.strokeStyle = '#c9a5ff'; ctx.lineWidth = S / 12; ctx.fillStyle = 'rgba(201,165,255,.9)';
  ctx.beginPath(); ctx.moveTo(g - S * 0.26, g - S * 0.1); ctx.lineTo(g + S * 0.06, g - S * 0.1); ctx.lineTo(g - S * 0.02, g + S * 0.06); ctx.lineTo(g + S * 0.3, g + S * 0.02); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g - S * 0.2, g + S * 0.22); ctx.lineTo(g + S * 0.2, g + S * 0.22); ctx.stroke();
  ctx.beginPath(); ctx.arc(g - S * 0.22, g - S * 0.24, S * 0.045, 0, Math.PI * 2); ctx.fill();
}
function skillRollback(ctx, S) {
  const g = S / 2;
  ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = S / 12; ctx.fillStyle = 'rgba(126,200,255,.9)';
  ctx.beginPath(); ctx.arc(g, g, S * 0.22, -0.4, Math.PI * 1.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g - S * 0.28, g - S * 0.02); ctx.lineTo(g - S * 0.16, g - S * 0.16); ctx.lineTo(g - S * 0.04, g - S * 0.02); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(g - S * 0.14, g + S * 0.06, S * 0.28, S * 0.16, S * 0.04); ctx.fill();
}

const ICONS = {
  'shortcut-sword': iconDrawCode,
  'shortcut-task': iconTask,
  'shortcut-project': iconProject,
  'shortcut-social': iconSocial,
  'shortcut-bag': iconBag,
  'shortcut-settings': iconGear,
  'skill-sword': skillSword,
  'skill-bomb': skillBomb,
  'skill-crush': skillCrush,
  'skill-rollback': skillRollback,
};

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, '_gen.html');
  fs.writeFileSync(htmlPath, '<!DOCTYPE html><html><body><canvas id="c" width="' + SIZE + '" height="' + SIZE + '"></canvas></body></html>');
  const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { offscreen: true, contextIsolation: false, nodeIntegration: false } });
  await win.loadFile(htmlPath);
  await wait(400);
  for (const [name, draw] of Object.entries(ICONS)) {
    const dataURL = await win.webContents.executeJavaScript(`
      (function(){
        var c=document.getElementById('c'); c.width=${SIZE}; c.height=${SIZE};
        var ctx=c.getContext('2d');
        ctx.clearRect(0,0,${SIZE},${SIZE});
        /* 墨玉圆角底 */
        ctx.fillStyle='rgba(10,26,40,0.92)';
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(2,2,${SIZE}-4,${SIZE}-4,${SIZE * 0.22}); ctx.fill(); }
        else { ctx.fillRect(2,2,${SIZE}-4,${SIZE}-4); }
        ctx.strokeStyle='rgba(230,199,127,.55)'; ctx.lineWidth=2;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(3,3,${SIZE}-6,${SIZE}-6,${SIZE * 0.22}); ctx.stroke(); }
        (${draw.toString()})(ctx, ${SIZE});
        return c.toDataURL('image/png');
      })()
    `);
    fs.writeFileSync(path.join(OUT_DIR, name + '.png'), Buffer.from(String(dataURL).split(',')[1], 'base64'));
    logf('[ICON] ' + name + '.png');
  }
  win.destroy();
  try { fs.unlinkSync(htmlPath); } catch (_) {}
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
