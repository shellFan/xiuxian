import { _decorator, Component } from 'cc';

import { GameBootstrap } from './game-bootstrap';
import { LocalStorageAdapter } from '../services/storage-adapter';
import * as Cocos from 'cc';

const { ccclass } = _decorator;

@ccclass('GameBootstrapComponent')
export class GameBootstrapComponent extends Component {
  private bootstrap: GameBootstrap | undefined;

  public get context() { return this.bootstrap?.context; }

  protected onLoad(): void {
    this.bootstrap = new GameBootstrap({ storage: new LocalStorageAdapter(Cocos.sys.localStorage) });
    this.bootstrap.start();
  }

  protected onDestroy(): void {
    this.bootstrap?.destroy();
    this.bootstrap = undefined;
  }
}
