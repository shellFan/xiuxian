import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

type SceneRef = { __id__: number };
type SceneObject = {
  __type__?: string;
  _name?: string;
  _parent?: SceneRef;
  _children?: SceneRef[];
  _components?: SceneRef[];
  _spriteFrame?: { __uuid__?: string } | null;
  _string?: string;
  [key: string]: unknown;
};

function findProjectRoot(start: string): string {
  let directory = path.resolve(start);
  while (directory !== path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, 'assets', 'scenes', 'Main.scene'))) return directory;
    directory = path.dirname(directory);
  }
  throw new Error('Could not locate project root for Main.scene');
}

const projectRoot = findProjectRoot(__dirname);
const generatorSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'rebuild-scene.cjs'), 'utf8');
const scene = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'scenes', 'Main.scene'), 'utf8')) as SceneObject[];

const HOME_ART = {
  character: 'assets/textures/ui/home/home-character.png',
  background: 'assets/textures/ui/home/home-office-background.png',
} as const;

const HOME_ART_NODES = {
  character: 'CharacterIconLabel',
  background: 'CharacterBackdrop',
} as const;

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}]/u;

function nodeNamed(name: string): { index: number; node: SceneObject } {
  const index = scene.findIndex((object) => object.__type__ === 'cc.Node' && object._name === name);
  assert.ok(index >= 0, `${name} must exist in Main.scene`);
  return { index, node: scene[index] };
}

function componentOf(node: SceneObject, type: string): SceneObject {
  const component = (node._components ?? [])
    .map((ref) => scene[ref.__id__])
    .find((object) => object?.__type__ === type);
  assert.ok(component, `${node._name} must have ${type}`);
  return component!;
}

function spriteFrameUuid(node: SceneObject, role: string): string {
  const sprite = componentOf(node, 'cc.Sprite');
  const frame = sprite._spriteFrame;
  assert.ok(frame && typeof frame.__uuid__ === 'string', `${role} must reference a SpriteFrame`);
  assert.ok(frame.__uuid__, `${role} SpriteFrame reference must not be empty`);
  return frame.__uuid__!;
}

function generatorSpriteFrameUuid(relativePath: string): string {
  const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = generatorSource.match(
    new RegExp(`path:\\s*['"]${escapedPath}['"][\\s\\S]{0,240}?spriteFrameUuid:\\s*['"]([^'"]+)['"]`),
  );
  assert.ok(match, `home generator must declare a SpriteFrame UUID for ${relativePath}`);
  return match[1];
}

function assertDirectChild(parentName: string, childIndex: number, childName: string): void {
  const parent = nodeNamed(parentName);
  assert.equal(scene[childIndex]._parent?.__id__, parent.index, `${childName} must be a child of ${parentName}`);
  assert.ok(
    (parent.node._children ?? []).some((ref) => ref.__id__ === childIndex),
    `${parentName} must list ${childName} as a child`,
  );
}

test('home art files exist at the official asset paths', () => {
  for (const relativePath of Object.values(HOME_ART)) {
    const assetPath = path.join(projectRoot, relativePath);
    assert.ok(fs.existsSync(assetPath), `${relativePath} must exist`);
    assert.ok(fs.statSync(assetPath).isFile(), `${relativePath} must be a file`);
  }
});

test('home generator declares the official art paths and creates resource nodes', () => {
  for (const relativePath of Object.values(HOME_ART)) {
    assert.ok(generatorSource.includes(relativePath), `home generator must reference ${relativePath}`);
    generatorSpriteFrameUuid(relativePath);
  }

  assert.match(generatorSource, /b\.addSprite\(characterBackdropIdx,\s*spriteFrameRef\(HOME_ASSETS\.background\)\)/);
  assert.match(generatorSource, /b\.addSprite\(characterIconIdx,\s*spriteFrameRef\(HOME_ASSETS\.character\)\)/);
});

test('Main.scene uses sprite resource nodes for the home character and office background', () => {
  const character = nodeNamed(HOME_ART_NODES.character);
  const background = nodeNamed(HOME_ART_NODES.background);

  assertDirectChild('CharacterArea', character.index, character.node._name ?? 'home character');
  assertDirectChild('CharacterArea', background.index, background.node._name ?? 'home background');

  assert.equal(
    spriteFrameUuid(character.node, 'home character'),
    generatorSpriteFrameUuid(HOME_ART.character),
    'Main.scene character SpriteFrame must match the official generator asset',
  );
  assert.equal(
    spriteFrameUuid(background.node, 'home office background'),
    generatorSpriteFrameUuid(HOME_ART.background),
    'Main.scene background SpriteFrame must match the official generator asset',
  );
});

test('CharacterIconLabel is not the home character emoji visual', () => {
  assert.doesNotMatch(
    generatorSource,
    /addTextNode\(\s*['"]CharacterIconLabel['"]\s*,\s*['"][^'"]*[\u{1F300}-\u{1FAFF}]/u,
    'home generator must not create CharacterIconLabel from an emoji',
  );

  const characterIcon = nodeNamed(HOME_ART_NODES.character).node;
  const label = (characterIcon._components ?? [])
    .map((ref) => scene[ref.__id__])
    .find((object) => object?.__type__ === 'cc.Label');
  assert.equal(label, undefined, 'CharacterIconLabel must not use a Label as its visual');
  assert.doesNotMatch(JSON.stringify(label ?? ''), EMOJI_RE, 'CharacterIconLabel must not contain an emoji visual');
});
