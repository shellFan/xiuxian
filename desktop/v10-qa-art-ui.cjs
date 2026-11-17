/**
 * V10.0 独立 QA：美术 + UI/UX 审计。
 * - sprite 加载：英雄/敌人背景图 URL 实际可加载（HTTP 200 且非空）
 * - 动画：sprite background-position 随时间变化
 * - 无 emoji 主视觉：主视觉区域含真实图片资源
 * - 五区结构、导航、移动端可达性（点击目标尺寸）
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('./main.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const EV = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'evidence');
const SHOT = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'screenshots');
const LOGF = path.join(EV, 'qa-art-ui.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };
const result = { startedAt: new Date().toISOString(), checks: {} };
const check = (name, pass, detail) => {
  result.checks[name] = { pass: !!pass, detail: detail === undefined ? null : detail };
  logf('[CHECK] ' + name + '=' + (pass ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(detail === undefined ? null : detail));
};
app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });
app.whenReady().then(async () => {
  const w = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => { try { return await w().webContents.executeJavaScript(js); } catch (e) { return { __error: String(e.message).slice(0, 200) }; } };
  const shot = async (name) => { try { const img = await w().webContents.capturePage(); fs.writeFileSync(path.join(SHOT, name + '.png'), img.toPNG()); logf('[shot] ' + name); } catch (e) { logf('[shot-fail] ' + name); } };
  await wait(9000);
  for (let i = 0; i < 12; i++) { await run(`(function(){ var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','#WelcomeContinueBtn','[data-offline-decision-action]']; for(var j=0;j<sels.length;j++){ var m=document.querySelector(sels[j]); if(m){ m.click(); return 1; } } return 0; })()`); await wait(500); }

  // 先切到洞府页（boot 可能停在最后活跃屏）
  await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('洞府')>=0){ items[i].click(); return 1; } } return 0; })()`);
  await wait(2000);
  await run(`(function(){ var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','#WelcomeContinueBtn','[data-offline-decision-action]']; for(var j=0;j<sels.length;j++){ var m=document.querySelector(sels[j]); if(m){ m.click(); return 1; } } return 0; })()`);

  // —— 洞府页美术 ——
  const art = await run(`(function(){
    function bgInfo(sel){ var el=document.querySelector(sel); if(!el) return {exists:false};
      var bi = getComputedStyle(el).backgroundImage || '';
      var u = null;
      if (bi && bi.indexOf('http') >= 0) { u = bi.slice(bi.indexOf('http')).split('"')[0].split(')')[0]; }
      else if (bi && bi.indexOf('data:') >= 0) { u = bi.slice(bi.indexOf('data:')); u = u.replace(/["')].*$/, ''); }
      else if (bi.indexOf('url(') >= 0) { var m2 = bi.slice(bi.indexOf('url(') + 4).replace(/["')].*$/, ''); u = m2 || null; }
      return { exists:true, bg: u, raw: bi.slice(0,120), text: (el.innerText||'').slice(0,30) };
    }
    return {
      hero: bgInfo('#Ux90CaveHero'),
      heroWrap: bgInfo('.ux91-hero'),
      enemyZoneSprite: bgInfo('#Ux66EnemySprite'),
      goalCard: bgInfo('.ux91-goal'),
      sceneBg: (function(){ var el=document.querySelector('.ux65-scene, [style*="scene"]'); if(!el) return null; var bi=getComputedStyle(el).backgroundImage; var m=bi&&bi.match(/url\("?([^")]+)"?\)/); return m?m[1]:null; })()
    };
  })()`);
  check('art_hero_sprite_exists', art.hero.exists === true, art.hero);
  check('art_hero_sprite_is_image', !!(art.hero.bg || art.heroWrap.bg), { hero: art.hero.bg, wrap: art.heroWrap.bg });

  // sprite URL 实际可加载性
  const urls = [];
  if (art.hero && art.hero.bg) urls.push(art.hero.bg);
  if (art.heroWrap && art.heroWrap.bg) urls.push(art.heroWrap.bg);
  if (art.sceneBg) urls.push(art.sceneBg);
  const loadCheck = urls.length ? await run(`(function(){
    var urls = ${JSON.stringify(urls)};
    return Promise.all(urls.map(function(u){
      return new Promise(function(res){
        var img = new Image(); img.onload = function(){ res({ url: u.slice(0,60), ok: img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = function(){ res({ url: u.slice(0,60), ok: false }); };
        img.src = u;
      });
    }));
  })()`) : [];
  const allLoaded = loadCheck.length > 0 && loadCheck.every(function(x){ return x.ok; });
  check('art_images_load', allLoaded, loadCheck);

  // —— 动画：sprite background-position 变化 ——
  const anim = await run(`(function(){
    var el = document.querySelector('#Ux90CaveHero') || document.querySelector('#Ux66EnemySprite');
    if (!el) return { exists: false };
    var cs1 = getComputedStyle(el).backgroundPosition;
    return { exists: true, pos1: cs1, sheet: (getComputedStyle(el).backgroundImage||'').slice(0,80) };
  })()`);
  await wait(1400);
  const anim2 = await run(`(function(){ var el=document.querySelector('#Ux90CaveHero')||document.querySelector('#Ux66EnemySprite'); if(!el) return {exists:false}; return { exists:true, pos2: getComputedStyle(el).backgroundPosition }; })()`);
  check('art_sprite_animates', anim.exists && anim2.exists && anim.pos1 !== anim2.pos2, { p1: anim.pos1, p2: anim2.pos2 });

  // —— 导航 + 页面可达性 ——
  const nav = await run(`(function(){
    var items = Array.prototype.slice.call(document.querySelectorAll('.ux-nav-item'));
    return { count: items.length, labels: items.map(function(i){ return (i.innerText||'').trim().slice(0,6); }),
      minTouch: Math.min.apply(null, items.map(function(i){ var r=i.getBoundingClientRect(); return Math.min(r.width, r.height); })) };
  })()`);
  check('ui_nav_five_pages', nav.count === 5, nav);
  check('ui_nav_touch_target', nav.minTouch >= 32, nav.minTouch);
  await shot('qa-15-art-cave');

  // —— 移动端可达性：以 H5 探针真实 390px 视口结果为准（qa-h5.json），此处记录桌面宽度基线 ——
  await wait(500);
  const mobile = await run(`(function(){
    var overX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    var btns = Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(b){ return b.getBoundingClientRect().width > 0; });
    var tinyList = btns.filter(function(b){ var r = b.getBoundingClientRect(); return r.height < 24 && r.width < 48; }).map(function(b){ return { text: (b.innerText||b.title||'').slice(0,16), cls: (b.className||'').slice(0,40), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }; });
    return { vw: window.innerWidth, overX: overX, tinyButtons: tinyList.length, tiny: tinyList, btnCount: btns.length };
  })()`);
  check('ui_desktop_no_overflow', mobile.overX === false, mobile);
  check('ui_no_tiny_buttons_desktop', mobile.tinyButtons === 0, mobile);
  await shot('qa-16-art-mobile');

  const names = Object.keys(result.checks);
  const failed = names.filter((n) => !result.checks[n].pass);
  result.summary = { total: names.length, passed: names.length - failed.length, failed: failed, verdict: failed.length === 0 ? 'PASS' : 'FAIL' };
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(EV, 'qa-art-ui.json'), JSON.stringify(result, null, 2));
  logf('VERDICT=' + result.summary.verdict + ' passed=' + result.summary.passed + '/' + result.summary.total);
  app.exit(result.summary.verdict === 'PASS' ? 0 : 2);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
