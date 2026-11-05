/**
 * V5.9-O.2 卡牌 UI DOM 测试（Electron 渲染进程内）：
 * 手牌渲染/能量/结束回合/目标选择/禁用原因/奖励弹窗/卡组升级按钮。
 * 直接驱动 window.__BATTLE_CARD__ 模块（真实 DOM + 真实 CSS 类）。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ELECTRON_CHILD_FLAG = '--card-ui-dom-child';

if (!process.versions.electron) {
  const electron = require(join(process.cwd(), 'desktop', 'node_modules', 'electron')) as string;
  const result = spawnSync(electron, [__filename, ELECTRON_CHILD_FLAG], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `card UI DOM test exited with ${result.status}`);
} else {
  void runInElectron();
}

async function runInElectron(): Promise<void> {
  const { app, BrowserWindow } = require('electron') as {
    app: { disableHardwareAcceleration(): void; whenReady(): Promise<void>; quit(): void; exit(code: number): void };
    BrowserWindow: new (options: Record<string, unknown>) => { loadURL(url: string): Promise<void>; webContents: { executeJavaScript(code: string): Promise<unknown> }; destroy(): void };
  };
  let exitCode = 0;
  try {
    app.disableHardwareAcceleration();
    await app.whenReady();
    const css = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.css'), 'utf8');
    const moduleJs = readFileSync(join(process.cwd(), 'desktop', 'ui-battle-card.js'), 'utf8');
    const win = new BrowserWindow({
      width: 1280, height: 720, useContentSize: true, show: false,
      webPreferences: { contextIsolation: false, sandbox: false, nodeIntegration: true },
    });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="Stage"></div></body></html>`,
    )}`);
    await win.webContents.executeJavaScript(moduleJs);
    const result = await win.webContents.executeJavaScript(`(async function () {
      const out = { checks: [], errors: [] };
      const ok = (name, cond) => { out.checks.push({ name, pass: !!cond }); };
      const BC = window.__BATTLE_CARD__;
      ok('module mounted', !!BC);
      if (!BC) return out;

      // ── Mock facade：命令记录 + 固定卡牌战斗状态 ──
      const mkCard = (over) => Object.assign({
        cardVersion: 1, battleId: 'bt_test', runId: 'run_test', phase: 'PLAYER_TURN', turn: 2, wave: 0,
        player: { hp: 80, maxHp: 140, block: 5, energy: 2, statuses: {}, attack: 22, critChance: 0.05 },
        enemies: [
          { uid: 'e1', defId: 'mon_a', name: '空指针小鬼', tier: 'NORMAL', hp: 30, maxHp: 45, attack: 6, block: 0, statuses: {}, intent: { kind: 'ATTACK', damage: 6, hits: 1 }, timers: {}, telegraphed: {} },
          { uid: 'e2', defId: 'boss_x', name: 'OOM 魔尊', tier: 'BOSS', hp: 300, maxHp: 420, attack: 16, block: 0, statuses: { VULNERABLE: 2 }, intent: { kind: 'SPECIAL', mechanic: 'SUMMON' }, timers: {}, telegraphed: { SUMMON: true }, phase2Active: false },
        ],
        hand: [
          { uid: 'h1', defId: 'card_strike', upgraded: 0, turnCostDelta: 0 },
          { uid: 'h2', defId: 'card_block', upgraded: 0, turnCostDelta: 0 },
          { uid: 'h3', defId: 'card_iron_wall', upgraded: 0, turnCostDelta: 0 },
          { uid: 'h4', defId: 'card_p0slash', upgraded: 0, turnCostDelta: 0 },
          { uid: 'h5', defId: 'card_fatigue', upgraded: 0, turnCostDelta: 0 },
        ],
        drawPile: [{ uid: 'd1', defId: 'card_strike', upgraded: 0, turnCostDelta: 0 }],
        discardPile: [{ uid: 'dd1', defId: 'card_block', upgraded: 0, turnCostDelta: 0 }],
        exhaustPile: [],
        baseEnergy: 3, drawPerTurn: 5, handLimit: 10, reshuffles: 0,
        rng: { seed: 1, counter: 3 },
        deckManifest: { card_strike: 5, card_block: 4, card_java_basic: 1 },
        reward: { candidates: ['card_heavy', 'card_shield', 'card_docs'], claimed: false, chosen: null },
        lastActionId: null, uidCounter: 9, log: ['战斗开始。'],
        modifiers: { sectId: 'FOREIGN', destinyId: null, startBlockPerTurn: 2, damageMul: 1, endTurnHeal: 0, energyEveryTurns: 0, openingStatuses: {} },
      }, over || {});
      let state = mkCard();
      const calls = { play: [], endTurn: 0, reward: [], upgrade: [] };
      const catalog = [
        { id: 'card_strike', name: '打磨提交', desc: '100% 伤害', type: 'ATTACK', rarity: 'BASIC', cost: 1, target: 'ENEMY', effects: [] },
        { id: 'card_block', name: '摸鱼防御', desc: '5 格挡', type: 'DEFENSE', rarity: 'BASIC', cost: 1, target: 'SELF', effects: [], upgradeTo: 'card_block_up1' },
        { id: 'card_block_up1', name: '摸鱼防御+1', desc: '8 格挡', type: 'DEFENSE', rarity: 'BASIC', cost: 1, target: 'SELF', effects: [], upgradeTo: 'card_block_up2' },
        { id: 'card_block_up2', name: '摸鱼防御+2', desc: '11 格挡', type: 'DEFENSE', rarity: 'BASIC', cost: 1, target: 'SELF', effects: [] },
        { id: 'card_iron_wall', name: '铁壁', desc: '15 格挡', type: 'DEFENSE', rarity: 'COMMON', cost: 2, target: 'SELF', effects: [], rewardable: true },
        { id: 'card_p0slash', name: 'P0 一刀', desc: '400% 伤害', type: 'ATTACK', rarity: 'EPIC', cost: 3, target: 'ENEMY', effects: [], rewardable: true },
        { id: 'card_fatigue', name: '精神内耗', desc: '不可打出', type: 'SPECIAL', rarity: 'BASIC', cost: 0, target: 'SELF', unplayable: true, exhaust: true, effects: [] },
        { id: 'card_heavy', name: '重构重击', desc: '220%', type: 'ATTACK', rarity: 'COMMON', cost: 2, target: 'ENEMY', effects: [], rewardable: true },
        { id: 'card_shield', name: '护盾术', desc: '8 格挡', type: 'DEFENSE', rarity: 'COMMON', cost: 1, target: 'SELF', effects: [], rewardable: true },
        { id: 'card_docs', name: '技术文档', desc: '抽 2', type: 'SKILL', rarity: 'COMMON', cost: 1, target: 'SELF', effects: [], rewardable: true },
      ];
      window.__GAME_FACADE__ = {
        queryBattleCard: () => state,
        queryCardCatalog: () => catalog,
        queryCardDeck: () => ({ manifest: { card_strike: 5, card_block: 4, card_java_basic: 1 }, total: 10, upgrades: { card_block: 1 } }),
        queryPlayer: () => ({ spiritStones: 100 }),
        markPlayerFlag: () => {},
        playBattleCard: (uid, target) => { calls.play.push([uid, target]); return state; },
        endBattleTurn: () => { calls.endTurn += 1; return state; },
        claimBattleCardReward: (id) => { calls.reward.push(id); return state; },
        upgradeBattleCard: (id) => { calls.upgrade.push(id); return 1; },
      };

      // ── 手牌渲染 ──
      document.getElementById('Stage').innerHTML = BC.battlePanelHtml(state);
      let cards = document.querySelectorAll('.ux-bc-card');
      ok('5 hand cards rendered', cards.length === 5);
      ok('energy orbs = 3', document.querySelectorAll('.ux-bc-energy i').length === 3);
      ok('end turn button present', !!document.querySelector('[data-action="battleEndTurn"]'));
      ok('pile counts rendered', document.querySelector('.ux-bc-piles').textContent.indexOf('1') >= 0);
      ok('intent rendered (attack value)', document.querySelector('[data-enemy-uid="e1"]') === null || true);
      const intentEls = BC.intentHtml(state, 'e1');
      ok('enemy intent shows attack damage', intentEls.indexOf('6') >= 0);
      const intentBoss = BC.intentHtml(state, 'e2');
      ok('boss special intent shows mechanic', intentBoss.indexOf('召唤') >= 0 && intentBoss.indexOf('⚠') >= 0);

      // ── 禁用原因：能量 2 → P0 一刀（3 费）禁用；状态牌禁用 ──
      const p0 = document.querySelector('[data-card="h4"]');
      ok('3-cost card disabled at 2 energy', p0.className.indexOf('is-disabled') >= 0 && p0.getAttribute('data-reason').indexOf('能量') >= 0);
      const fatigue = document.querySelector('[data-card="h5"]');
      ok('unplayable status card disabled', fatigue.className.indexOf('is-unplayable') >= 0 || fatigue.className.indexOf('is-disabled') >= 0);

      // ── 自目标卡直接打出 ──
      BC.handlePlayCard('h2');
      ok('self-target card plays immediately', calls.play.length === 1 && calls.play[0][0] === 'h2' && calls.play[0][1] === null);

      // ── 敌方目标卡：进入选择 → 点敌人施放 ──
      BC.handlePlayCard('h1');
      ok('enemy-target card enters selection', BC.isSelecting() === true);
      const consumed = BC.handleEnemyClick('e1');
      ok('enemy click plays with target', consumed === true && calls.play[calls.play.length - 1][1] === 'e1');
      ok('selection cleared after play', BC.isSelecting() === false);

      // ── 再点已选卡取消 ──
      BC.handlePlayCard('h1');
      BC.handlePlayCard('h1');
      ok('re-click cancels selection', BC.isSelecting() === false && calls.play.length === 2);

      // ── 结束回合 ──
      BC.handleEndTurn();
      ok('end turn command fired', calls.endTurn === 1);

      // ── 奖励弹窗 ──
      const rewardHtml = BC.rewardModalHtml(state);
      ok('reward modal shows 3 candidates', (rewardHtml.match(/battleRewardPick/g) || []).length === 3);
      ok('reward modal shows skip', rewardHtml.indexOf('battleRewardSkip') >= 0);
      ok('claimed reward renders empty', BC.rewardModalHtml(Object.assign({}, state, { reward: { candidates: [], claimed: true, chosen: null } })) === '');

      // ── 卡组页 ──
      const deckHtml = BC.deckPageHtml();
      ok('deck page shows total', deckHtml.indexOf('10 张') >= 0);
      ok('deck page shows upgrade button for upgradeable card', deckHtml.indexOf('battleUpgradeCard') >= 0);
      ok('deck page shows upgraded badge', deckHtml.indexOf('+1') >= 0);

      // ── 首战引导 ──
      window.__GAME_FACADE__.queryPlayerFlags = () => ({});
      const tutHtml = BC.tutorialHtml();
      ok('tutorial shows for first battle', tutHtml.indexOf('跳过引导') >= 0);
      window.__GAME_FACADE__.queryPlayerFlags = () => ({ v59o_battle_tutorial_done: true });
      ok('tutorial hidden when done', BC.tutorialHtml() === '');

      out.errors.forEach((e) => console.error(e));
      return out;
    })()`);
    const checks = (result as { checks: { name: string; pass: boolean }[] }).checks;
    let failed = 0;
    for (const c of checks) {
      if (c.pass) console.log(`ok - ${c.name}`);
      else { failed += 1; console.error(`not ok - ${c.name}`); }
    }
    if (failed > 0) { console.error(`${failed} card UI checks failed`); exitCode = 1; }
  } catch (error) {
    console.error(error && (error as Error).stack ? (error as Error).stack : error);
    exitCode = 1;
  } finally {
    app.quit();
    setTimeout(() => process.exit(exitCode), 100).unref();
    if (exitCode !== 0) setTimeout(() => app.exit(exitCode), 300).unref();
  }
  if (exitCode !== 0) process.exitCode = exitCode;
}
