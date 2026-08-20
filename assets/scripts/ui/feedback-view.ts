import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';

const { ccclass } = _decorator;
const property = (value: unknown): any => { const decorator = _decorator as unknown as { property?: (type: unknown) => any }; return decorator.property ? decorator.property(value) : () => {}; };
const resolveCocosType = (name: string): unknown => (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;
type TweenLike = { to: (duration: number, properties: Record<string, unknown>) => TweenLike; call: (callback: () => void) => TweenLike; start: () => TweenLike; stop: () => void };
interface Scale { x: number; y: number; z: number; }
interface Position { x: number; y: number; z: number; }
interface NodeLike { active?: boolean; isValid?: boolean; scale?: Scale; position?: Position; }
interface OpacityLike { opacity: number; }
interface LabelLike { string: string; }

@ccclass('FeedbackView')
export class FeedbackView extends Component {
  @property(resolveCocosType('Node')) public salaryNode?: NodeLike;
  @property(resolveCocosType('Label')) public salaryLabel?: LabelLike;
  @property(resolveCocosType('UIOpacity')) public salaryOpacity?: OpacityLike;
  @property(resolveCocosType('Node')) public breakthroughNode?: NodeLike;
  @property(resolveCocosType('Label')) public breakthroughLabel?: LabelLike;
  @property(resolveCocosType('UIOpacity')) public breakthroughOpacity?: OpacityLike;
  public lastBreakthrough = '';
  private readonly tweens = new Set<TweenLike>();
  private readonly mergeScales = new Map<NodeLike, Scale>();
  private readonly mergeTweens = new Map<NodeLike, Set<TweenLike>>();
  private readonly channelTweens = new Map<NodeLike, Set<TweenLike>>();
  private readonly channelPositions = new Map<NodeLike, Position>();
  private readonly channelOpacities = new Map<NodeLike, { target: OpacityLike; value: number }>();

  public onLoad(): void {
    const root = this.viewNode;
    const child = (name: string): NodeLike | undefined => (root as unknown as { getChildByName?: (name: string) => NodeLike | null } | undefined)?.getChildByName?.(name) ?? undefined;
    this.salaryNode ??= child('SalaryFeedback');
    this.breakthroughNode ??= child('BreakthroughFeedback');
  }

  public playMerge(target?: NodeLike): void {
    if (!target || target.isValid === false) return;
    this.stopMergeTween(target);
    const original = { ...(target.scale ?? { x: 1, y: 1, z: 1 }) };
    this.mergeScales.set(target, original);
    this.startTween(target, 0.12, { scale: { x: original.x * 1.18, y: original.y * 1.18, z: original.z } }, () => {
      this.startTween(target, 0.16, { scale: original }, () => { this.mergeScales.delete(target); }, target);
    }, target);
  }

  public showSalary(amount: number): void {
    if (!Number.isFinite(amount)) return;
    this.stopChannel(this.salaryNode);
    if (this.salaryLabel) this.salaryLabel.string = `+${amount} 工资`;
    const node = this.salaryNode;
    if (!node || node.isValid === false) return;
    node.active = true;
    const start = { ...(node.position ?? { x: 0, y: 0, z: 0 }) };
    const opacity = this.salaryOpacity ?? node as unknown as OpacityLike;
    this.channelPositions.set(node, start);
    this.channelOpacities.set(node, { target: opacity, value: opacity.opacity });
    opacity.opacity = 255;
    this.startTween(node, 0.8, { position: { x: start.x, y: start.y + 48, z: start.z } }, () => {
      this.restoreChannelState(node);
    }, undefined, node);
    this.startTween(opacity as unknown as NodeLike, 0.8, { opacity: 0 }, () => { this.restoreChannelState(node); }, undefined, node);
  }

  public showBreakthrough(rankName: string, level: number): void {
    this.lastBreakthrough = `突破：${rankName} Lv${level}`;
    if (this.breakthroughLabel) this.breakthroughLabel.string = this.lastBreakthrough;
    const node = this.breakthroughNode;
    if (!node || node.isValid === false) return;
    this.stopChannel(node);
    node.active = true;
    const opacity = this.breakthroughOpacity;
    if (opacity) {
      this.channelOpacities.set(node, { target: opacity, value: opacity.opacity });
      opacity.opacity = 255;
    }
  }

  public stopTweens(): void {
    for (const animation of this.tweens) animation.stop();
    this.tweens.clear();
    for (const [node, scale] of this.mergeScales) { if (node.isValid !== false) node.scale = { ...scale }; }
    for (const node of this.channelPositions.keys()) this.restoreChannelState(node);
    for (const node of [this.salaryNode, this.breakthroughNode]) if (node) this.restoreChannelState(node);
    this.mergeScales.clear();
    this.mergeTweens.clear();
    this.channelTweens.clear();
    this.channelPositions.clear();
    this.channelOpacities.clear();
  }
  public onDisable(): void { this.stopTweens(); }
  public onDestroy(): void { this.stopTweens(); for (const node of [this.salaryNode, this.breakthroughNode]) if (node && node.isValid !== false) node.active = false; }

  private get viewNode(): NodeLike | undefined { return (this as unknown as { node?: NodeLike }).node; }
  private stopMergeTween(target: NodeLike): void {
    for (const animation of this.mergeTweens.get(target) ?? []) { animation.stop(); this.tweens.delete(animation); }
    this.mergeTweens.delete(target);
    const scale = this.mergeScales.get(target);
    if (scale && target.isValid !== false) target.scale = { ...scale };
    this.mergeScales.delete(target);
  }
  private stopChannel(node?: NodeLike): void {
    if (!node) return;
    for (const animation of this.channelTweens.get(node) ?? []) { animation.stop(); this.tweens.delete(animation); }
    this.channelTweens.delete(node);
    this.restoreChannelState(node);
  }
  private restoreChannelState(node: NodeLike): void {
    if (node.isValid === false) return;
    const position = this.channelPositions.get(node);
    if (position) node.position = { ...position };
    const opacity = this.channelOpacities.get(node);
    if (opacity) opacity.target.opacity = opacity.value;
    node.active = false;
  }
  private startTween(target: object, duration: number, properties: Record<string, unknown>, after?: () => void, mergeTarget?: NodeLike, channel?: NodeLike): void {
    const factory = (Cocos as unknown as { tween?: (target: object) => TweenLike }).tween;
    if (!factory) return;
    let animation: TweenLike;
    animation = factory(target).to(duration, properties).call(() => { this.tweens.delete(animation); if (mergeTarget) this.mergeTweens.get(mergeTarget)?.delete(animation); if (channel) this.channelTweens.get(channel)?.delete(animation); after?.(); }).start();
    this.tweens.add(animation);
    if (mergeTarget) { let animations = this.mergeTweens.get(mergeTarget); if (!animations) { animations = new Set(); this.mergeTweens.set(mergeTarget, animations); } animations.add(animation); }
    if (channel) { let animations = this.channelTweens.get(channel); if (!animations) { animations = new Set(); this.channelTweens.set(channel, animations); } animations.add(animation); }
  }
}
