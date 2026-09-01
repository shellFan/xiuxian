export type PlatformKind = 'mock' | 'web' | 'desktop' | 'wechat';

export interface PlatformSystemInfo {
  readonly platform: PlatformKind;
  readonly language: string;
  readonly screenWidth: number;
  readonly screenHeight: number;
}

export interface SharePayload {
  readonly title: string;
  readonly description?: string;
}

export interface PlatformService {
  getPlatform(): PlatformKind;
  isWechatMiniGame(): boolean;
  isWindows(): boolean;
  isWeb(): boolean;
  getSystemInfo(): PlatformSystemInfo;
  vibrate(durationMs?: number): void;
  share(payload: SharePayload): void;
  openUrl(url: string): void;
  onShow(callback: () => void): void;
  onHide(callback: () => void): void;
}

type ShowHideListener = () => void;

abstract class BasePlatform implements PlatformService {
  private readonly showListeners = new Set<ShowHideListener>();
  private readonly hideListeners = new Set<ShowHideListener>();

  public abstract getPlatform(): PlatformKind;
  public isWechatMiniGame(): boolean { return this.getPlatform() === 'wechat' && hasWx(); }
  public isWindows(): boolean { return this.getPlatform() === 'desktop'; }
  public isWeb(): boolean { return this.getPlatform() === 'web'; }

  public getSystemInfo(): PlatformSystemInfo {
    return {
      platform: this.getPlatform(),
      language: 'zh-CN',
      screenWidth: 720,
      screenHeight: 1280,
    };
  }

  public vibrate(_durationMs?: number): void { /* no-op / platform fallback */ }
  public share(_payload: SharePayload): void { /* no-op / platform fallback */ }
  public openUrl(_url: string): void { /* no-op / platform fallback */ }

  public onShow(callback: ShowHideListener): void { this.showListeners.add(callback); }
  public onHide(callback: ShowHideListener): void { this.hideListeners.add(callback); }

  public emitShow(): void { for (const listener of this.showListeners) listener(); }
  public emitHide(): void { for (const listener of this.hideListeners) listener(); }
}

export class MockPlatformService extends BasePlatform {
  public getPlatform(): PlatformKind { return 'mock'; }
  public override isWechatMiniGame(): boolean { return false; }
  public override isWindows(): boolean { return false; }
  public override isWeb(): boolean { return false; }
}

export class WebPlatformService extends BasePlatform {
  public getPlatform(): PlatformKind { return 'web'; }
}

export class DesktopPlatformService extends BasePlatform {
  public getPlatform(): PlatformKind { return 'desktop'; }
}

export class WechatPlatformService extends BasePlatform {
  public getPlatform(): PlatformKind { return 'wechat'; }

  public override vibrate(): void {
    try { getWx()?.vibrateShort?.({ type: 'light' }); } catch { /* missing wx must not throw */ }
  }

  public override share(payload: SharePayload): void {
    try { getWx()?.shareAppMessage?.({ title: payload.title }); } catch { /* missing wx must not throw */ }
  }

  public override onShow(callback: ShowHideListener): void {
    super.onShow(callback);
    try { getWx()?.onShow?.(callback); } catch { /* missing wx must not throw */ }
  }

  public override onHide(callback: ShowHideListener): void {
    super.onHide(callback);
    try { getWx()?.onHide?.(callback); } catch { /* missing wx must not throw */ }
  }
}

export function createPlatformService(kind: PlatformKind = 'mock'): PlatformService {
  switch (kind) {
    case 'web': return new WebPlatformService();
    case 'desktop': return new DesktopPlatformService();
    case 'wechat': return new WechatPlatformService();
    default: return new MockPlatformService();
  }
}

interface WxMiniGame {
  vibrateShort?(options?: { type?: string }): void;
  shareAppMessage?(options?: { title?: string }): void;
  onShow?(callback: () => void): void;
  onHide?(callback: () => void): void;
}

function getWx(): WxMiniGame | undefined {
  const globalRef = globalThis as { wx?: WxMiniGame };
  return globalRef.wx;
}

function hasWx(): boolean {
  return typeof getWx() === 'object' && getWx() !== null;
}
