const state = {
  catalog: null,
  metadata: null,
  skills: [],
  skillCache: new Map(),
  selectedIds: [],
  openSkillId: '',
  filters: {
    q: '',
    group: '',
    job: '',
    school: '',
    category: '',
    level: '10',
  },
};

const elements = {
  search: document.querySelector('#search'),
  group: document.querySelector('#group'),
  job: document.querySelector('#job'),
  school: document.querySelector('#school'),
  category: document.querySelector('#category'),
  level: document.querySelector('#level'),
  reset: document.querySelector('#reset'),
  count: document.querySelector('#result-count'),
  grid: document.querySelector('#skill-grid'),
  compareBar: document.querySelector('#compare-bar'),
  compareChips: document.querySelector('#compare-chips'),
  clearCompare: document.querySelector('#clear-compare'),
  openCompare: document.querySelector('#open-compare'),
  openMods: document.querySelector('#open-mods'),
  detailDialog: document.querySelector('#detail-dialog'),
  detailContent: document.querySelector('#detail-content'),
  compareDialog: document.querySelector('#compare-dialog'),
  compareContent: document.querySelector('#compare-content'),
  modsDialog: document.querySelector('#mods-dialog'),
  modsContent: document.querySelector('#mods-content'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function optionHtml(item) {
  return `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`;
}

function readUrlState() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(state.filters)) {
    if (params.has(key)) state.filters[key] = params.get(key) || '';
  }
  state.openSkillId = params.get('skill') || '';
}

function writeUrlState({ push = false } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.filters)) {
    if (value && !(key === 'level' && value === '10')) {
      params.set(key, value);
    }
  }
  if (state.openSkillId) params.set('skill', state.openSkillId);
  const query = params.toString();
  history[push ? 'pushState' : 'replaceState'](
    {},
    '',
    `${location.pathname}${query ? `?${query}` : ''}`
  );
}

function fillSelect(select, items) {
  select.insertAdjacentHTML('beforeend', items.map(optionHtml).join(''));
}

