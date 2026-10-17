import * as Cocos from 'cc';
import type { GameFacade } from '../facade/game-facade';
import type { CharacterOnboardingView } from '../v59/character-creation-service';
import {
  CharacterCreationWizardComponent,
  type CharacterCreationButtonLike,
  type CharacterCreationFacade,
  type CharacterCreationInputLike,
  type CharacterCreationNodeLike,
  type CharacterCreationTextLike,
} from './character-creation-wizard-component';

interface RuntimeNode extends CharacterCreationNodeLike {
  readonly name?: string;
  readonly children?: readonly RuntimeNode[];
  addChild?(child: RuntimeNode): void;
  addComponent?<T>(type: new () => T): T;
  setPosition?(x: number, y: number, z?: number): void;
  setSiblingIndex?(index: number): void;
  destroy?(): void;
  on?(event: string, callback: () => void, target?: unknown): void;
  off?(event: string, callback: () => void, target?: unknown): void;
}

interface RuntimeTransform { setContentSize?(width: number, height: number): void; }
interface RuntimeLabel extends CharacterCreationTextLike {
  fontSize?: number;
  lineHeight?: number;
  color?: unknown;
  overflow?: number;
  horizontalAlign?: number;
  verticalAlign?: number;
}
interface RuntimeButtonComponent { interactable?: boolean; }
interface RuntimeSprite { color?: unknown; }
interface RuntimeGraphics {
  fillColor?: unknown;
  clear?(): void;
  rect?(x: number, y: number, width: number, height: number): void;
  fill?(): void;
}
interface RuntimeWidget {
  isAlignTop?: boolean;
  isAlignBottom?: boolean;
  isAlignLeft?: boolean;
  isAlignRight?: boolean;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}
interface RuntimeEditBox extends CharacterCreationInputLike {
  textLabel?: RuntimeLabel;
  placeholderLabel?: RuntimeLabel;
  maxLength?: number;
}

type RuntimeConstructor<T> = new (...args: never[]) => T;

interface CocosRuntime {
  Node?: new (name?: string) => RuntimeNode;
  UITransform?: RuntimeConstructor<RuntimeTransform>;
  Label?: RuntimeConstructor<RuntimeLabel>;
  Button?: RuntimeConstructor<RuntimeButtonComponent>;
  Sprite?: RuntimeConstructor<RuntimeSprite>;
  Graphics?: RuntimeConstructor<RuntimeGraphics>;
  Widget?: RuntimeConstructor<RuntimeWidget>;
  EditBox?: RuntimeConstructor<RuntimeEditBox>;
  Color?: new (r: number, g: number, b: number, a?: number) => unknown;
}

type CharacterCreationRuntimeFacade = CharacterCreationFacade & Pick<GameFacade,
  | 'queryCharacterOnboarding'
  | 'characterCreationAdvanceOnboarding'
  | 'characterCreationSkipOnboarding'
  | 'characterCreationStartGame'
>;

export interface CharacterCreationRuntimeView {
  readonly root: RuntimeNode;
  readonly controller: CharacterCreationWizardComponent;
  refresh(): void;
  destroy(): void;
}

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;

/**
 * Builds the complete V5.9-A wizard under the existing SafeAreaRoot.
 * COMPLETE saves allocate no Cocos nodes; required/backfill states fail closed
 * into the wizard and keep all state access behind CharacterCreationFacade.
 */
