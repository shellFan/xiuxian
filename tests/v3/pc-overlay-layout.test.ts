import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const overlay = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
const css = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.css'), 'utf8');

const desktopStart = css.indexOf('@media (min-width: 900px)');
assert.notEqual(desktopStart, -1, 'PC layout must activate from window width, including tall desktop windows');

const desktopCss = css.slice(desktopStart);
assert.match(desktopCss, /\.ux-home\s*\{[^}]*grid-template-areas/s, 'PC home must use a desktop grid instead of the phone stack');
assert.match(desktopCss, /\.ux-task-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s, 'PC tasks must use compact two-column cards');
assert.match(desktopCss, /\.ux-header\s*\{[^}]*height:\s*62px/s, 'PC header must reserve less vertical space');
assert.match(desktopCss, /\.ux-nav\s*\{[^}]*height:\s*74px/s, 'PC navigation must reserve less vertical space');
assert.match(overlay, /class="ux-task-list"/, 'task renderer must provide a layout container for the PC grid');

console.log('pc overlay layout tests passed');
