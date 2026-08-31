import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { EventBus } from '../../assets/scripts/core/event-bus';
import { GameBootstrap } from '../../assets/scripts/core/game-bootstrap';
import { GameConfig } from '../../assets/scripts/core/game-config';
import { SystemClock, FixedClock, FakeClock } from '../../assets/scripts/core/clock';
import { MathRandomProvider, FixedRandomProvider, SequenceRandomProvider } from '../../assets/scripts/core/random-provider';

function testClockImplementations(): void {
  assert.equal(typeof new SystemClock().now(), 'number');
  assert.equal(new FixedClock(123).now(), 123);
  const fake = new FakeClock(10);
  fake.advance(5);
  assert.equal(fake.now(), 15);
}

function testRandomProviderImplementations(): void {
  assert.equal(new MathRandomProvider().next() >= 0, true);
  assert.equal(new FixedRandomProvider(0.25).next(), 0.25);
  const sequence = new SequenceRandomProvider([0.1, 0.9]);
  assert.deepEqual([sequence.next(), sequence.next(), sequence.next()], [0.1, 0.9, 0.1]);
}

function testGameConfig(): void {
  assert.equal(GameConfig.designWidth, 720);
  assert.equal(GameConfig.designHeight, 1280);
  assert.equal(GameConfig.boardColumns, 4);
  assert.equal(GameConfig.boardRows, 4);
}

function testEventBus(): void {
  const bus = new EventBus<{ salaryChanged: number }>();
  const values: number[] = [];
  const listener = (value: number) => values.push(value);
  bus.on('salaryChanged', listener);
  bus.emit('salaryChanged', 10);
  bus.off('salaryChanged', listener);
  bus.emit('salaryChanged', 20);
  assert.deepEqual(values, [10]);
}

function testGameBootstrapLifecycle(): void {
  const bootstrap = new GameBootstrap();
  assert.equal(bootstrap.lifecycle, 'created');
  bootstrap.start();
  assert.equal(bootstrap.lifecycle, 'started');
  bootstrap.destroy();
  assert.equal(bootstrap.lifecycle, 'destroyed');
}

function testGameBootstrapOwnsOneBusinessContextAndEventBus(): void {
  const bootstrap = new GameBootstrap();
  assert.equal(bootstrap.context instanceof Object, true);
  const context = bootstrap.context as any;
  assert.equal(context.events, bootstrap.events);
  assert.equal(context.economy.context, context);
}

testGameConfig();
testEventBus();
testGameBootstrapOwnsOneBusinessContextAndEventBus();
testClockImplementations();
testRandomProviderImplementations();

function testMainSceneBootstrapContract(): void {
  const scenePath = path.resolve(__dirname, '../../../../assets/scenes/Main.scene');
  const componentMetaPath = path.resolve(__dirname, '../../../../assets/scripts/core/game-bootstrap-component.ts.meta');
  const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8')) as Array<Record<string, any>>;
  const componentMeta = JSON.parse(fs.readFileSync(componentMetaPath, 'utf8')) as { uuid: string };

  // Cocos Creator 3.8.4 compressUuid (keep first 5 hex, base64-encode the rest).
  const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const HEX: Record<string, number> = {};
  for (let i = 0; i < 16; i++) HEX[i.toString(16)] = i;
  const uuid = componentMeta.uuid;
  let classId = uuid.slice(0, 5);
  const clean = uuid.replace(/-/g, '');
  for (let index = 5; index < clean.length; index += 3) {
    const first = HEX[clean[index]];
    const second = HEX[clean[index + 1]];
    const third = HEX[clean[index + 2]];
    classId += base64[(first << 2) | (second >> 2)];
    classId += base64[((second & 3) << 4) | third];
  }

  // Index-agnostic: locate the GameBootstrap node by name (Cocos may re-index on re-serialize).
  const bootstrapNode = scene.find((o) => o && o._name === 'GameBootstrap');
  assert.ok(bootstrapNode, 'GameBootstrap node must exist in the scene');
  assert.equal(bootstrapNode!['__type__'], 'cc.Node', 'GameBootstrap must be a Node');
  const compRefs = (bootstrapNode!['_components'] as ReadonlyArray<{ __id__: number }>) ?? [];
  assert.ok(compRefs.length >= 1, 'GameBootstrap node must carry at least one component');
  const bootstrapComponent = scene[compRefs[0].__id__];
  assert.equal(bootstrapComponent['__type__'], classId, 'bootstrap component __type__ must be the compressed meta uuid');
  assert.deepEqual(bootstrapComponent['node'], { __id__: scene.indexOf(bootstrapNode!) }, 'bootstrap component node back-ref must match its node');
  assert.notEqual(bootstrapComponent['__type__'], componentMeta.uuid);
  assert.notEqual(bootstrapComponent['__type__'], 'cc.Component');
  assert.equal(Object.prototype.hasOwnProperty.call(bootstrapComponent, '_script'), false);

  // The GameBootstrap node must hang under the Canvas node (parent/child back-refs resolve).
  const parentRef = bootstrapNode!['_parent'] as { __id__: number } | undefined;
  assert.ok(parentRef, 'GameBootstrap node must have a parent');
  const parentNode = scene[parentRef!.__id__];
  assert.equal(parentNode['_name'], 'Canvas', 'GameBootstrap parent must be the Canvas node');
  const parentChildren = (parentNode['_children'] as ReadonlyArray<{ __id__: number }>) ?? [];
  assert.ok(parentChildren.some((c) => c.__id__ === scene.indexOf(bootstrapNode!)), 'Canvas must list GameBootstrap as a child');
}

function testCocosBootstrapLifecycleAdapterContract(): void {
  const adapterPath = path.resolve(__dirname, '../../../../assets/scripts/core/game-bootstrap-component.ts');
  const adapter = fs.readFileSync(adapterPath, 'utf8');

  assert.match(adapter, /extends Component/);
  assert.match(adapter, /new GameBootstrap\(/);
  assert.match(adapter, /onLoad\(\)/);
  assert.match(adapter, /\.start\(\)/);
  assert.match(adapter, /onDestroy\(\)/);
  assert.match(adapter, /\.destroy\(\)/);
}
testGameBootstrapLifecycle();
testMainSceneBootstrapContract();
testCocosBootstrapLifecycleAdapterContract();
console.log('foundation tests passed');