export function mountCharacterCreationRuntimeView(
  parentNode: unknown,
  facade: CharacterCreationRuntimeFacade,
  onVisibilityChanged: (visible: boolean) => void,
): CharacterCreationRuntimeView | null {
  let creationRequired = true;
  let onboardingRequired = true;
  try {
    creationRequired = facade.queryCharacterCreation().status !== 'COMPLETE';
    onboardingRequired = creationRequired || facade.queryCharacterOnboarding().step !== 'COMPLETE';
  } catch {
    // Fail closed when either persisted flow cannot be queried.
  }
  if (!creationRequired && !onboardingRequired) {
    onVisibilityChanged(false);
    return null;
  }

  const cc = Cocos as unknown as CocosRuntime;
  const parent = parentNode as RuntimeNode;
  if (!cc.Node || !cc.UITransform || !cc.Label || !cc.Button || !parent.addChild) {
    return null;
  }

  const root = createNode(cc, 'V59CharacterCreationWizard', parent, DESIGN_WIDTH, DESIGN_HEIGHT, 0, 0);
  root.active = false;
  stretchToParent(cc, root);
  addPanel(cc, root, DESIGN_WIDTH, DESIGN_HEIGHT, [12, 17, 31, 252]);

  const card = createNode(cc, 'CreationCard', root, 660, 1160, 0, 0);
  addPanel(cc, card, 660, 1160, [28, 36, 57, 255]);

  const progressLabel = createLabel(cc, card, 'CreationProgressLabel', '', 22, 600, 42, 0, 510);
  const titleLabel = createLabel(cc, card, 'CreationTitleLabel', '', 38, 600, 58, 0, 455);
  const descriptionLabel = createLabel(cc, card, 'CreationDescriptionLabel', '', 22, 600, 70, 0, 395);
  const errorLabel = createLabel(cc, card, 'CreationErrorLabel', '', 20, 600, 54, 0, -402, [255, 130, 130, 255]);

  const optionSection = createNode(cc, 'CreationOptionSection', card, 600, 680, 0, -5);
  const optionNodes: RuntimeNode[] = [];
  const optionTitleLabels: RuntimeLabel[] = [];
  const optionDescriptionLabels: RuntimeLabel[] = [];
  const optionButtons: CharacterCreationButtonLike[] = [];
  for (let index = 0; index < 8; index += 1) {
    const row = createButton(cc, optionSection, `CreationOptionButton${index}`, '', 570, 74, 0, 280 - index * 80);
    optionNodes.push(row.node);
    optionButtons.push(row.button);
    optionTitleLabels.push(createLabel(cc, row.node, `CreationOptionTitle${index}`, '', 22, 530, 28, 0, 21));
    optionDescriptionLabels.push(createLabel(cc, row.node, `CreationOptionDescription${index}`, '', 13, 540, 44, 0, -12));
  }

  const identitySection = createNode(cc, 'CreationIdentitySection', card, 600, 680, 0, -5);
  const nicknameInput = createEditBox(cc, identitySection, 'CreationNicknameInput', '请输入 2-12 字昵称', 570, 78, 0, 272);
  const avatarNodes: RuntimeNode[] = [];
  const avatarLabels: RuntimeLabel[] = [];
  const avatarButtons: CharacterCreationButtonLike[] = [];
  for (let index = 0; index < 4; index += 1) {
    const x = index % 2 === 0 ? -145 : 145;
    const y = index < 2 ? 155 : 52;
    const row = createButton(cc, identitySection, `CreationAvatarButton${index}`, '', 270, 80, x, y);
    avatarNodes.push(row.node);
    avatarButtons.push(row.button);
    avatarLabels.push(createLabel(cc, row.node, `CreationAvatarLabel${index}`, '', 23, 240, 44, 0, 0));
  }
  const backgroundNodes: RuntimeNode[] = [];
  const backgroundTitleLabels: RuntimeLabel[] = [];
  const backgroundDescriptionLabels: RuntimeLabel[] = [];
  const backgroundButtons: CharacterCreationButtonLike[] = [];
  for (let index = 0; index < 3; index += 1) {
    const row = createButton(cc, identitySection, `CreationBackgroundButton${index}`, '', 570, 95, 0, -82 - index * 110);
    backgroundNodes.push(row.node);
    backgroundButtons.push(row.button);
    backgroundTitleLabels.push(createLabel(cc, row.node, `CreationBackgroundTitle${index}`, '', 23, 520, 34, 0, 18));
    backgroundDescriptionLabels.push(createLabel(cc, row.node, `CreationBackgroundDescription${index}`, '', 18, 520, 38, 0, -24));
  }

  const destinySection = createNode(cc, 'CreationDestinySection', card, 600, 680, 0, -5);
  const candidateNodes: RuntimeNode[] = [];
  const candidateTitleLabels: RuntimeLabel[] = [];
  const candidateDescriptionLabels: RuntimeLabel[] = [];
  const candidateButtons: CharacterCreationButtonLike[] = [];
  for (let index = 0; index < 3; index += 1) {
    const row = createButton(cc, destinySection, `CreationCandidateButton${index}`, '', 570, 155, 0, 220 - index * 175);
    candidateNodes.push(row.node);
    candidateButtons.push(row.button);
    candidateTitleLabels.push(createLabel(cc, row.node, `CreationCandidateTitle${index}`, '', 27, 520, 38, 0, 42));
    candidateDescriptionLabels.push(createLabel(cc, row.node, `CreationCandidateDescription${index}`, '', 18, 520, 92, 0, -27));
  }
  const reroll = createButton(cc, destinySection, 'CreationRerollButton', '', 300, 66, 0, -330);
  const rerollLabel = createLabel(cc, reroll.node, 'CreationRerollLabel', '', 21, 270, 40, 0, 0);

  const allocationSection = createNode(cc, 'CreationAllocationSection', card, 600, 680, 0, -5);
  const remainingPointsLabel = createLabel(cc, allocationSection, 'CreationRemainingPointsLabel', '', 28, 570, 50, 0, 268);
  const statLabels: RuntimeLabel[] = [];
  const statDecreaseButtons: CharacterCreationButtonLike[] = [];
  const statIncreaseButtons: CharacterCreationButtonLike[] = [];
  for (let index = 0; index < 5; index += 1) {
    const y = 170 - index * 92;
    statLabels.push(createLabel(cc, allocationSection, `CreationStatLabel${index}`, '', 25, 330, 54, -100, y));
    const decrease = createButton(cc, allocationSection, `CreationStatDecreaseButton${index}`, '−', 76, 60, 130, y);
    statDecreaseButtons.push(decrease.button);
    const increase = createButton(cc, allocationSection, `CreationStatIncreaseButton${index}`, '+5', 76, 60, 220, y);
    statIncreaseButtons.push(increase.button);
  }
  const resetAllocation = createButton(cc, allocationSection, 'CreationResetAllocationButton', '重置分配', 260, 66, 0, -328);

  const confirmationSection = createNode(cc, 'CreationConfirmationSection', card, 600, 680, 0, -5);
  const confirmationLabels: RuntimeLabel[] = [];
  for (let index = 0; index < 9; index += 1) {
    confirmationLabels.push(createLabel(
      cc,
      confirmationSection,
      `CreationConfirmationLabel${index}`,
      '',
      24,
      540,
      48,
      0,
      255 - index * 65,
    ));
  }

  const back = createButton(cc, card, 'CreationBackButton', '上一步', 210, 76, -175, -492);
  const next = createButton(cc, card, 'CreationNextButton', '', 290, 76, 140, -492, [70, 130, 215, 255]);
  const nextButtonLabel = createLabel(cc, next.node, 'CreationNextButtonLabel', '', 25, 260, 44, 0, 0);

  const onboardingRoot = createNode(cc, 'CharacterOnboardingRoot', parent, DESIGN_WIDTH, DESIGN_HEIGHT, 0, 0);
  onboardingRoot.active = false;
  stretchToParent(cc, onboardingRoot);
  addPanel(cc, onboardingRoot, DESIGN_WIDTH, DESIGN_HEIGHT, [12, 17, 31, 252]);
  const onboardingCard = createNode(cc, 'CharacterOnboardingCard', onboardingRoot, 660, 720, 0, 0);
  addPanel(cc, onboardingCard, 660, 720, [28, 36, 57, 255]);
  createLabel(cc, onboardingCard, 'CharacterOnboardingProgress', '入职渡劫 · 新人引导', 23, 560, 52, 0, 265);
  const onboardingTitle = createLabel(cc, onboardingCard, 'CharacterOnboardingTitle', '', 37, 560, 100, 0, 170);
  const onboardingBody = createLabel(cc, onboardingCard, 'CharacterOnboardingBody', '', 25, 540, 190, 0, 20);
  const onboardingTask = createLabel(cc, onboardingCard, 'CharacterOnboardingTask', '', 23, 540, 96, 0, -160, [245, 205, 119, 255]);
  const onboardingError = createLabel(cc, onboardingCard, 'CharacterOnboardingError', '', 18, 560, 52, 0, -235, [255, 130, 130, 255]);
  const onboardingNext = createButton(cc, onboardingCard, 'CharacterOnboardingNextButton', '', 300, 78, -155, -292, [70, 130, 215, 255]);
  const onboardingNextLabel = createLabel(cc, onboardingNext.node, 'CharacterOnboardingNextLabel', '', 23, 280, 46, 0, 0);
  const onboardingSkip = createButton(cc, onboardingCard, 'CharacterOnboardingSkipButton', '跳过剧情', 230, 70, 180, -292);

  const controller = root.addComponent?.(CharacterCreationWizardComponent);
  if (!controller) {
    root.destroy?.();
    return null;
  }
  controller.bindFacadeOnLoad = false;
  controller.rootNode = root;
  controller.optionSectionNode = optionSection;
  controller.identitySectionNode = identitySection;
  controller.destinySectionNode = destinySection;
  controller.allocationSectionNode = allocationSection;
  controller.confirmationSectionNode = confirmationSection;
  controller.titleLabel = titleLabel;
  controller.descriptionLabel = descriptionLabel;
  controller.progressLabel = progressLabel;
  controller.errorLabel = errorLabel;
  controller.optionNodes = optionNodes;
  controller.optionTitleLabels = optionTitleLabels;
  controller.optionDescriptionLabels = optionDescriptionLabels;
  controller.optionButtons = optionButtons;
  controller.nicknameInput = nicknameInput;
  controller.avatarNodes = avatarNodes;
  controller.avatarLabels = avatarLabels;
  controller.avatarButtons = avatarButtons;
  controller.backgroundNodes = backgroundNodes;
  controller.backgroundTitleLabels = backgroundTitleLabels;
  controller.backgroundDescriptionLabels = backgroundDescriptionLabels;
  controller.backgroundButtons = backgroundButtons;
  controller.candidateNodes = candidateNodes;
  controller.candidateTitleLabels = candidateTitleLabels;
  controller.candidateDescriptionLabels = candidateDescriptionLabels;
  controller.candidateButtons = candidateButtons;
  controller.statLabels = statLabels;
  controller.statDecreaseButtons = statDecreaseButtons;
  controller.statIncreaseButtons = statIncreaseButtons;
  controller.remainingPointsLabel = remainingPointsLabel;
  controller.backButton = back.button;
  controller.nextButton = next.button;
  controller.nextButtonLabel = nextButtonLabel;
  controller.rerollButton = reroll.button;
  controller.rerollLabel = rerollLabel;
  controller.resetAllocationButton = resetAllocation.button;
  controller.confirmationLabels = confirmationLabels;
  let synchronizing = false;
  let lastReportedVisibility: boolean | null = null;
  const syncVisibility = (): void => {
    if (synchronizing) return;
    synchronizing = true;
    try {
      let needsCreation = true;
      let needsOnboarding = true;
      try {
        needsCreation = facade.queryCharacterCreation().status !== 'COMPLETE';
        if (needsCreation) {
          needsOnboarding = false;
        } else {
          const onboarding = facade.queryCharacterOnboarding();
          needsOnboarding = onboarding.step !== 'COMPLETE';
          renderOnboarding(onboarding);
        }
      } catch (error) {
        needsOnboarding = !needsCreation;
        onboardingError.string = error instanceof Error ? error.message : String(error);
      }
      root.active = needsCreation;
      onboardingRoot.active = !needsCreation && needsOnboarding;
      const visible = needsCreation || needsOnboarding;
      if (visible !== lastReportedVisibility) {
        lastReportedVisibility = visible;
        onVisibilityChanged(visible);
      }
    } finally {
      synchronizing = false;
    }
  };
  const renderOnboarding = (view: CharacterOnboardingView): void => {
    onboardingTitle.string = view.title;
    onboardingBody.string = view.body;
    onboardingTask.string = view.step === 'INTRO_4' || view.step === 'READY' ? `首份差事：${view.firstTaskTitle}` : '';
    onboardingNextLabel.string = view.step === 'READY' ? '开始修炼' : '继续';
    onboardingSkip.button.interactable = view.step !== 'READY';
  };
  const runOnboardingAction = (action: () => { success: boolean; reason?: string }): void => {
    try {
      const result = action();
      onboardingError.string = result.success ? '' : (result.reason ?? '操作失败，请重试');
    } catch (error) {
      onboardingError.string = error instanceof Error ? error.message : String(error);
    }
    syncVisibility();
  };
  onboardingNext.button.on?.('click', () => {
    let step: CharacterOnboardingView['step'] = 'COMPLETE';
    try { step = facade.queryCharacterOnboarding().step; } catch { /* sync reports the error */ }
    runOnboardingAction(() => step === 'READY'
      ? facade.characterCreationStartGame()
      : facade.characterCreationAdvanceOnboarding());
  });
  onboardingSkip.button.on?.('click', () => runOnboardingAction(() => facade.characterCreationSkipOnboarding()));
  controller.onVisibilityChanged = syncVisibility;
  controller.bindFacade(facade);
  root.setSiblingIndex?.((parent.children?.length ?? 1) - 1);
  syncVisibility();

  return {
    root,
    controller,
    refresh: () => { controller.refresh(); syncVisibility(); },
    destroy: () => {
      controller.unbindFacade();
      root.destroy?.();
      onboardingRoot.destroy?.();
    },
  };
}

