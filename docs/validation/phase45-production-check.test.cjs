const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, 'phase45-production-check.cjs');
const api = fs.existsSync(file) ? require(file) : {};
test('strict parser exists', () => assert.equal(typeof api.parseStrictJson, 'function'));
test('rejects duplicate flat locale keys', () => {
  assert.throws(() => api.parseStrictJson('{"ui.ok":"好","ui.ok":"行"}'), /duplicate key/);
});
test('rejects escaped equivalent duplicate keys', () => {
  assert.throws(() => api.parseStrictJson('{"ui.ok":"好","ui.\\u006fk":"行"}'), /duplicate key/);
});
test('rejects nested duplicate keys but permits same key in separate objects', () => {
  assert.throws(() => api.parseStrictJson('{"a":[{"x":1,"x":2}]}'), /duplicate key/);
  assert.deepEqual(api.parseStrictJson('[{"x":1},{"x":2}]'), [{x:1},{x:2}]);
});
test('quoted punctuation is text, not a duplicate member', () => {
  assert.deepEqual(api.parseStrictJson('{"a":"\\\"a\\\": {,}","b":true,"c":null}'), {a:'"a": {,}',b:true,c:null});
});
test('malformed JSON is rejected', () => assert.throws(() => api.parseStrictJson('{"a":1,}')));

const content = {
  events: [{id:'E', title:'事件', description:'说明', choices:[{id:'YES',text:'可以'}]}],
  achievements: [{id:'A',name:'成就',description:'已达成'}],
  daily: [{id:'D',name:'任务',description:'做一次'}],
  tutorial: [{id:'T',title:'引导',body:'点这里',completionHint:'完成'}],
};
function localeFixture() {
  return {
    'event.E.title':'事件','event.E.description':'说明','event.E.choice.YES':'可以',
    'achievement.A.title':'成就','achievement.A.description':'已达成',
    'daily.D.title':'任务','daily.D.description':'做一次',
    'tutorial.T.title':'引导','tutorial.T.body':'点这里','tutorial.T.completionHint':'完成',
    ...Object.fromEntries(['ui.confirm','ui.cancel','ui.close','ui.back','ui.recruit','ui.work','ui.fishing',
      'ui.claim','ui.loading','ui.achievement.hidden.title','ui.achievement.hidden.description',
      'system.networkUnavailable','system.providerUnavailable','system.saveFailed'].map(k=>[k,'中文'])),
  };
}
test('locale validation accepts complete matching Chinese copy', () => {
  assert.ok(api.validateLocale(localeFixture(), content) > 10);
});
test('missing content key is rejected', () => {
  const locale=localeFixture(); delete locale['event.E.choice.YES'];
  assert.throws(() => api.validateLocale(locale, content), /missing locale key/);
});
test('stale localized copy is rejected', () => {
  const locale=localeFixture(); locale['event.E.title']='过期文案';
  assert.throws(() => api.validateLocale(locale, content), /locale mismatch/);
});
test('unknown namespaces, empty copy and unbound variables are rejected', () => {
  for (const [key,value] of [['x.foo','测试'],['ui.new','  '],['ui.new','奖励{amount}']]) {
    assert.throws(()=>api.validateLocale({...localeFixture(),[key]:value},content), /locale/);
  }
});

test('production documents can be loaded and validated', () => {
  assert.equal(typeof api.loadProduction, 'function');
  assert.equal(api.validateProduction().status, 'PASS');
});
test('production assets reject missing fields and broken references', () => {
  for (const mutate of [
    p=>delete p.art.assets[0].mustReview,
    p=>p.art.assets.push({...p.art.assets[0]}),
    p=>p.art.assets[0].promptId='P99',
    p=>p.art.assets[0].size.width=-1,
    p=>p.art.assets[0].aspectRatio='3:2',
    p=>p.art.assets[0].filename='../outside.png',
  ]) {
    const p=api.loadProduction(); mutate(p);
    assert.throws(()=>api.validateProduction(p), /art/);
  }
});
test('audio and animation enforce salary coalescing and real event references', () => {
  for (const mutate of [
    p=>p.audio.cues.find(c=>c.id==='game_salary').cooldown=0,
    p=>p.audio.cues[0].volumeDefault=2,
    p=>p.animations.mappings[0].audioId='not_a_cue',
    p=>{p.animations.mappings[0].sourceKind='GAME_EVENT';p.animations.mappings[0].sourceEvent='WORKER_MERGED';},
  ]) {
    const p=api.loadProduction(); mutate(p);
    assert.throws(()=>api.validateProduction(p), /audio|animation/);
  }
});
test('daily metadata cannot change rewards or omit templates', () => {
  for (const mutate of [p=>p.dailyPool.tasks.pop(),p=>p.dailyPool.tasks[0].rewardBudget.salary=99999,
    p=>p.dailyPool.tasks[0].family='UNKNOWN',p=>p.dailyPool.tasks[0].weight=0]) {
    const p=api.loadProduction(); mutate(p);
    assert.throws(()=>api.validateProduction(p), /daily/);
  }
});
test('tutorial cannot block input while waiting for promotion', () => {
  const p=api.loadProduction();p.tutorial.steps.find(s=>s.id==='FIRST_PROMOTION').blockInput=true;
  assert.throws(()=>api.validateProduction(p), /tutorial/);
});
test('production locale requires every page and action key', () => {
  assert.equal(typeof api.validateUiKeys,'function');
  for(const key of ['ui.page.offlineReward','ui.action.openKpi','ui.reward.pending','ui.settings.reducedMotion',
    'ui.reward.loading','ui.reward.cancelled','ui.reward.dailyLimitReached','ui.dailyPool.fallback']) {
    const p=api.loadProduction();delete p.locale[key];
    assert.throws(()=>api.validateUiKeys(p.locale), /missing locale key/);
  }
});

test('production locale matches the explicit Phase4.5 UX contract mappings', () => {
  const locale = api.loadProduction().locale;
  assert.deepEqual({
    'ui.reward.loading': locale['ui.reward.loading'],
    'ui.reward.cancelled': locale['ui.reward.cancelled'],
    'ui.reward.dailyLimitReached': locale['ui.reward.dailyLimitReached'],
    'ui.dailyPool.fallback': locale['ui.dailyPool.fallback'],
  }, {
    'ui.reward.loading': '正在准备广告',
    'ui.reward.cancelled': '本次未获得广告奖励',
    'ui.reward.dailyLimitReached': '今日次数已用完',
    'ui.dailyPool.fallback': '其余任务待条件开放',
  });
});
