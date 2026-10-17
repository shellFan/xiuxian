import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { CharacterCreationResult } from '../v59/character-creation-service';
import { STAT_KEYS, type StatKey } from '../v59/character-rules';
import {
  buildCharacterCreationViewModel,
  type CharacterCreationViewModel,
} from './character-creation-view-model';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

export interface CharacterCreationTextLike { string: string; }
export interface CharacterCreationNodeLike { active?: boolean; }
export interface CharacterCreationButtonLike {
  interactable?: boolean;
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
}
export interface CharacterCreationInputLike extends CharacterCreationTextLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
}

export type CharacterCreationFacade = Pick<GameFacade,
  | 'queryCharacterCreation'
  | 'characterCreationSelectIndustry'
  | 'characterCreationSelectDirection'
  | 'characterCreationSelectProfession'
  | 'characterCreationSelectSect'
  | 'characterCreationSetIdentity'
  | 'characterCreationSetBackground'
  | 'characterCreationSelectCandidate'
  | 'characterCreationReroll'
  | 'characterCreationAllocate'
  | 'characterCreationResetAllocation'
  | 'characterCreationAdvance'
  | 'characterCreationBack'
  | 'characterCreationFinalize'
  | 'characterCreationCompleteBackfill'
>;

interface ButtonBinding {
  readonly button: CharacterCreationButtonLike;
  readonly callback: () => void;
}

/**
 * Cocos Creator 3.8 controller for the V5.9 character wizard.
 * It owns presentation only: every read and mutation goes through GameFacade.
 */
@ccclass('CharacterCreationWizardComponent')
export class CharacterCreationWizardComponent extends Component {
  /** Runtime-created views bind explicitly after assigning every control. */
  public bindFacadeOnLoad = true;
  public onVisibilityChanged?: (visible: boolean) => void;

  @property(resolveCocosType('Node'))
  public rootNode?: CharacterCreationNodeLike;

  /** Optional runtime section roots; serialized scenes may continue using stepNodes. */
  public optionSectionNode?: CharacterCreationNodeLike;
  public identitySectionNode?: CharacterCreationNodeLike;
  public destinySectionNode?: CharacterCreationNodeLike;
  public allocationSectionNode?: CharacterCreationNodeLike;
  public confirmationSectionNode?: CharacterCreationNodeLike;

  @property([resolveCocosType('Node')])
  public stepNodes: CharacterCreationNodeLike[] = [];

  @property(resolveCocosType('Label'))
  public titleLabel?: CharacterCreationTextLike;
  @property(resolveCocosType('Label'))
  public descriptionLabel?: CharacterCreationTextLike;
  @property(resolveCocosType('Label'))
  public progressLabel?: CharacterCreationTextLike;
  @property(resolveCocosType('Label'))
  public errorLabel?: CharacterCreationTextLike;

  /** Reusable choice slots for industry, direction, profession, avatar, and background. */
  @property([resolveCocosType('Node')])
  public optionNodes: CharacterCreationNodeLike[] = [];
  @property([resolveCocosType('Label')])
  public optionTitleLabels: CharacterCreationTextLike[] = [];
  @property([resolveCocosType('Label')])
  public optionDescriptionLabels: CharacterCreationTextLike[] = [];
  @property([resolveCocosType('Button')])
  public optionButtons: CharacterCreationButtonLike[] = [];

  @property(resolveCocosType('EditBox'))
  public nicknameInput?: CharacterCreationInputLike;

  @property([resolveCocosType('Node')])
  public avatarNodes: CharacterCreationNodeLike[] = [];
  @property([resolveCocosType('Label')])
  public avatarLabels: CharacterCreationTextLike[] = [];
  @property([resolveCocosType('Button')])
  public avatarButtons: CharacterCreationButtonLike[] = [];

  @property([resolveCocosType('Node')])
  public backgroundNodes: CharacterCreationNodeLike[] = [];
  @property([resolveCocosType('Label')])
  public backgroundTitleLabels: CharacterCreationTextLike[] = [];
  @property([resolveCocosType('Label')])
  public backgroundDescriptionLabels: CharacterCreationTextLike[] = [];
  @property([resolveCocosType('Button')])
  public backgroundButtons: CharacterCreationButtonLike[] = [];

  @property([resolveCocosType('Node')])
  public candidateNodes: CharacterCreationNodeLike[] = [];
  @property([resolveCocosType('Label')])
  public candidateTitleLabels: CharacterCreationTextLike[] = [];
  @property([resolveCocosType('Label')])
  public candidateDescriptionLabels: CharacterCreationTextLike[] = [];
  @property([resolveCocosType('Button')])
  public candidateButtons: CharacterCreationButtonLike[] = [];

