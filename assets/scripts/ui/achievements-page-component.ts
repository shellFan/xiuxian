/**
 * AchievementsPageComponent — PC V1 achievements (成就) page.
 *
 * Displays achievement grid (3-4 columns) with unlock status.
 * Shows: icon, name, description, progress, claim button.
 * Unlocked achievements show a toast notification.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { AchievementConfig, AchievementStatus } from '../services/achievement-service';
import type { UiEventCategory } from '../facade/ui-event-types';
import { formatNumber } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; active?: boolean; }
interface ButtonLike { on?: (event: string, callback: () => void, target?: unknown) => void; off?: (event: string, callback: () => void, target?: unknown) => void; interactable?: boolean; }
interface NodeLike { active?: boolean; name?: string; children?: readonly NodeLike[]; getChildByName?: (name: string) => NodeLike | null; getComponent?: (type: unknown) => unknown; }

const ACHIEVEMENT_REFRESH_CATEGORIES: readonly UiEventCategory[] = ['ACHIEVEMENT_CHANGED', 'STATE_CHANGED'];

const STATUS_LABELS: Record<string, string> = {
  LOCKED: '🔒',
  COMPLETED: '✅',
  CLAIMED: '🏆',
};

@ccclass('AchievementsPage')
export class AchievementsPageComponent extends Component {
  /** Title label */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Progress summary label (e.g., "已解锁: 12/37") */
  @property(resolveCocosType('Label'))
  public progressLabel?: TextLike;

  /** Achievement card nodes (grid) */
  @property([resolveCocosType('Node')])
  public achievementCards: NodeLike[] = [];

  /** Achievement name labels */
  @property([resolveCocosType('Label')])
  public achievementNameLabels: TextLike[] = [];

  /** Achievement description labels */
  @property([resolveCocosType('Label')])
  public achievementDescLabels: TextLike[] = [];

  /** Achievement status labels */
  @property([resolveCocosType('Label')])
  public achievementStatusLabels: TextLike[] = [];

  /** Claim buttons */
  @property([resolveCocosType('Button')])
  public claimButtons: ButtonLike[] = [];

  private facade: GameFacade | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) throw new Error('AchievementsPageComponent requires facade');
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

  public refresh(): void {
    if (!this.facade || this.disposed) return;

    const configs = this.facade.queryAchievementConfigs();
    let unlocked = 0;
    let total = configs.length;

    // Count unlocked
    for (const cfg of configs) {
      const status = this.facade.queryAchievementStatus(cfg.id);
      if (status !== 'LOCKED') unlocked++;
    }

    // Progress summary
    if (this.progressLabel) {
      this.progressLabel.string = `已解锁: ${unlocked}/${total}`;
    }

    // Fill cards
    const maxCards = Math.min(configs.length, this.achievementCards.length, this.achievementNameLabels.length);
    for (let i = 0; i < maxCards; i++) {
      const cfg = configs[i];
      const status = this.facade.queryAchievementStatus(cfg.id);

      if (this.achievementCards[i]) this.achievementCards[i].active = true;
      if (this.achievementNameLabels[i]) this.achievementNameLabels[i].string = cfg.name;
      if (this.achievementDescLabels[i]) this.achievementDescLabels[i].string = cfg.description;
      if (this.achievementStatusLabels[i]) {
        this.achievementStatusLabels[i].string = STATUS_LABELS[status] ?? '';
      }
      if (i < this.claimButtons.length && this.claimButtons[i]) {
        this.claimButtons[i].interactable = status === 'COMPLETED';
      }
    }

    // Hide unused cards
    for (let i = maxCards; i < this.achievementCards.length; i++) {
      if (this.achievementCards[i]) this.achievementCards[i].active = false;
    }
  }

  private bindButtons(): void {
    for (let i = 0; i < this.claimButtons.length; i++) {
      this.claimButtons[i]?.on?.('click', () => {
        if (!this.facade) return;
        const configs = this.facade.queryAchievementConfigs();
        if (i < configs.length) {
          this.facade.claimAchievement(configs[i].id);
          this.refresh();
        }
      }, this);
    }
  }

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const cat of ACHIEVEMENT_REFRESH_CATEGORIES) {
      this.unsubs.push(this.facade.onUiEvent(cat, () => { if (!this.disposed) this.refresh(); }));
    }
  }

  private unsubscribeEvents(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
  }
}