function createNode(
  cc: CocosRuntime,
  name: string,
  parent: RuntimeNode,
  width: number,
  height: number,
  x: number,
  y: number,
): RuntimeNode {
  const node = new cc.Node!(name);
  parent.addChild?.(node);
  node.setPosition?.(x, y, 0);
  const transform = cc.UITransform ? node.addComponent?.(cc.UITransform) : undefined;
  transform?.setContentSize?.(width, height);
  return node;
}

function stretchToParent(cc: CocosRuntime, node: RuntimeNode): void {
  if (!cc.Widget) return;
  const widget = node.addComponent?.(cc.Widget);
  if (!widget) return;
  widget.isAlignTop = true;
  widget.isAlignBottom = true;
  widget.isAlignLeft = true;
  widget.isAlignRight = true;
  widget.top = 0;
  widget.bottom = 0;
  widget.left = 0;
  widget.right = 0;
}

function addPanel(
  cc: CocosRuntime,
  node: RuntimeNode,
  width: number,
  height: number,
  rgba: readonly number[],
): void {
  if (cc.Graphics && cc.Color) {
    const graphics = node.addComponent?.(cc.Graphics);
    if (!graphics) return;
    graphics.clear?.();
    graphics.fillColor = new cc.Color(rgba[0], rgba[1], rgba[2], rgba[3]);
    graphics.rect?.(-width / 2, -height / 2, width, height);
    graphics.fill?.();
    return;
  }
  if (cc.Sprite) {
    const sprite = node.addComponent?.(cc.Sprite);
    if (sprite && cc.Color) sprite.color = new cc.Color(rgba[0], rgba[1], rgba[2], rgba[3]);
  }
}

