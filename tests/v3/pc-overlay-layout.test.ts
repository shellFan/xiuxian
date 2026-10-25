import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const overlay = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
const css = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.css'), 'utf8');

const desktopStart = css.indexOf('@media (min-width: 900px)');
assert.notEqual(desktopStart, -1, 'PC layout must activate from window width, including tall desktop windows');

const desktopCss = css.slice(desktopStart);
assert.match(desktopCss, /\.ux-home\s*\{[^}]*grid-template-areas/s, 'PC home must use a desktop grid instead of the phone stack');
assert.match(desktopCss, /grid-template-areas:[^'"]*'topbar topbar topbar'\s*'left center right'/s, 'scheme B home grid keeps topbar/left/center/right areas');
assert.match(desktopCss, /\.ux-task-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s, 'PC tasks must use compact two-column cards');
assert.match(desktopCss, /\.ux-header\s*\{[^}]*height:\s*62px/s, 'PC header must reserve less vertical space');
assert.match(desktopCss, /\.ux-nav\s*\{[^}]*height:\s*64px/s, 'scheme B bottom navigation must stay at 64px (§52)');
assert.match(desktopCss, /\.ux-body--home\s*\{[^}]*overflow:\s*hidden/s, 'home body must never scroll (§116)');
assert.match(desktopCss, /\.ux-scene-count\s*\{[^}]*font-size:\s*5\dpx/s, 'off-work countdown stays the dominant number (§14)');
assert.match(desktopCss, /\.ux-action\.is-selected/, 'action cards must expose a selected state (§82)');
assert.match(css, /prefers-reduced-motion/, 'reduced motion preference must be respected (§145)');
assert.match(overlay, /class="ux-task-list"/, 'task renderer must provide a layout container for the PC grid');
assert.match(overlay, /data-select-action=/, 'home must render the four action selector cards (§28)');
assert.match(overlay, /data-detail-type=/, 'detail panel must expose its action type for regression tests (§87)');
assert.match(overlay, /ux-topbar-shortcuts/, 'header must expose compact quick entries (§6)');
// V5.9-N.11+ 导航重做:五项(首页/任务/项目/晋升/更多),修仙并入首页一键行动卡;
// 底部导航断言随之收窄为"四项主功能必须钉住",修仙入口由首页行动卡断言兜底。
assert.match(overlay, /NAV_TABS = \[[^\]]*TASKS[^\]]*PROJECT[^\]]*PROMOTION/s, 'bottom navigation must pin 任务/项目/晋升 (§52 重做)');
assert.match(overlay, /data-action="mode" data-mode="CULTIVATION"|修炼一次/, 'cultivation entry must live on the home action cards (§52 重做)');

console.log('pc overlay layout tests passed');
