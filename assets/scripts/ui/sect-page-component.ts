/**
 * SectPageComponent — PC V1 sect (宗门) page.
 *
 * Displays the four sects (民企/外企/国企/大厂) with their bonuses,
 * current sect membership, cooldown timer, and join/switch button.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │ 宗门                                 │
 *   │ 当前宗门: 大厂宗  剩余CD: 0s         │
 *   │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
 *   │ │民企 │ │外企 │ │国企 │ │大厂 │    │
 *   │ │+20% │ │+15% │ │+10% │ │+25% │    │
 *   │ │工资 │ │修为 │ │道心 │ │绩效 │    │
 *   │ └─────┘ └─────┘ └─────┘ └─────┘    │
 *   │ [加入/切换宗门]                      │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { SectConfig } from '../model/config-types';
import type { UiEventCategory } from '../facade/ui-event-types';
import { formatNumber } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces ────────────────────────────────────────────────────

interface TextLike { string: string; active?: boolean; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}
interface NodeLike {
  active?: boolean;
  name?: string;
  children?: readonly NodeLike[];
  getChildByName?: (name: string) => NodeLike | null;
  getComponent?: (type: unknown) => unknown;
}

// ── Refresh categories ───────────────────────────────────────────────────────

const SECT_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'BUFF_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('SectPage')
export class SectPageComponent extends Component {
  // ── Scene-bound properties ──────────────────────────────────────────────

  /** Current sect name label */
  @property(resolveCocosType('Label'))
  public currentSectLabel?: TextLike;

  /** Cooldown label */
  @property(resolveCocosType('Label'))
  public cooldownLabel?: TextLike;

  /** Sect card nodes (4 cards: 民企, 外企, 国企, 大厂) */
  @property([resolveCocosType('Node')])
  public sectCards: NodeLike[] = [];

  /** Sect card name labels */
  @property([resolveCocosType('Label')])
  public sectNameLabels: TextLike[] = [];

  /** Sect card bonus labels */
  @property([resolveCocosType('Label')])
  public sectBonusLabels: TextLike[] = [];

  /** Join/switch sect button */
  @property(resolveCocosType('Button'))
  public joinButton?: ButtonLike;

  // ── Internal state ──────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;
  private selectedSectId: string | null = null;

  // ── Cocos Lifecycle ─────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('SectPageComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;
    this.subscribeEvents();
    this.bindButtons();
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.facade = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  public refresh(): void {
    if (!this.facade || this.disposed) return;

    const currentSect = this.facade.querySect();
    const allSects = this.facade.querySects();

    // Current sect
    if (this.currentSectLabel) {
      this.currentSectLabel.string = currentSect ? `当前宗门: ${currentSect.name}` : '未加入宗门';
    }

    // Cooldown
    if (this.cooldownLabel) {
      this.cooldownLabel.string = ''; // Sect switch CD handled by facade if needed
    }

    // Sect cards
    for (let i = 0; i < allSects.length && i < this.sectCards.length; i++) {
      const sect = allSects[i];
      const card = this.sectCards[i];
      if (card) card.active = true;

      if (i < this.sectNameLabels.length && this.sectNameLabels[i]) {
        this.sectNameLabels[i].string = sect.name;
      }
      if (i < this.sectBonusLabels.length && this.sectBonusLabels[i]) {
        this.sectBonusLabels[i].string = this.describeBonus(sect);
      }
    }

    // Hide unused cards
    for (let i = allSects.length; i < this.sectCards.length; i++) {
      if (this.sectCards[i]) this.sectCards[i].active = false;
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private describeBonus(sect: SectConfig): string {
    const parts: string[] = [];
    const m = sect.modifiers;
    if (m.salaryMultiplier !== 1) parts.push(`工资${formatBonus(m.salaryMultiplier)}`);
    if (m.cultivationMultiplier !== 1) parts.push(`修为${formatBonus(m.cultivationMultiplier)}`);
    if (m.mindMultiplier !== 1) parts.push(`道心${formatBonus(m.mindMultiplier)}`);
    if (m.performanceMultiplier !== 1) parts.push(`绩效${formatBonus(m.performanceMultiplier)}`);
    return parts.join(' ') || '无加成';
  }

  private bindButtons(): void {
    // Join button
    this.joinButton?.on?.('click', () => {
      if (!this.facade || !this.selectedSectId) return;
      this.facade.changeSect(this.selectedSectId);
      this.refresh();
    }, this);

    // Sect card click — select sect
    for (let i = 0; i < this.sectCards.length; i++) {
      const card = this.sectCards[i];
      const button = card?.getComponent?.(resolveCocosType('Button')) as ButtonLike | null;
      button?.on?.('click', () => {
        const allSects = this.facade?.querySects();
        if (allSects && i < allSects.length) {
          this.selectedSectId = allSects[i].id;
          this.refresh();
        }
      }, this);
    }
  }

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of SECT_REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed) this.refresh();
      });
      this.unsubs.push(unsub);
    }
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }
}

function formatBonus(multiplier: number): string {
  if (multiplier >= 1) return `+${formatNumber(Math.round((multiplier - 1) * 100))}%`;
  return `-${formatNumber(Math.round((1 - multiplier) * 100))}%`;
}