  @property([resolveCocosType('Label')])
  public statLabels: CharacterCreationTextLike[] = [];
  @property([resolveCocosType('Button')])
  public statIncreaseButtons: CharacterCreationButtonLike[] = [];
  @property([resolveCocosType('Button')])
  public statDecreaseButtons: CharacterCreationButtonLike[] = [];
  @property(resolveCocosType('Label'))
  public remainingPointsLabel?: CharacterCreationTextLike;

  @property(resolveCocosType('Button'))
  public backButton?: CharacterCreationButtonLike;
  @property(resolveCocosType('Button'))
  public nextButton?: CharacterCreationButtonLike;
  @property(resolveCocosType('Label'))
  public nextButtonLabel?: CharacterCreationTextLike;
  @property(resolveCocosType('Button'))
  public rerollButton?: CharacterCreationButtonLike;
  @property(resolveCocosType('Label'))
  public rerollLabel?: CharacterCreationTextLike;
  @property(resolveCocosType('Button'))
  public resetAllocationButton?: CharacterCreationButtonLike;
  @property([resolveCocosType('Label')])
  public confirmationLabels: CharacterCreationTextLike[] = [];

  private facade: CharacterCreationFacade | null = null;
  private viewModel: CharacterCreationViewModel | null = null;
  private buttonBindings: ButtonBinding[] = [];
  private destroyed = false;
  private actionError = '';
  private lastVisible: boolean | null = null;

  public get currentViewModel(): CharacterCreationViewModel | null { return this.viewModel; }

