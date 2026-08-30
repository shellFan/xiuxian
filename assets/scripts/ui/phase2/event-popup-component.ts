import { _decorator, Component } from 'cc';
import type { GameContext } from '../../core/game-context';
import { buildEventViewModel } from './view-models';
import { property, resolveCocosType, type TextLike, type ButtonLike } from './ui-bits';

const { ccclass } = _decorator;

/** Shows the pending career event and wires its resolve / choice actions to CareerEventService. */
@ccclass('EventPopup')
export class EventPopup extends Component {
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;
  @property(resolveCocosType('Label'))
  public descriptionLabel?: TextLike;
  @property(resolveCocosType('Button'))
  public confirmButton?: ButtonLike;
  @property(resolveCocosType('Button'))
  public choiceButton1?: ButtonLike;
  @property(resolveCocosType('Button'))
  public choiceButton2?: ButtonLike;
  @property(resolveCocosType('Button'))
  public choiceButton3?: ButtonLike;

  public context?: GameContext;

  public bind(context: GameContext): void {
    this.context = context;
    this.render();
  }

  public render(): void {
    const context = this.context;
    if (!context) return;
    const view = buildEventViewModel(context);
    this.set(this.titleLabel, view.pending ? view.title : '暂无职场事件');
    this.set(this.descriptionLabel, view.pending ? view.description : '');
    const buttons = [this.choiceButton1, this.choiceButton2, this.choiceButton3];
    buttons.forEach((button, index) => {
      const choice = view.choices[index];
      if (button && choice && view.pending) {
        button.on?.('click', () => this.onChoice(choice.id), this);
      }
    });
    if (this.confirmButton && view.pending && view.choices.length === 0) {
      this.confirmButton.on?.('click', () => this.onConfirm(), this);
    }
  }

  private onConfirm(): void {
    const context = this.context;
    if (!context) return;
    const event = context.careerEvents.current();
    if (!event) return;
    context.careerEvents.resolve(event.id);
    this.render();
    context.events.emit('phase2Refresh', { reason: 'event' });
  }

  private onChoice(choiceId: string): void {
    const context = this.context;
    if (!context) return;
    const event = context.careerEvents.current();
    if (!event) return;
    context.careerEvents.choose(event.id, choiceId);
    this.render();
    context.events.emit('phase2Refresh', { reason: 'event' });
  }

  private set(target: TextLike | undefined, value: string): void {
    if (target) target.string = value;
  }
}
