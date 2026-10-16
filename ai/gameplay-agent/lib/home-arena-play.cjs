'use strict';
const fs = require('node:fs');
const path = require('node:path');

function compact(v) { return { stage: v.stage, enemy: v.enemy, kills: v.kills, complete: v.complete, attack: v.attack, combo: v.combo, autoUnlocked: v.autoUnlocked, skillUnlocked: v.skillUnlocked, skillReadyAt: v.skillReadyAt, metrics: v.metrics, rewards: v.rewards }; }
async function waitForArenaSkillButton({ readState, inspect, delay, now = Date.now, timeoutMs = 1000, pollIntervalMs = 50 }) {
  const deadline = now() + timeoutMs;
  let state, target;
  do {
    state = await readState();
    if (!state.skillUnlocked || state.complete || state.skillRemainingMs > 0) return { status: 'not-ready', state, target };
    target = await inspect();
    if (target.found && target.visible && !target.disabled) return { status: 'ready', state, target };
    if (now() >= deadline) break;
    await delay(Math.min(pollIntervalMs, deadline - now()));
  } while (now() < deadline);
  return { status: 'inconsistent', state, target };
}
const observerSource = `(() => {
  const intervals=new Set(), frames=new Set(), si=window.setInterval.bind(window),ci=window.clearInterval.bind(window),raf=window.requestAnimationFrame.bind(window),caf=window.cancelAnimationFrame.bind(window);
  window.setInterval=(...args)=>{const id=si(...args);intervals.add(id);return id;};
  window.clearInterval=id=>{intervals.delete(id);return ci(id);};
  window.requestAnimationFrame=callback=>{const id=raf(t=>{frames.delete(id);callback(t);});frames.add(id);return id;};
  window.cancelAnimationFrame=id=>{frames.delete(id);return caf(id);};
  window.__GAMEPLAY_OBSERVER__=()=>({intervals:intervals.size,animationFrames:frames.size});
})()`;

