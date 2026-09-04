// Candidate-only verification. This file never loads into the game runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

function parseStrictJson(source) {
  const parsed = JSON.parse(source); // Establish JSON grammar before scanning member names.
  let at = 0;
  const whitespace = () => { while (/\s/.test(source[at] ?? '') && at < source.length) at++; };
  function string() {
    const start = at++;
    while (source[at] !== '"') {
      if (source[at] === '\\') at++;
      at++;
    }
    return JSON.parse(source.slice(start, ++at));
  }
  function value() {
    whitespace();
    if (source[at] === '{') {
      at++; whitespace();
      const keys = new Set();
      while (source[at] !== '}') {
        const key = string();
        assert.ok(!keys.has(key), `duplicate key ${key}`); keys.add(key);
        whitespace(); at++; value(); whitespace();
        if (source[at] !== ',') break;
        at++; whitespace();
      }
      at++;
    } else if (source[at] === '[') {
      at++; whitespace();
      while (source[at] !== ']') {
        value(); whitespace();
        if (source[at] !== ',') break;
        at++;
      }
      at++;
    } else if (source[at] === '"') string();
    else while (at < source.length && !/[\s,}\]]/.test(source[at])) at++;
  }
  value();
  return parsed;
}

function validateLocale(locale, content) {
  for (const [key, value] of Object.entries(locale)) {
    assert.match(key, /^(ui|event|achievement|daily|tutorial|system)\.[A-Za-z0-9_.-]+$/, `locale namespace ${key}`);
    assert.equal(typeof value, 'string', `locale text ${key}`);
    assert.ok(value.trim(), `locale empty ${key}`);
    assert.doesNotMatch(value, /\{[^}]*\}|%[sd]|\$\{/, `locale unbound variable ${key}`);
  }
  const expected = {};
  for (const e of content.events) {
    expected[`event.${e.id}.title`] = e.title; expected[`event.${e.id}.description`] = e.description;
    for (const c of e.choices ?? []) expected[`event.${e.id}.choice.${c.id}`] = c.text;
  }
  for (const [namespace, items] of [['achievement',content.achievements],['daily',content.daily]]) {
    for (const item of items) {
      expected[`${namespace}.${item.id}.title`] = item.name;
      expected[`${namespace}.${item.id}.description`] = item.description;
    }
  }
  for (const step of content.tutorial) for (const key of ['title','body','completionHint']) {
    expected[`tutorial.${step.id}.${key}`] = step[key];
  }
  for (const [key,value] of Object.entries(expected)) {
    assert.ok(Object.hasOwn(locale,key), `missing locale key ${key}`);
    assert.equal(locale[key],value, `locale mismatch ${key}`);
  }
  for (const key of ['ui.confirm','ui.cancel','ui.close','ui.back','ui.recruit','ui.work','ui.fishing',
    'ui.claim','ui.loading','ui.achievement.hidden.title','ui.achievement.hidden.description',
    'system.networkUnavailable','system.providerUnavailable','system.saveFailed']) {
    assert.ok(Object.hasOwn(locale,key), `missing locale key ${key}`);
  }
  return Object.keys(locale).length;
}

