import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { AchievementService, type AchievementBundle } from '../../assets/scripts/services/achievement-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const clock = new FakeClock(new Date(2026, 0, 5, 22).getTime());
const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ overtimeStats: { totalSeconds: 7200, paidSeconds: 0, freeSeconds: 7200, sessions: 2, nightSessions: 1, freeSessions: 2, consecutiveDays: 2, longestStreak: 2 } }), clock });
const bundle = {
  achievements: [{
    id: 'OT_TEST_FREE', name: '测试自愿奋斗', description: '测试免费加班统计。', category: 'OVERTIME',
    condition: { type: 'OVERTIME_STAT', stat: 'freeSeconds', target: 3600 },
  }],
} as unknown as AchievementBundle;

const service = new AchievementService(context, bundle);
assert.deepEqual(service.checkAll(), ['OT_TEST_FREE'], 'overtime achievements must unlock from persisted overtime stats');
assert.equal(service.isUnlocked('OT_TEST_FREE'), true);
console.log('overtime achievement tests passed');
