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
    this.unbind();
    this.context = context;
    this.render();
  }

  public unbind(): void {
    this.unwireButtons();
    this.context = undefined;
  }

  public onDestroy(): void {
    this.unbind();
  }

  public render(): void {
    const context = this.context;
    if (!context) return;
    const view = buildEventViewModel(context);
    this.set(this.titleLabel, view.pending ? view.title : '暂无职场事件');
    this.set(this.descriptionLabel, view.pending ? view.description : '');
    this.unwireButtons();
    const buttons = [this.choiceButton1, this.choiceButton2, this.choiceButton3];
    buttons.forEach((button, index) => {
      const choice = view.choices[index];
      if (button && choice && view.pending) {
        button.on?.('click', this.choiceHandlers[index], this);
      }
    });
    if (this.confirmButton && view.pending && view.choices.length === 0) {
      this.confirmButton.on?.('click', this.onConfirmClick, this);
    }
  }

  private unwireButtons(): void {
    this.confirmButton?.off?.('click', this.onConfirmClick, this);
    [this.choiceButton1, this.choiceButton2, this.choiceButton3].forEach((button, index) => {
      button?.off?.('click', this.choiceHandlers[index], this);
    });
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

  private onChoiceAt(index: number): void {
    const context = this.context;
    if (!context) return;
    const event = context.careerEvents.current();
    if (!event) return;
    const choice = buildEventViewModel(context).choices[index];
    if (!choice) return;
    context.careerEvents.choose(event.id, choice.id);
    this.render();
    context.events.emit('phase2Refresh', { reason: 'event' });
  }

  private readonly onConfirmClick = (): void => { this.onConfirm(); };
  private readonly choiceHandlers = [
    (): void => { this.onChoiceAt(0); },
    (): void => { this.onChoiceAt(1); },
    (): void => { this.onChoiceAt(2); },
  ] as const;

  private set(target: TextLike | undefined, value: string): void {
    if (target) target.string = value;
  }
}
