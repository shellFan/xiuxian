import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import test from 'node:test';

const moduleApi = Module as unknown as { _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown };
const loader = moduleApi._load;
const tweenRuns: Array<{ target: any; properties: any; stopped: boolean; finish: () => void }> = [];
const bootstrapStorage = new Map<string, string>();
moduleApi._load = function (request: string, parent: NodeModule | null, isMain: boolean): unknown {
  if (request === 'cc') {
    class MockTween {
      private readonly run: typeof tweenRuns[number];
      public constructor(public readonly target: any) { this.run = { target, properties: {}, stopped: false, finish: () => {} }; tweenRuns.push(this.run); }
      public to(_duration: number, properties: any) { this.run.properties = properties; return this; }
      public call(callback: () => void) { this.run.finish = callback; return this; }
      public start() { return this; }
      public stop() { this.run.stopped = true; }
    }
    return {
      _decorator: { ccclass: () => (target: unknown) => target, property: () => () => {} },
      Component: class {}, Label: class {}, Button: class {}, UITransform: class {}, UIOpacity: class {},
      sys: { localStorage: {
        getItem: (key: string) => bootstrapStorage.get(key) ?? null,
        setItem: (key: string, value: string) => { bootstrapStorage.set(key, value); },
        removeItem: (key: string) => { bootstrapStorage.delete(key); },
      } },
      tween: (target: any) => new MockTween(target),
    };
  }
  return loader.call(this, request, parent, isMain);
};
const { MainView } = require('../../assets/scripts/ui/main-view') as typeof import('../../assets/scripts/ui/main-view');
const { WorkerView } = require('../../assets/scripts/ui/worker-view') as typeof import('../../assets/scripts/ui/worker-view');
const { MergeBoardView } = require('../../assets/scripts/ui/merge-board-view') as typeof import('../../assets/scripts/ui/merge-board-view');
const { ToastView } = require('../../assets/scripts/ui/toast-view') as typeof import('../../assets/scripts/ui/toast-view');
const { FeedbackView } = require('../../assets/scripts/ui/feedback-view') as typeof import('../../assets/scripts/ui/feedback-view');
const { GameBootstrapComponent } = require('../../assets/scripts/core/game-bootstrap-component') as typeof import('../../assets/scripts/core/game-bootstrap-component');
const { GameContext } = require('../../assets/scripts/core/game-context') as typeof import('../../assets/scripts/core/game-context');
const { MemoryStorageAdapter } = require('../../assets/scripts/services/storage-adapter') as typeof import('../../assets/scripts/services/storage-adapter');
moduleApi._load = loader;

test('MainView onLoad uses the GameBootstrapComponent business context', () => {
  bootstrapStorage.clear();
  const bootstrap = new GameBootstrapComponent() as any;
  bootstrap.onLoad();
  const main = new MainView() as any;
  main.node = { parent: { getComponent: (type: unknown) => type === GameBootstrapComponent ? bootstrap : undefined } };

  main.onLoad();

  assert.equal(main.context, bootstrap.context);
  assert.equal(main.context.saveService, bootstrap.context.saveService);
  assert.equal(main.context.economy, bootstrap.context.economy);
  assert.equal(main.context.board, bootstrap.context.board);
  assert.equal(main.context.events, bootstrap.context.events);
  main.recruit();
  assert.equal(bootstrap.context.player.workers.length, 1);
  assert.equal(bootstrap.context.board.getWorker({ row: 0, column: 0 })?.level, 1);
});

test('refreshes labels and worker cards from the authoritative GameContext', () => {
  const context = new GameContext({ storage: new MemoryStorageAdapter() });
  const rank = { string: '' }; const salary = { string: '' };
  const main = new MainView() as any;
  main.rankLabel = rank; main.salaryLabel = salary;
  main.attachContext(context);
  assert.equal(rank.string, '当前职级：实习牛马');
  assert.equal(salary.string, '工资：0');
  assert.equal(main.boardSnapshot.length, 16);
  main.recruit();
  assert.equal(main.boardSnapshot.filter((cell: unknown) => cell !== undefined).length, 1);
  assert.equal(main.boardSnapshot[0].displayText, '🐮 Lv1');
});

test('ToastView presents a message without changing game state and can be stopped safely', () => {
  tweenRuns.length = 0;
  const toast = new ToastView() as any;
  const label = { string: '' };
  const node = { active: false, isValid: true };
  toast.opacity = { opacity: 0 };
  toast.messageLabel = label;
  toast.node = node;
  toast.show('工位满了');
  assert.equal(label.string, '工位满了');
  assert.equal(node.active, true);
  toast.stop();
  assert.equal(node.active, false);
  toast.onDestroy();
  assert.equal(tweenRuns[0].stopped, true);
});

