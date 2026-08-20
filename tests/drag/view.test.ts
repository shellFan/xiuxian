import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';

const MockUITransform = class UITransform {};
const moduleApi = Module as unknown as { _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown };
const loader = moduleApi._load;
moduleApi._load = function (request: string, parent: NodeModule | null, isMain: boolean): unknown {
  if (request === 'cc') return { _decorator: { ccclass: () => (target: unknown) => target }, Component: class {}, UITransform: MockUITransform };
  return loader.call(this, request, parent, isMain);
};const { MergeBoardView } = require('../../assets/scripts/ui/merge-board-view') as typeof import('../../assets/scripts/ui/merge-board-view');
const { WorkerView } = require('../../assets/scripts/ui/worker-view') as typeof import('../../assets/scripts/ui/worker-view');
moduleApi._load = loader;

test('uses transformed UI coordinates and parent-local worker positions', () => {
  const board = new MergeBoardView();
  board.configure({ originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, rows: 2, columns: 2,
    screenToBoardLocal: (p) => ({ x: (p.x - 100) / 2, y: (p.y - 50) / 2 }),
    boardLocalToScreen: (p) => ({ x: p.x * 2 + 100, y: p.y * 2 + 50 }),
    screenToWorkerParent: (p) => ({ x: p.x - 10, y: p.y - 20 }) });
  assert.deepEqual(board.targetPosition({ x: 121, y: 61 }), { row: 0, column: 1 });
  const positions: Array<{ x: number; y: number; z: number }> = [];
  const node = { parent: { getComponent: (type: unknown) => type === MockUITransform ? { convertToNodeSpaceAR: (point: { x: number; y: number; z: number }) => ({ x: point.x - 10, y: point.y - 20 }) } : null }, on() {}, off() {}, setPosition(p: { x: number; y: number; z: number }) { positions.push(p); } };
  const worker = new WorkerView() as any; worker.node = node; worker.workerId = 'a';
  const { DragController } = require('../../assets/scripts/game/drag-controller') as typeof import('../../assets/scripts/game/drag-controller');
  worker.bind(board, new DragController({ getWorker: () => ({ id: 'a', level: 1 }) }));
  worker.setBoardPosition({ row: 1, column: 0 });
  assert.deepEqual(positions, [{ x: 100, y: 60, z: 0 }]);
});

test('cancels by touch id even after the worker node becomes invalid', () => {
  let restored = 0; const listeners = new Map<string, (e: { getID: () => number; getUILocation: () => { x: number; y: number } }) => void>();
  const node = { isValid: true, on(event: string, listener: (e: { getID: () => number; getUILocation: () => { x: number; y: number } }) => void) { listeners.set(event, listener); }, off() {} };
  const board = new MergeBoardView(); board.configure({ originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, rows: 1, columns: 1 });
  const { DragController, DragState } = require('../../assets/scripts/game/drag-controller') as typeof import('../../assets/scripts/game/drag-controller');
  const worker = new WorkerView() as any; worker.node = node; worker.workerId = 'a';
  worker.bind(board, new DragController({ getWorker: () => ({ id: 'a', level: 1 }), onRestore: () => { restored += 1; } }));
  const event = { getID: () => 7, getUILocation: () => ({ x: 5, y: 5 }) }; listeners.get('touch-start')!(event); node.isValid = false; listeners.get('touch-end')!(event);
  assert.equal(restored, 1); assert.equal((worker as unknown as { controller?: { state: string } }).controller?.state ?? DragState.IDLE, DragState.IDLE);
});

