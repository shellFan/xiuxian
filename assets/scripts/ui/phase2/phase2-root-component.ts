import { _decorator, Component } from 'cc';
import type { GameContext } from '../../core/game-context';
import { PHASE2_REFRESH_EVENTS } from '../../core/game-events';
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
  private wired = false;
  private subscribed = false;

  public bind(context: GameContext): void {
    this.unbind();
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

  public unbind(): void {
    this.unwire();
    this.unsubscribe();
    this.careerPanel?.unbind();
    this.kpiPanel?.unbind();
    this.eventPopup?.unbind();
    this.promotionPopup?.unbind();
    this.context = undefined;
  }

  private subscribe(): void {
    if (!this.context || this.subscribed) return;
    for (const event of PHASE2_REFRESH_EVENTS) {
      this.context.events.on(event, this.onPhase2Dirty);
    }
    this.subscribed = true;
  }

  private unsubscribe(): void {
    if (!this.context || !this.subscribed) return;
    for (const event of PHASE2_REFRESH_EVENTS) {
      this.context.events.off(event, this.onPhase2Dirty);
    }
    this.subscribed = false;
  }

  public onDestroy(): void {
    this.unbind();
  }

  private wire(): void {
    if (this.wired) return;
    this.workplaceTab?.on?.('click', this.onWorkplaceTab, this);
    this.sectTab?.on?.('click', this.onSectTab, this);
    this.mergeTab?.on?.('click', this.onMergeTab, this);
    this.eventTab?.on?.('click', this.onEventTab, this);
    this.workButton?.on?.('click', this.onWorkButton, this);
    this.fishButton?.on?.('click', this.onFishButton, this);
    this.wired = true;
  }

  private unwire(): void {
    if (!this.wired) return;
    this.workplaceTab?.off?.('click', this.onWorkplaceTab, this);
    this.sectTab?.off?.('click', this.onSectTab, this);
    this.mergeTab?.off?.('click', this.onMergeTab, this);
    this.eventTab?.off?.('click', this.onEventTab, this);
    this.workButton?.off?.('click', this.onWorkButton, this);
    this.fishButton?.off?.('click', this.onFishButton, this);
    this.wired = false;
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
  private readonly onWorkplaceTab = (): void => { this.selectTab('WORKPLACE'); };
  private readonly onSectTab = (): void => { this.selectTab('SECT'); };
  private readonly onMergeTab = (): void => { this.selectTab('MERGE'); };
  private readonly onEventTab = (): void => { this.selectTab('EVENT'); };
  private readonly onWorkButton = (): void => { this.setMode('WORK'); };
  private readonly onFishButton = (): void => { this.setMode('FISHING'); };
}