  protected onLoad(): void {
    if (!this.bindFacadeOnLoad) return;
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap) throw new Error('CharacterCreationWizardComponent requires CocosBootstrapComponent');
    if (bootstrap.facade) {
      this.bindFacade(bootstrap.facade);
      return;
    }
    bootstrap.onFacadeReady((facade) => {
      if (!this.destroyed) this.bindFacade(facade);
    });
  }

  protected onDestroy(): void {
    this.destroyed = true;
    this.unbindFacade();
  }

  /** Public for scene coordinators and isolated Cocos tests. */
  public bindFacade(facade: CharacterCreationFacade): void {
    this.unbindFacade();
    this.destroyed = false;
    this.facade = facade;
    this.wireControls();
    this.refresh();
  }

  public unbindFacade(): void {
    for (const binding of this.buttonBindings) {
      binding.button.off?.('click', binding.callback, this);
    }
    this.buttonBindings = [];
    this.nicknameInput?.off?.('editing-did-ended', this.onIdentityEdited, this);
    this.facade = null;
    this.viewModel = null;
  }

  public refresh(): void {
    if (!this.facade) return;
    try {
      this.viewModel = buildCharacterCreationViewModel(this.facade.queryCharacterCreation());
    } catch (error) {
      this.actionError = error instanceof Error ? error.message : String(error);
      this.viewModel = null;
    }
    this.render();
  }

  private wireControls(): void {
    this.bindButton(this.backButton, this.onBack);
    this.bindButton(this.nextButton, this.onNext);
    this.bindButton(this.rerollButton, this.onReroll);
    this.bindButton(this.resetAllocationButton, this.onResetAllocation);
    this.optionButtons.forEach((button, index) => this.bindButton(button, () => this.onOption(index)));
    this.avatarButtons.forEach((button, index) => this.bindButton(button, () => this.onAvatar(index)));
    this.backgroundButtons.forEach((button, index) => this.bindButton(button, () => this.onBackground(index)));
    this.candidateButtons.forEach((button, index) => this.bindButton(button, () => this.onCandidate(index)));
    this.statIncreaseButtons.forEach((button, index) => this.bindButton(button, () => this.onIncreaseStat(index)));
    this.statDecreaseButtons.forEach((button, index) => this.bindButton(button, () => this.onDecreaseStat(index)));
    this.nicknameInput?.on?.('editing-did-ended', this.onIdentityEdited, this);
  }

  private bindButton(button: CharacterCreationButtonLike | undefined, callback: () => void): void {
    if (!button) return;
    button.on?.('click', callback, this);
    this.buttonBindings.push({ button, callback });
  }

  private render(): void {
    const vm = this.viewModel;
    const visible = vm ? !!vm.visible : this.facade !== null;
    if (this.rootNode) this.rootNode.active = visible;
    if (visible !== this.lastVisible) {
      this.lastVisible = visible;
      this.onVisibilityChanged?.(visible);
    }
    if (!vm) {
      if (this.errorLabel) this.errorLabel.string = this.actionError;
      return;
    }

    if (this.titleLabel) this.titleLabel.string = vm.title;
    if (this.descriptionLabel) this.descriptionLabel.string = vm.description;
    if (this.progressLabel) this.progressLabel.string = vm.progressText;
    if (this.errorLabel) this.errorLabel.string = this.actionError || vm.errorText;
    if (this.nicknameInput && vm.step === 'IDENTITY') this.nicknameInput.string = vm.nickname;

    this.stepNodes.forEach((node, index) => { node.active = index === vm.stepIndex; });
    if (this.optionSectionNode) {
      this.optionSectionNode.active = vm.step === 'INDUSTRY'
        || vm.step === 'DIRECTION'
        || vm.step === 'PROFESSION'
        || vm.step === 'SECT';
    }
    if (this.identitySectionNode) this.identitySectionNode.active = vm.step === 'IDENTITY';
    if (this.destinySectionNode) this.destinySectionNode.active = vm.step === 'DESTINY';
    if (this.allocationSectionNode) this.allocationSectionNode.active = vm.step === 'ALLOCATION';
    if (this.confirmationSectionNode) this.confirmationSectionNode.active = vm.step === 'CONFIRM';
    this.optionNodes.forEach((node, index) => { node.active = index < vm.options.length; });
    this.optionTitleLabels.forEach((label, index) => {
      const item = vm.options[index];
      label.string = item ? `${item.selected ? '已选 · ' : ''}${item.title}` : '';
    });
    this.optionDescriptionLabels.forEach((label, index) => { label.string = vm.options[index]?.description ?? ''; });
    this.optionButtons.forEach((button, index) => { button.interactable = vm.options[index]?.enabled === true; });

    this.avatarNodes.forEach((node, index) => { node.active = index < vm.avatarOptions.length; });
    this.avatarLabels.forEach((label, index) => {
      const avatar = vm.avatarOptions[index];
      label.string = avatar ? `${avatar.selected ? '已选 · ' : ''}${avatar.title}` : '';
    });
    this.avatarButtons.forEach((button, index) => { button.interactable = vm.avatarOptions[index]?.enabled === true; });
    this.backgroundNodes.forEach((node, index) => { node.active = index < vm.backgroundOptions.length; });
    this.backgroundTitleLabels.forEach((label, index) => {
      const background = vm.backgroundOptions[index];
      label.string = background ? `${background.selected ? '已选 · ' : ''}${background.title}` : '';
    });
    this.backgroundDescriptionLabels.forEach((label, index) => { label.string = vm.backgroundOptions[index]?.description ?? ''; });
    this.backgroundButtons.forEach((button, index) => { button.interactable = vm.backgroundOptions[index]?.enabled === true; });

    this.candidateNodes.forEach((node, index) => { node.active = index < vm.candidates.length && vm.step === 'DESTINY'; });
    this.candidateTitleLabels.forEach((label, index) => {
      const candidate = vm.candidates[index];
      label.string = candidate ? `${candidate.selected ? '已选 · ' : ''}${candidate.title}` : '';
    });
    this.candidateDescriptionLabels.forEach((label, index) => { label.string = vm.candidates[index]?.description ?? ''; });
    this.candidateButtons.forEach((button, index) => {
      button.interactable = vm.step === 'DESTINY' && index < vm.candidates.length;
    });

    this.statLabels.forEach((label, index) => {
      const stat = vm.stats[index];
      label.string = stat ? `${stat.label} ${stat.value}${stat.allocated > 0 ? ` (+${stat.allocated})` : ''}` : '';
    });
    this.statIncreaseButtons.forEach((button, index) => { button.interactable = vm.stats[index]?.canIncrease === true; });
    this.statDecreaseButtons.forEach((button, index) => { button.interactable = vm.stats[index]?.canDecrease === true; });
    if (this.remainingPointsLabel) this.remainingPointsLabel.string = `剩余潜力：${vm.remainingPoints}`;

    if (this.backButton) this.backButton.interactable = vm.canBack;
    if (this.nextButton) this.nextButton.interactable = vm.canContinue;
    if (this.nextButtonLabel) this.nextButtonLabel.string = vm.nextLabel;
    if (this.rerollButton) this.rerollButton.interactable = vm.canReroll;
    if (this.rerollLabel) this.rerollLabel.string = `免费推演：${vm.rerollsRemaining} 次`;
    if (this.resetAllocationButton) {
      this.resetAllocationButton.interactable = vm.step === 'ALLOCATION'
        && vm.stats.some((stat) => stat.allocated > 0);
    }
    this.confirmationLabels.forEach((label, index) => { label.string = vm.confirmationLines[index] ?? ''; });
  }

  private readonly onBack = (): void => {
    if (!this.viewModel?.canBack) return;
    this.perform(() => this.facade!.characterCreationBack());
  };

  private readonly onNext = (): void => {
    const vm = this.viewModel;
    if (!vm?.canContinue) return;
    if (vm.isBackfill) {
      this.perform(() => this.facade!.characterCreationCompleteBackfill());
    } else if (vm.canFinalize) {
      this.perform(() => this.facade!.characterCreationFinalize());
    } else if (vm.step === 'IDENTITY') {
      const avatarId = vm.avatarOptions.find((item) => item.selected)?.id ?? 'avatar-1';
      this.performSequence(
        () => this.facade!.characterCreationSetIdentity(this.nicknameInput?.string ?? vm.nickname, avatarId),
        () => this.facade!.characterCreationAdvance(),
      );
    } else {
      this.perform(() => this.facade!.characterCreationAdvance());
    }
  };

  private readonly onReroll = (): void => {
    if (this.viewModel?.canReroll) this.perform(() => this.facade!.characterCreationReroll());
  };

  private readonly onResetAllocation = (): void => {
    if (this.viewModel?.step === 'ALLOCATION') {
      this.perform(() => this.facade!.characterCreationResetAllocation());
    }
  };

  private readonly onIdentityEdited = (): void => {
    const vm = this.viewModel;
    if (vm?.step !== 'IDENTITY') return;
    const avatarId = vm.avatarOptions.find((item) => item.selected)?.id ?? 'avatar-1';
    this.perform(() => this.facade!.characterCreationSetIdentity(this.nicknameInput?.string ?? '', avatarId));
  };

  private onOption(index: number): void {
    const vm = this.viewModel;
    const selected = vm?.options[index];
    if (!vm || !selected?.enabled) return;
    switch (vm.step) {
      case 'INDUSTRY': this.perform(() => this.facade!.characterCreationSelectIndustry(selected.id)); break;
      case 'DIRECTION': this.perform(() => this.facade!.characterCreationSelectDirection(selected.id)); break;
      case 'PROFESSION': this.perform(() => this.facade!.characterCreationSelectProfession(selected.id)); break;
      case 'SECT': this.perform(() => this.facade!.characterCreationSelectSect(selected.id)); break;
      case 'IDENTITY':
      case 'DESTINY':
      case 'ALLOCATION':
      case 'CONFIRM': break;
    }
  }

  private onAvatar(index: number): void {
    const vm = this.viewModel;
    const avatar = vm?.avatarOptions[index];
    if (vm?.step !== 'IDENTITY' || !avatar?.enabled) return;
    this.perform(() => this.facade!.characterCreationSetIdentity(this.nicknameInput?.string ?? vm.nickname, avatar.id));
  }

  private onBackground(index: number): void {
    const vm = this.viewModel;
    const background = vm?.backgroundOptions[index];
    if (vm?.step !== 'IDENTITY' || !background?.enabled) return;
    this.perform(() => this.facade!.characterCreationSetBackground(background.id));
  }

  private onCandidate(index: number): void {
    const candidate = this.viewModel?.candidates[index];
    if (candidate && this.viewModel?.step === 'DESTINY') {
      this.perform(() => this.facade!.characterCreationSelectCandidate(candidate.id));
    }
  }

  private onIncreaseStat(index: number): void {
    const stat = STAT_KEYS[index] as StatKey | undefined;
    if (!stat || this.viewModel?.stats[index]?.canIncrease !== true) return;
    this.perform(() => this.facade!.characterCreationAllocate(stat, 1));
  }

  private onDecreaseStat(index: number): void {
    const stat = STAT_KEYS[index] as StatKey | undefined;
    if (!stat || this.viewModel?.stats[index]?.canDecrease !== true) return;
    this.perform(() => this.facade!.characterCreationAllocate(stat, -1));
  }

  private perform(action: () => CharacterCreationResult): void {
    if (!this.facade) return;
    try {
      const result = action();
      this.actionError = result.success ? '' : (result.reason ?? '操作失败，请重试');
    } catch (error) {
      this.actionError = error instanceof Error ? error.message : String(error);
    }
    this.refresh();
  }

  private performSequence(first: () => CharacterCreationResult, second: () => CharacterCreationResult): void {
    if (!this.facade) return;
    try {
      const firstResult = first();
      if (!firstResult.success) {
        this.actionError = firstResult.reason ?? '操作失败，请重试';
      } else {
        const secondResult = second();
        this.actionError = secondResult.success ? '' : (secondResult.reason ?? '操作失败，请重试');
      }
    } catch (error) {
      this.actionError = error instanceof Error ? error.message : String(error);
    }
    this.refresh();
  }
}
