/**
 * LeaderboardPageComponent — PC V1 leaderboard (排行榜) page.
 *
 * V11-S1（任务书§17）：
 *  - 四榜切换（职级/修为/财富/成就），复用场景 RefreshButton（原为未绑定死节点）循环切换
 *  - 标题显式标注「本地模拟」——后端未接入，禁止冒充在线榜
 *  - 行分值改为 entry.score（各榜独立口径），不再固定显示修为
 *  - 事件驱动刷新（STATE_CHANGED/RESOURCE_CHANGED），无轮询
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { UiEventCategory } from '../facade/ui-event-types';
import type { LeaderboardMetric } from '../services/leaderboard-service';
import { formatNumber } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; active?: boolean; color?: { r: number; g: number; b: number; a: number }; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}
interface NodeLike { active?: boolean; name?: string; children?: readonly NodeLike[]; getChildByName?: (name: string) => NodeLike | null; getComponent?: (type: unknown) => unknown; }

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
  private metrics: readonly LeaderboardMetric[] = ['career', 'cultivation', 'wealth', 'achievement'];
  private metricIndex = 0;
  private toggleButton: ButtonLike | null = null;
  private disposed = false;

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) throw new Error('LeaderboardPageComponent requires facade');
    this.facade = bootstrap.facade;
    this.metrics = this.facade.queryLeaderboardMetrics().map((m) => m.metric);
    this.bindToggleButton();
    this.subscribeEvents();
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unbindToggleButton();
    this.unsubscribeEvents();
    this.facade = null;
  }

  public refresh(): void {
    if (!this.facade || this.disposed) return;

    const metric = this.metrics[this.metricIndex] ?? 'career';
    const view = this.facade.queryLeaderboard(metric);
    const playerRank = view.playerRank;

    // Title：榜单名 + 本地模拟标记（后端未接入，如实标注，禁止冒充在线榜）
    if (this.titleLabel) {
      this.titleLabel.string = `${view.metricLabel} · 本地模拟`;
    }

    // Player rank
    if (this.playerRankLabel) {
      this.playerRankLabel.string = playerRank > 0
        ? `我的排名: 第${playerRank}名`
        : '未上榜';
    }

    // Fill rows（score 为该榜分值口径：职级/修为/灵石/成就数）
    const maxRows = Math.min(view.entries.length, this.entryRows.length, this.rankLabels.length, this.nameLabels.length, this.scoreLabels.length);
    for (let i = 0; i < maxRows; i++) {
      const entry = view.entries[i];
      const isPlayer = entry.isPlayer;

      if (this.entryRows[i]) this.entryRows[i].active = true;
      if (this.rankLabels[i]) this.rankLabels[i].string = `#${entry.rank}`;
      if (this.nameLabels[i]) {
        this.nameLabels[i].string = isPlayer ? `► ${entry.name} ◄` : entry.name;
      }
      if (this.scoreLabels[i]) {
        this.scoreLabels[i].string = formatNumber(entry.score);
      }
    }

    // Hide unused rows
    for (let i = maxRows; i < this.entryRows.length; i++) {
      if (this.entryRows[i]) this.entryRows[i].active = false;
    }
  }

  /** 场景 RefreshButton（原死节点）→ 循环切换榜单。节点缺失时静默降级为单榜。 */
  private bindToggleButton(): void {
    const node = this.node as unknown as NodeLike;
    const button = this.findButton(node, 'RefreshButton');
    if (!button) return;
    const label = this.findLabel(node, 'RefreshButtonLabel');
    if (label) label.string = '切换榜单';
    button.on?.('click', this.onToggleMetric, this);
    this.toggleButton = button;
  }

  private unbindToggleButton(): void {
    if (this.toggleButton) {
      this.toggleButton.off?.('click', this.onToggleMetric, this);
      this.toggleButton = null;
    }
  }

  private onToggleMetric(): void {
    if (this.disposed) return;
    this.metricIndex = (this.metricIndex + 1) % this.metrics.length;
    this.refresh();
  }

  private findLabel(parent: NodeLike, childName: string): TextLike | null {
    const child = parent.getChildByName?.(childName);
    if (!child) return null;
    const comp = child.getComponent?.(resolveCocosType('Label'));
    return (comp as unknown as TextLike) ?? null;
  }

  private findButton(parent: NodeLike, childName: string): ButtonLike | null {
    const child = parent.getChildByName?.(childName);
    if (!child) return null;
    const comp = child.getComponent?.(resolveCocosType('Button'));
    return (comp as unknown as ButtonLike) ?? null;
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