function loadProduction() {
  const read = f => parseStrictJson(fs.readFileSync(path.join(ROOT,'assets/configs',f),'utf8'));
  return {
    art:read('art-production-manifest.json'), audio:read('audio-production-manifest.json'),
    animations:read('animation-trigger-map.json'), dailyPool:read('phase4/daily-pool-metadata.json'),
    tutorial:read('phase4/tutorial-copy.json'), locale:read('i18n/zh-CN.json'),
    events:read('phase4/office-events.json').events,
    achievements:read('phase4/achievements.json').achievements,
    daily:read('phase4/daily-tasks.json').tasks, audioPlan:read('audio-plan.json'),
  };
}
function nonblank(value,label) {
  assert.equal(typeof value,'string',label); assert.ok(value.trim(),label);
}
function bounded(value,min,max,label,integer=false) {
  assert.ok(Number.isFinite(value) && value>=min && value<=max && (!integer || Number.isInteger(value)),label);
}
function unique(items,key,label) {
  assert.ok(Array.isArray(items),label);
  const values=items.map(i=>i[key]); values.forEach(v=>nonblank(v,label));
  assert.equal(new Set(values).size,values.length,`duplicate ${label}`);
}
function required(item,fields,label) {
  for (const f of fields) assert.ok(Object.hasOwn(item,f),`${label} missing ${f}`);
}
function validateUiKeys(locale) {
  const groups={
    'ui.page':'startup mainGame workerBoard career kpi officeEvents promotion offlineReward achievements dailyTasks sect settings tutorial rewardAd debug',
    'ui.nav':'worker career sect events tasks achievements settings more',
    'ui.action':'recruit work fish openKpi openTasks openAchievements openSettings openCareer openSect openEvents moveOrMerge claim goComplete preparePromotion startPromotion tryAgain defer dismiss confirm cancel back close retry explain viewRules chooseCompany viewBonus offlineCollect offlineDouble adWatch adNoThanks skipTutorial learnLater copyDiagnostics help privacy toggleBgm toggleSfx toggleReducedMotion more',
    'ui.resource':'salary performance cultivation mind kpi',
    'ui.state':'loading restoring ready empty error busy disabled inProgress completed claimed locked available maxed pending processing failed',
    'ui.reward':'ready inProgress playing granting claimed failed unavailable normal doubled pending noReward loading cancelled dailyLimitReached',
    'ui.dailyPool':'fallback',
    'ui.settings':'title sound bgm sfx reducedMotion version saveState enabled disabled saveFailed unavailable',
    'system':'configLoadFailed saveLoadFailed saveWriteFailed saveFailed networkUnavailable providerUnavailable recruitFailed mergeRejected invalidTarget eventChoiceFailed promotionUnavailable promotionResultUnknown promotionRetryRequired claimFailed rewardAdUnavailable rewardGrantPending rewardGrantFailed dailyRefreshFailed achievementHidden tutorialTargetMissing unsupportedViewport audioUnavailable',
  };
  for(const [namespace, names] of Object.entries(groups)) for(const name of names.split(' ')) {
    assert.ok(Object.hasOwn(locale,`${namespace}.${name}`),`missing locale key ${namespace}.${name}`);
  }
}
function validateProduction(p=loadProduction()) {
  for (const name of ['art','audio','animations','dailyPool','tutorial']) {
    assert.equal(p[name].schemaVersion,1,`${name} version`);
    assert.equal(p[name].runtimeEnabled,false,`${name} runtime disabled`);
    assert.equal(p[name].status,'PHASE4_CANDIDATE',`${name} candidate`);
  }
  const art=p.art.assets;
  unique(art,'id','art id'); unique(art,'filename','art filename');
  const promptText=fs.readFileSync(path.join(ROOT,'docs/ART-GENERATION-PROMPTS.md'),'utf8');
  const prompts=new Set(promptText.match(/\bP(?:0\d|1\d|2[0-4])\b/g));
  const groups=['ui_common','career_early','career_mid','career_high','events','achievements','office','effects'];
  for (const a of art) {
    required(a,['id','category','filename','priority','size','aspectRatio','transparent','atlasGroup','usage',
      'promptId','status','mustReview','targetPhase'],'art');
    assert.match(a.id,/^[a-z0-9]+(?:_[a-z0-9]+)*$/,'art id');
    assert.match(a.filename,/^[a-z0-9]+(?:_[a-z0-9]+)*\.png$/,'art filename');
    assert.ok(['P0','P1','P2'].includes(a.priority),'art priority');
    for(const axis of ['width','height']) bounded(a.size[axis],1,2048,'art size',true);
    assert.match(a.aspectRatio,/^[1-9]\d*:[1-9]\d*$/,'art aspectRatio');
    const [w,h]=a.aspectRatio.split(':').map(Number);
    assert.equal(a.size.width*h,a.size.height*w,'art aspectRatio dimensions');
    assert.equal(typeof a.transparent,'boolean','art transparent');
    assert.ok(groups.includes(a.atlasGroup),'art atlasGroup');
    assert.ok(prompts.has(a.promptId),'art prompt reference');
    nonblank(a.category,'art category'); nonblank(a.usage,'art usage');
    assert.equal(a.status,'PLANNED','art production status');
    assert.equal(a.mustReview,true,'art manual review');
    assert.equal(a.targetPhase,'PHASE4_INTEGRATION','art targetPhase');
  }
  for (const [category,count] of [['career_portrait',10],['realm_badge',4],['background',7],['worker_portrait',4],
    ['resource_icon',4],['event_category_icon',5]]) {
    assert.equal(art.filter(a=>a.category===category).length,count,`art category ${category}`);
  }
  for(const category of ['achievement_icon','daily_icon','button','panel','modal','merge_effect','promotion_effect','tutorial_pointer']) {
    assert.ok(art.some(a=>a.category===category),`art missing ${category}`);
  }
  for(const id of ['worker_level_1','worker_level_2','worker_level_3','worker_level_4','office_background_01',
    'salary_icon','cultivation_icon','mind_icon','kpi_icon','primary_button','promotion_effect']) {
    assert.equal(art.find(a=>a.id===id)?.priority,'P0',`art P0 ${id}`);
  }
  unique(p.audio.cues,'id','audio id'); unique(p.audio.cues,'filename','audio filename');
  assert.deepEqual(p.audio.cues.map(c=>c.id).sort(),p.audioPlan.cues.map(c=>c.id).sort(),'audio plan parity');
  assert.deepEqual(p.audio.limits,{maxSfxVoices:4,maxBgmVoices:1},'audio global voices');
  for(const c of p.audio.cues) {
    required(c,['id','type','durationTarget','loop','priority','duckBgm','maxConcurrent','cooldown','volumeDefault','filename','status'],'audio');
    const src=p.audioPlan.cues.find(s=>s.id===c.id);
    assert.ok(['SFX','BGM'].includes(c.type),'audio type');
    assert.equal(c.type,c.id.startsWith('bgm_')?'BGM':'SFX','audio BGM type');
    assert.equal(c.loop,src.loop,'audio loop'); assert.equal(c.priority,src.priority,'audio priority');
    assert.equal(c.durationTarget,src.suggestedDurationMs,'audio duration parity');
    bounded(c.durationTarget,1,600000,'audio duration'); bounded(c.cooldown,0,600000,'audio cooldown');
    bounded(c.volumeDefault,0,1,'audio volume'); bounded(c.maxConcurrent,1,c.type==='BGM'?1:4,'audio concurrency',true);
    assert.equal(typeof c.duckBgm,'boolean','audio duckBgm'); assert.equal(c.status,'PLANNED','audio status');
    assert.match(c.filename,/^(?:audio\/)?[a-z0-9_]+\.(wav|ogg|mp3)$/,'audio filename');
  }
  const salary=p.audio.cues.find(c=>c.id==='game_salary');
  assert.equal(salary.maxConcurrent,1,'audio salary concurrency'); assert.ok(salary.cooldown>=1000,'audio salary coalescing');
  unique(p.animations.mappings,'id','animation id'); assert.equal(p.animations.mappings.length,15,'animation count');
  const gameEvents=fs.readFileSync(path.join(ROOT,'assets/scripts/core/game-events.ts'),'utf8')
    .split('export interface GameEvents extends Record<string, unknown> {')[1].split('\n}')[0];
  const eventNames=new Set([...gameEvents.matchAll(/readonly (\w+):/g)].map(m=>m[1]));
  for(const m of p.animations.mappings) {
    required(m,['id','sourceEvent','sourceKind','condition','animation','target','audioId','integrationStatus'],'animation');
    assert.ok(['GAME_EVENT','UI_INTENT','SNAPSHOT_TRANSITION'].includes(m.sourceKind),'animation sourceKind');
    if(m.sourceKind==='GAME_EVENT') assert.ok(eventNames.has(m.sourceEvent),'animation event reference');
    if(m.sourceEvent!==null) assert.ok(eventNames.has(m.sourceEvent),'animation event reference');
    if(m.audioId!==null) assert.ok(p.audio.cues.some(c=>c.id===m.audioId),'animation audio reference');
    assert.ok(['ADAPTER_REQUIRED','COMPATIBLE'].includes(m.integrationStatus),'animation integration status');
    for(const k of ['condition','animation','target']) nonblank(m[k],`animation ${k}`);
  }
  const families={MERGE_5:'MERGE',WORK_10_MIN:'WORK',FISH_3_MIN:'FISH',EVENT_3:'EVENT',KPI_COMPLETE:'KPI',PROMOTION_1:'PROMOTION'};
  unique(p.dailyPool.tasks,'id','daily metadata id');
  assert.deepEqual(p.dailyPool.tasks.map(t=>t.id).sort(),p.daily.map(t=>t.id).sort(),'daily metadata coverage');
  assert.equal(p.dailyPool.perDay,5,'daily perDay'); assert.equal(p.dailyPool.maxPerDay,6,'daily maxPerDay');
  assert.deepEqual(p.dailyPool.rewardBudget,{salary:750,cultivation:100,performance:30,mind:45},'daily global budget');
  for(const t of p.dailyPool.tasks) {
    const src=p.daily.find(d=>d.id===t.id);
    assert.equal(t.family,families[src.type],'daily family'); assert.deepEqual(t.rewardBudget,src.reward,'daily reward parity');
    assert.ok(['EASY','NORMAL','HARD'].includes(t.difficulty),'daily difficulty');
    bounded(t.weight,1,100,'daily weight',true); bounded(t.minCareerLevel,1,10,'daily career',true);
    assert.ok(Array.isArray(t.requiresCapability) && t.requiresCapability.length>0,'daily capability');
    t.requiresCapability.forEach(c=>nonblank(c,'daily capability'));
  }
  const steps=['FIRST_RECRUIT','SECOND_RECRUIT','FIRST_MERGE','START_WORK','CHECK_KPI','FIRST_PROMOTION'];
  assert.deepEqual(p.tutorial.steps.map(s=>s.id),steps,'tutorial ordered steps');
  for(const s of p.tutorial.steps) {
    required(s,['id','title','body','highlightTarget','pointerPosition','allowSkip','blockInput','completionHint'],'tutorial');
    for(const k of ['title','body','completionHint','highlightTarget']) nonblank(s[k],`tutorial ${k}`);
    assert.ok([...s.title].length<=18 && [...s.body].length<=40,'tutorial short copy');
    assert.ok(['above','below','left','right'].includes(s.pointerPosition),'tutorial position');
    assert.equal(typeof s.allowSkip,'boolean','tutorial skip'); assert.equal(typeof s.blockInput,'boolean','tutorial block');
  }
  assert.equal(p.tutorial.steps.at(-1).blockInput,false,'tutorial promotion must not lock game');
  const localeKeys=validateLocale(p.locale,{events:p.events,achievements:p.achievements,daily:p.daily,tutorial:p.tutorial.steps});
  validateUiKeys(p.locale);
  return {status:'PASS',artAssets:art.length,audioCues:p.audio.cues.length,animationMappings:15,dailyMetadata:12,tutorialSteps:6,localeKeys};
}

module.exports = { parseStrictJson, validateLocale, validateUiKeys, loadProduction, validateProduction };
if(require.main===module) console.log(JSON.stringify(validateProduction(),null,2));
