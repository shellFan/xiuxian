/**
 * V6.3 AI点评系统 — 职场修仙风战斗解说员
 *
 * 监听自动战斗事件，以"AI导师"角色对玩家表现进行吐槽/鼓励/提醒。
 * 文案池按事件类型分组，确定性选择（stage做种子），同类心情15s冷却防刷屏。
 */

import type { GameContext } from '../core/game-context';

type Mood = 'praise' | 'sarcasm' | 'warn' | 'cheer';

interface CommentEntry {
  readonly text: string;
  readonly mood: Mood;
  readonly emoji: string;
}

// ── 文案池 ───────────────────────────────────────────────────────────────────

const ON_VICTORY: readonly CommentEntry[] = [
  { text: '这个Bug修得行云流水！', mood: 'praise', emoji: '😎' },
  { text: '代码质量+1，老板又拿去PPT吹了', mood: 'sarcasm', emoji: '📝' },
  { text: '击杀效率不错，KPI稳了', mood: 'praise', emoji: '📈' },
  { text: '这波操作我给满分', mood: 'cheer', emoji: '👏' },
  { text: '敌人倒下的姿势很标准', mood: 'sarcasm', emoji: '🤺' },
  { text: '又消灭一个伪需求，世界清静了', mood: 'cheer', emoji: '🧘' },
];

const ON_STAGE_ADVANCED: readonly CommentEntry[] = [
  { text: '又推一关，离996飞升更近了', mood: 'cheer', emoji: '🚀' },
  { text: '进度条动了！产品经理都惊了', mood: 'praise', emoji: '📊' },
  { text: '稳步推进，架构师看了都点赞', mood: 'praise', emoji: '🏗️' },
  { text: '这速度，年终奖有着落了', mood: 'cheer', emoji: '💰' },
  { text: '关卡推进中，摸鱼两不误', mood: 'sarcasm', emoji: '🐟' },
];

const ON_BOSS_PENDING: readonly CommentEntry[] = [
  { text: '大Boss来了！快去打卡牌战斗！', mood: 'warn', emoji: '⚠️' },
  { text: '章末Boss挡路，用卡牌决胜负！', mood: 'warn', emoji: '🃏' },
  { text: '这个Boss需要你亲自出马——卡牌战斗！', mood: 'warn', emoji: '⚔️' },
  { text: '自动推关到此为止，该你表演了！', mood: 'cheer', emoji: '🎪' },
];

const ON_TOWER_ADVANCED: readonly CommentEntry[] = [
  { text: '又爬一层，头发又少一根', mood: 'sarcasm', emoji: '💇' },
  { text: '996通天塔：越往上，Bug越凶', mood: 'warn', emoji: '🗼' },
  { text: '这层守关者被你的996精神感动了', mood: 'sarcasm', emoji: '🙏' },
  { text: '通天塔打卡+1，修仙进度+1', mood: 'cheer', emoji: '🧗' },
];

const ON_MEMBER_HIRED: readonly CommentEntry[] = [
  { text: '新同事入职！欢迎加入加班大军', mood: 'cheer', emoji: '🎉' },
  { text: '小队+1，摸鱼时间-1', mood: 'sarcasm', emoji: '🎣' },
  { text: '又拉一个垫背的…啊不，战友！', mood: 'sarcasm', emoji: '🤝' },
];

const ON_STUCK: readonly CommentEntry[] = [
  { text: '这关有点硬，要不要升级一下小队？', mood: 'warn', emoji: '💡' },
  { text: '卡关了？灵石花在刀刃上——升级点击或招人！', mood: 'warn', emoji: '💎' },
  { text: '敌人太肉了，提升DPS才是正道', mood: 'sarcasm', emoji: '🍖' },
  { text: '磨刀不误砍柴工，先升升级吧', mood: 'praise', emoji: '🔪' },
];

// ── 工具 ─────────────────────────────────────────────────────────────────────

const COOLDOWN_MS = 15_000;
const STUCK_THRESHOLD_SEC = 60;

/** 确定性选择：seed决定下标，同seed同文案 */
function pick(pool: readonly CommentEntry[], seed: number): CommentEntry {
  return pool[Math.abs(seed) % pool.length];
}

// ── 服务 ─────────────────────────────────────────────────────────────────────

export class AiCommentatorService {
  private lastCommentAt: Record<Mood, number> = { praise: 0, sarcasm: 0, warn: 0, cheer: 0 };
  private lastStageSeen = 0;
  private stageEnterAt = 0;

  constructor(private readonly context: GameContext, private readonly now: () => number = Date.now) {}

  /** facade初始化后调用：订阅战斗事件。 */
  public attach(): void {
    const ev = this.context.events;
    ev.on('v63Victory', (e) => this.emit(pick(ON_VICTORY, e.stage)));
    ev.on('v63StageAdvanced', (e) => {
      this.emit(pick(ON_STAGE_ADVANCED, e.stage));
      this.stageEnterAt = this.now();
      this.lastStageSeen = e.stage;
    });
    ev.on('v63BossPending', (e) => this.emit(pick(ON_BOSS_PENDING, e.stage)));
    ev.on('v63TowerAdvanced', (e) => this.emit(pick(ON_TOWER_ADVANCED, e.floor)));
    ev.on('v63TowerEntered', () => this.emit(pick(ON_TOWER_ADVANCED, 1)));
    ev.on('v63MemberHired', (e) => this.emit(pick(ON_MEMBER_HIRED, e.name.length)));
  }

  /** 每秒由GameLoop调用：检测卡关。 */
  public tick(): void {
    const ab = this.context.autoBattle;
    if (!ab) return;
    const v = ab.view();
    if (v.status !== 'FIGHTING') return;
    if (v.stage !== this.lastStageSeen) {
      this.lastStageSeen = v.stage;
      this.stageEnterAt = this.now();
      return;
    }
    const elapsed = (this.now() - this.stageEnterAt) / 1000;
    if (elapsed >= STUCK_THRESHOLD_SEC) {
      this.emit(pick(ON_STUCK, v.stage + Math.floor(elapsed / STUCK_THRESHOLD_SEC)));
      // 重置计时，每60s最多提醒一次
      this.stageEnterAt = this.now();
    }
  }

  private emit(entry: CommentEntry): void {
    const now = this.now();
    if (now - this.lastCommentAt[entry.mood] < COOLDOWN_MS) return;
    this.lastCommentAt[entry.mood] = now;
    this.context.events.emit('v63AiComment', { text: entry.text, mood: entry.mood, emoji: entry.emoji });
  }
}