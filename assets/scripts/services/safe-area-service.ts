/**
 * SafeAreaService — platform-aware safe area insets for UI layout.
 *
 * Provides safe area insets scaled to 750-based design units so that UI
 * elements avoid overlapping with system UI (status bar, navigation bar,
 * home indicator, WeChat capsule button, etc.).
 *
 * Platform behaviour:
 *   - WeChat: reads wx.getSystemInfoSync() for statusBarHeight, safeArea,
 *     and derives capsule button position.
 *   - Web / Desktop / Mock: returns fallback padding (16/24 physical px
 *     scaled to design units).
 */

import type { PlatformKind } from './platform/platform-service';

// ── Public types ─────────────────────────────────────────────────────────────

/** Safe area insets in 750-based design units. */
export interface SafeAreaInsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly scale: number;
}

/** WeChat capsule button bounding rect in design units. */
export interface CapsuleRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Design width used for scaling physical pixels → design units. */
const DESIGN_WIDTH = 750;

/** Fallback screen dimensions (iPhone 6/7/8 class). */
const FALLBACK_SCREEN_WIDTH = 375;
const FALLBACK_SCREEN_HEIGHT = 667;
const FALLBACK_PADDING = 16;
const FALLBACK_TOP_PADDING = 24;

// ── Service ──────────────────────────────────────────────────────────────────

export class SafeAreaService {
  public constructor(private readonly platformKind: PlatformKind = 'mock') {}

  /**
   * Returns safe area insets in design units (750-based).
   *
   * On WeChat, reads wx.getSystemInfoSync() for statusBarHeight and safeArea.
   * On Web/Desktop/Mock, returns fallback padding (16/24 px scaled).
   */
  public getSafeArea(): SafeAreaInsets {
    if (this.platformKind === 'wechat') {
      return this.getWechatSafeArea();
    }
    return this.getFallbackSafeArea();
  }

  /**
   * Returns the WeChat capsule button rect in design units.
   * Only available on WeChat platform; returns null otherwise.
   *
   * The capsule is the native navigation button in the top-right corner
   * of WeChat mini-games. UI must avoid overlapping it.
   */
  public getCapsuleRect(): CapsuleRect | null {
    if (this.platformKind !== 'wechat') {
      return null;
    }
    return this.getWechatCapsuleRect();
  }

  // ── WeChat ─────────────────────────────────────────────────────────────────

  private getWechatSafeArea(): SafeAreaInsets {
    try {
      const wx = getWx();
      if (!wx) return this.getFallbackSafeArea();

      const info = wx.getSystemInfoSync();
      const screenWidth = info.screenWidth;
      const screenHeight = info.screenHeight;
      const scale = DESIGN_WIDTH / screenWidth;
      const safeArea = info.safeArea;

      return {
        left: safeArea.left * scale,
        right: (screenWidth - safeArea.right) * scale,
        top: safeArea.top * scale,
        bottom: (screenHeight - safeArea.bottom) * scale,
        screenWidth,
        screenHeight,
        scale,
      };
    } catch {
      return this.getFallbackSafeArea();
    }
  }

  private getWechatCapsuleRect(): CapsuleRect | null {
    try {
      const wx = getWx();
      if (!wx) return null;

      const info = wx.getSystemInfoSync();
      const screenWidth = info.screenWidth;
      const scale = DESIGN_WIDTH / screenWidth;
      const statusBarHeight = info.statusBarHeight ?? 0;

      // WeChat capsule button sits to the right of the status bar area.
      // Approximate dimensions based on WeChat mini-game design guidelines.
      const capsuleHeight = 32;
      const capsuleWidth = 87;
      const marginRight = 8;
      const marginTop = 4;

      return {
        left: (screenWidth - marginRight - capsuleWidth) * scale,
        right: (screenWidth - marginRight) * scale,
        top: (statusBarHeight + marginTop) * scale,
        bottom: (statusBarHeight + marginTop + capsuleHeight) * scale,
      };
    } catch {
      return null;
    }
  }

  // ── Fallback (Web / Desktop / Mock) ────────────────────────────────────────

  private getFallbackSafeArea(): SafeAreaInsets {
    const screenWidth = FALLBACK_SCREEN_WIDTH;
    const screenHeight = FALLBACK_SCREEN_HEIGHT;
    const scale = DESIGN_WIDTH / screenWidth;
    return {
      left: FALLBACK_PADDING * scale,
      right: FALLBACK_PADDING * scale,
      top: FALLBACK_TOP_PADDING * scale,
      bottom: FALLBACK_PADDING * scale,
      screenWidth,
      screenHeight,
      scale,
    };
  }
}

// ── WeChat API types (local to this module) ──────────────────────────────────

interface WxSafeArea {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface WxSystemInfo {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly statusBarHeight?: number;
  readonly safeArea: WxSafeArea;
}

interface WxMiniGameSafeArea {
  getSystemInfoSync(): WxSystemInfo;
}

function getWx(): WxMiniGameSafeArea | undefined {
  const globalRef = globalThis as { wx?: WxMiniGameSafeArea };
  return globalRef.wx;
}