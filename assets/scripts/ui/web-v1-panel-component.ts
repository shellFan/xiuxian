import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

interface GraphicsLike {
  clear(): void;
  rect(x: number, y: number, width: number, height: number): void;
  roundRect?(x: number, y: number, width: number, height: number, radius: number): void;
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

/** Draws one asset-free paper/chrome panel from its scene UITransform. */
@ccclass('WebV1PanelRenderer')
export class WebV1PanelRenderer extends Component {
  protected onLoad(): void {
    this.drawPanel();
  }

  protected onEnable(): void {
    this.drawPanel();
  }

  private drawPanel(): void {
    const node = this.node as unknown as { name?: string; getComponent(type: string): unknown };
    const graphics = node.getComponent('cc.Graphics') as GraphicsLike | null;
    if (!graphics) return;

    const transform = node.getComponent('cc.UITransform') as UITransformLike | null;
    const width = transform?.contentSize?.width ?? 100;
    const height = transform?.contentSize?.height ?? 40;
    graphics.clear();
    const homeCard = /^(Resource.*Chip|CultivateButton|WorkButton|FishButton|IdleIncomePanel)$/.test(node.name ?? '');
    if (homeCard && graphics.roundRect) graphics.roundRect(-width / 2, -height / 2, width, height, 12);
    else graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.stroke();
  }
}
