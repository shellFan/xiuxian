/**
 * V10.0 独立 QA 探针（核心玩法全流程）r2 — 修正字段形态后的复跑版。
 * 运行时形态均以 qa-shape-dump.json 实测为准：
 *   - 角色视图 = queryCharacterProfile()（含 name/level 等）
 *   - 敌人视图字段 = name/emoji/hp/maxHp/hpPct/isBoss/isCardBoss
 *   - 连击视图 = ab.comboCount（重建后 bundle 已含 V9.2 服务）
 *   - 存档 = 文件存储 XIUXIAN_USER_DATA/xiuxian-save/save.json
 * 全部结论基于实际运行观测，写入 evidence/qa-core-r2.json。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa');
const SHOT = path.join(OUT, 'screenshots');
const EV = path.join(OUT, 'evidence');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(EV, 'qa-core-r2.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

const result = { startedAt: new Date().toISOString(), checks: {}, timeline: [] };
const check = (name, pass, detail) => {
  result.checks[name] = { pass: !!pass, detail: detail === undefined ? null : detail };
  logf('[CHECK] ' + name + '=' + (pass ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(detail === undefined ? null : detail));
};
const SAVE_FILE = path.join(process.env.XIUXIAN_USER_DATA || '', 'xiuxian-save', 'save.json');

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  const winRef = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => {
    try { return await winRef().webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 200) }; }
  };
  const shot = async (name) => {
    try {
      const img = await winRef().webContents.capturePage();
      fs.writeFileSync(path.join(SHOT, name + '.png'), img.toPNG());
      logf('[shot] ' + name);
    } catch (e) { logf('[shot-fail] ' + name); }
  };
  const dismissAll = `(function(){ var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','#WelcomeContinueBtn','.ux-offline-ok','[data-offline-decision-action]']; for(var i=0;i<sels.length;i++){ var m=document.querySelector(sels[i]); if(m){ m.click(); return sels[i]; } } return null; })()`;

  // ---- Phase 0: 隔离存档 ----
  await wait(3000);
  await run('localStorage.clear(); sessionStorage.clear(); "cleared"');
  await winRef().webContents.reload();
  await wait(6000);
  const fac0 = await run('!!window.__GAME_FACADE__');
  check('boot_facade_ready', fac0 === true, fac0);
  logf('phase0 isolated save cleared');

  // ---- Phase 1: 新玩家创建 ----
  let home = false;
  const t0 = Date.now();
  for (let i = 0; i < 90 && !home; i++) {
    const st = await run(`(function(){
      var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn') || document.querySelector('#V2EventOk');
      if (modal) { modal.click(); return {action:'dismiss'}; }
      var f = window.__GAME_FACADE__, q = null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
      var d = q && q.draft ? q.draft : null;
      if (document.querySelector('.ux91-hero') || document.querySelector('.ux65-stage')) return {action:'home'};
      function click(sel){ var e=document.querySelector(sel); if(!e) return null; if(e.disabled) return 'disabled'; e.click(); return 'ok'; }
      function primary(){ return click('[data-creation-action="advance"]') || click('[data-creation-action="finalize"]') || click('[data-creation-action="start-game"]') || click('[data-creation-action="onboarding-skip"]') || click('[data-creation-action="onboarding-next"]'); }
      var wiz = !!document.querySelector('.v59-creation');
      if (!wiz) { var r = primary(); return r ? {action:'primary'} : {action:'wait'}; }
      if (!d) return {action:'nodraft'};
      var s = d.step;
      if (s==='INDUSTRY'){ if(!d.industry) return {action:'ind',result:click('[data-creation-choice="industry:INTERNET"]')}; }
      else if (s==='DIRECTION'){ if(!d.direction) return {action:'dir',result:click('[data-creation-choice="direction:TECH_RND"]')}; }
      else if (s==='PROFESSION'){ if(!d.professionConfirmed) return {action:'prof',result:click('[data-creation-choice="profession:JAVA_BACKEND"]')}; }
      else if (s==='IDENTITY'){ var inp=document.querySelector('#v59-nickname');
        if(!d.background) return {action:'bg',result:click('[data-creation-choice="background:ORDINARY_WORKER"]')};
        if (inp && inp.value!=='V10QA验收'){ inp.value='V10QA验收'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V10QA验收') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && (st.action === 'home' || st.action === 'primary')) home = true;
    await wait(600);
  }
  const creationMs = Date.now() - t0;
  const charView = await run(`(function(){ var f=window.__GAME_FACADE__; var c=null; try{ c=f.queryCharacterProfile?f.queryCharacterProfile():null; }catch(e){} return c ? { name:c.name, careerLevel:c.careerLevel } : null; })()`);
  check('creation_completed', home === true && charView && charView.name === 'V10QA验收', { ms: creationMs, char: charView });
  await shot('qa-01-home-cave');

  // ---- Phase 2: 洞府五区结构 ----
  const cave = await run(`(function(){
    var q = function(s){ return document.querySelector(s); };
    var goal = q('.ux91-goal'), hero = q('.ux91-hero'), today = q('.ux91-today'), quick = q('.ux91-quick'), res = q('.ux91-res'), bar = q('.ux91-chapter-bar');
    var goalFirst = false;
    try { goalFirst = !!(goal && hero && (goal.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING)); } catch(e){}
    return { res: !!res, goal: !!goal, hero: !!hero, today: !!today, quick: !!quick, chapterBar: !!bar, goalBeforeHero: goalFirst,
      heroSprite: !!document.getElementById('Ux90CaveHero'), goalText: goal ? (goal.innerText||'').slice(0,60) : null };
  })()`);
  check('cave_five_areas', !!(cave.res && cave.goal && cave.hero && cave.today && cave.quick), cave);
  check('cave_goal_first', cave.goalBeforeHero === true, cave.goalBeforeHero);
  check('cave_chapter_bar', cave.chapterBar === true, cave.chapterBar);
  check('cave_hero_sprite', cave.heroSprite === true, cave.heroSprite);
  await shot('qa-02-cave-areas');

  // ---- Phase 3: 战斗页 + 自动战斗真实推进 ----
  const clickNav = (tab) => run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('` + tab + `')>=0){ items[i].click(); return 1; } } var el=document.querySelector('[data-nav="` + tab + `"]'); if(el){el.click(); return 2;} return 0; })()`);
  await clickNav('战斗');
  await wait(1800);
  const b1 = await run(`(function(){
    var f=window.__GAME_FACADE__; var ab=null; try{ ab=f&&f.queryAutoBattle?f.queryAutoBattle():null; }catch(e){}
    return { alive: !!document.getElementById('Ux66EnemySprite'), stage: ab?ab.stage:null, enemyHp: ab&&ab.enemy?ab.enemy.hp:null, kills: ab?ab.totalKills:null, comboField: ab?('comboCount' in ab ? ab.comboCount : 'MISSING') : 'no-ab' };
  })()`);
  check('battle_page_renders', !!(b1.alive && b1.stage !== null), b1);
  check('bundle_combo_field_present', b1.comboField !== 'MISSING' && b1.comboField !== 'no-ab', b1.comboField);
  await shot('qa-03-battle-initial');
  await wait(8000);
  const b2 = await run(`(function(){ var f=window.__GAME_FACADE__; var ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return { stage: ab?ab.stage:null, enemyHp: ab&&ab.enemy?ab.enemy.hp:null, kills: ab?ab.totalKills:null }; })()`);
  check('battle_auto_progresses', (b2.enemyHp !== b1.enemyHp) || (b2.kills !== b1.kills) || (b2.stage !== b1.stage), { before: b1, after: b2 });

  // ---- Phase 4: 点按攻击 + 连击（原子式：FIGHTING 窗口内同步连点并立即读数）----
  let combo = null;
  for (let i = 0; i < 60 && !(combo && combo.comboCount >= 5); i++) {
    combo = await run(`(function(){
      var f=window.__GAME_FACADE__; var ab=null; try{ ab=f.queryAutoBattle(); }catch(e){ return {skip:'no-ab'}; }
      if (!ab || ab.status !== 'FIGHTING') return { skip: ab ? ab.status : 'null' };
      for(var i=0;i<20;i++){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b) b.click(); }
      try{ ab=f.queryAutoBattle(); }catch(e){}
      var el = document.querySelector('.ux65-combo');
      return { comboCount: ab?ab.comboCount:null, comboDom: !!el, comboText: el?(el.innerText||''):null };
    })()`);
    await wait(400);
  }
  check('tap_attack_combo', !!(combo && combo.comboCount >= 5), combo);
  await shot('qa-04-combo');

  // ---- Phase 5: 技能释放 + V9.2 联动 debuff（原子式，FIGHTING 窗口内施放并读数）----
  let skill = null, bombOk = null;
  for (let i = 0; i < 90 && !(skill && bombOk); i++) {
    const r = await run(`(function(){
      var f=window.__GAME_FACADE__, ab=null;
      try{ ab=f.queryAutoBattle(); }catch(e){ return {skip:'no-ab'}; }
      if (!ab || ab.status !== 'FIGHTING') return { skip: ab ? ab.status : 'null' };
      var out = { stage: ab.stage, status: ab.status };
      try { out.code_sword = f.useActiveSkill('code_sword'); } catch(e){ out.code_sword = {err:String(e).slice(0,100)}; }
      if (out.code_sword && !out.code_sword.err && ab.stage >= 5) {
        try { out.bomb = f.useActiveSkill('bug_bomb'); } catch(e){ out.bomb = {err:String(e).slice(0,100)}; }
        try{ ab=f.queryAutoBattle(); }catch(e){}
        out.bugAfter = ab ? ab.enemyBugDebuff : null;
      }
      return out;
    })()`);
    if (r && r.stage !== undefined) {
      if (!skill && r.code_sword && !r.code_sword.err) skill = r;
      if (r.bomb && !r.bomb.err && typeof r.bugAfter === 'number') bombOk = r;
    }
    await wait(400);
  }
  check('skill_usable', !!(skill && skill.code_sword && !skill.code_sword.err), skill);
  check('skill_synergy_bug_debuff', !!(bombOk && bombOk.bugAfter > 0), bombOk);
  await shot('qa-05-skill');

  // ---- Phase 6: 关卡推进 + Boss P2（isBoss 视图字段 + P2 DOM 标签）----
  let bossSeen = null, maxStage = 0, bossPhase2Seen = false, bugDebuffSeen = false;
  const bossDeadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < bossDeadline) {
    await wait(1200);
    const s = await run(`(function(){
      var f=window.__GAME_FACADE__; var ab=null; try{ ab=f.queryAutoBattle(); }catch(e){}
      if(!ab) return null;
      var p2dom = !!document.querySelector('.ux65-debuff--p2');
      return { stage: ab.stage, isBoss: !!(ab.enemy&&ab.enemy.isBoss), hp: ab.enemy&&ab.enemy.hp, maxHp: ab.enemy&&ab.enemy.maxHp, phase2View: !!(ab.enemy&&ab.enemy.phase2Active), p2Dom: p2dom, bug: ab.enemyBugDebuff||0 };
    })()`);
    if (s) {
      if (s.stage > maxStage) { maxStage = s.stage; logf('stage=' + s.stage + ' boss=' + s.isBoss + ' hp=' + s.hp + '/' + s.maxHp); }
      if (s.bug > 0) bugDebuffSeen = true;
      if (s.isBoss) { bossSeen = s; if (s.phase2View || s.p2Dom) { bossPhase2Seen = true; break; } }
      if (s.stage >= 9) break;
    }
  }
  check('stage_progressed', maxStage >= 4, { maxStage: maxStage });
  check('boss_encountered', !!bossSeen, bossSeen);
  check('boss_phase2', bossPhase2Seen, bossSeen);
  check('bug_debuff_observed', bugDebuffSeen, { seen: bugDebuffSeen });
  await shot('qa-06-boss');
  result.timeline.push({ at: new Date().toISOString(), maxStage: maxStage, boss: bossSeen });

  // ---- Phase 7: 养成页 ----
  await clickNav('养成');
  await wait(1800);
  const growth = await run(`(function(){
    var syns = !!document.querySelector('.ux-grow-syns');
    var bodyHas = (document.body.innerText||'');
    return { syns: syns, hire: bodyHas.indexOf('招募')>=0, equip: bodyHas.indexOf('装备')>=0 };
  })()`);
  check('growth_page_renders', growth.syns === true, growth);
  check('growth_hire_equip_present', !!(growth.hire && growth.equip), growth);
  await shot('qa-07-growth');

  // ---- Phase 8: 存档落盘（文件存储）----
  await run('(function(){ var f=window.__GAME_FACADE__; try{ f.saveGame&&f.saveGame(); }catch(e){} return 1; })()');
  await wait(2000);
  let saveInfo = { exists: false };
  try {
    const stt = fs.statSync(SAVE_FILE);
    const raw = fs.readFileSync(SAVE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const inner = parsed['game-save'] && typeof parsed['game-save'] === 'object' ? parsed['game-save'] : parsed;
    saveInfo = { exists: true, size: stt.size, mtime: stt.mtime.toISOString(), hasGameSave: !!parsed['game-save'], saveVersion: inner.saveVersion, name: inner.name, careerLevel: inner.careerLevel };
  } catch (e) { saveInfo = { exists: false, err: String(e.message).slice(0, 120) }; }
  check('save_file_persisted', saveInfo.exists === true && saveInfo.size > 500, saveInfo);
  check('save_has_backup', fs.existsSync(SAVE_FILE.replace('save.json', 'save.backup.json')), {});

  // ---- Phase 9: 重启恢复 ----
  const stageBefore = maxStage;
  await winRef().webContents.reload();
  await wait(9000);
  let recovered = null;
  for (let i = 0; i < 24 && !recovered; i++) {
    await run(dismissAll);
    const v = await run(`(function(){
      var f=window.__GAME_FACADE__; var ab=null; try{ ab=f.queryAutoBattle(); }catch(e){}
      var c=null; try{ c=f.queryCharacterProfile? f.queryCharacterProfile():null; }catch(e){}
      if (!c || !c.name) return null;
      return { name: c.name, stage: ab?ab.stage:null, maxStage: ab?ab.maxStage:null, heroDom: !!document.querySelector('.ux91-hero') };
    })()`);
    if (v && v.name === 'V10QA验收') recovered = v;
    await wait(800);
  }
  check('restart_recovery', !!(recovered && recovered.name === 'V10QA验收'), { after: recovered, expectedMaxStage: stageBefore });
  check('restart_battle_restored', !!(recovered && recovered.maxStage !== null && recovered.maxStage >= 3), recovered);
  await shot('qa-08-restart-recovered');

  // ---- 汇总 ----
  const names = Object.keys(result.checks);
  const failed = names.filter((n) => !result.checks[n].pass);
  result.summary = { total: names.length, passed: names.length - failed.length, failed: failed, verdict: failed.length === 0 ? 'PASS' : 'FAIL' };
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(EV, 'qa-core-r2.json'), JSON.stringify(result, null, 2));
  logf('VERDICT=' + result.summary.verdict + ' passed=' + result.summary.passed + '/' + result.summary.total);
  app.exit(result.summary.verdict === 'PASS' ? 0 : 2);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
