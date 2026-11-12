/** V7.0 TASK-069: verify the packaged app.asar contains all V7.0 content. */
'use strict';
const asar = require('../../desktop/node_modules/@electron/asar');
const path = require('path');

const p = 'dist/牛马修仙传-win32-x64/resources/app.asar';
const J = path.sep; // windows: backslash inside asar listing
function read(f) { return asar.extractFile(p, f.split('/').join(J)).toString('utf8'); }

const checks = {};
try { const css = read('build/web-desktop/ui-overlay.css'); checks.css_persistent_battle = css.includes('战斗舞台常驻'); checks.css_toast_moved = css.includes('Toast 移至舞台下沿'); } catch (e) { checks.css_err = e.message.slice(0, 90); }
try { const js = read('build/web-desktop/ui-overlay.js'); checks.js_notifyPopupClosed = js.includes('notifyPopupClosed'); checks.js_battleSkillCandidate = js.includes('battle-skill:'); checks.js_preserveBattle = js.includes('preservedBattle'); checks.js_grace = js.includes('_homeGraceUntil'); } catch (e) { checks.js_err = e.message.slice(0, 90); }
try { const ab = read('build/web-desktop/ui-auto-battle.js'); checks.js_battleSignature = ab.includes('battleSignature'); checks.js_hireCost = ab.includes('ux63-hire-cost'); checks.js_gotoUppercase = ab.includes("H.goto('PROJECT')"); } catch (e) { checks.ab_err = e.message.slice(0, 90); }
try { const bc = read('build/web-desktop/ui-battle-card.js'); checks.card_dbg_removed = !bc.includes('BC-DBG'); } catch (e) { checks.bc_err = e.message.slice(0, 90); }
try { const main = read('build/web-desktop/assets/main/index.js'); checks.svc_creationGate = main.includes('isCreationGated'); checks.svc_powerCurve = main.includes('recommendedPowerFor'); checks.svc_battleSkillKind = main.includes('BATTLE_SKILL'); checks.svc_deferNextEvent = main.includes('deferNextEvent'); } catch (e) { checks.svc_err = e.message.slice(0, 90); }
try { const mf = JSON.parse(read('build/web-desktop/.xiuxian-build-manifest.json')); checks.manifest_gitHead = mf.gitHead.slice(0, 7); checks.manifest_at = mf.generatedAt; } catch (e) { checks.manifest_err = e.message.slice(0, 90); }
try { const list = asar.listPackage(p); checks.sprite_sheet_count = list.filter((f) => /sheets[\\/]scene?_?[\\/\w-]*\.png$/.test(f) && f.includes('sprites')).length; checks.patch_html_has_sprite_copy = read('patch-html.cjs').includes('sprites'); } catch (e) { checks.sheets_err = e.message.slice(0, 90); }
console.log(JSON.stringify(checks, null, 1));
