import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';

const { ccclass } = _decorator;
const property = (value: unknown): any => { const decorator = _decorator as unknown as { property?: (type: unknown) => any }; return decorator.property ? decorator.property(value) : () => {}; };
const resolveCocosType = (name: string): unknown => (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;
type TweenLike = { to: (duration: number, properties: Record<string, unknown>) => TweenLike; call: (callback: () => void) => TweenLike; start: () => TweenLike; stop: () => void };
interface NodeLike { active?: boolean; isValid?: boolean; getComponent?: (type: unknown) => unknown; }
interface OpacityLike { opacity: number; }
interface LabelLike { string: string; }

@ccclass('ToastView')
export class ToastView extends Component {
  @property(resolveCocosType('Label'))
  public messageLabel?: LabelLike;
  @property(resolveCocosType('UIOpacity'))
  public opacity?: OpacityLike;
  private activeTween?: TweenLike;

  public onLoad(): void {
    const node = this.viewNode;
    const getChild = (node as unknown as { getChildByName?: (name: string) => unknown } | undefined)?.getChildByName;
    const label = getChild?.('ToastLabel');
    if (!this.messageLabel && label) this.messageLabel = (label as { getComponent?: (type: unknown) => unknown }).getComponent?.(resolveCocosType('Label')) as LabelLike | undefined;
    if (!this.opacity) this.opacity = node?.getComponent?.(resolveCocosType('UIOpacity')) as OpacityLike | undefined;
  }

  public show(message: string, duration = 1.2): void {
    this.stopTween();
    const node = this.viewNode;
    if (!node || node.isValid === false) return;
    if (this.messageLabel) this.messageLabel.string = message;
    node.active = true;
    const opacity: OpacityLike = this.opacity ?? node as unknown as OpacityLike;
    opacity.opacity = 255;
    this.activeTween = this.createTween(opacity, duration, { opacity: 0 }, () => { if (node.isValid !== false) node.active = false; });
  }

  public stop(): void { this.stopTween(); const node = this.viewNode; if (node && node.isValid !== false) node.active = false; }
  public onDisable(): void { this.stop(); }
  public onDestroy(): void { this.stop(); }

  private get viewNode(): NodeLike | undefined { return (this as unknown as { node?: NodeLike }).node; }
  private stopTween(): void { this.activeTween?.stop(); this.activeTween = undefined; }
  private createTween(target: object, duration: number, properties: Record<string, unknown>, after: () => void): TweenLike | undefined {
    const factory = (Cocos as unknown as { tween?: (target: object) => TweenLike }).tween;
    if (!factory) return undefined;
    return factory(target).to(duration, properties).call(() => { after(); }).start();
  }
}
