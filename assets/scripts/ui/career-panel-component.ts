/**
 * CareerPanelComponent — Phase 5 career status panel.
 *
 * Reads CareerViewModel from GameFacade via CocosBootstrapComponent.
 * Shows career level, salary, performance, cultivation, mind, sect,
 * talent, work mode, office, and promotion readiness.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { CareerViewModel } from './view-models';
import { buildCareerViewModel } from './view-models';
import { formatNumber, formatProgress } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}

@ccclass('CareerPanel')
export class CareerPanelComponent extends Component {
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

  @property(resolveCocosType('Button'))
  public promoteButton?: ButtonLike;

  private facade: GameFacade | null = null;
  private viewModel: CareerViewModel | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('CareerPanelComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;
    this.promoteButton?.on?.('click', this.onPromote, this);
    this.subscribeEvents();
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.promoteButton?.off?.('click', this.onPromote, this);
    this.facade = null;
    this.viewModel = null;
  }

  public getViewModel(): CareerViewModel | null {
    return this.viewModel;
  }

  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildCareerViewModel(this.facade);
    this.render(this.viewModel);
  }

  private render(vm: CareerViewModel): void {
    this.setText(this.careerLabel, `职级 ${vm.careerLevel} · ${vm.careerName}（${vm.realm}）`);
    this.setText(this.salaryLabel, `灵石 ${formatNumber(vm.salary)}`);
    this.setText(this.performanceLabel, `绩效 ${formatNumber(vm.performance)}`);
    this.setText(this.cultivationLabel, `修为 ${formatNumber(vm.cultivation)}/${formatNumber(vm.cultivationRequired)}`);
    this.setText(this.mindLabel, `道心 ${vm.mind}/${vm.maxMind}（${vm.mindStatusText}）`);
    this.setText(this.sectLabel, `宗门 ${vm.sectName}`);
    this.setText(this.talentLabel, `天赋 ${vm.talentName}`);
    this.setText(this.workModeLabel, vm.workMode === 'WORK' ? '认真上班' : '带薪摸鱼');
    this.setText(this.officeLabel, `办公室 ${vm.officeName}`);
    this.setText(this.promotionLabel, vm.canPromote ? '可渡劫晋升' : `不可晋升（${vm.promotionReason}）`);

    // Enable/disable promote button based on promotion readiness
    if (this.promoteButton) {
      this.promoteButton.interactable = vm.canPromote;
    }
  }

  private subscribeEvents(): void {
    if (!this.facade) return;
    const categories: readonly import('../facade/ui-event-types').UiEventCategory[] = [
      'CAREER_CHANGED', 'RESOURCE_CHANGED', 'STATE_CHANGED', 'BUFF_CHANGED',
    ];
    for (const category of categories) {
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

  private readonly onPromote = (): void => {
    if (!this.facade || !this.viewModel?.canPromote) return;
    // Get the first available promotion option
    const options = this.facade.context.configService.promotion.options;
    if (options.length > 0) {
      this.facade.context.promotion.promote(options[0].id);
    }
  };

  private setText(label: TextLike | undefined, text: string): void {
    if (label) label.string = text;
  }
}