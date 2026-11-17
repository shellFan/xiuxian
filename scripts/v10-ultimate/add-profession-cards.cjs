#!/usr/bin/env node
'use strict';

/**
 * V10 ULTIMATE §7.1 — expand each profession's exclusive card pool to >=15.
 * Current: JAVA 7 / FRONTEND 6 / QA 6 / DEVOPS 4.  Adds 37 themed cards using
 * only effect kinds already implemented in card-engine.ts (validated by
 * card-database.ts on load).  Idempotent: skips ids already present.
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, '..', '..', 'assets', 'configs', 'v59o', 'card-battle.json');
const config = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const existing = new Set(config.cards.map((c) => c.id));

const up = (name, desc, cost, effects) => ({ name, desc, cost, effects });
const card = (def) => def;

const NEW_CARDS = [
  // ── JAVA_BACKEND +8（持续输出/回血/循环利用/稳定成长） ──────────────────────
  card({ id: 'card_gc_minor', name: '垃圾回收', desc: '清除自身所有减益，获得 4 点格挡。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'JAVA_BACKEND', rewardable: true,
    effects: [{ kind: 'CLEANSE' }, { kind: 'BLOCK', flat: 4 }],
    upgrades: [up('垃圾回收+1', '清除自身所有减益，获得 7 点格挡。', 1, [{ kind: 'CLEANSE' }, { kind: 'BLOCK', flat: 7 }])] }),
  card({ id: 'card_thread_pool', name: '线程池扩容', desc: '抽 2 张牌，获得 3 点格挡。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'JAVA_BACKEND', rewardable: true,
    effects: [{ kind: 'DRAW', count: 2 }, { kind: 'BLOCK', flat: 3 }],
    upgrades: [up('线程池扩容+1', '抽 2 张牌，获得 5 点格挡。', 1, [{ kind: 'DRAW', count: 2 }, { kind: 'BLOCK', flat: 5 }])] }),
  card({ id: 'card_cache_hit', name: '缓存命中', desc: '造成 40% 攻击伤害，抽 1 张牌。', type: 'PROFESSION', rarity: 'COMMON', cost: 0, target: 'ENEMY', profession: 'JAVA_BACKEND', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 0.4 }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('缓存命中+1', '造成 70% 攻击伤害，抽 1 张牌。', 0, [{ kind: 'DAMAGE', mul: 0.7 }, { kind: 'DRAW', count: 1 }])] }),
  card({ id: 'card_tx_commit', name: '事务提交', desc: '造成 150% 攻击伤害，获得 回生 3。', type: 'PROFESSION', rarity: 'RARE', cost: 2, target: 'ENEMY', profession: 'JAVA_BACKEND', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 1.5 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'REGEN', stacks: 3 }],
    upgrades: [up('事务提交+1', '造成 190% 攻击伤害，获得 回生 4。', 2, [{ kind: 'DAMAGE', mul: 1.9 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'REGEN', stacks: 4 }])] }),
  card({ id: 'card_circuit_break', name: '熔断保护', desc: '获得 16 点格挡，自身获得 降费 1。', type: 'PROFESSION', rarity: 'RARE', cost: 2, target: 'NONE', profession: 'JAVA_BACKEND', rewardable: true,
    effects: [{ kind: 'BLOCK', flat: 16 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'COST_DOWN', stacks: 1 }],
    upgrades: [up('熔断保护+1', '获得 22 点格挡，自身获得 降费 1。', 2, [{ kind: 'BLOCK', flat: 22 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'COST_DOWN', stacks: 1 }])] }),
  card({ id: 'card_retry', name: '重试三次', desc: '造成 180% 攻击伤害。消耗。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'ENEMY', profession: 'JAVA_BACKEND', rewardable: true, exhaust: true,
    effects: [{ kind: 'DAMAGE', mul: 1.8 }],
    upgrades: [up('重试三次+1', '造成 240% 攻击伤害。消耗。', 1, [{ kind: 'DAMAGE', mul: 2.4 }])] }),
  card({ id: 'card_full_gc', name: 'Full GC', desc: '弃置所有手牌（保留牌除外），抽 2 张牌并获得 8 点格挡。', type: 'PROFESSION', rarity: 'EPIC', cost: 2, target: 'NONE', profession: 'JAVA_BACKEND', rewardable: true,
    effects: [{ kind: 'DISCARD_HAND' }, { kind: 'DRAW', count: 2 }, { kind: 'BLOCK', flat: 8 }],
    upgrades: [up('Full GC+1', '弃置所有手牌（保留牌除外），抽 3 张牌并获得 12 点格挡。', 2, [{ kind: 'DISCARD_HAND' }, { kind: 'DRAW', count: 3 }, { kind: 'BLOCK', flat: 12 }])] }),
  card({ id: 'card_jit_warmup', name: 'JIT 热身', desc: '获得 力量 3，造成 80% 攻击伤害。', type: 'PROFESSION', rarity: 'EPIC', cost: 2, target: 'ENEMY', profession: 'JAVA_BACKEND', rewardable: true,
    effects: [{ kind: 'APPLY_STATUS', target: 'SELF', status: 'STRENGTH', stacks: 3 }, { kind: 'DAMAGE', mul: 0.8 }],
    upgrades: [up('JIT 热身+1', '获得 力量 4，造成 110% 攻击伤害。', 2, [{ kind: 'APPLY_STATUS', target: 'SELF', status: 'STRENGTH', stacks: 4 }, { kind: 'DAMAGE', mul: 1.1 }])] }),

  // ── FRONTEND +9（护盾/抽牌/连击/快速过牌/低费用） ──────────────────────────
  card({ id: 'card_virtual_dom', name: '虚拟 DOM', desc: '获得 5 点格挡，抽 1 张牌。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'FRONTEND', rewardable: true,
    effects: [{ kind: 'BLOCK', flat: 5 }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('虚拟 DOM+1', '获得 8 点格挡，抽 1 张牌。', 1, [{ kind: 'BLOCK', flat: 8 }, { kind: 'DRAW', count: 1 }])] }),
  card({ id: 'card_component_reuse', name: '组件复用', desc: '获得 6 点格挡，抽 1 张牌。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'FRONTEND', rewardable: true,
    effects: [{ kind: 'BLOCK', flat: 6 }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('组件复用+1', '获得 9 点格挡，抽 1 张牌。', 1, [{ kind: 'BLOCK', flat: 9 }, { kind: 'DRAW', count: 1 }])] }),
  card({ id: 'card_hot_reload', name: '热更新', desc: '造成 50% 攻击伤害，抽 1 张牌。', type: 'PROFESSION', rarity: 'COMMON', cost: 0, target: 'ENEMY', profession: 'FRONTEND', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 0.5 }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('热更新+1', '造成 80% 攻击伤害，抽 1 张牌。', 0, [{ kind: 'DAMAGE', mul: 0.8 }, { kind: 'DRAW', count: 1 }])] }),
  card({ id: 'card_paint_opt', name: '渲染优化', desc: '获得 1 点能量，获得 6 点格挡。', type: 'PROFESSION', rarity: 'RARE', cost: 1, target: 'NONE', profession: 'FRONTEND', rewardable: true,
    effects: [{ kind: 'ENERGY', delta: 1 }, { kind: 'BLOCK', flat: 6 }],
    upgrades: [up('渲染优化+1', '获得 1 点能量，获得 10 点格挡。', 1, [{ kind: 'ENERGY', delta: 1 }, { kind: 'BLOCK', flat: 10 }])] }),
  card({ id: 'card_lazy_load', name: '懒加载', desc: '获得 12 点格挡。保留。', type: 'PROFESSION', rarity: 'COMMON', cost: 2, target: 'NONE', profession: 'FRONTEND', rewardable: true, retain: true,
    effects: [{ kind: 'BLOCK', flat: 12 }],
    upgrades: [up('懒加载+1', '获得 17 点格挡。保留。', 2, [{ kind: 'BLOCK', flat: 17 }])] }),
  card({ id: 'card_ssr', name: '服务端渲染', desc: '获得 20 点格挡，抽 2 张牌。', type: 'PROFESSION', rarity: 'EPIC', cost: 3, target: 'NONE', profession: 'FRONTEND', rewardable: true,
    effects: [{ kind: 'BLOCK', flat: 20 }, { kind: 'DRAW', count: 2 }],
    upgrades: [up('服务端渲染+1', '获得 28 点格挡，抽 2 张牌。', 3, [{ kind: 'BLOCK', flat: 28 }, { kind: 'DRAW', count: 2 }])] }),
  card({ id: 'card_tree_shake', name: 'Tree Shaking', desc: '清除自身所有减益，抽 1 张牌。', type: 'PROFESSION', rarity: 'RARE', cost: 1, target: 'NONE', profession: 'FRONTEND', rewardable: true,
    effects: [{ kind: 'CLEANSE' }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('Tree Shaking+1', '清除自身所有减益，抽 2 张牌。', 1, [{ kind: 'CLEANSE' }, { kind: 'DRAW', count: 2 }])] }),
  card({ id: 'card_fps_lock', name: '帧率锁定', desc: '获得 闪避 2，获得 3 点格挡。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'FRONTEND', rewardable: true,
    effects: [{ kind: 'APPLY_STATUS', target: 'SELF', status: 'DODGE', stacks: 2 }, { kind: 'BLOCK', flat: 3 }],
    upgrades: [up('帧率锁定+1', '获得 闪避 3，获得 5 点格挡。', 1, [{ kind: 'APPLY_STATUS', target: 'SELF', status: 'DODGE', stacks: 3 }, { kind: 'BLOCK', flat: 5 }])] }),
  card({ id: 'card_skeleton', name: '骨架屏', desc: '获得 5 点格挡，获得 回生 2。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'FRONTEND', rewardable: true,
    effects: [{ kind: 'BLOCK', flat: 5 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'REGEN', stacks: 2 }],
    upgrades: [up('骨架屏+1', '获得 8 点格挡，获得 回生 3。', 1, [{ kind: 'BLOCK', flat: 8 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'REGEN', stacks: 3 }])] }),

  // ── QA +9（标记弱点/破甲/反击/精准攻击/暴露意图） ──────────────────────────
  card({ id: 'card_boundary', name: '边界值测试', desc: '造成 90% 攻击伤害，目标 易伤 2。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'ENEMY', profession: 'QA', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 0.9 }, { kind: 'APPLY_STATUS', target: 'ENEMY', status: 'VULNERABLE', stacks: 2 }],
    upgrades: [up('边界值测试+1', '造成 120% 攻击伤害，目标 易伤 3。', 1, [{ kind: 'DAMAGE', mul: 1.2 }, { kind: 'APPLY_STATUS', target: 'ENEMY', status: 'VULNERABLE', stacks: 3 }])] }),
  card({ id: 'card_repro', name: '稳定复现', desc: '目标 失明 2，抽 1 张牌。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'ENEMY', profession: 'QA', rewardable: true,
    effects: [{ kind: 'APPLY_STATUS', target: 'ENEMY', status: 'BLIND', stacks: 2 }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('稳定复现+1', '目标 失明 3，抽 1 张牌。', 1, [{ kind: 'APPLY_STATUS', target: 'ENEMY', status: 'BLIND', stacks: 3 }, { kind: 'DRAW', count: 1 }])] }),
  card({ id: 'card_regression', name: '回归验证', desc: '造成 100% 攻击伤害，抽 1 张牌。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'ENEMY', profession: 'QA', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 1.0 }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('回归验证+1', '造成 140% 攻击伤害，抽 1 张牌。', 1, [{ kind: 'DAMAGE', mul: 1.4 }, { kind: 'DRAW', count: 1 }])] }),
  card({ id: 'card_bug_locate', name: '缺陷定位', desc: '目标生命低于 50% 时造成 250% 伤害，否则造成 80% 伤害。', type: 'PROFESSION', rarity: 'RARE', cost: 2, target: 'ENEMY', profession: 'QA', rewardable: true,
    effects: [{ kind: 'CONDITIONAL', if: { kind: 'ENEMY_HP_BELOW_PCT', pct: 0.5 },
      then: [{ kind: 'DAMAGE', mul: 2.5 }], otherwise: [{ kind: 'DAMAGE', mul: 0.8 }] }],
    upgrades: [up('缺陷定位+1', '目标生命低于 50% 时造成 320% 伤害，否则造成 110% 伤害。', 2, [{ kind: 'CONDITIONAL', if: { kind: 'ENEMY_HP_BELOW_PCT', pct: 0.5 }, then: [{ kind: 'DAMAGE', mul: 3.2 }], otherwise: [{ kind: 'DAMAGE', mul: 1.1 }] }])] }),
  card({ id: 'card_mock_stub', name: 'Mock 桩', desc: '获得 6 点格挡，获得 闪避 1。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'QA', rewardable: true,
    effects: [{ kind: 'BLOCK', flat: 6 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'DODGE', stacks: 1 }],
    upgrades: [up('Mock 桩+1', '获得 9 点格挡，获得 闪避 2。', 1, [{ kind: 'BLOCK', flat: 9 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'DODGE', stacks: 2 }])] }),
  card({ id: 'card_coverage', name: '覆盖率拉满', desc: '造成 120% 攻击伤害，所有敌人 易伤 3，抽 1 张牌。', type: 'PROFESSION', rarity: 'EPIC', cost: 3, target: 'ENEMY', profession: 'QA', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 1.2 }, { kind: 'APPLY_STATUS', target: 'ALL_ENEMIES', status: 'VULNERABLE', stacks: 3 }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('覆盖率拉满+1', '造成 160% 攻击伤害，所有敌人 易伤 4，抽 1 张牌。', 3, [{ kind: 'DAMAGE', mul: 1.6 }, { kind: 'APPLY_STATUS', target: 'ALL_ENEMIES', status: 'VULNERABLE', stacks: 4 }, { kind: 'DRAW', count: 1 }])] }),
  card({ id: 'card_smoke', name: '冒烟测试', desc: '造成 60% 攻击伤害。', type: 'PROFESSION', rarity: 'COMMON', cost: 0, target: 'ENEMY', profession: 'QA', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 0.6 }],
    upgrades: [up('冒烟测试+1', '造成 90% 攻击伤害。', 0, [{ kind: 'DAMAGE', mul: 0.9 }])] }),
  card({ id: 'card_gray_qa', name: '灰度放量', desc: '生命低于 50% 时获得 回生 4 与 8 点格挡，否则获得 8 点格挡。', type: 'PROFESSION', rarity: 'RARE', cost: 2, target: 'NONE', profession: 'QA', rewardable: true,
    effects: [{ kind: 'CONDITIONAL', if: { kind: 'PLAYER_HP_BELOW_PCT', pct: 0.5 },
      then: [{ kind: 'APPLY_STATUS', target: 'SELF', status: 'REGEN', stacks: 4 }, { kind: 'BLOCK', flat: 8 }], otherwise: [{ kind: 'BLOCK', flat: 8 }] }],
    upgrades: [up('灰度放量+1', '生命低于 50% 时获得 回生 5 与 12 点格挡，否则获得 12 点格挡。', 2, [{ kind: 'CONDITIONAL', if: { kind: 'PLAYER_HP_BELOW_PCT', pct: 0.5 }, then: [{ kind: 'APPLY_STATUS', target: 'SELF', status: 'REGEN', stacks: 5 }, { kind: 'BLOCK', flat: 12 }], otherwise: [{ kind: 'BLOCK', flat: 12 }] }])] }),
  card({ id: 'card_stress_test', name: '压测脚本', desc: '造成 220% 攻击伤害。消耗。', type: 'PROFESSION', rarity: 'RARE', cost: 1, target: 'ENEMY', profession: 'QA', rewardable: true, exhaust: true,
    effects: [{ kind: 'DAMAGE', mul: 2.2 }],
    upgrades: [up('压测脚本+1', '造成 300% 攻击伤害。消耗。', 1, [{ kind: 'DAMAGE', mul: 3.0 }])] }),

  // ── DEVOPS +11（控制/减伤/回滚/能量管理/状态清除） ──────────────────────────
  card({ id: 'card_rollback', name: '一键回滚', desc: '清除自身所有减益，获得 回生 3。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'CLEANSE' }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'REGEN', stacks: 3 }],
    upgrades: [up('一键回滚+1', '清除自身所有减益，获得 回生 4。', 1, [{ kind: 'CLEANSE' }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'REGEN', stacks: 4 }])] }),
  card({ id: 'card_release_gate', name: '发布门禁', desc: '获得 7 点格挡，获得 闪避 1。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'BLOCK', flat: 7 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'DODGE', stacks: 1 }],
    upgrades: [up('发布门禁+1', '获得 11 点格挡，获得 闪避 2。', 1, [{ kind: 'BLOCK', flat: 11 }, { kind: 'APPLY_STATUS', target: 'SELF', status: 'DODGE', stacks: 2 }])] }),
  card({ id: 'card_pager', name: '告警呼叫', desc: '造成 70% 攻击伤害，抽 1 张牌。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'ENEMY', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 0.7 }, { kind: 'DRAW', count: 1 }],
    upgrades: [up('告警呼叫+1', '造成 100% 攻击伤害，抽 1 张牌。', 1, [{ kind: 'DAMAGE', mul: 1.0 }, { kind: 'DRAW', count: 1 }])] }),
  card({ id: 'card_dr_switch', name: '容灾切换', desc: '获得 无形 1，获得 5 点格挡。', type: 'PROFESSION', rarity: 'EPIC', cost: 2, target: 'NONE', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'APPLY_STATUS', target: 'SELF', status: 'INTANGIBLE', stacks: 1 }, { kind: 'BLOCK', flat: 5 }],
    upgrades: [up('容灾切换+1', '获得 无形 1，获得 9 点格挡。', 2, [{ kind: 'APPLY_STATUS', target: 'SELF', status: 'INTANGIBLE', stacks: 1 }, { kind: 'BLOCK', flat: 9 }])] }),
  card({ id: 'card_scale_out', name: '弹性扩容', desc: '抽 2 张牌。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'NONE', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'DRAW', count: 2 }],
    upgrades: [up('弹性扩容+1', '抽 3 张牌。', 1, [{ kind: 'DRAW', count: 3 }])] }),
  card({ id: 'card_pipeline', name: '流水线加速', desc: '获得 1 点能量。', type: 'PROFESSION', rarity: 'COMMON', cost: 0, target: 'NONE', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'ENERGY', delta: 1 }],
    upgrades: [up('流水线加速+1', '获得 2 点能量。', 0, [{ kind: 'ENERGY', delta: 2 }])] }),
  card({ id: 'card_canary', name: '金丝雀发布', desc: '场上敌人不少于 2 时对目标造成 100% 伤害并全体 易伤 1，否则造成 160% 伤害。', type: 'PROFESSION', rarity: 'RARE', cost: 2, target: 'ENEMY', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'CONDITIONAL', if: { kind: 'ENEMY_COUNT_AT_LEAST', count: 2 },
      then: [{ kind: 'DAMAGE', mul: 1.0 }, { kind: 'APPLY_STATUS', target: 'ALL_ENEMIES', status: 'VULNERABLE', stacks: 1 }], otherwise: [{ kind: 'DAMAGE', mul: 1.6 }] }],
    upgrades: [up('金丝雀发布+1', '场上敌人不少于 2 时对目标造成 130% 伤害并全体 易伤 2，否则造成 210% 伤害。', 2, [{ kind: 'CONDITIONAL', if: { kind: 'ENEMY_COUNT_AT_LEAST', count: 2 }, then: [{ kind: 'DAMAGE', mul: 1.3 }, { kind: 'APPLY_STATUS', target: 'ALL_ENEMIES', status: 'VULNERABLE', stacks: 2 }], otherwise: [{ kind: 'DAMAGE', mul: 2.1 }] }])] }),
  card({ id: 'card_blue_green', name: '蓝绿部署', desc: '获得 18 点格挡，移除自身 虚弱。', type: 'PROFESSION', rarity: 'EPIC', cost: 3, target: 'NONE', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'BLOCK', flat: 18 }, { kind: 'REMOVE_STATUS', status: 'WEAK' }],
    upgrades: [up('蓝绿部署+1', '获得 26 点格挡，移除自身 虚弱。', 3, [{ kind: 'BLOCK', flat: 26 }, { kind: 'REMOVE_STATUS', status: 'WEAK' }])] }),
  card({ id: 'card_monitor', name: '监控大盘', desc: '抽 2 张牌，获得 4 点格挡。保留。', type: 'PROFESSION', rarity: 'COMMON', cost: 2, target: 'NONE', profession: 'DEVOPS', rewardable: true, retain: true,
    effects: [{ kind: 'DRAW', count: 2 }, { kind: 'BLOCK', flat: 4 }],
    upgrades: [up('监控大盘+1', '抽 3 张牌，获得 6 点格挡。保留。', 2, [{ kind: 'DRAW', count: 3 }, { kind: 'BLOCK', flat: 6 }])] }),
  card({ id: 'card_kill_switch', name: '紧急停机', desc: '清除自身所有减益，获得 14 点格挡。消耗。', type: 'PROFESSION', rarity: 'RARE', cost: 1, target: 'NONE', profession: 'DEVOPS', rewardable: true, exhaust: true,
    effects: [{ kind: 'CLEANSE' }, { kind: 'BLOCK', flat: 14 }],
    upgrades: [up('紧急停机+1', '清除自身所有减益，获得 20 点格挡。消耗。', 1, [{ kind: 'CLEANSE' }, { kind: 'BLOCK', flat: 20 }])] }),
  card({ id: 'card_traffic_shift', name: '流量切换', desc: '造成 80% 攻击伤害，获得 4 点格挡。', type: 'PROFESSION', rarity: 'COMMON', cost: 1, target: 'ENEMY', profession: 'DEVOPS', rewardable: true,
    effects: [{ kind: 'DAMAGE', mul: 0.8 }, { kind: 'BLOCK', flat: 4 }],
    upgrades: [up('流量切换+1', '造成 110% 攻击伤害，获得 6 点格挡。', 1, [{ kind: 'DAMAGE', mul: 1.1 }, { kind: 'BLOCK', flat: 6 }])] }),
];

let added = 0; const skipped = [];
for (const c of NEW_CARDS) {
  if (existing.has(c.id)) { skipped.push(c.id); continue; }
  config.cards.push(c);
  existing.add(c.id);
  added += 1;
}
fs.writeFileSync(FILE, JSON.stringify(config, null, 1) + '\n');
const byProf = {};
config.cards.forEach((c) => { const p = c.profession || 'neutral'; byProf[p] = (byProf[p] || 0) + 1; });
console.log('added:', added, 'skipped(duplicate):', skipped.length);
console.log('pool now:', JSON.stringify(byProf), 'total:', config.cards.length);
