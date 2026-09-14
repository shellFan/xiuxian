import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

interface GraphicsLike {
  clear(): void;
  rect(x: number, y: number, width: number, height: number): void;
  fill(): void;
  stroke(): void;
}

interface SizeLike {
  readonly width: number;
  readonly height: number;
}

interface UITransformLike {
  readonly contentSize?: SizeLike;
}

/** Draws the static background geometry for one Craft board cell. */
@ccclass('BoardCellRenderer')
export class BoardCellRenderer extends Component {
  protected onLoad(): void {
    this.drawBackground();
  }

  protected onEnable(): void {
    this.drawBackground();
  }

  private drawBackground(): void {
    const getComponentByName = this.node as unknown as { getComponent(type: string): unknown };
    const graphics = getComponentByName.getComponent('cc.Graphics') as GraphicsLike | null;
    if (!graphics) return;

    const transform = getComponentByName.getComponent('cc.UITransform') as UITransformLike | null;
    const width = transform?.contentSize?.width ?? 112;
    const height = transform?.contentSize?.height ?? 82;
    graphics.clear();
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.stroke();
  }
}
