/**
 * CraftPageComponent — WEB V1 craft/merge page placeholder.
 *
 * Displays a "coming soon" message since the merge/craft system
 * is deferred to a later version. All visible buttons show
 * "后续版本开放" feedback via toast.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { SceneBindingComponent } from './scene-binding-component';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; active?: boolean; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}

@ccclass('CraftPage')
export class CraftPageComponent extends Component {
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  @property(resolveCocosType('Label'))
  public placeholderLabel?: TextLike;

  protected onLoad(): void {
    if (this.titleLabel) this.titleLabel.string = '合成';
    if (this.placeholderLabel) {
      this.placeholderLabel.string = '🧪 合成系统开发中...\n\n后续版本开放，敬请期待！';
    }
  }

  /** Show "coming soon" toast for any craft button. */
  public onCraftAction(): void {
    SceneBindingComponent.instance?.showToast('合成系统后续版本开放', 'INFO');
  }
}