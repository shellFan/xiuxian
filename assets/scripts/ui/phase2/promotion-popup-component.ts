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

  public bind(context: GameContext): void {
    this.context = context;
    this.render();
  }

  public render(): void {
    const context = this.context;
    if (!context) return;
    const view = buildPromotionViewModel(context);
    this.set(this.statusLabel, view.allowed ? `可渡劫（成功率 ${view.probability}%）` : `暂不可渡劫（${view.reason}）`);
    this.set(this.resultLabel, '');
    const buttons = [this.optionButton1, this.optionButton2, this.optionButton3];
    buttons.forEach((button, index) => {
      const option = view.options[index];
      if (button && option && view.allowed) {
        button.on?.('click', () => this.onInterview(option.id), this);
      }
    });
  }

  private onInterview(optionId: string): void {
    const context = this.context;
    if (!context) return;
    try {
      const result = context.promotion.promote(optionId);
      this.set(this.resultLabel, result.success ? `恭喜突破境界！晋升至 ${result.newCareerLevel} 级` : '渡劫失败，道心受损');
      this.render();
    } catch (error) {
      this.set(this.resultLabel, `渡劫失败：${(error as Error).message}`);
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
    this.retryButton?.on?.('click', () => this.onRetry(), this);
  }

  private set(target: TextLike | undefined, value: string): void {
    if (target) target.string = value;
  }
}
