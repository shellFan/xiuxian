#!/usr/bin/env node
/**
 * Cocos Creator 3.x UUID compression utility.
 * Converts standard UUID (8-4-4-4-12) to compressed format used in .scene files.
 *
 * Cocos algorithm:
 *   1. Remove hyphens → 32 hex chars
 *   2. Keep first 5 hex chars as-is (prefix)
 *   3. Remaining 27 hex chars → 9 groups of 3 hex → 9 pairs of Base64 chars
 *   4. Each group: 3 hex chars (12 bits) → high 6 bits + low 6 bits → 2 Base64 chars
 *   5. Result: 5 prefix + 18 Base64 = 23 chars total
 */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function compressUuid(uuid) {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`Invalid UUID hex length: ${hex.length} for ${uuid}`);

  // First 5 hex chars kept as-is
  const prefix = hex.substring(0, 5);
  const tail = hex.substring(5); // 27 hex chars

  // Encode tail: 9 groups of 3 hex chars → 9 pairs of Base64 chars
  let compressed = prefix;
  for (let i = 0; i < 27; i += 3) {
    const group = parseInt(tail.substring(i, i + 3), 16); // 12 bits
    compressed += BASE64[(group >> 6) & 0x3f]; // high 6 bits
    compressed += BASE64[group & 0x3f];         // low 6 bits
  }
  return compressed;
}

// Generate a proper UUID v4
function generateUuid() {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4'; // version 4
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4 | 0) + 8]; // variant 10xx
    } else {
      uuid += hex[Math.random() * 16 | 0];
    }
  }
  return uuid;
}

// CLI: pass UUIDs as arguments, or --generate N to generate N new UUIDs
const args = process.argv.slice(2);
if (args[0] === '--generate') {
  const count = parseInt(args[1] || '1', 10);
  for (let i = 0; i < count; i++) {
    const uuid = generateUuid();
    console.log(`${uuid} → ${compressUuid(uuid)}`);
  }
} else if (args.length > 0) {
  for (const uuid of args) {
    try {
      console.log(`${uuid} → ${compressUuid(uuid)}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
    }
  }
} else {
  // Verify known mappings from existing scene + meta files
  const known = [
    ['ca7eea41-44b3-492a-97bc-076e499a275f', 'game-bootstrap-component.ts', 'yn7qQUSzSSqXvAduSZonXw?'],
    ['b31501e8-6d7f-4119-964f-03c0cbae45cb', 'cocos-bootstrap-component.ts', null],
    ['1e5d1ce1-9bc9-456e-b907-d1c5e665a656', 'main-view.ts', '1e5d1zhm8lFbrkH0cXmZaZW?'],
    ['eb568879-2d62-4203-b897-bf86ccec92d6', 'phase2-root-component.ts', 'eb568h5LWJCA7iXv4bM7JLW'],
    ['ecdc80a3-a623-4a2d-963c-66cc776d3378', 'safe-area-service.ts', null],
  ];
  console.log('Verifying known UUID → compressed mappings:');
  for (const [uuid, name, expected] of known) {
    const result = compressUuid(uuid);
    const match = expected ? (result === expected ? '✓ MATCH' : `✗ MISMATCH (expected ${expected})`) : '';
    console.log(`  ${name}: ${uuid} → ${result} ${match}`);
  }
}