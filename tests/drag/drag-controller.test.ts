import assert from 'node:assert/strict';
import test from 'node:test';

import { DragController, DragState } from '../../assets/scripts/game/drag-controller';

test('moves a worker to an empty target and returns to idle', () => {
  const moves: string[] = [];
  const controller = new DragController({
    getWorker: (position) => position.row === 0 && position.column === 0 ? { id: 'a', level: 1 } : undefined,
    onMove: (from, to) => moves.push(`${from.column},${from.row}->${to.column},${to.row}`),
  });
  assert.equal(controller.begin('a', { row: 0, column: 0 }), true);
  assert.equal(controller.drop({ row: 0, column: 1 }), 'move');
  assert.deepEqual(moves, ['0,0->1,0']);
  assert.equal(controller.state, DragState.IDLE);
});

test('restores a worker for an out-of-bounds or different-level target', () => {
  let restored = 0;
  const controller = new DragController({
    getWorker: (position) => position.column === 0 ? { id: 'a', level: 1 } : { id: 'b', level: 2 },
    onRestore: () => { restored += 1; },
  });
  assert.equal(controller.begin('a', { row: 0, column: 0 }), true);
  assert.equal(controller.drop(undefined), 'restore');
  assert.equal(controller.begin('a', { row: 0, column: 0 }), true);
  assert.equal(controller.drop({ row: 0, column: 1 }), 'restore');
  assert.equal(restored, 2);
});

test('locks input while merging and handles an occupied target after the lock clears', () => {
  let merges = 0;
  let occupied = true;
  const controller = new DragController({
    getWorker: (position) => {
      if (position.column === 0) return { id: 'a', level: 2 };
      if (occupied) return { id: 'b', level: 2 };
      return undefined;
    },
    onMerge: () => { merges += 1; }, onMove: () => { /* move accepted */ },
  });
  assert.equal(controller.begin('a', { row: 0, column: 0 }), true);
  assert.equal(controller.drop({ row: 0, column: 1 }), 'merge');
  assert.equal(controller.state, DragState.MERGING);
  assert.equal(controller.drop({ row: 0, column: 1 }), 'ignored');
  assert.deepEqual(controller.sourcePosition, { row: 0, column: 0 });
  assert.equal(controller.begin('a', { row: 0, column: 0 }), false);
  controller.completeMerge();
  occupied = false;
  assert.equal(controller.begin('a', { row: 0, column: 0 }), true);
  assert.equal(controller.drop({ row: 0, column: 1 }), 'move');
  assert.equal(merges, 1);
});

test('rejects a worker whose node/session became invalid', () => {
  const controller = new DragController({ getWorker: () => undefined });
  assert.equal(controller.begin('missing', { row: 0, column: 0 }), false);
  assert.equal(controller.state, DragState.IDLE);
});

test('does not report success or remain locked when callbacks are unavailable', () => {
  const empty = new DragController({ getWorker: (position) => position.column === 0 ? { id: 'a', level: 1 } : undefined });
  assert.equal(empty.begin('a', { row: 0, column: 0 }), true);
  assert.equal(empty.drop({ row: 0, column: 1 }), 'restore');
  assert.equal(empty.state, DragState.IDLE);
  const occupied = new DragController({ getWorker: (position) => position.column === 0 ? { id: 'a', level: 1 } : { id: 'b', level: 1 } });
  assert.equal(occupied.begin('a', { row: 0, column: 0 }), true);
  assert.equal(occupied.drop({ row: 0, column: 1 }), 'restore');
  assert.equal(occupied.state, DragState.IDLE);
});

test('clears its lock when worker lookup or merge callback throws', () => {
  let lookupCount = 0;
  let restored = 0;
  const lookupFailure = new DragController({
    getWorker: () => { lookupCount += 1; if (lookupCount > 1) throw new Error('stale board'); return { id: 'a', level: 1 }; },
  });
  assert.equal(lookupFailure.begin('a', { row: 0, column: 0 }), true);
  assert.equal(lookupFailure.drop({ row: 0, column: 1 }), 'restore');
  assert.equal(lookupFailure.state, DragState.IDLE);
  const mergeFailure = new DragController({
    getWorker: (position) => position.column === 0 ? { id: 'a', level: 1 } : { id: 'b', level: 1 },
    onMerge: () => { throw new Error('merge rejected'); },
    onRestore: () => { restored += 1; },
  });
  assert.equal(mergeFailure.begin('a', { row: 0, column: 0 }), true);
  assert.equal(mergeFailure.drop({ row: 0, column: 1 }), 'restore');
  assert.equal(mergeFailure.state, DragState.IDLE);
  assert.equal(restored, 1);
});