test('FeedbackView uses separate salary and breakthrough nodes and restores merge scale on cancellation', () => {
  tweenRuns.length = 0;
  const feedback = new FeedbackView() as any;
  const salaryLabel = { string: '' };
  const salaryNode = { active: false, isValid: true, position: { x: 0, y: 0, z: 0 } };
  const salaryOpacity = { opacity: 255 };
  const breakthroughNode = { active: false, isValid: true };
  const mergeNode = { active: true, isValid: true, scale: { x: 1, y: 1, z: 1 } };
  feedback.salaryLabel = salaryLabel;
  feedback.salaryOpacity = salaryOpacity;
  feedback.salaryNode = salaryNode;
  feedback.breakthroughNode = breakthroughNode;
  feedback.showSalary(25);
  assert.equal(salaryLabel.string, '+25 工资');
  feedback.showBreakthrough('筑基牛马', 2);
  assert.equal(feedback.lastBreakthrough, '突破：筑基牛马 Lv2');
  assert.equal(salaryNode.active, true);
  assert.equal(breakthroughNode.active, true);
  feedback.playMerge(mergeNode);
  assert.equal(mergeNode.scale.x, 1);
  assert.equal(tweenRuns.some((run) => run.properties.scale), true);
  salaryNode.position = { x: 0, y: 24, z: 0 };
  salaryNode.active = true;
  feedback.showSalary(50);
  assert.deepEqual(salaryNode.position, { x: 0, y: 0, z: 0 });
  assert.equal(salaryOpacity.opacity, 255);
  feedback.playMerge(mergeNode);
  mergeNode.scale = { x: 1.18, y: 1.18, z: 1 };
  feedback.playMerge(mergeNode);
  assert.deepEqual(mergeNode.scale, { x: 1, y: 1, z: 1 });
  feedback.stopTweens();
  assert.deepEqual(mergeNode.scale, { x: 1, y: 1, z: 1 });
  assert.deepEqual(salaryNode.position, { x: 0, y: 0, z: 0 });
  assert.equal(salaryNode.active, false);
  assert.equal(salaryOpacity.opacity, 255);
  assert.equal(breakthroughNode.active, false);
  feedback.onDisable();
  feedback.onDestroy();
  assert.equal(tweenRuns.every((run) => run.stopped), true);
});

test('FeedbackView restores feedback state after tween completion', () => {
  tweenRuns.length = 0;
  const feedback = new FeedbackView() as any;
  const salaryNode = { active: false, isValid: true, position: { x: 3, y: 4, z: 0 } };
  const mergeNode = { active: true, isValid: true, scale: { x: 1, y: 1, z: 1 } };
  feedback.salaryNode = salaryNode;
  feedback.showSalary(10);
  tweenRuns[0].finish();
  assert.deepEqual(salaryNode.position, { x: 3, y: 4, z: 0 });
  assert.equal(salaryNode.active, false);
  feedback.playMerge(mergeNode);
  tweenRuns[tweenRuns.length - 1].finish();
  tweenRuns[tweenRuns.length - 1].finish();
  assert.equal(feedback.mergeScales.size, 0);
  assert.deepEqual(mergeNode.scale, { x: 1, y: 1, z: 1 });
});

test('full board recruitment shows a Toast instead of mutating the board', () => {
  const context = new GameContext({ storage: new MemoryStorageAdapter(), boardRows: 1, boardColumns: 1 });
  const main = new MainView() as any;
  const toast = new ToastView() as any;
  const label = { string: '' };
  toast.messageLabel = label;
  toast.node = { active: false, isValid: true };
  main.toastView = toast;
  main.attachContext(context);
  main.recruit();
  const before = context.board.toSaveData();
  const result = main.recruit();
  assert.equal(result?.success, false);
  assert.deepEqual(context.board.toSaveData(), before);
  assert.equal(label.string, '工位满了');
});

test('WorkerView exposes a model-driven card presentation without owning game state', () => {
  const view = new WorkerView() as any;
  view.refresh({ id: 'worker-test', level: 3 });
  assert.equal(view.workerId, 'worker-test');
  assert.equal(view.level, 3);
  assert.equal(view.displayText, '🐮 Lv3');
  assert.equal(Object.prototype.hasOwnProperty.call(view, 'salary'), false);
});

test('Main.scene declares the core screen nodes and view components', () => {
  const scene = fs.readFileSync('assets/scenes/Main.scene', 'utf8');
  for (const name of ['MainView', 'Title', 'RankLabel', 'SalaryLabel', 'MergeBoard', 'RecruitButton', 'HintLabel', 'Toast', 'Feedback', 'SalaryFeedback', 'BreakthroughFeedback']) {
    assert.match(scene, new RegExp(`_name":"${name}"`));
  }
  assert.match(scene, /MergeBoardView/);
  assert.match(scene, /WorkerView/);
  assert.match(scene, /ToastView/);
  assert.match(scene, /FeedbackView/);
  assert.match(scene, /UIOpacity/);
});

