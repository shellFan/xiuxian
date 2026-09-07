/**
 * FloatingRewardComponent — WEB V1 floating reward feedback.
 *
 * Shows brief "+100 💰" style floating text when the player earns
 * resources (salary, cultivation exp, spirit stones).
 * Listens to RESOURCE_CHANGED UI events and displays the delta.
 *
 * Layout: floating text that rises and fades out over 1.5s.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { UiEventCategory, UiEvent } from '../facade/ui-event-types';
import { formatNumber } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces ────────────────────────────────────────────────────

interface TextLike { string: string; }
interface NodeLike {
  active?: boolean;
  isValid?: boolean;
  position?: { x: number; y: number; z?: number };
  children?: readonly NodeLike[];
  getChildByName?: (name: string) => NodeLike | null;
  getComponent?: (type: unknown) => unknown;
  setPosition?: (pos: { x: number; y: number; z?: number }) => void;
}

type TweenLike = {
  to: (duration: number, properties: Record<string, unknown>) => TweenLike;
  call: (callback: () => void) => TweenLike;
  start: () => TweenLike;
  stop: () => void;
};

interface OpacityLike { opacity: number; }

// ── Reward type icons ────────────────────────────────────────────────────────

const REWARD_ICONS: Record<string, string> = {
  salary: '💰',
  cultivation: '⚡',
  spiritStones: '💎',
  mind: '🧠',
  performance: '📊',
};

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('FloatingReward')
export class FloatingRewardComponent extends Component {
  // ── Scene-bound properties ────────────────────────────────────────────────

  /** Pool of floating text nodes (pre-created in scene) */
  @property(resolveCocosType('Node'))
  public floatingPool?: NodeLike;

  /** How many floating items to pool */
  private static readonly POOL_SIZE = 5;

  /** Duration of float animation in seconds */
  private static readonly FLOAT_DURATION = 1.5;

  /** Vertical rise distance */
  private static readonly RISE_DISTANCE = 80;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;
  private poolIndex = 0;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('FloatingRewardComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;
    this.subscribeEvents();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.facade = null;
  }

  // ── Show Floating Reward ──────────────────────────────────────────────────

  /** Show a floating reward text. */
  public showReward(type: string, amount: number): void {
    if (this.disposed) return;

    const icon = REWARD_ICONS[type] ?? '✨';
    const text = `+${formatNumber(amount)} ${icon}`;

    this.showFloatingText(text);
  }

  /** Show arbitrary floating text. */
  public showFloatingText(text: string): void {
    if (!this.floatingPool || this.disposed) return;

    // Get next pool item
    const nodeName = `FloatItem_${this.poolIndex % FloatingRewardComponent.POOL_SIZE}`;
    this.poolIndex++;

    const item = this.floatingPool.getChildByName?.(nodeName);
    if (!item) return;

    // Set text
    const label = this.findLabel(item, 'FloatLabel');
    if (label) label.string = text;

    // Reset position and opacity
    item.active = true;
    const opacity = this.findOpacity(item);
    if (opacity) opacity.opacity = 255;
    if (item.position) {
      item.setPosition?.({ x: item.position.x, y: 0, z: 0 });
    }

    // Animate: rise and fade
    this.animateFloat(item, opacity);
  }

  // ── Animation ─────────────────────────────────────────────────────────────

  private animateFloat(node: NodeLike, opacity: OpacityLike | null): void {
    const factory = (Cocos as unknown as { tween?: (target: object) => TweenLike }).tween;
    if (!factory) {
      // Fallback: just hide after duration
      setTimeout(() => { node.active = false; }, FloatingRewardComponent.FLOAT_DURATION * 1000);
      return;
    }

    const target = { y: 0, opacity: 255 };
    factory(target)
      .to(FloatingRewardComponent.FLOAT_DURATION, {
        y: FloatingRewardComponent.RISE_DISTANCE,
        opacity: 0,
      })
      .call(() => { node.active = false; })
      .start();
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;

    const unsub = this.facade.onUiEvent('RESOURCE_CHANGED', (event: UiEvent) => {
      if (this.disposed) return;
      this.handleResourceChanged(event);
    });
    this.unsubs.push(unsub);

    const unsub2 = this.facade.onUiEvent('REWARD_COMPLETED', (event: UiEvent) => {
      if (this.disposed) return;
      this.handleRewardCompleted(event);
    });
    this.unsubs.push(unsub2);
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  private handleResourceChanged(event: UiEvent): void {
    const detail = event.detail as Record<string, unknown> | undefined;
    if (!detail) return;

    // salaryChanged event
    if (typeof detail.amount === 'number' && detail.amount > 0) {
      const source = event.source;
      if (source === 'salaryChanged') {
        this.showReward('salary', detail.amount as number);
      } else if (source === 'cultivationClicked') {
        this.showReward('cultivation', detail.amount as number);
      }
    }
  }

  private handleRewardCompleted(event: UiEvent): void {
    const detail = event.detail as Record<string, unknown> | undefined;
    if (!detail) return;

    // Task claim rewards
    if (typeof detail.salary === 'number' && detail.salary > 0) {
      this.showReward('salary', detail.salary);
    }
    if (typeof detail.cultivationExp === 'number' && detail.cultivationExp > 0) {
      this.showReward('cultivation', detail.cultivationExp);
    }
    if (typeof detail.spiritStones === 'number' && detail.spiritStones > 0) {
      this.showReward('spiritStones', detail.spiritStones);
    }
  }

  // ── Node Helpers ──────────────────────────────────────────────────────────

  private findLabel(parent: NodeLike, childName: string): TextLike | null {
    const child = parent.getChildByName?.(childName);
    if (!child) return null;
    const comp = child.getComponent?.(resolveCocosType('Label'));
    return (comp as unknown as TextLike) ?? null;
  }

  private findOpacity(parent: NodeLike): OpacityLike | null {
    const comp = parent.getComponent?.(resolveCocosType('UIOpacity'));
    return (comp as unknown as OpacityLike) ?? null;
  }
}