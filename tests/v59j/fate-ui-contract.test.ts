import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync('desktop/ui-home-arena.js', 'utf8');
const style = readFileSync('desktop/ui-home-arena.css', 'utf8');
const overlayV2 = readFileSync('desktop/ui-overlay-v2.js', 'utf8');

assert.match(script, /id="FateEventCard"/);
assert.match(script, /queryFateEvent\(/);
assert.match(script, /queryFateEventOptions\(/);
assert.match(script, /resolveFateEvent\(/);
assert.match(script, /dataset\.fateChoice/);
assert.match(script, /textContent\s*=\s*choice\.text/);
assert.match(script, /aria-live="polite"/);
assert.match(script, /data-fate-choice/);
assert.match(script, /fate-event-card/);
assert.match(style, /\.fate-event-card[^}]*position:absolute/);
assert.match(style, /\.fate-event-card[^}]*right:/);
assert.match(script, /attack\.disabled\s*=\s*!v\.ready\s*\|\|\s*v\.complete\s*\|\|\s*paused/);
assert.match(script, /id="FateRunPanel"/);
assert.match(script, /data-fate-challenge/);
assert.match(script, /data-fate-talent/);
assert.match(script, /rebirthFateRun\(/);
assert.match(script, /settleFateRun\(/);
const criticalMessageHandler = overlayV2.slice(
  overlayV2.indexOf("H.$$('[data-critical-conv]', layer)"),
  overlayV2.indexOf('/* ── V5 事故副本入口横幅', overlayV2.indexOf("H.$$('[data-critical-conv]', layer)")),
);
assert.ok(criticalMessageHandler.indexOf('openMessenger') < criticalMessageHandler.indexOf('H.closePopup()'),
  'message navigation must finish before popup close schedules battle-result redispatch');
assert.ok(criticalMessageHandler.indexOf('markConversationRead(conv)') < criticalMessageHandler.indexOf('openMessenger'),
  'selecting a critical conversation must clear its unread badge so it cannot starve battle settlement');
console.log('v59j fate UI contract tests passed');