function createLabel(
  cc: CocosRuntime,
  parent: RuntimeNode,
  name: string,
  text: string,
  fontSize: number,
  width: number,
  height: number,
  x: number,
  y: number,
  rgba: readonly number[] = [232, 239, 255, 255],
): RuntimeLabel {
  const node = createNode(cc, name, parent, width, height, x, y);
  const label = node.addComponent?.(cc.Label!) as RuntimeLabel;
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.ceil(fontSize * 1.35);
  label.overflow = 2;
  label.horizontalAlign = 1;
  label.verticalAlign = 1;
  if (cc.Color) label.color = new cc.Color(rgba[0], rgba[1], rgba[2], rgba[3]);
  return label;
}

function createButton(
  cc: CocosRuntime,
  parent: RuntimeNode,
  name: string,
  text: string,
  width: number,
  height: number,
  x: number,
  y: number,
  rgba: readonly number[] = [49, 64, 91, 255],
): { readonly node: RuntimeNode; readonly button: CharacterCreationButtonLike } {
  const node = createNode(cc, name, parent, width, height, x, y);
  addPanel(cc, node, width, height, rgba);
  const component = node.addComponent?.(cc.Button!) as RuntimeButtonComponent;
  if (text) createLabel(cc, node, `${name}Text`, text, 23, width - 24, height - 12, 0, 0);
  const button: CharacterCreationButtonLike = {
    on: (event, callback, target) => node.on?.(event, callback, target),
    off: (event, callback, target) => node.off?.(event, callback, target),
    get interactable() { return component.interactable; },
    set interactable(value) { component.interactable = value; },
  };
  return { node, button };
}

function createEditBox(
  cc: CocosRuntime,
  parent: RuntimeNode,
  name: string,
  placeholder: string,
  width: number,
  height: number,
  x: number,
  y: number,
): RuntimeEditBox {
  const node = createNode(cc, name, parent, width, height, x, y);
  addPanel(cc, node, width, height, [42, 53, 76, 255]);
  const textLabel = createLabel(cc, node, `${name}Text`, '', 24, width - 36, height - 14, 0, 0);
  const placeholderLabel = createLabel(cc, node, `${name}Placeholder`, placeholder, 22, width - 36, height - 14, 0, 0, [143, 157, 184, 255]);
  let fallbackValue = '';
  let component: RuntimeEditBox | undefined;
  if (cc.EditBox) {
    component = node.addComponent?.(cc.EditBox) as RuntimeEditBox;
    component.textLabel = textLabel;
    component.placeholderLabel = placeholderLabel;
    component.maxLength = 12;
  }
  return {
    get string() { return component?.string ?? fallbackValue; },
    set string(value: string) {
      fallbackValue = value;
      if (component) component.string = value;
    },
    on: (event, callback, target) => node.on?.(event, callback, target),
    off: (event, callback, target) => node.off?.(event, callback, target),
  };
}