function initializeControls(metadata) {
  fillSelect(elements.group, metadata.groups);
  fillSelect(elements.job, metadata.jobs);
  fillSelect(elements.school, metadata.schools);
  fillSelect(elements.category, metadata.categories);
  elements.level.innerHTML = Array.from({ length: metadata.maximumPreviewLevel }, (_, index) => {
    const level = index + 1;
    return `<option value="${level}">技能 Lv.${level}</option>`;
  }).join('');
  for (const [key, value] of Object.entries(state.filters)) {
    const control = key === 'q' ? elements.search : elements[key];
    if (control) control.value = value;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('zh-Hant');
}

function matchesFilters(skill) {
  const filters = state.filters;
  if (filters.group && skill.group !== filters.group) return false;
  if (filters.job && skill.job?.id !== filters.job) return false;
  if (filters.school && skill.school?.id !== filters.school) return false;
  if (filters.category && skill.category !== filters.category) return false;

  const query = normalizeText(filters.q);
  if (!query) return true;
  return [
    skill.id,
    skill.name,
    skill.description,
    skill.job?.name,
    skill.school?.name,
    skill.categoryName,
    ...skill.tags.map(tag => tag.name),
    ...skill.effects.map(effect => effect.summary),
  ].some(value => normalizeText(value).includes(query));
}

function getSkillAtCurrentLevel(skillId) {
  const levelSkills = state.catalog?.skillsByLevel?.[state.filters.level] || [];
  return levelSkills.find(skill => skill.id === skillId) || null;
}

function skillMeta(skill) {
  return [
    skill.job?.name,
    skill.school ? `${skill.school.icon} ${skill.school.name}` : null,
    skill.categoryName,
    skill.activationMode === 'reaction' ? '反應技能' : null,
  ].filter(Boolean).join('・');
}

function renderSkillCard(skill) {
  const selected = state.selectedIds.includes(skill.id);
  const effectLines = skill.effects.slice(0, 3).map(effect =>
    `<li>${escapeHtml(effect.summary)}</li>`
  ).join('');
  const extraCount = Math.max(0, skill.effects.length - 3);
  return `
    <article class="skill-card" data-skill-id="${escapeHtml(skill.id)}">
      <div class="skill-card__top">
        <div>
          <div class="skill-card__level">需求 Lv.${skill.requiredLevel}　技能 Lv.${skill.level}</div>
          <h2>${escapeHtml(skill.elementIcon)} ${escapeHtml(skill.name)}</h2>
        </div>
        <span class="badge">${escapeHtml(skill.groupName)}</span>
      </div>
      <div class="skill-card__meta">${escapeHtml(skillMeta(skill))}</div>
      <p class="skill-card__description">${escapeHtml(skill.description || '尚無技能說明。')}</p>
      <ul class="effect-list">
        ${effectLines}
        ${extraCount ? `<li>另有 ${extraCount} 項效果</li>` : ''}
      </ul>
      <div class="skill-card__actions">
        <button class="button button--ghost" type="button" data-action="detail">詳細</button>
        <button class="button ${selected ? 'button--active' : 'button--ghost'}" type="button" data-action="compare">
          ${selected ? '已加入比較' : '加入比較'}
        </button>
      </div>
    </article>`;
}

function renderSkills() {
  elements.count.textContent = `共 ${state.skills.length} 項技能`;
  if (!state.skills.length) {
    elements.grid.innerHTML = document.querySelector('#empty-template').innerHTML;
    return;
  }
  elements.grid.innerHTML = state.skills.map(renderSkillCard).join('');
}

function renderCompareBar() {
  const selected = state.selectedIds
    .map(id => state.skillCache.get(id))
    .filter(Boolean);
  elements.compareBar.hidden = selected.length === 0;
  elements.compareChips.innerHTML = selected
    .map(skill => `<span class="chip">${escapeHtml(skill.name)}</span>`)
    .join('');
  elements.openCompare.disabled = selected.length < 2;
}

function detailHtml(skill) {
  const costs = [
    skill.cost.hp ? `生命 ${skill.cost.hp}` : null,
    skill.cost.hpPercent ? `最大生命 ${skill.cost.hpPercent}%` : null,
    skill.cost.resourceAmount ? `${skill.cost.resourceType} ${skill.cost.resourceAmount}` : null,
  ].filter(Boolean).join('、') || '無';
  const prerequisites = skill.prerequisites.length
    ? skill.prerequisites.map(item => `${item.name || item.skillId} Lv.${item.level}`).join('、')
    : '無';
  return `
    <div class="skill-card__level">需求 Lv.${skill.requiredLevel}　技能 Lv.${skill.level} / ${skill.maxLevel}</div>
    <h2 class="detail-title">${escapeHtml(skill.elementIcon)} ${escapeHtml(skill.name)}</h2>
    <div class="detail-subtitle">${escapeHtml(skillMeta(skill))}</div>
    <p class="skill-card__description detail-section">${escapeHtml(skill.description || '尚無技能說明。')}</p>
    <section class="detail-section">
      <h3>技能資料</h3>
      <div class="data-grid">
        <div class="data-cell"><small>發動率</small>${skill.triggerRate}%</div>
        <div class="data-cell"><small>冷卻</small>${skill.cooldown} 次行動</div>
        <div class="data-cell"><small>消耗</small>${escapeHtml(costs)}</div>
        <div class="data-cell"><small>武器限制</small>${escapeHtml(skill.requiredWeaponNames.join('、') || '不限')}</div>
        <div class="data-cell"><small>前置技能</small>${escapeHtml(prerequisites)}</div>
        <div class="data-cell"><small>技能 ID</small>${escapeHtml(skill.id)}</div>
      </div>
    </section>
    <section class="detail-section">
      <h3>效果</h3>
      <ul class="effect-list">${skill.effects.map(effect => `<li>${escapeHtml(effect.summary)}</li>`).join('')}</ul>
    </section>
    <section class="detail-section">
      <h3>標籤</h3>
      <div class="tag-list">${skill.tags.map(tag => `<span class="chip">${escapeHtml(tag.name)}</span>`).join('') || '<span class="chip">無</span>'}</div>
    </section>`;
}

function openDetail(skill, { updateHistory = true } = {}) {
  elements.detailContent.innerHTML = detailHtml(skill);
  state.openSkillId = skill.id;
  if (updateHistory) writeUrlState({ push: true });
  if (!elements.detailDialog.open) elements.detailDialog.showModal();
}

function buildComparisonHtml(skills) {
  const row = (label, values) => `
    <tr><td>${escapeHtml(label)}</td>${values.map(value => `<td>${value}</td>`).join('')}</tr>`;
  return `
    <h2 class="detail-title">技能比較</h2>
    <div class="detail-section" style="overflow:auto">
      <table class="comparison">
        <thead><tr><th>項目</th>${skills.map(skill => `<th>${escapeHtml(skill.name)}</th>`).join('')}</tr></thead>
        <tbody>
          ${row('需求等級', skills.map(skill => `Lv.${skill.requiredLevel}`))}
          ${row('分類', skills.map(skill => escapeHtml(skillMeta(skill))))}
          ${row('發動率', skills.map(skill => `${skill.triggerRate}%`))}
          ${row('冷卻', skills.map(skill => `${skill.cooldown} 次行動`))}
          ${row('說明', skills.map(skill => escapeHtml(skill.description)))}
          ${row('效果', skills.map(skill => `<ul>${skill.effects.map(effect => `<li>${escapeHtml(effect.summary)}</li>`).join('')}</ul>`))}
        </tbody>
      </table>
    </div>`;
}

function toggleComparison(skillId) {
  const index = state.selectedIds.indexOf(skillId);
  if (index >= 0) {
    state.selectedIds.splice(index, 1);
  } else if (state.selectedIds.length < 3) {
    state.selectedIds.push(skillId);
  }
  renderSkills();
  renderCompareBar();
}

async function loadSkills() {
  elements.count.textContent = '讀取技能中…';
  try {
    const levelSkills = state.catalog?.skillsByLevel?.[state.filters.level] || [];
    state.skills = levelSkills.filter(matchesFilters);
    for (const skill of state.skills) state.skillCache.set(skill.id, skill);
    renderSkills();
    renderCompareBar();
  } catch (error) {
    elements.count.innerHTML = '<span class="error">技能讀取失敗，請稍後再試。</span>';
    elements.grid.innerHTML = '';
    console.error(error);
  }
}

let searchTimer = null;
function handleFilterChange(event) {
  const key = event.target.id === 'search' ? 'q' : event.target.id;
  if (key === 'level') {
    state.selectedIds = [];
    state.skillCache.clear();
  }
  state.filters[key] = event.target.value;
  writeUrlState();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadSkills, key === 'search' ? 220 : 0);
}

