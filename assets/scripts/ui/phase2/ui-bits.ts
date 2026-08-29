import { _decorator, type Component } from 'cc';
import * as Cocos from 'cc';

/** Mirrors the decorator shim used by the existing MainView so Phase 2 UI compiles
 *  without a live Cocos Creator editor (the real decorators are applied at build time). */
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown => (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

export { property, resolveCocosType };

export interface TextLike { string: string; }
export interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
}
export interface SceneNodeLike {
  name?: string;
  children?: readonly SceneNodeLike[];
  parent?: SceneNodeLike;
  active?: boolean;
  getChildByName?: (name: string) => SceneNodeLike | null;
  getComponent?: (type: unknown) => unknown;
}
export type { Component };
