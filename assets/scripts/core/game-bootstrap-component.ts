import { _decorator, Component } from 'cc';

import { GameBootstrap } from './game-bootstrap';
import { LocalStorageAdapter } from '../services/storage-adapter';
import { Phase2Root } from '../ui/phase2/phase2-root-component';
import * as Cocos from 'cc';

const { ccclass } = _decorator;

@ccclass('GameBootstrapComponent')
export class GameBootstrapComponent extends Component {
  private bootstrap: GameBootstrap | undefined;
  private phase2Root: Phase2Root | undefined;

  public get context() { return this.bootstrap?.context; }

  protected onLoad(): void {
    this.bootstrap = new GameBootstrap({ storage: new LocalStorageAdapter(Cocos.sys.localStorage) });
    this.bootstrap.start();
    this.wirePhase2Ui();
  }

  /**
   * Binds the single GameContext created above into the Phase 2 HUD. The context is never created
   * here a second time — it comes from `this.bootstrap`. The Phase2Root node lives under MainView
   * in Main.scene; if it is missing (e.g. an older scene) we simply skip wiring.
   */
  private wirePhase2Ui(): void {
    if (!this.bootstrap) return;
    // In the Cocos runtime `node` is always present; guard for headless/unit contexts.
    if (!this.node) return;
    const mainView = this.node.getChildByName('MainView');
    const phase2Node = mainView?.getChildByName('Phase2Root');
    const phase2 = phase2Node?.getComponent(Phase2Root) as Phase2Root | null;
    if (phase2) {
      this.phase2Root = phase2;
      phase2.bind(this.bootstrap.context);
    }
  }

  protected onDestroy(): void {
    this.phase2Root?.unbind();
    this.phase2Root = undefined;
    this.bootstrap?.destroy();
    this.bootstrap = undefined;
  }
}
