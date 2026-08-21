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
  const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8')) as Array<Record<string, unknown>>;
  const componentMeta = JSON.parse(fs.readFileSync(componentMetaPath, 'utf8')) as { uuid: string };
  const canvas = scene[2];
  const bootstrapNode = scene[5];
  const bootstrapComponent = scene[6];

  const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const uuid = componentMeta.uuid.replace(/-/g, '');
  const reservedHeadLength = 5;
  let classId = uuid.slice(0, reservedHeadLength);
  for (let index = reservedHeadLength; index < uuid.length; index += 3) {
    const first = Number.parseInt(uuid[index], 16);
    const second = Number.parseInt(uuid[index + 1], 16);
    const third = Number.parseInt(uuid[index + 2], 16);
    classId += base64[(first << 2) | (second >> 2)];
    classId += base64[((second & 3) << 4) | third];
  }

  assert.deepEqual(canvas['_children'], [{ __id__: 5 }]);
  assert.equal(bootstrapNode['_name'], 'GameBootstrap');
  assert.deepEqual(bootstrapNode['_components'], [{ __id__: 6 }]);
  assert.equal(classId, '00000AAAAAAAAAAAAAAAAAD');
  assert.equal(bootstrapComponent['__type__'], classId);
  assert.deepEqual(bootstrapComponent['node'], { __id__: 5 });
  assert.notEqual(bootstrapComponent['__type__'], componentMeta.uuid);
  assert.notEqual(bootstrapComponent['__type__'], 'cc.Component');
  assert.equal(Object.prototype.hasOwnProperty.call(bootstrapComponent, '_script'), false);
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
