import { _decorator, Component } from 'cc';
import type { GameContext } from '../../core/game-context';
import { property, resolveCocosType, type TextLike } from './ui-bits';

const { ccclass } = _decorator;

/** Renders the current career KPI progress. Reads the view model from KpiService; never computes completion itself. */
@ccclass('KpiPanel')
export class KpiPanel extends Component {
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public contentLabel?: TextLike;

  public context?: GameContext;

  public bind(context: GameContext): void {
    this.unbind();
    this.context = context;
    this.refresh();
  }

  public unbind(): void {
    this.context = undefined;
  }

  public onDestroy(): void {
    this.unbind();
  }

  public refresh(): void {
    const context = this.context;
    if (!context) return;
    const view = context.kpi.getView();
    this.set(this.titleLabel, `职级 ${view.careerLevel} 晋升 KPI`);
    if (view.items.length === 0) {
      this.set(this.contentLabel, '当前职级无晋升 KPI（已达最高或尚未配置）');
      return;
    }
    const lines = view.items.map((item) => {
      const mark = item.completed ? '✅' : '⬜';
      return `${mark} ${item.description}：${item.progress} / ${item.target}`;
    });
    lines.push(view.allCompleted ? '—— 全部达成，可渡劫！' : '—— 继续努力 ——');
    this.set(this.contentLabel, lines.join('\n'));
  }

  private set(target: TextLike | undefined, value: string): void {
    if (target) target.string = value;
  }
}