test('restores the cached worker-parent source point when the board becomes invalid', () => {
  const listeners = new Map<string, (e: { getID: () => number; getUILocation: () => { x: number; y: number } }) => void>();
  const positions: Array<{ x: number; y: number; z: number }> = [];
  const parent = { getComponent: (type: unknown) => type === MockUITransform ? { convertToNodeSpaceAR: (point: { x: number; y: number; z: number }) => ({ x: point.x - 100, y: point.y - 200 }) } : null };
  const node = { parent, isValid: true, on(event: string, listener: (e: { getID: () => number; getUILocation: () => { x: number; y: number } }) => void) { listeners.set(event, listener); }, off() {}, setPosition(position: { x: number; y: number; z: number }) { positions.push(position); } };
  const board = new MergeBoardView(); board.configure({ originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, rows: 1, columns: 2 });
  const { DragController } = require('../../assets/scripts/game/drag-controller') as typeof import('../../assets/scripts/game/drag-controller');
  const worker = new WorkerView() as any; worker.node = node; worker.workerId = 'a';
  worker.bind(board, new DragController({ getWorker: (position) => position.column === 0 ? { id: 'a', level: 1 } : undefined }));
  const start = { getID: () => 1, getUILocation: () => ({ x: 5, y: 5 }) };
  listeners.get('touch-start')!(start);
  listeners.get('touch-move')!({ getID: () => 1, getUILocation: () => ({ x: 15, y: 5 }) });
  (board as unknown as { node: { isValid: boolean } }).node = { isValid: false };
  listeners.get('touch-end')!(start);
  assert.deepEqual(positions[positions.length - 1], { x: -95, y: -195, z: 0 });
});
test('converts UI location through the actual worker parent container', () => {
  const converted: Array<{ x: number; y: number; z: number }> = [];
  const UITransform = MockUITransform;
  const parent = { getComponent: (type: unknown) => type === UITransform ? { convertToNodeSpaceAR: (point: { x: number; y: number; z: number }) => { converted.push(point); return { x: point.x - 300, y: point.y - 400 }; } } : null };
  const listeners = new Map<string, (event: { getID: () => number; getUILocation: () => { x: number; y: number } }) => void>();
  const positions: Array<{ x: number; y: number; z: number }> = [];
  const node = { parent, isValid: true, on(event: string, listener: (event: { getID: () => number; getUILocation: () => { x: number; y: number } }) => void) { listeners.set(event, listener); }, off() {}, setPosition(position: { x: number; y: number; z: number }) { positions.push(position); } };
  const board = new MergeBoardView(); board.configure({ originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, rows: 1, columns: 1 });
  const worker = new WorkerView() as any; worker.node = node; worker.workerId = 'a';
  const { DragController } = require('../../assets/scripts/game/drag-controller') as typeof import('../../assets/scripts/game/drag-controller');
  worker.bind(board, new DragController({ getWorker: () => ({ id: 'a', level: 1 }), onRestore: () => {} }));
  listeners.get('touch-start')!({ getID: () => 1, getUILocation: () => ({ x: 5, y: 5 }) });
  listeners.get('touch-move')!({ getID: () => 1, getUILocation: () => ({ x: 350, y: 450 }) });
  assert.deepEqual(converted[converted.length - 1], { x: 350, y: 450, z: 0 });
  assert.deepEqual(positions, [{ x: 50, y: 50, z: 0 }]);
});

test('clears the active touch after a throwing restore and ignores secondary touches', () => {
  const listeners = new Map<string, (event: { getID: () => number; getUILocation: () => { x: number; y: number } }) => void>();
  const node = { isValid: true, on(event: string, listener: (event: { getID: () => number; getUILocation: () => { x: number; y: number } }) => void) { listeners.set(event, listener); }, off() {}, setPosition() {} };
  const board = new MergeBoardView(); board.configure({ originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, rows: 1, columns: 1 });
  const worker = new WorkerView() as any; worker.node = node; worker.workerId = 'a';
  const { DragController } = require('../../assets/scripts/game/drag-controller') as typeof import('../../assets/scripts/game/drag-controller');
  worker.bind(board, new DragController({ getWorker: () => ({ id: 'a', level: 1 }), onRestore: () => { throw new Error('restore failed'); } }));
  listeners.get('touch-start')!({ getID: () => 1, getUILocation: () => ({ x: 5, y: 5 }) });
  listeners.get('touch-move')!({ getID: () => 2, getUILocation: () => ({ x: 5, y: 5 }) });
  listeners.get('touch-end')!({ getID: () => 1, getUILocation: () => ({ x: 20, y: 20 }) });
  listeners.get('touch-start')!({ getID: () => 3, getUILocation: () => ({ x: 5, y: 5 }) });
  assert.equal((worker as unknown as { activeTouchId?: number }).activeTouchId, 3);
});
