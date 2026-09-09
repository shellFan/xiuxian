/**
 * LeaderboardPageComponent — PC V1 leaderboard (排行榜) page.
 *
 * Displays top 50 NPC rankings with the player highlighted.
 * Shows: rank, name, career level, cultivation exp.
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

interface TextLike { string: string; active?: boolean; color?: { r: number; g: number; b: number; a: number }; }
interface NodeLike { active?: boolean; name?: string; children?: readonly NodeLike[]; getChildByName?: (name: string) => NodeLike | null; }

const LEADERBOARD_REFRESH_CATEGORIES: readonly UiEventCategory[] = ['STATE_CHANGED', 'RESOURCE_CHANGED'];

@ccclass('LeaderboardPage')
export class LeaderboardPageComponent extends Component {
  /** Title label */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Player rank label */
  @property(resolveCocosType('Label'))
  public playerRankLabel?: TextLike;

  /** Entry row nodes (top 10 visible) */
  @property([resolveCocosType('Node')])
  public entryRows: NodeLike[] = [];

  /** Rank number labels per row */
  @property([resolveCocosType('Label')])
  public rankLabels: TextLike[] = [];

  /** Name labels per row */
  @property([resolveCocosType('Label')])
  public nameLabels: TextLike[] = [];

  /** Score labels per row */
  @property([resolveCocosType('Label')])
  public scoreLabels: TextLike[] = [];

  private facade: GameFacade | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) throw new Error('LeaderboardPageComponent requires facade');
    this.facade = bootstrap.facade;
    this.subscribeEvents();
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.facade = null;
  }

  public refresh(): void {
    if (!this.facade || this.disposed) return;

    const view = this.facade.queryLeaderboard();
    const playerRank = view.playerRank;
    const topEntries = view.entries;

    // Player rank
    if (this.playerRankLabel) {
      this.playerRankLabel.string = playerRank > 0
        ? `我的排名: 第${playerRank}名`
        : '未上榜';
    }

    // Fill rows
    const maxRows = Math.min(topEntries.length, this.entryRows.length, this.rankLabels.length, this.nameLabels.length, this.scoreLabels.length);
    for (let i = 0; i < maxRows; i++) {
      const entry = topEntries[i];
      const isPlayer = entry.isPlayer;

      if (this.entryRows[i]) this.entryRows[i].active = true;
      if (this.rankLabels[i]) this.rankLabels[i].string = `#${entry.rank}`;
      if (this.nameLabels[i]) {
        this.nameLabels[i].string = isPlayer ? `► ${entry.name} ◄` : entry.name;
      }
      if (this.scoreLabels[i]) {
        this.scoreLabels[i].string = formatNumber(entry.cultivationExp);
      }
    }

    // Hide unused rows
    for (let i = maxRows; i < this.entryRows.length; i++) {
      if (this.entryRows[i]) this.entryRows[i].active = false;
    }
  }

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const cat of LEADERBOARD_REFRESH_CATEGORIES) {
      this.unsubs.push(this.facade.onUiEvent(cat, () => { if (!this.disposed) this.refresh(); }));
    }
  }

  private unsubscribeEvents(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
  }
}