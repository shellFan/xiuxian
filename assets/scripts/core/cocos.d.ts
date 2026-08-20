declare module 'cc' {
  export class Component {
    protected onLoad(): void;
    protected onDestroy(): void;
  }

  export const _decorator: {
    ccclass(name: string): <T extends new (...args: never[]) => object>(constructor: T) => T;
  };

  export class UITransform {
    convertToNodeSpaceAR(point: { x: number; y: number; z: number }): { x: number; y: number };
  }
}
