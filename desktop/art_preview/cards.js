(() => {
  'use strict';

  const cards = [...document.querySelectorAll('.character-card')];
  const filters = [
    { id: 'all', label: '全部角色' },
    { id: 'jade', label: '青玉' },
    { id: 'gold', label: '鎏金' },
    { id: 'purple', label: '紫金' }
  ];
  const grid = document.querySelector('#card-grid');
  const count = document.querySelector('#visible-count');
  const status = document.querySelector('#filter-status');
  const motionInput = document.querySelector('#motion-toggle');
  const mediaReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mediaFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let userMotionEnabled = true;
  let selectedFilter = 'all';
  let rafId = 0;
  let pendingPointer = null;

  function preferenceIsLow() {
    return mediaReduced.matches || !userMotionEnabled;
  }

  function applyMotionPreference() {
    const low = preferenceIsLow();
    document.body.classList.toggle('low-motion', low);
    motionInput.checked = !low;
    motionInput.disabled = mediaReduced.matches;
    motionInput.setAttribute('aria-label', mediaReduced.matches ? '动态效果已关闭：系统减少动态偏好已启用' : `动态效果${low ? '关闭' : '开启'}`);
    motionInput.title = mediaReduced.matches ? '系统减少动态偏好已启用，动态效果已关闭' : `动态效果${low ? '关闭' : '开启'}`;
    if (low) cards.forEach(clearTilt);
  }

  function clearTilt(card) {
    card.style.removeProperty('--tilt-x');
    card.style.removeProperty('--tilt-y');
    card.style.transform = '';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    pendingPointer = null;
  }

  function updateTilt() {
    rafId = 0;
    if (!pendingPointer || preferenceIsLow() || !mediaFine.matches) return;
    const { card, x, y } = pendingPointer;
    pendingPointer = null;
    if (card.classList.contains('is-flipped')) return;
    const rect = card.getBoundingClientRect();
    const dx = (x - rect.left) / rect.width - .5;
    const dy = (y - rect.top) / rect.height - .5;
    card.style.transform = `perspective(1100px) rotateX(${(-dy * 5).toFixed(2)}deg) rotateY(${(dx * 5).toFixed(2)}deg)`;
  }

  function setCardFlipped(card, flipped) {
    card.classList.toggle('is-flipped', flipped);
    const front = card.querySelector('.card-front');
    const back = card.querySelector('.card-back');
    const frontToggle = card.querySelector('.front-toggle');
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
    front.inert = flipped;
    back.inert = !flipped;
    frontToggle.setAttribute('aria-expanded', String(flipped));
    clearTilt(card);
  }

  function applyFilter(filterId) {
    selectedFilter = filterId;
    const shown = cards.filter(card => filterId === 'all' || card.dataset.rarity === filterId);
    cards.forEach(card => {
      const visible = shown.includes(card);
      card.hidden = !visible;
      if (!visible) setCardFlipped(card, false);
    });
    count.textContent = String(shown.length).padStart(2, '0');
    const label = filters.find(item => item.id === filterId).label;
    status.textContent = filterId === 'all' ? `正在展示全部 ${shown.length} 位同门` : `正在展示${label}角色 ${shown.length} 位`;
    document.querySelectorAll('.filter-button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === filterId));
    });
  }

  // Store concise metadata in attributes; all visible copy stays HTML-rendered.
  cards.forEach((card, index) => {
    const title = card.querySelector('.card-title h3').textContent.trim();
    const rarity = card.querySelector('.rarity').textContent.replace(/\s+/g, ' ').trim().replace('✦', '').trim();
    card.dataset.name = title;
    card.dataset.rarityLabel = rarity;
    const front = card.querySelector('.card-front');
    const back = card.querySelector('.card-back');
    const frontToggle = document.createElement('button');
    const backReturn = card.querySelector('.back-return');
    back.id = `character-card-back-${index + 1}`;
    frontToggle.type = 'button';
    frontToggle.className = 'front-toggle';
    frontToggle.setAttribute('aria-label', `翻阅${title}角色设定`);
    frontToggle.setAttribute('aria-expanded', 'false');
    frontToggle.setAttribute('aria-controls', back.id);
    front.append(frontToggle);
    front.setAttribute('aria-hidden', 'false');
    front.inert = false;
    backReturn.addEventListener('click', () => {
      setCardFlipped(card, false);
      frontToggle.focus({ preventScroll: true });
    });
    frontToggle.addEventListener('click', () => {
      setCardFlipped(card, true);
      backReturn.focus({ preventScroll: true });
    });
    card.addEventListener('pointermove', event => {
      if (preferenceIsLow() || !mediaFine.matches || card.classList.contains('is-flipped')) return;
      pendingPointer = { card, x: event.clientX, y: event.clientY };
      if (!rafId) rafId = requestAnimationFrame(updateTilt);
    });
    card.addEventListener('pointerleave', () => clearTilt(card));
    card.addEventListener('pointercancel', () => clearTilt(card));
  });

  const filterBar = document.createElement('nav');
  filterBar.className = 'filter-bar';
  filterBar.setAttribute('aria-label', '按角色稀有度筛选');
  filters.forEach(filter => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.dataset.filter = filter.id;
    button.textContent = filter.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => applyFilter(filter.id));
    filterBar.append(button);
  });
  document.querySelector('.filter-status').after(filterBar);

  motionInput.addEventListener('change', () => {
    userMotionEnabled = motionInput.checked;
    applyMotionPreference();
  });
  mediaReduced.addEventListener?.('change', applyMotionPreference);
  applyMotionPreference();
  applyFilter(selectedFilter);
})();
