import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import test from 'node:test';

const moduleApi = Module as unknown as { _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown };
const loader = moduleApi._load;
moduleApi._load = function (request: string, parent: NodeModule | null, isMain: boolean): unknown {
  if (request === 'cc') return { _decorator: { ccclass: () => (target: unknown) => target, property: () => () => {} }, Component: class {}, Label: class {}, Button: class {}, UITransform: class {} };
  return loader.call(this, request, parent, isMain);
};
const { MainView } = require('../../assets/scripts/ui/main-view') as typeof import('../../assets/scripts/ui/main-view');
const { WorkerView } = require('../../assets/scripts/ui/worker-view') as typeof import('../../assets/scripts/ui/worker-view');
const { MergeBoardView } = require('../../assets/scripts/ui/merge-board-view') as typeof import('../../assets/scripts/ui/merge-board-view');
const { GameContext } = require('../../assets/scripts/core/game-context') as typeof import('../../assets/scripts/core/game-context');
const { MemoryStorageAdapter } = require('../../assets/scripts/services/storage-adapter') as typeof import('../../assets/scripts/services/storage-adapter');
moduleApi._load = loader;

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
  for (const name of ['MainView', 'Title', 'RankLabel', 'SalaryLabel', 'MergeBoard', 'RecruitButton', 'HintLabel']) {
    assert.match(scene, new RegExp(`_name":"${name}"`));
  }
  assert.match(scene, /MergeBoardView/);
  assert.match(scene, /WorkerView/);
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
  assert.equal(main._children.length, 6);
  assert.equal(scene[5]._children.some((child: any) => child.__id__ === scene.indexOf(main)), true);
  assert.equal(scene.find((item) => item.__type__ === 'MainView')!.titleLabel.__id__, 10);
  assert.equal(scene.filter((item) => item._name?.startsWith('BoardCell')).length, 16);
  for (const name of ['Title', 'RankLabel', 'SalaryLabel', 'HintLabel']) {
    const node = nodes.find((item) => item._name === name)!;
    assert.equal(node._components.some((component: any) => ref(component).__type__ === 'cc.Label'), true);
  }
  assert.equal(nodes.find((node) => node._name === 'RecruitButton')!._components.some((component: any) => ref(component).__type__ === 'cc.Button'), true);
  const board = nodes.find((node) => node._name === 'MergeBoard')!;
  const layout = board._components.map(ref).find((component: any) => component.__type__ === 'cc.Layout');
  assert.equal(layout._layoutType, 3);
  assert.equal(layout._spacingX, 15);
  assert.equal(layout._spacingY, 15);
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
