/**
 * V8.0 V7.6 TASK-030 — AI NPC 真实模型桥验证。
 *
 * 1. 启动本地 mock MNN 服务（OpenAI 兼容 /v1/chat/completions，返回带
 *    MNN-MOCK 标记的回复）——验证真实 HTTP 模型桥，不下载任何模型。
 * 2. 启动真实游戏（MNN_CHAT_URL 指向 mock）→ 打开 NPC 对话 → 发消息。
 * 3. 读取回复：带 MNN-MOCK 标记 = 模型桥 PASS；否则记录降级状态。
 */
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('node:fs');
const path = require('node:path');

process.env.MNN_CHAT_URL = 'http://127.0.0.1:7860'; // V8.0: 模型桥验证（mock 服务）
require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v80');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v80-npc-probe.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

let mnnHits = 0;
let mnnLastBody = '';
const mnnServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    mnnHits++;
    mnnLastBody = body.slice(0, 200);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'MNN-MOCK回复：模型桥已验证。' } }],
    }));
  });
});

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  await new Promise((r) => mnnServer.listen(7860, '127.0.0.1', r));
  logf('mock MNN server on :7860');
  const result = { mnnHits: 0, replies: [], pass: false };

  await wait(14000);
  const winRef = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => {
    try { return await winRef().webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 150) }; }
  };
  // reach home (compact loop)
  let home = false;
  for (let i = 0; i < 40 && !home; i++) {
    const st = await run(`(function(){
      var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn') || document.querySelector('#V2EventOk');
      if (modal) { modal.click(); return {action:'dismiss'}; }
      var f = window.__GAME_FACADE__, q = null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
      var d = q && q.draft ? q.draft : null;
      if (document.querySelector('.ux65-stage') || document.querySelector('[data-action="v63-tapAttack"]')) return {action:'home'};
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
        if (inp && inp.value!=='V80NPC'){ inp.value='V80NPC'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V80NPC') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && st.action === 'home') home = true;
    await wait(650);
  }
  logf('home=' + home);

  // status check (ai:status via facade bridge)
  const status = await run(`(function(){ var f=window.__GAME_FACADE__; return f&&f.queryAiStatus? f.queryAiStatus() : (window.__AI_STATUS__||null); })()`);
  result.aiStatus = status;
  logf('aiStatus=' + JSON.stringify(status));

  // open NPC page: header shortcut data-page="npc"
  await run(`(function(){ var b=document.querySelector('[data-action="openMessenger"]'); if(b) b.click(); return 1; })()`);
  await wait(1200);
  // find NPC list + open first NPC chat, send a message
  const npcUi = await run(`(function(){
    var send=document.querySelector('[data-ai-send]');
    var npcBtn=document.querySelector('[data-ai-npc]');
    return { send:!!send, npcBtn:!!npcBtn, npcId: npcBtn?npcBtn.getAttribute('data-ai-npc'):null, modeBadge:(document.querySelector('.ux-ai-mode')||{}).innerText||null };
  })()`);
  result.npcUi = npcUi;
  logf('npcUi=' + JSON.stringify(npcUi));
  if (npcUi && npcUi.npcBtn) {
    await run(`(function(){ var b=document.querySelector('[data-ai-npc]'); if(b) b.click(); return 1; })()`);
    await wait(1800);
    const domDump = await run(`(function(){
      var active=document.querySelector('.ux-conv--ai.is-active');
      return { messenger:!!document.querySelector('.ux-messenger'), chatInput:!!document.getElementById('AiChatInput'),
        aiActive: active ? active.getAttribute('data-ai-npc') : null,
        modeBadge:(document.querySelector('.ux-ai-mode')||{}).innerText||null };
    })()`);
    result.domDump = domDump;
    logf('domDump=' + JSON.stringify(domDump));
    // send a battle-related message (rule engine would answer with battle topic text)
    const inputInfo = await run(`(function(){
      var inp=document.getElementById('AiChatInput');
      return { found:!!inp, tag:inp?inp.tagName:null, id:inp?(inp.id||''):'' };
    })()`);
    result.inputInfo = inputInfo;
    logf('input=' + JSON.stringify(inputInfo));
    if (inputInfo && inputInfo.found) {
      await run(`(function(){
        var inp=document.getElementById('AiChatInput');
        inp.value='今天战斗打得怎么样？';
        inp.dispatchEvent(new Event('input',{bubbles:true}));
        inp.dispatchEvent(new Event('change',{bubbles:true}));
        var btn=document.querySelector('[data-ai-send]');
        if(btn) btn.click();
        return 1;
      })()`);
      // wait for reply (model call up to 8s)
      let reply = null;
      for (let i = 0; i < 14; i++) {
        await wait(1000);
        const r = await run(`(function(){
          var msgs=document.querySelectorAll('.ux-chat-bubble--ai');
          var last=msgs.length?msgs[msgs.length-1]:null;
          return { count:msgs.length, last:last?(last.innerText||'').slice(0,120):null };
        })()`);
        if (r && r.last && r.last.indexOf('MNN-MOCK') >= 0) { reply = r.last; break; }
        if (i === 13 && r) reply = r.last;
      }
      result.replies.push(reply);
      result.mnnHits = mnnHits;
      result.mnnLastBody = mnnLastBody;
      result.pass = !!(reply && String(reply).indexOf('MNN-MOCK') >= 0);
      logf('reply=' + reply + ' mnnHits=' + mnnHits);
    }
  }
  fs.writeFileSync(path.join(OUT, 'v80-npc-probe.json'), JSON.stringify(result, null, 2));
  logf('PASS=' + result.pass);
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
