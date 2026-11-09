---
name: phase5-progress
description: V6.1完成 - Game Feel七子系统+AI NPC聊天+晋升指引+合成/战斗特效，已推送origin/gameplay-v2
type: project
---

# 修仙项目进度

## V6.1 已完成 (2026-11-09, commit 43a287d)
- **Game Feel系统**: ui-game-feel.js七子系统(EffectPool/SfxSynth/ClickFeedback/FloatingNumber/ScreenShake/ParticleBurst/ComboTracker)，window.__GAME_FEEL__暴露
- **连击暴击**: CultivationService — critChance = clamp(15% + min(combo-1,10)×2%, 5%, 60%)，暴击倍率1.5~3.0
- **战斗特效**: __BATTLE_CARD__内部统一触发，snapshotBattle/diffAndFeel对比系统
- **合成演出**: mergeCelebrate增强+skipDom去重
- **晋升指引**: promotionGoalHtml() — 条件满足率+闭环提示+CTA
- **AI NPC**: ai-bridge.cjs双模式(MNN HTTP优先/规则引擎降级)，4NPC人设，12条记忆/NPC；Electron三层IPC；MESSENGER页面AI/普通会话双模
- **修复**: patch-html.cjs ui-battle-card.js注入缺失；aiBuildContext() readHud→readHUD大小写

**Why:** V6.1目标是爽感重构+AI NPC+玩法闭环
**How to apply:** 后续版本基于此构建，Game Feel API见window.__GAME_FEEL__，AI API见electronAPI.ai

## PC V1 Desktop 已完成 (此前)
- Electron+pc-patch.js运行时UI接线+EXE打包验证通过