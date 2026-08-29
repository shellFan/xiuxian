import { _decorator, Component } from 'cc';
import type { GameContext } from '../../core/game-context';
import { buildCareerViewModel } from './view-models';
import { property, resolveCocosType, type TextLike } from './ui-bits';

const { ccclass } = _decorator;

/** Displays the core Phase 2 status (career, salary, performance, cultivation, mind, sect, talent, work mode, office, promotion readiness). */
@ccclass('CareerPanel')
export class CareerPanel extends Component {
  @property(resolveCocosType('Label'))
  public careerLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public salaryLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public performanceLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public cultivationLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public mindLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public sectLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public talentLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public workModeLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public officeLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public promotionLabel?: TextLike;

  public context?: GameContext;

  public bind(context: GameContext): void {
    this.context = context;
    this.refresh();
  }

  public refresh(): void {
    const context = this.context;
    if (!context) return;
    const view = buildCareerViewModel(context);
    this.set(this.careerLabel, `职级 ${view.careerLevel} · ${view.careerName}（${view.realm}）`);
    this.set(this.salaryLabel, `灵石 ${view.salary}`);
    this.set(this.performanceLabel, `绩效 ${view.performance}`);
    this.set(this.cultivationLabel, `修为 ${view.cultivation} / ${view.cultivationRequired}`);
    this.set(this.mindLabel, `道心 ${view.mind} / ${view.maxMind}（${view.mindStatusText}）`);
    this.set(this.sectLabel, `宗门 ${view.sectName}`);
    this.set(this.talentLabel, `天赋 ${view.talentName}`);
    this.set(this.workModeLabel, `状态 ${view.workMode === 'WORK' ? '认真上班' : '带薪摸鱼'}`);
    this.set(this.officeLabel, `办公室 ${view.officeName}`);
    this.set(this.promotionLabel, view.canPromote ? '可渡劫晋升' : `不可晋升（${view.promotionReason}）`);
  }

  private set(target: TextLike | undefined, value: string): void {
    if (target) target.string = value;
  }
}
