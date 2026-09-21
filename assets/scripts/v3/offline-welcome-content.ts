/** Stable, reusable Chinese welcome-back copy for the offline summary. */
export interface OfflineWelcomeLine {
  readonly id: string;
  readonly text: string;
}

export const OFFLINE_WELCOME_CONTENT: readonly OfflineWelcomeLine[] = Object.freeze([
  Object.freeze({ id: 'offline-welcome-01', text: '工位结界仍在，今日也要稳住道心。' }),
  Object.freeze({ id: 'offline-welcome-02', text: '日报经文已更新，搬砖修为悄然上涨。' }),
  Object.freeze({ id: 'offline-welcome-03', text: '会议渡劫暂告一段，回来继续破局。' }),
  Object.freeze({ id: 'offline-welcome-04', text: '需求又变了一轮，你的功法仍然能打。' }),
  Object.freeze({ id: 'offline-welcome-05', text: '老板画的饼未凉，先补一口灵气。' }),
  Object.freeze({ id: 'offline-welcome-06', text: '同事还在宗门群里等你并肩做法。' }),
  Object.freeze({ id: 'offline-welcome-07', text: '绩效不过身外物，境界提升才是真章。' }),
  Object.freeze({ id: 'offline-welcome-08', text: '加班心魔已记录，回来亲手降服它。' }),
  Object.freeze({ id: 'offline-welcome-09', text: '项目尚未飞升，但你的积累从未停下。' }),
  Object.freeze({ id: 'offline-welcome-10', text: '代码如剑，归来先看哪一招需要出鞘。' }),
  Object.freeze({ id: 'offline-welcome-11', text: '排期之外亦可闭关，张弛才是正道。' }),
  Object.freeze({ id: 'offline-welcome-12', text: '打卡只是仪式，筑基还看每日寸功。' }),
  Object.freeze({ id: 'offline-welcome-13', text: '周报已替你守候，元神可以从容归位。' }),
  Object.freeze({ id: 'offline-welcome-14', text: '办公桌便是洞府，收拾妥当再开工。' }),
  Object.freeze({ id: 'offline-welcome-15', text: '职场仙途多岔路，稳稳走完这一程。' }),
  Object.freeze({ id: 'offline-welcome-16', text: '工资化作灵石，辛苦总算没有白费。' }),
  Object.freeze({ id: 'offline-welcome-17', text: '摸鱼也讲真气流转，休息并非躺平。' }),
  Object.freeze({ id: 'offline-welcome-18', text: '任务炉火未熄，回来继续炼丹成章。' }),
  Object.freeze({ id: 'offline-welcome-19', text: '下班钟声如法器，提醒你留住道心。' }),
  Object.freeze({ id: 'offline-welcome-20', text: '上班亦是修仙，今天继续稳中求进。' }),
]);

/** Selects one stable line without time, randomness, or mutable state. */
export function selectOfflineWelcomeLine(stableKey: string): OfflineWelcomeLine {
  let hash = 2166136261;
  for (let index = 0; index < stableKey.length; index += 1) {
    hash ^= stableKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return OFFLINE_WELCOME_CONTENT[(hash >>> 0) % OFFLINE_WELCOME_CONTENT.length];
}
