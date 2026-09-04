/**
 * KpiPanelComponent — Phase 5 KPI progress panel.
 *
 * Reads KpiViewModel from GameFacade via CocosBootstrapComponent.
 * Subscribes to CAREER_CHANGED events for re-render.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { KpiViewModel, KpiItemViewModel } from './view-models';
import { buildKpiViewModel } from './view-models';
import { formatProgress } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; }

@ccclass('KpiPanel')
export class KpiPanelComponent extends Component {
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  @property(resolveCocosType('Label'))
  public contentLabel?: TextLike;

  @property(resolveCocosType('Label'))
  public progressLabel?: TextLike;

  private facade: GameFacade | null = null;
  private viewModel: KpiViewModel | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('KpiPanelComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;
    this.subscribeEvents();
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.facade = null;
    this.viewModel = null;
  }

  public getViewModel(): KpiViewModel | null {
    return this.viewModel;
  }

  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildKpiViewModel(this.facade);
    this.render(this.viewModel);
  }

  private render(vm: KpiViewModel): void {
    this.setText(this.titleLabel, `职级 ${vm.careerLevel} 晋升 KPI`);
    this.setText(this.progressLabel, formatProgress(vm.completedCount, vm.totalCount));

    if (vm.items.length === 0) {
      this.setText(this.contentLabel, '当前职级无晋升 KPI');
      return;
    }

    const lines = vm.items.map((item: KpiItemViewModel) => {
      const mark = item.completed ? '✅' : '⬜';
      return `${mark} ${item.description}：${formatProgress(item.progress, item.target)}`;
    });
    lines.push(vm.allCompleted ? '—— 全部达成，可渡劫！' : '—— 继续努力 ——');
    this.setText(this.contentLabel, lines.join('\n'));
  }

  private subscribeEvents(): void {
    if (!this.facade) return;
    const unsub = this.facade.onUiEvent('CAREER_CHANGED', () => {
      if (!this.disposed) this.refresh();
    });
    this.unsubs.push(unsub);
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  private setText(label: TextLike | undefined, text: string): void {
    if (label) label.string = text;
  }
}