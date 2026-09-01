import { _decorator, Component } from 'cc';
import type { GameContext } from '../../core/game-context';
import { buildPromotionViewModel } from './view-models';
import { property, resolveCocosType, type TextLike, type ButtonLike } from './ui-bits';

const { ccclass } = _decorator;

/**
 * Drives the promotion interview: shows the three interview tactics and the result.
 * No real rewarded ad is involved (Phase 2 uses the mock reward provider).
 */
@ccclass('PromotionPopup')
export class PromotionPopup extends Component {
  @property(resolveCocosType('Label'))
  public statusLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public resultLabel?: TextLike;
  @property(resolveCocosType('Button'))
  public optionButton1?: ButtonLike;
  @property(resolveCocosType('Button'))
  public optionButton2?: ButtonLike;
  @property(resolveCocosType('Button'))
  public optionButton3?: ButtonLike;
  @property(resolveCocosType('Button'))
  public retryButton?: ButtonLike;

  public context?: GameContext;
  private retryWired = false;

  public bind(context: GameContext): void {
    this.unbind();
    this.context = context;
    this.render();
  }

  public unbind(): void {
    this.unwireOptionButtons();
    this.unwireRetry();
    this.context = undefined;
  }

  public onDestroy(): void {
    this.unbind();
  }

  public render(): void {
    const context = this.context;
    if (!context) return;
    const view = buildPromotionViewModel(context);
    if (view.needsRetry) {
      this.set(this.statusLabel, '渡劫失败，需领取重试令（看广告）');
    } else if (view.allowed) {
      this.set(this.statusLabel, `可渡劫（成功率 ${view.probability}%）`);
    } else {
      this.set(this.statusLabel, `暂不可渡劫（${view.reason}）`);
    }
    this.set(this.resultLabel, '');
    const canInterview = view.allowed && !view.needsRetry;
    this.unwireOptionButtons();
    const buttons = [this.optionButton1, this.optionButton2, this.optionButton3];
    buttons.forEach((button, index) => {
      const option = view.options[index];
      if (button && option && canInterview) {
        button.on?.('click', this.optionHandlers[index], this);
      }
    });
  }

  private unwireOptionButtons(): void {
    [this.optionButton1, this.optionButton2, this.optionButton3].forEach((button, index) => {
      button?.off?.('click', this.optionHandlers[index], this);
    });
  }

  private onInterviewAt(index: number): void {
    const context = this.context;
    if (!context) return;
    const option = buildPromotionViewModel(context).options[index];
    if (!option) return;
    try {
      const result = context.promotion.promote(option.id);
      this.set(this.resultLabel, result.success ? `恭喜突破境界！晋升至 ${result.newCareerLevel} 级` : '渡劫失败，道心受损');
      this.render();
      context.events.emit('phase2Refresh', { reason: 'promotion' });
    } catch (error) {
      this.set(this.resultLabel, `渡劫失败：${(error as Error).message}`);
      this.render();
    }
  }

  private onRetry(): void {
    const context = this.context;
    if (!context) return;
    context.promotion.requestRetry((granted) => {
      this.set(this.resultLabel, granted ? '获得重试机会，可再次渡劫' : '重试未成功');
      this.render();
    });
  }

  public bindRetry(): void {
    if (this.retryWired) return;
    this.retryButton?.on?.('click', this.onRetryClick, this);
    this.retryWired = true;
  }

  private unwireRetry(): void {
    if (!this.retryWired) return;
    this.retryButton?.off?.('click', this.onRetryClick, this);
    this.retryWired = false;
  }

  private readonly onRetryClick = (): void => { this.onRetry(); };
  private readonly optionHandlers = [
    (): void => { this.onInterviewAt(0); },
    (): void => { this.onInterviewAt(1); },
    (): void => { this.onInterviewAt(2); },
  ] as const;

  private set(target: TextLike | undefined, value: string): void {
    if (target) target.string = value;
  }
}