test('Main.scene has a consistent node/component reference graph', () => {
  const scene = JSON.parse(fs.readFileSync('assets/scenes/Main.scene', 'utf8')) as Array<Record<string, any>>;
  const ref = (value: any): Record<string, any> => scene[value.__id__];
  const nodes = scene.filter((item) => item.__type__ === 'cc.Node');
  for (const node of nodes) {
    for (const childRef of node._children ?? []) assert.equal(ref(childRef)._parent.__id__, scene.indexOf(node));
    for (const componentRef of node._components ?? []) assert.equal(ref(componentRef).node.__id__, scene.indexOf(node));
  }
  const main = nodes.find((node) => node._name === 'MainView')!;
  assert.equal(main._parent.__id__, 5);
  assert.equal(main._children.length, 8);
  assert.equal(scene[5]._children.some((child: any) => child.__id__ === scene.indexOf(main)), true);
  assert.equal(scene.find((item) => item.__type__ === 'MainView')!.titleLabel.__id__, 10);
  const mainComponent = scene.find((item) => item.__type__ === 'MainView')!;
  assert.equal(scene[mainComponent.toastView.__id__].node.__id__, scene.find((item) => item.__type__ === 'ToastView')!.node.__id__);
  assert.equal(scene[mainComponent.feedbackView.__id__].node.__id__, scene.find((item) => item.__type__ === 'FeedbackView')!.node.__id__);
  assert.equal(scene.filter((item) => item._name?.startsWith('BoardCell')).length, 16);
  for (const name of ['Title', 'RankLabel', 'SalaryLabel', 'HintLabel']) {
    const node = nodes.find((item) => item._name === name)!;
    assert.equal(node._components.some((component: any) => ref(component).__type__ === 'cc.Label'), true);
  }
  assert.equal(nodes.find((node) => node._name === 'RecruitButton')!._components.some((component: any) => ref(component).__type__ === 'cc.Button'), true);
  const board = nodes.find((node) => node._name === 'MergeBoard')!;
  assert.equal(board._components.map(ref).some((component: any) => component.__type__ === 'cc.Layout'), false);
  assert.equal(board._children.every((child: any) => ref(child)._active === true), true);
  assert.equal(nodes.find((node) => node._name === 'RecruitButton')!._components.some((component: any) => ref(component).__type__ === 'cc.Label'), true);
  const sceneText = fs.readFileSync('assets/scenes/Main.scene', 'utf8');
  assert.match(sceneText, /displayLabel/);
  assert.match(sceneText, /"cellWidth":150/);
});

test('scene assembly binds every worker view and clears an empty cell', () => {
  const context = new GameContext({ storage: new MemoryStorageAdapter() });
  const main = new MainView() as any;
  const button = { listeners: new Map<string, () => void>(), on(event: string, callback: () => void) { this.listeners.set(event, callback); }, off(event: string) { this.listeners.delete(event); } };
  main.recruitButton = button;
  const views = Array.from({ length: 16 }, () => {
    const view = new WorkerView() as any;
    view.node = { active: false, on() {}, off() {}, setPosition() {} };
    return view;
  });
  const board = new (MergeBoardView as any)();
  board.configure({ originX: 0, originY: 0, cellWidth: 1, cellHeight: 1, rows: 4, columns: 4 });
  main.boardView = board;
  main.attachContext(context);
  main.bindWorkerViews(views);
  button.listeners.get('click')!();
  assert.equal(views[0].node.active, true);
  context.board.move({ row: 0, column: 0 }, { row: 0, column: 1 });
  context.syncPlayerWorkers();
  main.refresh();
  assert.equal(views[0].node.active, true);
  assert.equal(views[1].node.active, true);
  assert.equal(views.every((view: any) => view.boardView === board), true);
  main.detachContext();
  assert.equal(views.every((view: any) => view.boardView === undefined), true);
});

test('refresh restores unique fixed cell centers after recruit, move, merge, and cancel', () => {
  const context = new GameContext({ storage: new MemoryStorageAdapter() });
  const main = new MainView() as any;
  const views = Array.from({ length: 16 }, () => {
    const node = { active: false, position: { x: 0, y: 0 }, on() {}, off() {}, setPosition(position: { x: number; y: number }) { this.position = position; } };
    const view = new WorkerView() as any;
    view.node = node;
    return view;
  });
  const board = new (MergeBoardView as any)();
  board.configure({ originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, rows: 4, columns: 4 });
  main.boardView = board;
  main.attachContext(context);
  main.bindWorkerViews(views);

  const positions = () => views.map((view: any) => `${view.node.position.x},${view.node.position.y}`);
  assert.equal(new Set(positions()).size, 16);
  main.recruit();
  assert.equal(new Set(positions()).size, 16);

  const drag = main.getDragController();
  assert.equal(drag.begin(context.board.getWorker({ row: 0, column: 0 })!.id, { row: 0, column: 0 }), true);
  assert.equal(drag.drop({ row: 0, column: 2 }), 'move');
  assert.equal(new Set(positions()).size, 16);

  main.recruit();
  assert.equal(drag.begin(context.board.getWorker({ row: 0, column: 0 })!.id, { row: 0, column: 0 }), true);
  assert.equal(drag.drop({ row: 0, column: 2 }), 'merge');
  assert.equal(new Set(positions()).size, 16);

  assert.equal(drag.begin('missing-worker', { row: 0, column: 0 }), false);
  assert.equal(drag.begin(context.board.getWorker({ row: 0, column: 2 })!.id, { row: 0, column: 2 }), true);
  assert.equal(drag.cancel(), 'restore');
  assert.equal(new Set(positions()).size, 16);
});
