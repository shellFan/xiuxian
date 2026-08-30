import { _decorator, Component } from 'cc';
import type { GameContext } from '../../core/game-context';
import { CareerPanel } from './career-panel-component';
import { KpiPanel } from './kpi-panel-component';
import { EventPopup } from './event-popup-component';
import { PromotionPopup } from './promotion-popup-component';
import { property, resolveCocosType, type ButtonLike, type SceneNodeLike } from './ui-bits';

const { ccclass } = _decorator;

export type Phase2Tab = 'WORKPLACE' | 'SECT' | 'MERGE' | 'EVENT';

/**
 * Coordinator for the Phase 2 HUD: bottom tabs switch between panels, work/fishing
 * toggle drives WorkService, and every panel is bound to a single GameContext.
 * All business logic stays in the services; this component only reads view models,
 * binds buttons, and refreshes.
 */
@ccclass('Phase2Root')
export class Phase2Root extends Component {
  @property(CareerPanel)
  public careerPanel?: CareerPanel;
  @property(KpiPanel)
  public kpiPanel?: KpiPanel;
  @property(EventPopup)
  public eventPopup?: EventPopup;
  @property(PromotionPopup)
  public promotionPopup?: PromotionPopup;

  @property(resolveCocosType('Button'))
  public workplaceTab?: ButtonLike;
  @property(resolveCocosType('Button'))
  public sectTab?: ButtonLike;
  @property(resolveCocosType('Button'))
  public mergeTab?: ButtonLike;
  @property(resolveCocosType('Button'))
  public eventTab?: ButtonLike;
  @property(resolveCocosType('Node'))
  public workplaceNode?: SceneNodeLike;
  @property(resolveCocosType('Node'))
  public sectNode?: SceneNodeLike;
  @property(resolveCocosType('Node'))
  public mergeNode?: SceneNodeLike;
  @property(resolveCocosType('Node'))
  public eventNode?: SceneNodeLike;
  @property(resolveCocosType('Button'))
  public workButton?: ButtonLike;
  @property(resolveCocosType('Button'))
  public fishButton?: ButtonLike;

  public context?: GameContext;

  public bind(context: GameContext): void {
    this.context = context;
    this.careerPanel?.bind(context);
    this.kpiPanel?.bind(context);
    this.eventPopup?.bind(context);
    this.promotionPopup?.bind(context);
    this.promotionPopup?.bindRetry();
    this.wire();
    this.subscribe();
    this.selectTab('WORKPLACE');
    this.refreshAll();
  }

  private subscribe(): void {
    if (!this.context) return;
    this.context.events.on('mergeCompleted', this.onPhase2Dirty);
    this.context.events.on('salaryChanged', this.onPhase2Dirty);
    this.context.events.on('idleSettled', this.onPhase2Dirty);
    this.context.events.on('phase2Refresh', this.onPhase2Dirty);
  }

  public onDestroy(): void {
    if (!this.context) return;
    this.context.events.off('mergeCompleted', this.onPhase2Dirty);
    this.context.events.off('salaryChanged', this.onPhase2Dirty);
    this.context.events.off('idleSettled', this.onPhase2Dirty);
    this.context.events.off('phase2Refresh', this.onPhase2Dirty);
  }

  private wire(): void {
    this.workplaceTab?.on?.('click', () => this.selectTab('WORKPLACE'), this);
    this.sectTab?.on?.('click', () => this.selectTab('SECT'), this);
    this.mergeTab?.on?.('click', () => this.selectTab('MERGE'), this);
    this.eventTab?.on?.('click', () => this.selectTab('EVENT'), this);
    this.workButton?.on?.('click', () => this.setMode('WORK'), this);
    this.fishButton?.on?.('click', () => this.setMode('FISHING'), this);
  }

  public selectTab(tab: Phase2Tab): void {
    const panels: Record<Phase2Tab, SceneNodeLike | undefined> = {
      WORKPLACE: this.workplaceNode,
      SECT: this.sectNode,
      MERGE: this.mergeNode,
      EVENT: this.eventNode,
    };
    (Object.keys(panels) as Phase2Tab[]).forEach((key) => {
      if (panels[key]) panels[key]!.active = key === tab;
    });
  }

  private setMode(mode: 'WORK' | 'FISHING'): void {
    this.context?.work.setMode(mode);
    this.refreshAll();
  }

  public refreshAll(): void {
    this.careerPanel?.refresh();
    this.kpiPanel?.refresh();
    this.eventPopup?.render();
    this.promotionPopup?.render();
  }

  private readonly onPhase2Dirty = (): void => { this.refreshAll(); };
}