async function runHomeArena({ step, context, screenshotDir, readFacadeState, inspectElement, inputClick, gracefulClose, launchScenario, delay }) {
  let session = context.session;
  const dir = path.dirname(screenshotDir), tracePath = path.join(dir, 'home-arena-input.jsonl');
  const metricsPath = path.join(dir, 'home-arena-metrics.json');
  const trace = fs.openSync(tracePath, 'a');
  const record = value => fs.writeSync(trace, JSON.stringify(value) + '\n');
  const screenshots = [], stages = [], samples = [], seen = new Set();
  let startedAt, finishedAt, current, beforeRestart, afterRestart, inputCount = 0;
  const exceptions = [];
  async function screenshot(name) {
    const file = path.join(screenshotDir, String(context.imageCounter++).padStart(3, '0') + '-arena-' + name + '.png');
    await session.screenshot(file); screenshots.push(path.relative(context.runDir, file).replace(/\\/g, '/'));
  }
  async function waitReady() {
    const deadline = Date.now() + 35000;
    do { try { if (await session.evaluate('!!window.__GAME_FACADE__?.queryHomeArena && !!document.querySelector("#ArenaAttack")')) return; } catch (_) {} await delay(100); } while (Date.now() < deadline);
    throw new Error('NOT_VERIFIED: home arena did not become ready after renderer restart');
  }
  async function sample() {
    await session.send('HeapProfiler.collectGarbage');
    const heap = await session.send('Runtime.getHeapUsage');
    const dom = await session.send('Memory.getDOMCounters');
    const ui = await session.evaluate('({arena:window.__HOME_ARENA__?.diagnostics(),timers:window.__GAMEPLAY_OBSERVER__?.(),focused:document.hasFocus(),hidden:document.hidden})');
    const item = { elapsedMs: Date.now() - startedAt, heap, dom, ui, arena: compact(await readFacadeState(session, 'queryHomeArena')) };
    samples.push(item); record({ type: 'performance-sample', ...item });
    if (!ui.arena || ui.arena.floatingNodes > 24 || ui.arena.animationLoops !== 1) throw new Error('home arena visual pool or animation loop bound violated');
    return item;
  }
  try {
    await session.send('Page.bringToFront');
    if (step.action === 'homeArenaSoak') {
      await session.evaluate('window.__GAME_FACADE__.save()');
      await session.send('Page.addScriptToEvaluateOnNewDocument', { source: observerSource });
      await session.send('Page.reload', {}); await waitReady();
    }
    const seed = await session.evaluate('window.__XIUXIAN_TEST__?.seed');
    if (seed !== step.seed) throw new Error('NOT_VERIFIED: controlled isolated-profile test seed is missing or differs from the scenario');
    current = await readFacadeState(session, 'queryHomeArena');
    if (current.stage !== 1 || current.complete) throw new Error('SETUP_BLOCKED: five-stage scenario must begin with a new campaign');
    startedAt = Date.now(); stages.push({ stage: 1, startedAt, endedAt: null });
    await screenshot('first-second');
    let nextClickAt = Date.now(), nextSampleAt = startedAt + 60000;
    const limit = step.action === 'homeArenaSoak' ? step.durationMs : 600000;
    while (Date.now() - startedAt < limit) {
      const previous = current;
      await session.send('Page.bringToFront');
      current = await readFacadeState(session, 'queryHomeArena');
      if (current.complete && !seen.has('five-complete')) { seen.add('five-complete'); stages.at(-1).endedAt = Date.now(); await screenshot('five-stages-complete'); }
      if (current.complete && step.action === 'homeArenaPlay') break;
      if (current.complete) {
        const completedRewards = JSON.stringify(current.rewards);
        const interaction = await inputClick(session, '#ArenaReplay');
        record({ type: 'click', elapsedMs: Date.now() - startedAt, selector: '#ArenaReplay', interaction, before: compact(current) });
        current = await readFacadeState(session, 'queryHomeArena');
        if (JSON.stringify(current.rewards) !== completedRewards) throw new Error('practice replay duplicated campaign rewards');
      }
      if (current.stage !== stages.at(-1).stage && stages.length < 5) {
        stages.at(-1).endedAt = Date.now(); stages.push({ stage: current.stage, startedAt: Date.now(), endedAt: null });
        await screenshot('stage-' + current.stage);
      }
      if (current.enemy.elite && !seen.has('elite')) { seen.add('elite'); await screenshot('elite'); }
      if (current.skillUnlocked && current.skillRemainingMs === 0 && !current.complete) {
        const readiness = await waitForArenaSkillButton({
          readState: () => readFacadeState(session, 'queryHomeArena'),
          inspect: () => inspectElement(session, '#ArenaStorm'),
          delay,
        });
        current = readiness.state;
        if (readiness.status === 'inconsistent') {
          const diagnostics = await session.evaluate(`(() => {
            const button=document.querySelector('#ArenaStorm'), facade=window.__GAME_FACADE__;
            return {focused:document.hasFocus(),hidden:document.hidden,modal:document.querySelector('#PopupLayer .ux-modal-layer')?.innerText??null,
              button:button?{disabled:button.disabled,ariaDisabled:button.getAttribute('aria-disabled'),text:button.innerText,outerHTML:button.outerHTML,style:getComputedStyle(button).cssText}:null,
              authoritative:facade?.queryHomeArena?.()??null};
          })()`);
          const error = new Error('GAME_DEFECT: authoritative home arena reports the skill ready, but the visible code-storm button remained disabled for 1 second');
          error.failureClass = 'GAME_DEFECT';
          error.diagnostics = { selector: '#ArenaStorm', authoritative: readiness.state, inspectedTarget: readiness.target, renderer: diagnostics };
          record({ type: 'skill-ready-ui-mismatch', elapsedMs: Date.now() - startedAt, ...error.diagnostics });
          throw error;
        }
        if (readiness.status === 'not-ready') continue;
        const interaction = await inputClick(session, '#ArenaStorm');
        record({ type: 'click', elapsedMs: Date.now() - startedAt, selector: '#ArenaStorm', interaction, before: compact(current), after: compact(await readFacadeState(session, 'queryHomeArena')) });
        if (!seen.has('storm')) { seen.add('storm'); await screenshot('code-storm'); }
      }
      const before = await readFacadeState(session, 'queryHomeArena');
      if (before.complete) continue;
      let interaction;
      try { interaction = await inputClick(session, '#ArenaAttack'); }
      catch (error) {
        current = await readFacadeState(session, 'queryHomeArena');
        if (!current.complete) throw error;
        record({ type: 'completion-during-input', elapsedMs: Date.now() - startedAt, error: error.message, after: compact(current) });
        continue;
      }
      inputCount++;
      current = await readFacadeState(session, 'queryHomeArena');
      record({ type: 'click', index: inputCount, elapsedMs: Date.now() - startedAt, selector: '#ArenaAttack', interaction, before: compact(before), after: compact(current) });
      if (current.metrics.attacks <= before.metrics.attacks && !current.complete) {
        const ui = await session.evaluate('({focused:document.hasFocus(),hidden:document.hidden,arena:window.__GAME_FACADE__.queryHomeArena(),popup:document.querySelector("#PopupLayer")?.innerText})');
        throw Object.assign(new Error(!ui.focused || ui.hidden ? 'ENVIRONMENT: game window lost focus during input' : 'home attack input produced no accepted authoritative hit'), { diagnostics: ui });
      }
      if (current.metrics.totalKills && !seen.has('kill')) { seen.add('kill'); await screenshot('first-kill'); }
      if (current.metrics.crits && !seen.has('crit')) { seen.add('crit'); await screenshot('first-critical'); }
      if (Date.now() - startedAt >= 60000 && !seen.has('minute1')) { seen.add('minute1'); await screenshot('first-minute'); }
      if (Date.now() - startedAt >= 300000 && !seen.has('minute5')) { seen.add('minute5'); await screenshot('fifth-minute'); }
      if (Date.now() >= nextSampleAt) {
        const item = await sample(); await screenshot('minute-' + Math.floor(item.elapsedMs / 60000));
        process.stdout.write('[home-arena] ' + Math.floor(item.elapsedMs / 60000) + ' min; accepted clicks=' + current.metrics.attacks + '; JS heap=' + Math.round(item.heap.usedSize / 1048576) + ' MiB; DOM=' + item.dom.nodes + '\n');
        nextSampleAt += 60000;
      }
      nextClickAt = Math.max(nextClickAt + step.clickIntervalMs, Date.now() + 60);
      await delay(Math.max(0, nextClickAt - Date.now()));
    }
    finishedAt = Date.now();
    if (step.action === 'homeArenaSoak') await sample();
    if (!seen.has('five-complete')) throw new Error('five-stage campaign did not finish within the bounded play duration');
    if (stages[0].endedAt - stages[0].startedAt < 15000 || stages[0].endedAt - stages[0].startedAt > 25000) throw new Error('first-stage active completion time outside 15–25 seconds: ' + (stages[0].endedAt - stages[0].startedAt));
    if (!current.metrics.crits || current.metrics.maxCombo < 5 || !current.metrics.autoAttacks || !current.metrics.skillUses || !current.rewards.materials.mat_bug_crystal) throw new Error('campaign did not exercise critical/combo/auto/skill/real elite rewards');
    if (step.action === 'homeArenaSoak') {
      if (finishedAt - startedAt < 1200000 || samples.length < 19) throw new Error('NOT_VERIFIED: twenty real minutes of stability evidence were not collected');
      const baseline = samples[1], final = samples.at(-1);
      if (!final.ui.timers || final.ui.timers.intervals > baseline.ui.timers.intervals + 2 || final.ui.timers.animationFrames > baseline.ui.timers.animationFrames + 2) throw new Error('timer or animation-frame registrations grew during soak');
      if (final.heap.usedSize - baseline.heap.usedSize > 64 * 1048576 || final.dom.nodes - baseline.dom.nodes > 250 || final.dom.jsEventListeners - baseline.dom.jsEventListeners > 64) throw new Error('retained heap, DOM nodes or event listener count grew beyond the soak bounds');
    }
    if (!current.complete) await inputClick(session, '#ArenaPause');
    beforeRestart = await readFacadeState(session, 'queryHomeArena');
    exceptions.push(...session.messages.filter(item => item.type === 'exception'));
    await gracefulClose(session, context.child);
    Object.assign(context, await launchScenario(context.exe, context.profile, context.logPath, screenshotDir));
    session = context.session; await waitReady();
    afterRestart = await readFacadeState(session, 'queryHomeArena');
    for (const key of ['stage', 'kills', 'hp', 'complete', 'rewards', 'clearedStages', 'skillReadyAt']) if (JSON.stringify(beforeRestart[key]) !== JSON.stringify(afterRestart[key])) throw new Error('restart did not preserve authoritative home arena field ' + key);
    await screenshot('restart-recovery');
    exceptions.push(...session.messages.filter(item => item.type === 'exception'));
    if (exceptions.length) throw Object.assign(new Error('renderer exception during home arena play'), { diagnostics: exceptions });
    return { detail: 'Five real UI stages, ' + inputCount + ' paced clicks, ' + Math.round((finishedAt - startedAt) / 1000) + ' real seconds; saved state recovered after EXE restart', value: { seed: step.seed, startedAt, finishedAt, durationMs: finishedAt - startedAt, stages: stages.map(s => ({ ...s, durationMs: s.endedAt - s.startedAt })), metrics: beforeRestart.metrics, rewards: beforeRestart.rewards, samples, screenshots }, evidence: path.relative(context.runDir, metricsPath).replace(/\\/g, '/') };
  } finally {
    fs.closeSync(trace);
    fs.writeFileSync(metricsPath, JSON.stringify({ seed: step.seed, startedAt, finishedAt: finishedAt ?? Date.now(), inputCount, stages, samples, screenshots, finalState: current, beforeRestart, afterRestart }, null, 2));
  }
}
module.exports = { runHomeArena, waitForArenaSkillButton };
