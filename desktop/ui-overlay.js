/**
 * 牛马修仙传 — DOM Overlay UI Controller
 * 
 * 通过 window.__GAME_FACADE__ 桥接 Cocos 游戏数据
 * 在 Cocos Canvas 上叠加 HTML/CSS 层实现 UI 重构
 */
;(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     §0. Constants & Mappings
     ═══════════════════════════════════════════════════════════ */

  const NAV_TABS = [
    { id: 'HOME',      icon: '🏠', label: '首页' },
    { id: 'TASKS',     icon: '📋', label: '任务' },
    { id: 'CRAFT',     icon: '🧪', label: '合成' },
    { id: 'PROMOTION', icon: '⬆️', label: '晋升' },
    { id: 'MORE',      icon: '⚙️', label: '更多' },
  ];

  const TASK_TYPE_LABELS = { DAILY: '日常', WORK: '工作', CULTIVATION: '修炼', EVENT: '事件' };
  const TASK_TYPE_ICONS  = { DAILY: '📅', WORK: '💼', CULTIVATION: '🧘', EVENT: '🎉' };

  const RECIPE_TYPE_ICONS = { pill: '🧪', talisman: '📜', artifact: '🔮' };
  const EFFECT_LABELS = {
    cultivationExp: '修为', spiritStones: '灵石', salary: '工资',
    performance: '绩效', mind: '心境', kpi: 'KPI',
  };

  const MIND_LABELS = ['崩溃', '焦虑', '疲惫', '平静', '专注', '悟道'];
  const WORK_MODE_LABELS = { WORK: '打工', FISHING: '摸鱼' };
  const WORK_MODE_ICONS  = { WORK: '💼', FISHING: '🎣' };

  const MORE_SUB_TABS = [
    { id: 'SECT',         icon: '⚔️', label: '宗门' },
    { id: 'ACHIEVEMENT',  icon: '🏆', label: '成就' },
    { id: 'DAILY',        icon: '📅', label: '日常' },
    { id: 'SETTINGS',     icon: '⚙️', label: '设置' },
  ];

  /* ═══════════════════════════════════════════════════════════
     §1. Utility Functions
     ═══════════════════════════════════════════════════════════ */

  function fmtNum(n) {
    if (n == null) return '0';
    if (typeof n === 'string') n = Number(n);
    if (isNaN(n)) return '0';
    if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    if (n >= 1000) return n.toLocaleString('zh-CN');
    return String(Math.floor(n));
  }

  function pct(current, required) {
    if (!required || required <= 0) return 0;
    return Math.min(100, Math.max(0, (current / required) * 100));
  }

  function mindText(mind, maxMind) {
    if (maxMind <= 0) return MIND_LABELS[0];
    const ratio = mind / maxMind;
    if (ratio <= 0.1) return MIND_LABELS[0];
    if (ratio <= 0.3) return MIND_LABELS[1];
    if (ratio <= 0.5) return MIND_LABELS[2];
    if (ratio <= 0.7) return MIND_LABELS[3];
    if (ratio <= 0.9) return MIND_LABELS[4];
    return MIND_LABELS[5];
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /* ═══════════════════════════════════════════════════════════
     §2. Data Layer — Facade Bridge
     ═══════════════════════════════════════════════════════════ */

  let _facade = null;
  let _unsubs = [];
  let _demoMode = false;

  function getFacade() {
    if (_facade) return _facade;
    _facade = window.__GAME_FACADE__ || null;
    return _facade;
  }

  /* ── Demo data for when GameFacade is unavailable ── */
  const DEMO = {
    hud: {
      careerLevel: 3, careerName: '筑基弟子', realm: '筑基期',
      cultivationReq: 5000, salary: 120, performance: 85,
      cultivationExp: 2340, spiritStones: 580, mind: 65, maxMind: 100,
      workMode: 'WORK', kpiCompleted: 2, kpiTotal: 5,
      talentName: '灵根', officeLevel: 1, sectId: 'qingyun',
      isFishingMode: false, salaryEfficiency: 1.0, cultivationEfficiency: 1.2,
    },
    idle: {
      salaryEfficiency: 1.0, performanceEfficiency: 0.8,
      mindRecoveryEfficiency: 1.0, cultivationEfficiency: 1.2,
      isWorkIncomeStopped: false,
    },
    tasks: {
      active: [
        { taskId: 't1', taskType: 'DAILY', name: '日常修炼', description: '完成日常修炼任务', durationSeconds: 60, startedAt: Date.now() - 30000, rewardSalary: 10, rewardCultivation: 50, rewardSpiritStones: 5, completed: false, claimed: false },
        { taskId: 't2', taskType: 'WORK', name: '整理文书', description: '帮师兄整理文书', durationSeconds: 120, startedAt: Date.now() - 80000, rewardSalary: 20, rewardCultivation: 0, rewardSpiritStones: 10, completed: false, claimed: false },
      ],
      configs: [
        { id: 'c1', type: 'DAILY', name: '采药任务', description: '去后山采集灵药', durationSeconds: 90, rewardSalary: 15, rewardCultivation: 30, rewardSpiritStones: 8 },
        { id: 'c2', type: 'CULTIVATION', name: '闭关修炼', description: '在洞府闭关修炼', durationSeconds: 180, rewardSalary: 0, rewardCultivation: 100, rewardSpiritStones: 0 },
      ],
    },
    craft: {
      recipes: [
        { id: 'r1', name: '聚灵丹', description: '增加修为的丹药', costCultivation: 200, costSpiritStones: 50, effect: { cultivation: 500 }, unlockCareerLevel: 1, maxCraftCount: 0 },
        { id: 'r2', name: '清心符', description: '恢复心境的符箓', costCultivation: 100, costSpiritStones: 30, effect: { mind: 20 }, unlockCareerLevel: 2, maxCraftCount: 0 },
      ],
      playerCultivation: 2340, playerSpiritStones: 580, playerCareerLevel: 3,
    },
    promotion: {
      allowed: true, reason: '', probability: 0.35, needsRetry: false,
      options: [
        { id: 'opt1', name: '突破筑基', description: '尝试突破到筑基期，成功率35%' },
        { id: 'opt2', name: '稳固根基', description: '先稳固当前修为再突破' },
      ],
    },
  };

  function buildHUD() {
    const f = getFacade();
    if (!f) { _demoMode = true; return DEMO.hud; }
    try {
      const s = f.snapshot();
      if (!s) return null;
      const career = f.queryCareer ? f.queryCareer() : null;
      const talent = (f.queryTalent && s.talentId) ? f.queryTalent(s.talentId) : null;
      const kpi = f.queryKpi ? f.queryKpi() : null;

      return {
        careerLevel:   career ? career.level : s.careerLevel,
        careerName:    career ? career.name : '凡人',
        realm:         career ? career.realm : '练气期',
        cultivationReq: career ? career.requiredExp : 100,
        salary:        s.salary,
        performance:   s.performance,
        cultivationExp: s.cultivationExp,
        mind:          s.mind,
        maxMind:       s.maxMind,
        workMode:      s.workMode,
        kpiCompleted:  kpi ? kpi.items.filter(function(i){return i.completed}).length : 0,
        kpiTotal:      kpi ? kpi.items.length : 0,
        spiritStones:  s.spiritStones,
        talentName:    talent ? talent.name : '',
        officeLevel:   s.officeLevel,
        sectId:        s.sectId,
        mindStatus:    s.mindStatus,
        isFishingMode: s.isFishingMode,
        salaryEfficiency: s.salaryEfficiency,
        cultivationEfficiency: s.cultivationEfficiency,
      };
    } catch (e) {
      console.warn('[UI] buildHUD error:', e);
      return null;
    }
  }

  function buildTasks() {
    const f = getFacade();
    if (!f) { _demoMode = true; return DEMO.tasks; }
    try {
      const active = f.queryActiveTasks ? f.queryActiveTasks() : [];
      const configs = f.queryTaskConfigs ? f.queryTaskConfigs() : [];
      const activeArr = Array.isArray(active) ? active : [];
      const configArr = Array.isArray(configs) ? configs : [];
      // Filter out configs that are already active
      const activeIds = new Set(activeArr.map(function(t) { return t.taskId || t.id; }));
      const availableConfigs = configArr.filter(function(c) { return !activeIds.has(c.id); });
      return {
        activeTasks: activeArr,
        availableConfigs: availableConfigs,
        activeCount: activeArr.length,
        maxConcurrent: 4,
        canStartMore: activeArr.length < 4,
      };
    } catch (e) {
      console.warn('[UI] buildTasks error:', e);
      return null;
    }
  }

  function buildCraft() {
    const f = getFacade();
    if (!f) { _demoMode = true; return DEMO.craft; }
    try {
      const recipes = f.queryCraftRecipes ? f.queryCraftRecipes() : [];
      const allRecipes = f.queryAllCraftRecipes ? f.queryAllCraftRecipes() : [];
      const s = f.snapshot();
      return {
        recipes: Array.isArray(allRecipes) ? allRecipes : [],
        availableRecipes: Array.isArray(recipes) ? recipes : [],
        totalCrafted: f.queryTotalCraftedCount ? f.queryTotalCraftedCount() : 0,
        playerCultivation: s ? s.cultivationExp : 0,
        playerSpiritStones: s ? s.spiritStones : 0,
        playerCareerLevel: s ? s.careerLevel : 1,
      };
    } catch (e) {
      console.warn('[UI] buildCraft error:', e);
      return null;
    }
  }

  function buildPromotion() {
    const f = getFacade();
    if (!f) { _demoMode = true; return DEMO.promotion; }
    try {
      const check = f.queryPromotionCheck ? f.queryPromotionCheck() : null;
      const options = f.queryPromotionOptions ? f.queryPromotionOptions() : [];
      const probability = f.queryPromotionProbability ? f.queryPromotionProbability() : 0;
      const needsRetry = f.queryPromotionNeedsRetry ? f.queryPromotionNeedsRetry() : false;
      return {
        allowed: check ? check.allowed : false,
        reason: check ? String(check.reason || '') : '',
        probability: probability,
        needsRetry: needsRetry,
        options: Array.isArray(options) ? options : [],
      };
    } catch (e) {
      console.warn('[UI] buildPromotion error:', e);
      return null;
    }
  }

  function buildIdle() {
    const f = getFacade();
    if (!f) { _demoMode = true; return DEMO.idle; }
    try {
      const s = f.snapshot();
      if (!s) return null;
      return {
        workMode: s.workMode,
        isFishingMode: s.isFishingMode,
        salaryEfficiency: s.salaryEfficiency,
        performanceEfficiency: s.performanceEfficiency,
        mindRecoveryEfficiency: s.mindRecoveryEfficiency,
        cultivationEfficiency: s.cultivationEfficiency,
        isWorkIncomeStopped: s.isWorkIncomeStopped,
      };
    } catch (e) {
      console.warn('[UI] buildIdle error:', e);
      return null;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     §3. Command Dispatch
     ═══════════════════════════════════════════════════════════ */

  function cmd(name, ...args) {
    const f = getFacade();
    if (!f || !f[name]) {
      if (_demoMode) {
        toast('🎮 演示模式: ' + name, 'info');
        return;
      }
      console.warn('[UI] Command not available:', name);
      return;
    }
    try {
      const result = f[name](...args);
      console.log('[UI] cmd:', name, args, '→', result);
      if (result && typeof result.then === 'function') {
        result.then(r => { toast(r ? '✅ ' + String(r) : '✅ 操作成功', 'success'); refresh(); })
              .catch(e => { toast('❌ ' + (e.message || '操作失败'), 'error'); });
      } else {
        setTimeout(refresh, 100);
      }
    } catch (e) {
      console.error('[UI] cmd error:', name, e);
      toast('❌ ' + e.message, 'error');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     §4. Toast System
     ═══════════════════════════════════════════════════════════ */

  let _toastTimer = null;

  function toast(msg, type) {
    type = type || 'info';
    const container = $('#ToastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'ui-toast' + (type !== 'info' ? ' ui-toast--' + type : '');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('ui-toast--leaving');
      setTimeout(() => el.remove(), 300);
    }, 2500);
  }

  /* ═══════════════════════════════════════════════════════════
     §5. Modal System
     ═══════════════════════════════════════════════════════════ */

  function showModal(title, bodyHtml, actions) {
    const layer = $('#ModalLayer');
    if (!layer) return;
    const actionsHtml = (actions || []).map(a =>
      `<button class="ui-btn ${a.cls || 'ui-btn--ghost'}" data-modal-action="${a.id}">${escHtml(a.label)}</button>`
    ).join('');

    layer.innerHTML = `
      <div class="ui-modal-overlay" data-close-modal>
        <div class="ui-modal" onclick="event.stopPropagation()">
          <div class="ui-modal-header">
            <span class="ui-modal-title">${escHtml(title)}</span>
            <button class="ui-modal-close" data-close-modal>✕</button>
          </div>
          <div class="ui-modal-body">${bodyHtml}</div>
          ${actionsHtml ? `<div class="ui-modal-footer">${actionsHtml}</div>` : ''}
        </div>
      </div>`;

    layer.querySelectorAll('[data-close-modal]').forEach(el => {
      el.addEventListener('click', () => { layer.innerHTML = ''; });
    });
    layer.querySelectorAll('[data-modal-action]').forEach(el => {
      el.addEventListener('click', () => {
        const actionId = el.dataset.modalAction;
        const action = (actions || []).find(a => a.id === actionId);
        if (action && action.handler) action.handler();
        layer.innerHTML = '';
      });
    });
  }

  function closeModal() {
    const layer = $('#ModalLayer');
    if (layer) layer.innerHTML = '';
  }

  /* ═══════════════════════════════════════════════════════════
     §6. Page Renderers
     ═══════════════════════════════════════════════════════════ */

  /* ── 6a. Home Page ── */

  function renderHome() {
    const hud = buildHUD();
    const idle = buildIdle();
    if (!hud) return '<div class="ui-loading"><div class="ui-spinner"></div>加载中...</div>';

    const cultPct = pct(hud.cultivationExp, hud.cultivationReq);
    const mindPct = pct(hud.mind, hud.maxMind);
    const mindLabel = mindText(hud.mind, hud.maxMind);
    const wm = hud.workMode || 'WORK';
    const wmLabel = WORK_MODE_LABELS[wm] || wm;
    const wmIcon = WORK_MODE_ICONS[wm] || '💼';
    const nextMode = wm === 'WORK' ? 'FISHING' : 'WORK';
    const nextLabel = WORK_MODE_LABELS[nextMode];
    const nextIcon = WORK_MODE_ICONS[nextMode];

    return `
      <div class="ui-page-section">
        <div class="ui-home-cultivation">
          <div class="ui-realm-name">⚔️ ${escHtml(hud.realm)}</div>
          <div class="ui-career-name">${escHtml(hud.careerName)} · Lv.${hud.careerLevel}</div>
          <div class="ui-cult-progress">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-muted);margin-bottom:4px">
              <span>修为进度</span>
              <span class="ui-num">${fmtNum(hud.cultivationExp)} / ${fmtNum(hud.cultivationReq)}</span>
            </div>
            <div class="ui-progress">
              <div class="ui-progress-bar ui-progress-bar--gold" style="width:${cultPct}%"></div>
            </div>
          </div>
          <div class="ui-home-actions">
            <button class="ui-btn ui-btn--primary" onclick="UiOverlay.cmd('cultivate')">🧘 修炼</button>
            <button class="ui-btn ui-btn--secondary" onclick="UiOverlay.cmd('changeWorkMode','${nextMode}')">${nextIcon} ${nextLabel}</button>
          </div>
        </div>
      </div>

      <div class="ui-page-section">
        <div class="ui-section-title"><span class="ui-section-icon">📊</span> 状态</div>
        <div class="ui-idle-panel">
          <div class="ui-idle-row">
            <span class="ui-idle-label">心境</span>
            <span class="ui-idle-value">${mindLabel} (${hud.mind}/${hud.maxMind})</span>
          </div>
          <div class="ui-progress" style="margin:4px 0">
            <div class="ui-progress-bar ui-progress-bar--jade" style="width:${mindPct}%"></div>
          </div>
          <div class="ui-idle-row">
            <span class="ui-idle-label">工作模式</span>
            <span class="ui-idle-value">${wmIcon} ${wmLabel}</span>
          </div>
          <div class="ui-idle-row">
            <span class="ui-idle-label">绩效</span>
            <span class="ui-idle-value">${fmtNum(hud.performance)}</span>
          </div>
          <div class="ui-idle-row">
            <span class="ui-idle-label">KPI</span>
            <span class="ui-idle-value">${hud.kpiCompleted} / ${hud.kpiTotal}</span>
          </div>
        </div>
      </div>

      <div class="ui-page-section">
        <div class="ui-section-title"><span class="ui-section-icon">💰</span> 资源</div>
        <div class="ui-card">
          <div class="ui-card-body">
            <div class="ui-idle-row">
              <span class="ui-idle-label">💎 灵石</span>
              <span class="ui-idle-value ui-text-gold">${fmtNum(hud.spiritStones)}</span>
            </div>
            <div class="ui-idle-row">
              <span class="ui-idle-label">💵 工资</span>
              <span class="ui-idle-value">${fmtNum(hud.salary)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ── 6b. Tasks Page ── */

  function renderTasks() {
    const data = buildTasks();
    if (!data) return '<div class="ui-loading"><div class="ui-spinner"></div>加载中...</div>';

    let html = '';
    const now = Date.now();

    // Active tasks
    if (data.activeTasks.length > 0) {
      html += '<div class="ui-page-section">';
      html += '<div class="ui-section-title"><span class="ui-section-icon">🔥</span> 进行中 (${data.activeTasks.length}/${data.maxConcurrent})</div>';
      data.activeTasks.forEach(t => {
        const typeIcon = TASK_TYPE_ICONS[t.taskType] || TASK_TYPE_ICONS[t.type] || '📋';
        const typeLabel = TASK_TYPE_LABELS[t.taskType] || TASK_TYPE_LABELS[t.type] || t.taskType || '任务';
        // Calculate progress from startedAt and durationSeconds
        let progressPct = 0;
        if (t.completed) {
          progressPct = 100;
        } else if (t.startedAt && t.durationSeconds) {
          const elapsed = (now - t.startedAt) / 1000;
          progressPct = Math.min(100, Math.max(0, (elapsed / t.durationSeconds) * 100));
        }
        const isComplete = !!t.completed;
        const btnLabel = isComplete ? '领取' : Math.floor(progressPct) + '%';
        const btnClass = isComplete ? 'ui-btn--primary' : 'ui-btn--secondary';
        html += `
          <div class="ui-card ui-task-card">
            <div class="ui-task-icon">${typeIcon}</div>
            <div class="ui-task-info">
              <div class="ui-task-name">${escHtml(t.name || typeLabel + '任务')}</div>
              <div class="ui-task-desc">${escHtml(t.description || '')}</div>
              <div class="ui-task-progress">
                <div class="ui-progress">
                  <div class="ui-progress-bar ui-progress-bar--gold" style="width:${progressPct}%"></div>
                </div>
                <div class="ui-progress-text">${Math.floor(progressPct)}%</div>
              </div>
            </div>
            <button class="ui-btn ${btnClass} ui-btn--sm" ${isComplete ? '' : 'disabled'}
              onclick="UiOverlay.cmd('claimTask','${t.taskId}')">${btnLabel}</button>
          </div>`;
      });
      html += '</div>';
    }

    // Available tasks
    if (data.availableConfigs.length > 0) {
      html += '<div class="ui-page-section">';
      html += '<div class="ui-section-title"><span class="ui-section-icon">📋</span> 可接任务</div>';
      data.availableConfigs.forEach(c => {
        const typeIcon = TASK_TYPE_ICONS[c.type] || '📋';
        const typeLabel = TASK_TYPE_LABELS[c.type] || c.type || '任务';
        const canStart = data.canStartMore;
        // Show reward info
        let rewardParts = [];
        if (c.rewardSalary > 0) rewardParts.push('💰' + fmtNum(c.rewardSalary));
        if (c.rewardCultivation > 0) rewardParts.push('⚔️' + fmtNum(c.rewardCultivation));
        if (c.rewardSpiritStones > 0) rewardParts.push('💎' + fmtNum(c.rewardSpiritStones));
        const rewardHtml = rewardParts.length > 0 ? rewardParts.join(' ') : '';
        const durationMin = c.durationSeconds ? Math.ceil(c.durationSeconds / 60) : 0;
        html += `
          <div class="ui-card ui-task-card ${canStart ? 'ui-card--interactive' : 'ui-card--disabled'}">
            <div class="ui-task-icon">${typeIcon}</div>
            <div class="ui-task-info">
              <div class="ui-task-name">${escHtml(c.name || typeLabel + '任务')}</div>
              <div class="ui-task-desc">${escHtml(c.description || '')}</div>
              ${rewardHtml ? '<div style="font-size:11px;color:var(--color-gold);margin-top:2px">奖励: ' + rewardHtml + '</div>' : ''}
              ${durationMin > 0 ? '<div style="font-size:11px;color:var(--color-text-muted)">耗时: ' + durationMin + '分钟</div>' : ''}
            </div>
            <button class="ui-btn ui-btn--secondary ui-btn--sm" ${canStart ? '' : 'disabled'}
              onclick="UiOverlay.cmd('startTask','${c.id}')">接取</button>
          </div>`;
      });
      html += '</div>';
    }

    if (!data.activeTasks.length && !data.availableConfigs.length) {
      html += '<div class="ui-empty-state"><div class="ui-empty-icon">📋</div><div class="ui-empty-text">暂无任务</div><div class="ui-empty-hint">继续修炼，任务会自动出现</div></div>';
    }

    return html;
  }

  /* ── 6c. Craft Page ── */

  function renderCraft() {
    const data = buildCraft();
    if (!data) return '<div class="ui-loading"><div class="ui-spinner"></div>加载中...</div>';

    let html = '';

    if (data.recipes.length > 0) {
      html += '<div class="ui-page-section">';
      html += '<div class="ui-section-title"><span class="ui-section-icon">🧪</span> 炼制配方</div>';
      data.recipes.forEach(r => {
        const canAfford = (data.playerCultivation >= (r.costCultivation || 0)) && (data.playerSpiritStones >= (r.costSpiritStones || 0));
        const unlocked = (r.unlockCareerLevel || 0) <= data.playerCareerLevel;
        const canCraft = canAfford && unlocked;
        // Build cost display
        let costParts = [];
        if (r.costCultivation > 0) costParts.push('修为 ' + fmtNum(r.costCultivation));
        if (r.costSpiritStones > 0) costParts.push('灵石 ' + fmtNum(r.costSpiritStones));
        const costHtml = costParts.join(' + ');
        // Build effect display
        let effectParts = [];
        const eff = r.effect || {};
        if (eff.salary) effectParts.push('薪资+' + fmtNum(eff.salary));
        if (eff.performance) effectParts.push('绩效+' + fmtNum(eff.performance));
        if (eff.cultivation) effectParts.push('修为+' + fmtNum(eff.cultivation));
        if (eff.mind) effectParts.push('心境+' + fmtNum(eff.mind));
        const effectHtml = effectParts.join('  ');

        html += `
          <div class="ui-card ui-recipe-card ${canCraft ? 'ui-card--interactive' : 'ui-card--disabled'}">
            <div class="ui-recipe-header">
              <div class="ui-recipe-icon">🧪</div>
              <div class="ui-recipe-name">${escHtml(r.name || '配方')}</div>
              ${!unlocked ? '<span style="font-size:11px;color:var(--color-text-muted)">需Lv.' + (r.unlockCareerLevel || 0) + '</span>' : ''}
            </div>
            ${r.description ? '<div class="ui-recipe-desc" style="font-size:12px;color:var(--color-text-muted);margin-bottom:6px">' + escHtml(r.description) + '</div>' : ''}
            ${costHtml ? '<div class="ui-recipe-cost">消耗: ' + escHtml(costHtml) + '</div>' : ''}
            ${effectHtml ? '<div class="ui-recipe-effect">效果: ' + escHtml(effectHtml) + '</div>' : ''}
            <div class="ui-card-footer">
              <button class="ui-btn ui-btn--primary ui-btn--sm" ${canCraft ? '' : 'disabled'}
                onclick="UiOverlay.cmd('craft','${r.id}')">炼制</button>
            </div>
          </div>`;
      });
      html += '</div>';
    } else {
      html += '<div class="ui-empty-state"><div class="ui-empty-icon">🧪</div><div class="ui-empty-text">暂无配方</div><div class="ui-empty-hint">提升修为解锁更多配方</div></div>';
    }

    return html;
  }

  /* ── 6d. Promotion Page ── */

  function renderPromotion() {
    const data = buildPromotion();
    const hud = buildHUD();
    if (!data) return '<div class="ui-loading"><div class="ui-spinner"></div>加载中...</div>';

    let html = '';

    html += '<div class="ui-page-section">';
    html += '<div class="ui-section-title"><span class="ui-section-icon">⬆️</span> 晋升</div>';

    html += `<div class="ui-card">
      <div class="ui-promo-status">
        <div class="ui-promo-realm">${escHtml(hud ? hud.realm : '练气期')}</div>
        <div class="ui-promo-probability">
          成功率: <span class="ui-value">${data.probability != null ? Math.floor(data.probability * 100) : 0}%</span>
        </div>
      </div>`;

    if (data.allowed) {
      const firstOptId = (data.options && data.options.length > 0) ? (data.options[0].id || '') : '';
      html += `
        <div class="ui-card-footer" style="justify-content:center">
          <button class="ui-btn ui-btn--primary ui-btn--lg ui-animate-pulse" onclick="UiOverlay.cmd('promote','${escHtml(firstOptId)}')">突破晋升</button>
        </div>`;
    } else if (data.reason) {
      html += `<div style="text-align:center;padding:8px 0;color:var(--color-text-muted);font-size:13px">${escHtml(data.reason)}</div>`;
    }

    if (data.needsRetry) {
      const retryOptId = (data.options && data.options.length > 0) ? (data.options[0].id || '') : '';
      html += `
        <div class="ui-card-footer" style="justify-content:center">
          <button class="ui-btn ui-btn--secondary" onclick="UiOverlay.cmd('promote','${escHtml(retryOptId)}')">再次尝试</button>
        </div>`;
    }

    html += '</div></div>';

    // Promotion options
    if (data.options && data.options.length > 0) {
      html += '<div class="ui-page-section">';
      html += '<div class="ui-section-title"><span class="ui-section-icon">🎯</span> 晋升选项</div>';
      data.options.forEach(opt => {
        html += `
          <div class="ui-card ui-card--interactive" onclick="UiOverlay.showPromoDetail('${escHtml(opt.id || opt.name || '')}')">
            <div class="ui-card-header">
              <span class="ui-card-title">${escHtml(opt.name || opt.title || '选项')}</span>
              ${opt.level ? `<span class="ui-card-badge">Lv.${opt.level}</span>` : ''}
            </div>
            <div class="ui-card-body">${escHtml(opt.description || opt.desc || '')}</div>
          </div>`;
      });
      html += '</div>';
    }

    return html;
  }

  /* ── 6e. More Page ── */

  let _moreSubTab = 'SECT';

  function renderMore() {
    let html = '';

    // Sub tabs
    html += '<div class="ui-sub-tabs">';
    MORE_SUB_TABS.forEach(t => {
      html += `<button class="ui-sub-tab ${_moreSubTab === t.id ? 'ui-sub-tab--active' : ''}" 
        onclick="UiOverlay.switchMoreTab('${t.id}')">${t.icon} ${t.label}</button>`;
    });
    html += '</div>';

    // Sub content
    switch (_moreSubTab) {
      case 'SECT': html += renderMoreSect(); break;
      case 'ACHIEVEMENT': html += renderMoreAchievement(); break;
      case 'DAILY': html += renderMoreDaily(); break;
      case 'SETTINGS': html += renderMoreSettings(); break;
      default: html += renderMoreSect();
    }

    return html;
  }

  function renderMoreSect() {
    const f = getFacade();
    let sect = null;
    try { sect = f && f.querySect ? f.querySect() : null; } catch (e) {}

    if (!sect) {
      return '<div class="ui-empty-state"><div class="ui-empty-icon">⚔️</div><div class="ui-empty-text">尚未加入宗门</div><div class="ui-empty-hint">提升修为后可加入宗门</div></div>';
    }

    return `
      <div class="ui-card">
        <div class="ui-card-header">
          <span class="ui-card-title">⚔️ ${escHtml(sect.name || '宗门')}</span>
          ${sect.level ? `<span class="ui-card-badge">Lv.${sect.level}</span>` : ''}
        </div>
        <div class="ui-card-body">${escHtml(sect.description || sect.desc || '宗门信息')}</div>
      </div>`;
  }

  function renderMoreAchievement() {
    return '<div class="ui-empty-state"><div class="ui-empty-icon">🏆</div><div class="ui-empty-text">成就系统</div><div class="ui-empty-hint">即将开放</div></div>';
  }

  function renderMoreDaily() {
    return '<div class="ui-empty-state"><div class="ui-empty-icon">📅</div><div class="ui-empty-text">每日签到</div><div class="ui-empty-hint">即将开放</div></div>';
  }

  function renderMoreSettings() {
    return `
      <div class="ui-card">
        <div class="ui-setting-row">
          <div>
            <div class="ui-setting-label">音效</div>
            <div class="ui-setting-desc">游戏音效开关</div>
          </div>
          <button class="ui-toggle ui-toggle--on" id="ToggleSfx" onclick="UiOverlay.toggleSetting(this,'sfx')"></button>
        </div>
        <div class="ui-setting-row">
          <div>
            <div class="ui-setting-label">背景音乐</div>
            <div class="ui-setting-desc">背景音乐开关</div>
          </div>
          <button class="ui-toggle" id="ToggleBgm" onclick="UiOverlay.toggleSetting(this,'bgm')"></button>
        </div>
        <div class="ui-setting-row">
          <div>
            <div class="ui-setting-label">推送通知</div>
            <div class="ui-setting-desc">接收游戏通知</div>
          </div>
          <button class="ui-toggle ui-toggle--on" id="ToggleNotify" onclick="UiOverlay.toggleSetting(this,'notify')"></button>
        </div>
      </div>
      <div class="ui-card" style="margin-top:12px">
        <div class="ui-card-body ui-text-center ui-text-muted ui-text-sm">
          牛马修仙传 v1.0<br>DOM Overlay UI
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     §7. Main UI Controller
     ═══════════════════════════════════════════════════════════ */

  let _currentTab = 'HOME';
  let _refreshTimer = null;
  let _overlay = null;

  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'UiOverlay';
    el.innerHTML = `
      <div class="ui-header" id="UiHeader"></div>
      <div class="ui-resource-bar" id="UiResourceBar"></div>
      <div class="ui-page-container" id="UiPageContainer"></div>
      <div class="ui-bottom-nav" id="UiBottomNav"></div>
      <div id="ModalLayer"></div>
      <div class="ui-toast-container" id="ToastContainer"></div>`;
    return el;
  }

  function renderHeader() {
    const el = $('#UiHeader');
    if (!el) return;
    const hud = buildHUD();
    if (!hud) { el.innerHTML = '<span class="ui-header-title">牛马修仙传</span>'; return; }
    const demoTag = _demoMode ? ' <span style="font-size:10px;color:var(--color-gold);background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px">演示</span>' : '';
    el.innerHTML = `
      <span class="ui-header-title">🏠 牛马修仙传${demoTag}</span>
      <span class="ui-header-realm">${escHtml(hud.realm)}</span>`;
  }

  function renderResourceBar() {
    const el = $('#UiResourceBar');
    if (!el) return;
    const hud = buildHUD();
    if (!hud) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="ui-res-item"><span class="ui-res-icon">💎</span><span class="ui-res-value ui-num">${fmtNum(hud.spiritStones)}</span></div>
      <div class="ui-res-item"><span class="ui-res-icon">💵</span><span class="ui-res-value ui-num">${fmtNum(hud.salary)}</span></div>
      <div class="ui-res-item"><span class="ui-res-icon">📊</span><span class="ui-res-value ui-num">${fmtNum(hud.performance)}</span></div>
      <div class="ui-res-item"><span class="ui-res-icon">🧘</span><span class="ui-res-value ui-num">${fmtNum(hud.cultivationExp)}</span></div>`;
  }

  function renderPage() {
    const el = $('#UiPageContainer');
    if (!el) return;
    let html = '';
    switch (_currentTab) {
      case 'HOME':      html = renderHome(); break;
      case 'TASKS':     html = renderTasks(); break;
      case 'CRAFT':     html = renderCraft(); break;
      case 'PROMOTION': html = renderPromotion(); break;
      case 'MORE':      html = renderMore(); break;
      default:          html = renderHome();
    }
    el.innerHTML = `<div class="ui-page ui-page--active">${html}</div>`;
  }

  function renderNav() {
    const el = $('#UiBottomNav');
    if (!el) return;
    el.innerHTML = NAV_TABS.map(t => `
      <button class="ui-nav-item ${_currentTab === t.id ? 'ui-nav-item--active' : ''}" 
        data-tab="${t.id}">
        <span class="ui-nav-icon">${t.icon}</span>
        <span class="ui-nav-label">${t.label}</span>
      </button>`).join('');

    el.querySelectorAll('.ui-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab && tab !== _currentTab) {
          _currentTab = tab;
          renderNav();
          renderPage();
        }
      });
    });
  }

  function refresh() {
    renderHeader();
    renderResourceBar();
    renderPage();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    _refreshTimer = setInterval(refresh, 2000);
  }

  function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }

  function subscribeEvents() {
    const f = getFacade();
    if (!f || !f.onUiEvent) return;
    const categories = ['STATE_CHANGED', 'RESOURCE_CHANGED', 'WORK_MODE_CHANGED', 'CAREER_CHANGED', 'BUFF_CHANGED'];
    categories.forEach(cat => {
      try {
        const unsub = f.onUiEvent(cat, () => { setTimeout(refresh, 50); });
        if (typeof unsub === 'function') _unsubs.push(unsub);
      } catch (e) { /* ignore */ }
    });
  }

  function unsubscribeEvents() {
    _unsubs.forEach(fn => { try { fn(); } catch (e) {} });
    _unsubs = [];
  }

  /* ═══════════════════════════════════════════════════════════
     §8. Hide Cocos Native UI
     ═══════════════════════════════════════════════════════════ */

  function hideCocosUI() {
    // Only hide the Cocos canvas — NOT GameDiv (UiOverlay is a child of GameDiv)
    const canvas = document.querySelector('#GameDiv canvas');
    if (canvas) {
      canvas.style.opacity = '0';
      canvas.style.pointerEvents = 'none';
    }
    // Also hide the Cocos3dGameContainer wrapper if present
    const container = document.getElementById('Cocos3dGameContainer');
    if (container) {
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
    }
  }

  /* ═══════════════════════════════════════════════════════════
     §9. Public API (window.UiOverlay)
     ═══════════════════════════════════════════════════════════ */

  window.UiOverlay = {
    cmd,
    toast,
    showModal,
    closeModal,
    refresh,
    switchMoreTab(tab) { _moreSubTab = tab; renderPage(); },
    showPromoDetail(id) {
      const data = buildPromotion();
      const opt = data && data.options ? data.options.find(o => o.id === id || o.name === id) : null;
      if (!opt) { showModal('晋升详情', '<p style="color:var(--color-text-muted)">未找到该选项</p>'); return; }
      const body = `
        <div style="margin-bottom:12px">
          <div style="font-size:16px;font-weight:600;color:var(--color-text-primary)">${escHtml(opt.name || opt.title || '选项')}</div>
          <div style="font-size:13px;color:var(--color-text-secondary);margin-top:6px">${escHtml(opt.description || opt.desc || '无描述')}</div>
        </div>
        ${data && data.probability != null ? `<div style="font-size:13px;color:var(--color-text-muted)">成功率: <span class="ui-value">${Math.floor(data.probability * 100)}%</span></div>` : ''}
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
          <button class="ui-btn ui-btn--secondary" onclick="UiOverlay.closeModal()">取消</button>
          <button class="ui-btn ui-btn--primary" onclick="UiOverlay.cmd('promote','${escHtml(opt.id || '')}');UiOverlay.closeModal()">确认晋升</button>
        </div>`;
      showModal('晋升详情', body);
    },
    toggleSetting(el, key) {
      el.classList.toggle('ui-toggle--on');
      toast((el.classList.contains('ui-toggle--on') ? '开启' : '关闭') + ' ' + key, 'success');
    },
  };

  /* ═══════════════════════════════════════════════════════════
     §10. Initialization
     ═══════════════════════════════════════════════════════════ */

  function init() {
    console.log('[UI] Initializing DOM Overlay...');

    // Mount immediately with demo data, switch to real data when facade arrives
    mount();

    // Poll for GameFacade — once found, re-render with real data
    let attempts = 0;
    const maxAttempts = 200;
    const pollInterval = setInterval(() => {
      attempts++;
      if (getFacade() && !_demoMode) {
        clearInterval(pollInterval);
        console.log('[UI] GameFacade found, switching to live data');
        _demoMode = false;
        refresh();
        subscribeEvents();
      } else if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        if (_demoMode) {
          console.warn('[UI] GameFacade not found after', maxAttempts * 300, 'ms — staying in demo mode');
        }
      }
    }, 300);
  }

  function mount() {
    // Build and insert overlay INTO GameDiv for correct scaling
    const gameDiv = document.getElementById('GameDiv');
    _overlay = buildOverlay();
    if (gameDiv) {
      gameDiv.appendChild(_overlay);
    } else {
      document.body.appendChild(_overlay);
    }
    hideCocosUI();

    // Initial render (demo data if facade not available)
    renderHeader();
    renderResourceBar();
    renderNav();
    renderPage();

    // Start auto refresh
    startAutoRefresh();

    console.log('[UI] DOM Overlay mounted', _demoMode ? '(demo mode)' : '(live mode)');
    toast(_demoMode ? '🎮 UI已加载 (演示模式)' : '🎮 UI已加载', 'gold');
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();