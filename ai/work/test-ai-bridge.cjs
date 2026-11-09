// Quick AI bridge smoke test
const ai = require('../../desktop/ai-bridge.cjs');

async function main() {
  const s = ai.getStatus();
  console.log('status:', JSON.stringify(s));

  const r = await ai.chat('master', '我要怎么修炼？', { combo: 3, fatigue: 20, promoAllowed: false });
  console.log('mode:', r.mode);
  console.log('reply:', r.reply.substring(0, 80));

  const r2 = await ai.chat('boss', '今天加班工资怎么算？', { combo: 0, fatigue: 80, promoAllowed: true });
  console.log('mode2:', r2.mode);
  console.log('reply2:', r2.reply.substring(0, 80));

  const list = ai.getNpcList();
  console.log('npcs:', list.map(n => n.name).join(','));

  const g = ai.getGreeting('senior');
  console.log('greeting:', g.substring(0, 50));

  ai.clearHistory('master');
  console.log('cleared master history OK');

  console.log('AI-BRIDGE-SMOKE-PASS');
  process.exit(0);
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });