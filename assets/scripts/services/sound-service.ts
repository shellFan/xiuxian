import type { GameContext } from '../core/game-context';

/**
 * V5.8 HIGH — GameSoundEvent 接口层（§36）。
 * 不阻塞在音频资源：先提供事件接口 + 静音开关 + graceful no-audio；
 * 未来接入真实资源时只需实现 PlayableSound 接口。
 */

export type SoundEvent =
  | 'TASK_COMPLETE' | 'BOSS_WARNING' | 'BOSS_KILL' | 'RARE_DROP' | 'LEGENDARY_DROP'
  | 'PROMOTION' | 'MESSAGE' | 'OFF_WORK' | 'INCIDENT' | 'ACHIEVEMENT'
  | 'BOSS_PHASE2' | 'BURNOUT' | 'OFFER' | 'MILESTONE';

export interface SoundPlayback {
  play(event: SoundEvent, volume?: number): void;
}

/** 无声实现（graceful fallback）：事件照发，播放器缺席时零开销。 */
class SilentPlayback implements SoundPlayback {
  public play(_event: SoundEvent, _volume?: number): void { /* no audio resources yet */ }
}

export class GameSoundService {
  private player: SoundPlayback = new SilentPlayback();
  private muted = false;
  private volume = 0.6;

  public constructor(private readonly context: GameContext) {
    const on = (event: import('../core/game-events').GameEvents extends Record<string, unknown> ? string : never, sound: SoundEvent) => {
      this.context.events.on(event as never, () => this.play(sound));
    };
    on('taskCompleted', 'TASK_COMPLETE');
    on('bossPhase2', 'BOSS_WARNING');
    on('bossExclusiveDrop', 'LEGENDARY_DROP');
    on('burnoutTriggered', 'BURNOUT');
    on('offerReceived', 'OFFER');
    on('milestoneReached', 'MILESTONE');
    on('daySettled', 'OFF_WORK');
  }

  public setPlayer(player: SoundPlayback): void { this.player = player; }
  public setMuted(muted: boolean): void { this.muted = muted; }
  public isMuted(): boolean { return this.muted; }
  public setVolume(volume: number): void { this.volume = Math.max(0, Math.min(1, volume)); }

  public play(event: SoundEvent, volumeOverride?: number): void {
    if (this.muted) return;
    try { this.player.play(event, volumeOverride ?? this.volume); } catch { /* 声音失败永不影响游戏 */ }
    this.context.events.emit('soundEvent', { event, volume: volumeOverride ?? this.volume });
  }
}
