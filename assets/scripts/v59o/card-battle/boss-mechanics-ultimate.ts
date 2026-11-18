/**
 * V10 ULTIMATE §8 — 四种新增 Boss 机制的纯实现（供 card-battle-service 委托、单测直测）。
 *
 * 全部为回合化语义（2 游戏秒 ≈ 1 回合）。伤害统一走 ctx.strikePlayer 权威管线，
 * 不绕过格挡/状态结算；资源类操作只触碰战斗内状态（能量/格挡），绝不修改存档。
 */
import type { CardBattleState, CardEnemy } from './card-types';

export type UltimateMechanicKind = 'ENERGY_LEECH' | 'MIRROR' | 'COUNTER_STANCE' | 'TRIBULATION_COUNTDOWN';

export interface UltimateMechanicDef {
  kind: UltimateMechanicKind;
  /** ENERGY_LEECH：抽取玩家能量点数（缺省 1）。 */
  energyDrain?: number;
  /** ENERGY_LEECH：转化为护盾的比例（占 Boss 最大生命，缺省 0.03）。 */
  shieldPct?: number;
  /** MIRROR：复制玩家卡牌伤害倍率的缩放（缺省 1）。 */
  mirrorScale?: number;
  /** COUNTER_STANCE：判定「龟缩」的格挡门槛（缺省 10）。 */
  blockGate?: number;
  /** TRIBULATION_COUNTDOWN：引爆攻击倍率（缺省 2.5）。引爆节奏由 planIntent 的 everySec 驱动（进入 SPECIAL 即引爆），此处只定强度。 */
  strikeDamageMul?: number;
}

export interface UltimateMechanicCtx {
  /** 权威伤害管线：格挡/状态结算全部在管线内完成。 */
  strikePlayer(raw: number, label?: string): void;
}

export function applyUltimateBossMechanic(
  kind: UltimateMechanicKind,
  mech: UltimateMechanicDef | undefined,
  enemy: CardEnemy,
  state: CardBattleState,
  log: (line: string) => void,
  ctx: UltimateMechanicCtx,
): void {
  switch (kind) {
    case 'ENERGY_LEECH': {
      // 抽取记录到 pendingEnergyLeech，在下个玩家回合开始时结算（startPlayerTurn）。
      // 敌人回合直接扣当前能量没有意义：startPlayerTurn 会把能量重置为基础值。
      const drain = Math.max(1, mech?.energyDrain ?? 1);
      state.pendingEnergyLeech = (state.pendingEnergyLeech ?? 0) + drain;
      const shieldGain = Math.max(4, Math.floor(enemy.maxHp * (mech?.shieldPct ?? 0.03)));
      enemy.block += shieldGain;
      log(`🫗 ${enemy.name} 吞噬了你 ${drain} 点能量（下回合生效），凝聚成 ${shieldGain} 点护盾！`);
      return;
    }
    case 'MIRROR': {
      const mulScale = mech?.mirrorScale ?? 1;
      const name = state.lastPlayedCardName;
      const mul = (state.lastPlayedDamageMul ?? 0) * mulScale;
      if (!name || mul <= 0) {
        log(`${enemy.name} 窥视着你的出牌节奏……（尚无可复制的牌）`);
        return;
      }
      const raw = Math.max(1, Math.floor(enemy.attack * mul));
      log(`🪞 ${enemy.name} 复制了你的【${name}】反噬其主！`);
      ctx.strikePlayer(raw, `${enemy.name} 的镜像·${name}`);
      return;
    }
    case 'COUNTER_STANCE': {
      const blockGate = mech?.blockGate ?? 10;
      if (state.player.block >= blockGate) {
        state.player.statuses.VULNERABLE = (state.player.statuses.VULNERABLE ?? 0) + 2;
        log(`${enemy.name} 看穿了你的龟缩！你获得 易伤 2！`);
        const heal = Math.max(2, Math.floor(enemy.maxHp * 0.03));
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
        log(`${enemy.name} 判定「防守绩效达标」，自满回复 ${heal} 点。`);
      } else {
        enemy.statuses.STRENGTH = (enemy.statuses.STRENGTH ?? 0) + 2;
        log(`${enemy.name} 判定你「进攻过猛」，反击姿态：力量 +2！`);
      }
      return;
    }
    case 'TRIBULATION_COUNTDOWN': {
      // 引爆节奏由 planIntent 的 everySec 驱动（累计到点才进入 SPECIAL），
      // 进入本函数即引爆一次——避免「外层节奏 × 内层倒计时」的双重计时放大间隔。
      const mul = mech?.strikeDamageMul ?? 2.5;
      log(`⚡ 天劫降临！${enemy.name} 的 KPI 倒计时归零！`);
      ctx.strikePlayer(Math.floor(enemy.attack * mul), `${enemy.name} 的天劫`);
      return;
    }
    default:
      return;
  }
}
