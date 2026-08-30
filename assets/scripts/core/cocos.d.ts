declare module 'cc' {
  export class Node {
    public getChildByName(name: string): Node | null;
    public getComponent(type: any): any;
  }

  export class Component {
    protected onLoad(): void;
    protected onDestroy(): void;
    public readonly node: Node;
  }

  export const _decorator: {
    ccclass(name: string): <T extends new (...args: never[]) => object>(constructor: T) => T;
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
}