async function initialize() {
  readUrlState();
  state.filters.q = state.filters.q || '';
  try {
    state.catalog = await fetchJson('data/catalog.json');
    state.metadata = state.catalog.metadata;
    initializeControls(state.metadata);
    await loadSkills();

    if (state.openSkillId) {
      const skill = getSkillAtCurrentLevel(state.openSkillId);
      if (skill) openDetail(skill, { updateHistory: false });
    }
  } catch (error) {
    elements.count.innerHTML = '<span class="error">圖鑑初始化失敗。</span>';
    console.error(error);
  }
}

for (const key of ['search', 'group', 'job', 'school', 'category', 'level']) {
  elements[key].addEventListener(key === 'search' ? 'input' : 'change', handleFilterChange);
}

elements.reset.addEventListener('click', () => {
  state.filters = { q: '', group: '', job: '', school: '', category: '', level: '10' };
  for (const [key, value] of Object.entries(state.filters)) {
    const control = key === 'q' ? elements.search : elements[key];
    if (control) control.value = value;
  }
  writeUrlState();
  loadSkills();
});

elements.grid.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const card = event.target.closest('[data-skill-id]');
  if (!button || !card) return;
  const skill = state.skills.find(item => item.id === card.dataset.skillId);
  if (!skill) return;
  if (button.dataset.action === 'detail') openDetail(skill);
  if (button.dataset.action === 'compare') toggleComparison(skill.id);
});

elements.clearCompare.addEventListener('click', () => {
  state.selectedIds = [];
  renderSkills();
  renderCompareBar();
});

elements.openCompare.addEventListener('click', () => {
  const skills = state.selectedIds
    .map(id => state.skillCache.get(id))
    .filter(Boolean);
  if (skills.length < 2) return;
  elements.compareContent.innerHTML = buildComparisonHtml(skills);
  elements.compareDialog.showModal();
});

elements.openMods.addEventListener('click', () => {
  elements.modsDialog.showModal();
  try {
    const mods = state.catalog?.mods || [];
    const sections = ['core', 'rune'].map(type => {
      const matchingMods = mods.filter(mod => mod.type === type);
      const title = type === 'core' ? 'Core・玩法改造' : 'Rune・能力強化';
      return `
        <section class="detail-section">
          <h2 class="detail-title">${title}</h2>
          <div class="mod-grid">
            ${matchingMods.map(mod => `
              <article class="mod-card">
                <small>${escapeHtml(mod.rarity || '一般')}・${escapeHtml(mod.id)}</small>
                <h3>${escapeHtml(mod.name)}</h3>
                <p>${escapeHtml(mod.description)}</p>
              </article>`).join('')}
          </div>
        </section>`;
    }).join('');
    elements.modsContent.innerHTML = sections;
  } catch (error) {
    elements.modsContent.innerHTML = '<p class="error">技能改造讀取失敗。</p>';
    console.error(error);
  }
});

document.addEventListener('click', event => {
  const closeButton = event.target.closest('[data-close-dialog]');
  if (!closeButton) return;
  document.querySelector(`#${closeButton.dataset.closeDialog}`)?.close();
});

elements.detailDialog.addEventListener('close', () => {
  if (state.openSkillId) {
    state.openSkillId = '';
    writeUrlState();
  }
});

window.addEventListener('popstate', () => {
  const skillId = new URLSearchParams(location.search).get('skill') || '';
  state.openSkillId = skillId;
  if (!skillId) {
    elements.detailDialog.close();
    return;
  }
  const skill = getSkillAtCurrentLevel(skillId);
  if (skill) openDetail(skill, { updateHistory: false });
});

initialize();
