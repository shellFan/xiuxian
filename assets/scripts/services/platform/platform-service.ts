export type PlatformKind = 'mock' | 'web' | 'desktop' | 'wechat';

/** Safe area insets for UI layout (CSS pixels). */
export interface SafeAreaInsets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface PlatformSystemInfo {
  readonly platform: PlatformKind;
  readonly language: string;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly safeArea: SafeAreaInsets;
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
  /** Register a callback for platform show. Returns unsubscribe function. */
  onShow(callback: () => void): () => void;
  /** Register a callback for platform hide. Returns unsubscribe function. */
  onHide(callback: () => void): () => void;
}

type ShowHideListener = () => void;

const DEFAULT_SAFE_AREA: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

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
      safeArea: DEFAULT_SAFE_AREA,
    };
  }

  public vibrate(_durationMs?: number): void { /* no-op / platform fallback */ }
  public share(_payload: SharePayload): void { /* no-op / platform fallback */ }
  public openUrl(_url: string): void { /* no-op / platform fallback */ }

  public onShow(callback: ShowHideListener): () => void {
    this.showListeners.add(callback);
    return () => { this.showListeners.delete(callback); };
  }
  public onHide(callback: ShowHideListener): () => void {
    this.hideListeners.add(callback);
    return () => { this.hideListeners.delete(callback); };
  }

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

  public override getSystemInfo(): PlatformSystemInfo {
    const w = typeof window !== 'undefined' ? window : undefined;
    const lang = w?.navigator?.language ?? 'zh-CN';
    const sw = w?.screen?.width ?? 720;
    const sh = w?.screen?.height ?? 1280;
    // Safe area from CSS env() — fallback to 0 when not available
    const safeArea: SafeAreaInsets = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    };
    return { platform: 'web', language: lang, screenWidth: sw, screenHeight: sh, safeArea };
  }

  public override vibrate(durationMs?: number): void {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (durationMs && durationMs > 0 && nav?.vibrate) {
        nav.vibrate(durationMs);
      } else if (nav?.vibrate) {
        nav.vibrate(15);
      }
    } catch { /* vibration not supported must not throw */ }
  }

  public override share(payload: SharePayload): void {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        nav.share({ title: payload.title, text: payload.description }).catch(() => { /* user cancelled or not supported */ });
      }
    } catch { /* share not supported must not throw */ }
  }

  public override openUrl(url: string): void {
    try {
      if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank', 'noopener');
      }
    } catch { /* blocked popup must not throw */ }
  }
}

export class DesktopPlatformService extends BasePlatform {
  public getPlatform(): PlatformKind { return 'desktop'; }

  public override getSystemInfo(): PlatformSystemInfo {
    // Cocos native: cc.sys and cc.view provide real device info
    let sw = 720;
    let sh = 1280;
    try {
      const g = globalThis as Record<string, unknown> | undefined;
      const cc = g?.cc;
      if (cc && typeof (cc as Record<string, unknown>).view === 'object') {
        const view = (cc as Record<string, unknown>).view as Record<string, unknown>;
        const getDRS = view.getDesignResolutionSize;
        if (typeof getDRS === 'function') {
          const res = getDRS.call(view) as Record<string, number> | undefined;
          if (res) { sw = res.width ?? 720; sh = res.height ?? 1280; }
        }
      }
    } catch { /* cc.view access must not throw */ }
    const lang = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN';
    const safeArea: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
    return { platform: 'desktop', language: lang, screenWidth: sw, screenHeight: sh, safeArea };
  }

  public override openUrl(url: string): void {
    try {
      // Cocos native: cc.sys.openURL
      const cc = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>).cc : undefined;
      if (cc && typeof (cc as Record<string, unknown>).sys === 'object') {
        const sys = (cc as Record<string, unknown>).sys as Record<string, unknown>;
        if (typeof sys.openURL === 'function') { sys.openURL(url); return; }
      }
    } catch { /* native open failed */ }
    // Fallback: window.open
    try { if (typeof window !== 'undefined') window.open(url, '_blank'); } catch { /* blocked */ }
  }
}

export class WechatPlatformService extends BasePlatform {
  public getPlatform(): PlatformKind { return 'wechat'; }

  public override getSystemInfo(): PlatformSystemInfo {
    try {
      const wx = getWx();
      if (wx && typeof wx.getSystemInfoSync === 'function') {
        const info = wx.getSystemInfoSync();
        const sa = (info as Record<string, unknown>).safeArea as Record<string, number> | undefined;
        const safeArea: SafeAreaInsets = {
          top: sa?.top ?? 0,
          bottom: sa?.bottom ?? 0,
          left: sa?.left ?? 0,
          right: sa?.right ?? 0,
        };
        return {
          platform: 'wechat',
          language: ((info as Record<string, unknown>).language as string) ?? 'zh-CN',
          screenWidth: ((info as Record<string, unknown>).screenWidth as number) ?? 720,
          screenHeight: ((info as Record<string, unknown>).screenHeight as number) ?? 1280,
          safeArea,
        };
      }
    } catch { /* wx.getSystemInfoSync must not throw */ }
    return super.getSystemInfo();
  }

  public override vibrate(): void {
    try { getWx()?.vibrateShort?.({ type: 'light' }); } catch { /* missing wx must not throw */ }
  }

  public override share(payload: SharePayload): void {
    try { getWx()?.shareAppMessage?.({ title: payload.title }); } catch { /* missing wx must not throw */ }
  }

  public override onShow(callback: ShowHideListener): () => void {
    const unsub = super.onShow(callback);
    try { getWx()?.onShow?.(callback); } catch { /* missing wx must not throw */ }
    return unsub;
  }

  public override onHide(callback: ShowHideListener): () => void {
    const unsub = super.onHide(callback);
    try { getWx()?.onHide?.(callback); } catch { /* missing wx must not throw */ }
    return unsub;
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

interface WxSystemInfo { readonly [key: string]: unknown; }

interface WxMiniGame {
  vibrateShort?(options?: { type?: string }): void;
  shareAppMessage?(options?: { title?: string }): void;
  onShow?(callback: () => void): void;
  onHide?(callback: () => void): void;
  getSystemInfoSync?(): WxSystemInfo;
}

function getWx(): WxMiniGame | undefined {
  const globalRef = globalThis as { wx?: WxMiniGame };
  return globalRef.wx;
}

function hasWx(): boolean {
  return typeof getWx() === 'object' && getWx() !== null;
}
