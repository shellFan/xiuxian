/**
 * Minimal headless `cc` module shim for `tsc` / `npm test` / `npm run build`.
 * Tracked in git — must not reference Cocos Editor cache (`temp/`, `library/`, etc.).
 * When the project is opened in Creator, the editor supplies full engine types;
 * this file only augments what headless compilation needs and avoids `any` tokens.
 */
declare module 'cc' {
  /** Inspector property type token for floating-point serialized fields. */
  export class CCFloat {}

  /** Inspector property type token for integer serialized fields. */
  export class CCInteger {}

  export class Node {
    public getChildByName(name: string): Node | null;
    public getComponent<T = unknown>(type: new (...args: never[]) => T | string): T | null;
  }

  export class Component {
    protected onLoad(): void;
    protected start(): void;
    protected onDestroy(): void;
    public readonly node: Node;
    protected update(dt: number): void;
    public destroy(): void;
  }

  type ClassDecorator = <T extends new (...args: never[]) => object>(constructor: T) => T;
  type PropertyDecorator = (target: object, propertyKey: string | symbol) => void;

  export const _decorator: {
    ccclass(name: string): ClassDecorator;
    property(type?: unknown): PropertyDecorator;
  };

  export class UITransform {
    convertToNodeSpaceAR(point: { x: number; y: number; z: number }): { x: number; y: number };
  }

  export const sys: {
    localStorage: {
      getItem(key: string): string | null;
      setItem(key: string, value: string): void;
      removeItem(key: string): void;
    };
  };

  /** Cocos game-level visibility events and lifecycle. */
  export const game: {
    readonly EVENT_HIDE: string;
    readonly EVENT_SHOW: string;
    on(event: string, callback: (...args: unknown[]) => void, target?: unknown): void;
    off(event: string, callback: (...args: unknown[]) => void, target?: unknown): void;
  };
}
