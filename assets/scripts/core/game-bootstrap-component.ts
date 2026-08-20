import { _decorator, Component } from 'cc';

import { GameBootstrap } from './game-bootstrap';

const { ccclass } = _decorator;

@ccclass('GameBootstrapComponent')
export class GameBootstrapComponent extends Component {
  private bootstrap: GameBootstrap | undefined;

  protected onLoad(): void {
    this.bootstrap = new GameBootstrap();
    this.bootstrap.start();
  }

  protected onDestroy(): void {
    this.bootstrap?.destroy();
    this.bootstrap = undefined;
  }
}