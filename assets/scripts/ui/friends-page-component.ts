/**
 * FriendsPageComponent — PC V1 friends (好友) page.
 *
 * Displays friend list with visit/gift buttons.
 * Shows: name, level, online status, gift status.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
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

const FRIENDS_REFRESH_CATEGORIES: readonly UiEventCategory[] = ['STATE_CHANGED', 'RESOURCE_CHANGED'];

@ccclass('FriendsPage')
export class FriendsPageComponent extends Component {
  /** Title label */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Pending gifts count label */
  @property(resolveCocosType('Label'))
  public pendingGiftsLabel?: TextLike;

  /** Claim all gifts button */
  @property(resolveCocosType('Button'))
  public claimAllButton?: ButtonLike;

  /** Friend row nodes */
  @property([resolveCocosType('Node')])
  public friendRows: NodeLike[] = [];

  /** Friend name labels */
  @property([resolveCocosType('Label')])
  public friendNameLabels: TextLike[] = [];

  /** Friend level labels */
  @property([resolveCocosType('Label')])
  public friendLevelLabels: TextLike[] = [];

  /** Gift status labels */
  @property([resolveCocosType('Label')])
  public giftStatusLabels: TextLike[] = [];

  /** Send gift buttons */
  @property([resolveCocosType('Button')])
  public sendGiftButtons: ButtonLike[] = [];

  /** Claim gift buttons */
  @property([resolveCocosType('Button')])
  public claimGiftButtons: ButtonLike[] = [];

  private facade: GameFacade | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) throw new Error('FriendsPageComponent requires facade');
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

    const view = this.facade.queryFriends();
    const friends = view.friends;
    const pendingGifts = view.giftsToClaim;

    // Pending gifts
    if (this.pendingGiftsLabel) {
      this.pendingGiftsLabel.string = pendingGifts > 0 ? `${pendingGifts}个待领取礼物` : '无待领取礼物';
    }
    if (this.claimAllButton) {
      this.claimAllButton.interactable = pendingGifts > 0;
    }

    // Friend rows
    const maxRows = Math.min(friends.length, this.friendRows.length, this.friendNameLabels.length);
    for (let i = 0; i < maxRows; i++) {
      const friend = friends[i];
      if (this.friendRows[i]) this.friendRows[i].active = true;
      if (this.friendNameLabels[i]) this.friendNameLabels[i].string = friend.name;
      if (this.friendLevelLabels[i]) this.friendLevelLabels[i].string = `Lv.${friend.careerLevel}`;
      if (this.giftStatusLabels[i]) {
        if (friend.giftReceived) {
          this.giftStatusLabels[i].string = '🎁 待领取';
        } else if (friend.giftSent) {
          this.giftStatusLabels[i].string = '已送礼';
        } else {
          this.giftStatusLabels[i].string = '可送礼';
        }
      }
      if (i < this.sendGiftButtons.length && this.sendGiftButtons[i]) {
        this.sendGiftButtons[i].interactable = !friend.giftSent;
      }
      if (i < this.claimGiftButtons.length && this.claimGiftButtons[i]) {
        this.claimGiftButtons[i].interactable = friend.giftReceived;
      }
    }

    // Hide unused rows
    for (let i = maxRows; i < this.friendRows.length; i++) {
      if (this.friendRows[i]) this.friendRows[i].active = false;
    }
  }

  private bindButtons(): void {
    // Claim all
    this.claimAllButton?.on?.('click', () => {
      if (!this.facade) return;
      this.facade.claimAllFriendGifts();
      this.refresh();
    }, this);

    // Per-friend buttons
    for (let i = 0; i < this.sendGiftButtons.length; i++) {
      this.sendGiftButtons[i]?.on?.('click', () => {
        if (!this.facade) return;
        const view = this.facade.queryFriends();
        if (i < view.friends.length) {
          this.facade.sendFriendGift(view.friends[i].id);
          this.refresh();
        }
      }, this);
    }

    for (let i = 0; i < this.claimGiftButtons.length; i++) {
      this.claimGiftButtons[i]?.on?.('click', () => {
        if (!this.facade) return;
        const view = this.facade.queryFriends();
        if (i < view.friends.length && view.friends[i].giftReceived) {
          this.facade.claimFriendGift(view.friends[i].id);
          this.refresh();
        }
      }, this);
    }
  }

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const cat of FRIENDS_REFRESH_CATEGORIES) {
      this.unsubs.push(this.facade.onUiEvent(cat, () => { if (!this.disposed) this.refresh(); }));
    }
  }

  private unsubscribeEvents(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
  }
}