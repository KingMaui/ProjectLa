/* ==========================================================
   Day Planner
   ----------------------------------------------------------
   Vanilla JS, no build step, no external dependencies.

   Data model (per block):
     { id, start (minutes from midnight, 0-1439), duration (min),
       label, category, synced (bool) }

   One continuous 24-hour vertical bar (midnight to midnight).

   Storage:
     - Always saved to localStorage first (source of truth offline).
     - If a PocketBase auth session is found in localStorage under
       the key PocketBase's JS SDK uses by default ("pocketbase_auth",
       shape: {token, model:{id,...}}), changes are also synced to a
       `planner_blocks` collection. If your site's auth.js stores the
       session under a different key, change AUTH_LOCAL_KEY below —
       everything else (guest mode, offline fallback) keeps working
       either way.
     - Backward-compatible with the earlier two-bar (day/night) version:
       any already-saved record tagged bar:"day"/"night" is converted
       to an absolute minutes-from-midnight value on load.
   ========================================================== */

const PB_URL = window.PB_URL || '';
const COLLECTION = 'planner_blocks';
const LOCAL_KEY = 'dayplanner_data_v1';
const AUTH_LOCAL_KEY = 'pocketbase_auth';

const DAY_LEN = 1440;  // minutes in a day
const SLOT = 15;       // snap increment, minutes

const CATEGORIES = [
  { id: 'work',     label: 'Work',     color: 'var(--dp-work)' },
  { id: 'personal', label: 'Personal', color: 'var(--dp-personal)' },
  { id: 'health',   label: 'Health',   color: 'var(--dp-health)' },
  { id: 'rest',     label: 'Rest',     color: 'var(--dp-rest)' },
  { id: 'other',    label: 'Other',    color: 'var(--dp-other)' },
];
const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// ---------------------------------------------------------
// State
// ---------------------------------------------------------
let allData = {};          // { 'YYYY-MM-DD': [block, ...] }
let state = { date: todayStr(), blocks: [] };
let modalState = null;     // { mode:'create'|'edit', id? }

// DOM refs (filled in buildStaticDOM)
let el = {};

// ---------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseLocalDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}
function shiftDate(dateStr, delta) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function titleForDate(dateStr) {
  const d = parseLocalDate(dateStr);
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function snap(min) { return clamp(Math.round(min / SLOT) * SLOT, 0, DAY_LEN); }

function formatClock(absMin) {
  let h = Math.floor(absMin / 60), m = absMin % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
function formatDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
function hourLabel(h24) {
  const ap = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12; if (h12 === 0) h12 = 12;
  return `${h12} ${ap}`;
}
function timeValueFromMinutes(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
function minutesFromTimeValue(hh, mm) {
  return clamp(hh * 60 + mm, 0, DAY_LEN - 1);
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function uid() {
  return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function safeCapture(elm, id) { try { elm.setPointerCapture && elm.setPointerCapture(id); } catch (e) { /* not supported — drag still works via document listeners */ } }
function safeRelease(elm, id) { try { elm.releasePointerCapture && elm.releasePointerCapture(id); } catch (e) { /* no-op */ } }

// Back-compat: earlier two-bar version stored start as minutes-from-bar-start
// with a bar:"day"/"night" tag. Convert those to absolute minutes-from-midnight.
function normalizeBlock(b) {
  if (b.bar === 'day') return { ...b, start: 360 + b.start, bar: undefined };
  if (b.bar === 'night') return { ...b, start: (1080 + b.start) % 1440, bar: undefined };
  return b;
}

// ---------------------------------------------------------
// Local storage
// ---------------------------------------------------------
function loadAllLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveLocalAll() {
  allData[state.date] = clone(state.blocks);
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(allData)); }
  catch (e) { console.warn('Day planner: could not save to localStorage.', e); }
}

// ---------------------------------------------------------
// PocketBase sync (best-effort — the planner is fully usable
// without it; every call here is wrapped so a failure just
// falls back to local-only storage)
// ---------------------------------------------------------
function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.token && parsed.model && parsed.model.id) {
      return { token: parsed.token, userId: parsed.model.id };
    }
  } catch (e) { /* not logged in / different auth shape */ }
  return null;
}
function toRemote(block, userId, date) {
  return {
    user: userId, date, bar: 'full',
    start_min: block.start, duration_min: block.duration,
    label: block.label, category: block.category,
  };
}
function fromRemote(rec) {
  let start = rec.start_min;
  if (rec.bar === 'day') start = 360 + start;
  else if (rec.bar === 'night') start = (1080 + start) % 1440;
  return { id: rec.id, start, duration: rec.duration_min, label: rec.label, category: rec.category, synced: true };
}
async function pbList(date, userId, token) {
  const filter = encodeURIComponent(`user="${userId}" && date="${date}"`);
  const res = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records?filter=${filter}&perPage=200`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error('list failed: ' + res.status);
  const data = await res.json();
  return data.items || [];
}
async function pbCreate(rec, token) {
  const res = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(rec),
  });
  if (!res.ok) throw new Error('create failed: ' + res.status);
  return res.json();
}
async function pbUpdate(id, rec, token) {
  const res = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(rec),
  });
  if (!res.ok) throw new Error('update failed: ' + res.status);
  return res.json();
}
async function pbDelete(id, token) {
  const res = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${id}`, {
    method: 'DELETE',
    headers: { Authorization: token },
  });
  if (!res.ok && res.status !== 404) throw new Error('delete failed: ' + res.status);
}
function setSyncStatus(status) {
  if (!el.syncStatus) return;
  const text = {
    guest: 'Guest mode — saved on this device',
    syncing: 'Syncing…',
    synced: 'Synced',
    offline: 'Offline — saved on this device',
  }[status] || '';
  el.syncStatus.textContent = text;
}
async function persistBlock(block) {
  saveLocalAll();
  const auth = getAuth();
  if (!auth || !PB_URL) { setSyncStatus(auth ? 'offline' : 'guest'); return; }
  try {
    const payload = toRemote(block, auth.userId, state.date);
    if (block.synced) {
      await pbUpdate(block.id, payload, auth.token);
    } else {
      const created = await pbCreate(payload, auth.token);
      block.id = created.id;
      block.synced = true;
      saveLocalAll();
    }
    setSyncStatus('synced');
  } catch (err) {
    console.warn('Day planner: PocketBase sync failed, change is still saved on this device.', err);
    setSyncStatus('offline');
  }
}
async function deleteBlockEverywhere(block) {
  state.blocks = state.blocks.filter(b => b.id !== block.id);
  saveLocalAll();
  renderTrack();
  renderBudget();
  const auth = getAuth();
  if (!auth || !PB_URL || !block.synced) return;
  try { await pbDelete(block.id, auth.token); setSyncStatus('synced'); }
  catch (err) { console.warn('Day planner: PocketBase delete failed.', err); setSyncStatus('offline'); }
}
async function loadDate(date) {
  saveLocalAll(); // persist whatever we had for the previous date first
  state.date = date;
  state.blocks = clone(allData[date] || []).map(normalizeBlock);
  renderAll();

  const auth = getAuth();
  if (!auth || !PB_URL) { setSyncStatus('guest'); return; }

  setSyncStatus('syncing');
  try {
    const remote = await pbList(date, auth.userId, auth.token);
    const remoteBlocks = remote.map(fromRemote);

    // Upload anything created locally (e.g. while signed out) that isn't on the server yet
    const localOnly = state.blocks.filter(b => !b.synced);
    for (const b of localOnly) {
      try {
        const created = await pbCreate(toRemote(b, auth.userId, date), auth.token);
        remoteBlocks.push(fromRemote(created));
      } catch (e) { console.warn('Day planner: could not upload a locally-created block.', e); }
    }

    state.blocks = remoteBlocks;
    allData[date] = clone(state.blocks);
    saveLocalAll();
    setSyncStatus('synced');
    renderTrack();
    renderBudget();
  } catch (err) {
    console.warn('Day planner: could not reach PocketBase, using data saved on this device.', err);
    setSyncStatus('offline');
  }
}

// ---------------------------------------------------------
// Collision-free drag bounds
// ---------------------------------------------------------
function freeBounds(excludeId, aroundMin) {
  const blocks = state.blocks.filter(b => b.id !== excludeId).sort((a, b) => a.start - b.start);

  // For move/resize, aroundMin is the dragged block's own original start, which by
  // invariant never sits inside another block. For create, a typed/clicked start
  // can land inside an existing block — push forward to its end ("next available
  // time"), chaining through any back-to-back blocks.
  let guard = 0;
  let containing;
  while (guard++ <= blocks.length && (containing = blocks.find(b => aroundMin >= b.start && aroundMin < b.start + b.duration))) {
    aroundMin = containing.start + containing.duration;
  }

  let lower = 0, upper = DAY_LEN;
  for (const b of blocks) {
    if (b.start + b.duration <= aroundMin) lower = Math.max(lower, b.start + b.duration);
    else if (b.start >= aroundMin) { upper = Math.min(upper, b.start); break; }
  }
  return { lower, upper };
}

// ---------------------------------------------------------
// Static DOM (built once)
// ---------------------------------------------------------
function buildStaticDOM() {
  const root = document.getElementById('dayPlannerApp');
  root.innerHTML = `
    <div class="dp-app">
      <div class="dp-topbar">
        <div class="dp-date-nav">
          <button class="dp-btn dp-nav" id="dpPrev" aria-label="Previous day">‹</button>
          <button class="dp-btn" id="dpToday">Today</button>
          <button class="dp-btn dp-nav" id="dpNext" aria-label="Next day">›</button>
        </div>
        <div class="dp-title-wrap" id="dpTitleWrap">
          <button class="dp-date-title" id="dpDateTitle" type="button"></button>
          <div class="dp-date-picker">
            <input type="date" id="dpDateInput">
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; justify-self:end;">
          <span class="dp-summary-sub" id="dpSyncStatus"></span>
          <button class="dp-btn dp-primary" id="dpAddBtn">+ Add block</button>
        </div>
      </div>

      <div class="dp-legend" id="dpLegend"></div>

      <div class="dp-main">
        <div class="dp-timeline-wrap">
          <div class="dp-bar">
            <div class="dp-track" id="dpTrack"></div>
          </div>
        </div>

        <div class="dp-summary-col">
          <div class="dp-summary">
            <div class="dp-summary-head">
              <div class="dp-summary-title">Time budget</div>
              <div class="dp-summary-sub">24h, updates as you plan</div>
            </div>
            <div class="dp-budget-bar" id="dpBudgetBar"></div>
            <div class="dp-totals" id="dpTotals"></div>
            <div class="dp-cat-rows" id="dpCatRows"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Modal lives at body level, same reasoning as the contact modal on other pages
  const modalWrap = document.createElement('div');
  modalWrap.id = 'dp-edit-overlay';
  modalWrap.innerHTML = `
    <div class="dp-modal" role="dialog" aria-modal="true" aria-labelledby="dpModalTitle">
      <button class="dp-modal-close" id="dpModalClose" aria-label="Close">&times;</button>
      <h2 id="dpModalTitle">Add block</h2>
      <div class="dp-row dp-row-1">
        <div class="dp-field">
          <label for="dpFieldLabel">Label</label>
          <input type="text" id="dpFieldLabel" placeholder="e.g. Team standup" maxlength="60">
        </div>
      </div>
      <div class="dp-row">
        <div class="dp-field">
          <label for="dpFieldStart">Start</label>
          <input type="time" id="dpFieldStart">
        </div>
        <div class="dp-field">
          <label for="dpFieldHours">Duration</label>
          <div class="dp-duration-combo">
            <input type="number" id="dpFieldHours" min="0" max="23" step="1" value="1" aria-label="Hours">
            <span class="dp-unit">h</span>
            <input type="number" id="dpFieldMinutes" min="0" max="45" step="15" value="0" aria-label="Minutes">
            <span class="dp-unit">m</span>
          </div>
        </div>
      </div>
      <div class="dp-row dp-row-1">
        <div class="dp-field">
          <label>Category</label>
          <div class="dp-cat-picker" id="dpCatPicker"></div>
        </div>
      </div>
      <p class="dp-summary-sub" id="dpModalWarning" style="min-height:1.1em; margin:10px 0 0;"></p>
      <div class="dp-modal-actions">
        <button class="dp-danger-link" id="dpDeleteBtn" style="display:none;">Delete</button>
        <span></span>
        <button class="dp-save" id="dpSaveBtn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalWrap);

  el = {
    root,
    prev: document.getElementById('dpPrev'),
    next: document.getElementById('dpNext'),
    today: document.getElementById('dpToday'),
    titleWrap: document.getElementById('dpTitleWrap'),
    dateTitle: document.getElementById('dpDateTitle'),
    dateInput: document.getElementById('dpDateInput'),
    addBtn: document.getElementById('dpAddBtn'),
    syncStatus: document.getElementById('dpSyncStatus'),
    legend: document.getElementById('dpLegend'),
    track: document.getElementById('dpTrack'),
    budgetBar: document.getElementById('dpBudgetBar'),
    totals: document.getElementById('dpTotals'),
    catRows: document.getElementById('dpCatRows'),
    overlay: modalWrap,
    modalTitle: document.getElementById('dpModalTitle'),
    modalClose: document.getElementById('dpModalClose'),
    fieldLabel: document.getElementById('dpFieldLabel'),
    fieldStart: document.getElementById('dpFieldStart'),
    fieldHours: document.getElementById('dpFieldHours'),
    fieldMinutes: document.getElementById('dpFieldMinutes'),
    catPicker: document.getElementById('dpCatPicker'),
    modalWarning: document.getElementById('dpModalWarning'),
    deleteBtn: document.getElementById('dpDeleteBtn'),
    saveBtn: document.getElementById('dpSaveBtn'),
  };

  // legend (static content)
  el.legend.innerHTML = CATEGORIES.map(c =>
    `<span class="dp-chip"><span class="dp-dot" style="background:${c.color}"></span>${c.label}</span>`
  ).join('');

  // category picker inside modal — colored dot + visible name
  el.catPicker.innerHTML = CATEGORIES.map(c =>
    `<button type="button" class="dp-cat-btn" data-cat="${c.id}" style="--cat-color:${c.color}" aria-pressed="false">
       <span class="dp-dot"></span>${c.label}
     </button>`
  ).join('');
}

function wireStaticHandlers() {
  el.prev.addEventListener('click', () => loadDate(shiftDate(state.date, -1)));
  el.next.addEventListener('click', () => loadDate(shiftDate(state.date, 1)));
  el.today.addEventListener('click', () => loadDate(todayStr()));

  el.dateTitle.addEventListener('click', () => {
    el.dateInput.value = state.date;
    el.titleWrap.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!el.titleWrap.contains(e.target)) el.titleWrap.classList.remove('open');
  });
  el.dateInput.addEventListener('change', () => {
    if (el.dateInput.value) loadDate(el.dateInput.value);
    el.titleWrap.classList.remove('open');
  });

  el.addBtn.addEventListener('click', () => {
    // default: next free 60-minute slot starting from 9am
    const { lower, upper } = freeBounds(null, 9 * 60);
    const start = clamp(9 * 60, lower, Math.max(lower, upper - SLOT));
    const duration = clamp(60, SLOT, Math.max(SLOT, upper - start));
    openModal('create', { start, duration });
  });

  wireTrackCreateDrag(el.track);

  el.modalClose.addEventListener('click', closeModal);
  el.overlay.addEventListener('click', (e) => { if (e.target === el.overlay) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.overlay.classList.contains('dp-show')) closeModal();
  });
  el.catPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.dp-cat-btn');
    if (!btn) return;
    selectCategory(btn.dataset.cat);
  });
  el.saveBtn.addEventListener('click', saveModal);
  el.deleteBtn.addEventListener('click', () => {
    if (!modalState || modalState.mode !== 'edit') return;
    const block = state.blocks.find(b => b.id === modalState.id);
    if (!block) return closeModal();
    if (!confirm(`Delete "${block.label || 'this block'}"?`)) return;
    deleteBlockEverywhere(block);
    closeModal();
  });
}

// ---------------------------------------------------------
// Render
// ---------------------------------------------------------
function renderAll() {
  el.dateTitle.textContent = titleForDate(state.date);
  renderTrack();
  renderBudget();
}

function renderTrack() {
  const trackEl = el.track;
  trackEl.innerHTML = '';

  // hour grid (24 rows)
  for (let h = 0; h < 24; h++) {
    const row = document.createElement('div');
    row.className = 'dp-hourrow';
    row.style.top = (h / 24 * 100) + '%';
    const label = document.createElement('span');
    label.className = 'dp-hour-label';
    label.textContent = hourLabel(h);
    row.appendChild(label);
    trackEl.appendChild(row);
  }

  // empty-state hint
  if (state.blocks.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'dp-track-empty-hint';
    hint.textContent = 'Click or drag on the bar to add a block';
    trackEl.appendChild(hint);
  }

  // now line
  if (state.date === todayStr()) {
    const now = new Date();
    const nowAbs = now.getHours() * 60 + now.getMinutes();
    const line = document.createElement('div');
    line.className = 'dp-now-line';
    line.style.top = (nowAbs / DAY_LEN * 100) + '%';
    trackEl.appendChild(line);
  }

  // blocks
  state.blocks.forEach(block => renderBlockEl(trackEl, block));
}

function renderBlockEl(trackEl, block) {
  const cat = CATEGORY_MAP[block.category] || CATEGORY_MAP.other;
  const wrap = document.createElement('div');
  wrap.className = 'dp-block';
  wrap.tabIndex = 0;
  wrap.dataset.id = block.id;

  const labelEl = document.createElement('div');
  labelEl.className = 'dp-block-label';
  const timeEl = document.createElement('div');
  timeEl.className = 'dp-block-time';

  const delBtn = document.createElement('button');
  delBtn.className = 'dp-block-del';
  delBtn.type = 'button';
  delBtn.setAttribute('aria-label', 'Delete block');
  delBtn.textContent = '×';

  const handleTop = document.createElement('div');
  handleTop.className = 'dp-block-handle dp-h-top';
  const handleBottom = document.createElement('div');
  handleBottom.className = 'dp-block-handle dp-h-bottom';

  wrap.append(labelEl, timeEl, delBtn, handleTop, handleBottom);
  trackEl.appendChild(wrap);

  positionBlockEl(wrap, block);

  // move
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.dp-block-handle') || e.target.closest('.dp-block-del')) return;
    e.preventDefault();
    const rect = trackEl.getBoundingClientRect();
    const startClientY = e.clientY;
    const origStart = block.start;
    const { lower, upper } = freeBounds(block.id, block.start);
    let moved = false;
    safeCapture(wrap, e.pointerId);
    wrap.classList.add('dp-dragging');

    function onMove(ev) {
      if (Math.abs(ev.clientY - startClientY) > 3) moved = true;
      const dyMin = (ev.clientY - startClientY) / rect.height * DAY_LEN;
      block.start = clamp(snap(origStart + dyMin), lower, upper - block.duration);
      positionBlockEl(wrap, block);
    }
    function onUp() {
      safeRelease(wrap, e.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      wrap.classList.remove('dp-dragging');
      if (!moved) { openModal('edit', block); return; }
      persistBlock(block);
      renderBudget();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  // resize — top edge (adjust start, end stays fixed)
  handleTop.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = trackEl.getBoundingClientRect();
    const startClientY = e.clientY;
    const origStart = block.start, end = block.start + block.duration;
    const { lower } = freeBounds(block.id, block.start);
    safeCapture(handleTop, e.pointerId);
    function onMove(ev) {
      const dyMin = (ev.clientY - startClientY) / rect.height * DAY_LEN;
      const newStart = clamp(snap(origStart + dyMin), lower, end - SLOT);
      block.start = newStart;
      block.duration = end - newStart;
      positionBlockEl(wrap, block);
    }
    function onUp() {
      safeRelease(handleTop, e.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      persistBlock(block);
      renderBudget();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  // resize — bottom edge (adjust duration, start stays fixed)
  handleBottom.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = trackEl.getBoundingClientRect();
    const startClientY = e.clientY;
    const start = block.start, origDuration = block.duration;
    const { upper } = freeBounds(block.id, block.start);
    safeCapture(handleBottom, e.pointerId);
    function onMove(ev) {
      const dyMin = (ev.clientY - startClientY) / rect.height * DAY_LEN;
      const newEnd = clamp(snap(start + origDuration + dyMin), start + SLOT, upper);
      block.duration = newEnd - start;
      positionBlockEl(wrap, block);
    }
    function onUp() {
      safeRelease(handleBottom, e.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      persistBlock(block);
      renderBudget();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${block.label || 'this block'}"?`)) return;
    deleteBlockEverywhere(block);
  });

  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal('edit', block); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (confirm(`Delete "${block.label || 'this block'}"?`)) deleteBlockEverywhere(block);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const { lower, upper } = freeBounds(block.id, block.start);
      const dir = e.key === 'ArrowUp' ? -SLOT : SLOT;
      block.start = clamp(block.start + dir, lower, upper - block.duration);
      positionBlockEl(wrap, block);
      persistBlock(block);
      renderBudget();
    }
  });
}

function positionBlockEl(wrap, block) {
  wrap.style.top = (block.start / DAY_LEN * 100) + '%';
  wrap.style.height = (block.duration / DAY_LEN * 100) + '%';
  wrap.classList.toggle('dp-narrow', block.duration < 45);
  wrap.classList.toggle('dp-xnarrow', block.duration < 25);
  const labelEl = wrap.querySelector('.dp-block-label');
  const timeEl = wrap.querySelector('.dp-block-time');
  labelEl.textContent = block.label || 'Untitled';
  timeEl.textContent = `${formatClock(block.start)} – ${formatClock(block.start + block.duration)}`;
  const cat = CATEGORY_MAP[block.category] || CATEGORY_MAP.other;
  wrap.style.borderLeftColor = cat.color;
}

function wireTrackCreateDrag(trackEl) {
  trackEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.dp-block')) return;
    e.preventDefault();
    const rect = trackEl.getBoundingClientRect();
    const pxToMin = (clientY) => clamp((clientY - rect.top) / rect.height * DAY_LEN, 0, DAY_LEN);
    const startMin = snap(pxToMin(e.clientY));
    let curMin = startMin;

    const ghost = document.createElement('div');
    ghost.className = 'dp-ghost';
    trackEl.appendChild(ghost);
    updateGhost();

    function updateGhost() {
      const lo = Math.min(startMin, curMin), hi = Math.max(startMin, curMin);
      const dur = Math.max(hi - lo, SLOT);
      ghost.style.top = (lo / DAY_LEN * 100) + '%';
      ghost.style.height = (dur / DAY_LEN * 100) + '%';
    }
    function onMove(ev) { curMin = snap(pxToMin(ev.clientY)); updateGhost(); }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      ghost.remove();
      const lo = Math.min(startMin, curMin);
      const hi = Math.max(startMin, curMin);
      let dur = hi - lo;
      if (dur < SLOT) dur = 60; // plain click → default 60-minute block
      const { lower, upper } = freeBounds(null, lo + dur / 2);
      const clampedStart = clamp(lo, lower, Math.max(lower, upper - SLOT));
      const clampedDur = clamp(dur, SLOT, Math.max(SLOT, upper - clampedStart));
      if (upper - clampedStart < SLOT) return; // no room here
      openModal('create', { start: clampedStart, duration: clampedDur });
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

function renderBudget() {
  const totalsByCategory = {};
  CATEGORIES.forEach(c => { totalsByCategory[c.id] = 0; });
  let scheduled = 0;
  state.blocks.forEach(b => {
    totalsByCategory[b.category] = (totalsByCategory[b.category] || 0) + b.duration;
    scheduled += b.duration;
  });
  const free = clamp(1440 - scheduled, 0, 1440);

  // stacked budget bar
  el.budgetBar.innerHTML = CATEGORIES.map(c => {
    const pct = totalsByCategory[c.id] / 1440 * 100;
    return pct > 0 ? `<div class="dp-budget-seg" style="width:${pct}%; background:${c.color}" title="${c.label}: ${formatDuration(totalsByCategory[c.id])}"></div>` : '';
  }).join('') + `<div class="dp-budget-seg dp-free" style="width:${free / 1440 * 100}%" title="Free: ${formatDuration(free)}"></div>`;

  // KPIs
  el.totals.innerHTML = `
    <div class="dp-kpi"><div class="dp-kpi-label">Scheduled</div><div class="dp-kpi-value">${formatDuration(scheduled)}</div></div>
    <div class="dp-kpi"><div class="dp-kpi-label">Free</div><div class="dp-kpi-value">${formatDuration(free)}</div></div>
    <div class="dp-kpi"><div class="dp-kpi-label">Blocks</div><div class="dp-kpi-value">${state.blocks.length}</div></div>
  `;

  // per-category rows
  el.catRows.innerHTML = CATEGORIES.map(c => {
    const min = totalsByCategory[c.id];
    const pct = clamp(min / 1440 * 100, 0, 100);
    return `
      <div class="dp-cat-row">
        <div class="dp-cat-name"><span class="dp-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color}"></span>${c.label}</div>
        <div class="dp-cat-track"><div class="dp-cat-fill" style="width:${pct}%; background:${c.color}"></div></div>
        <div class="dp-cat-val">${min > 0 ? formatDuration(min) : '—'}</div>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------
// Modal
// ---------------------------------------------------------
function openModal(mode, payload) {
  if (mode === 'create') {
    modalState = { mode, id: null };
    el.modalTitle.textContent = 'Add block';
    el.fieldLabel.value = '';
    el.fieldStart.value = timeValueFromMinutes(payload.start);
    el.fieldHours.value = Math.floor(payload.duration / 60);
    el.fieldMinutes.value = payload.duration % 60;
    selectCategory('work');
    el.deleteBtn.style.display = 'none';
  } else {
    const block = payload;
    modalState = { mode, id: block.id };
    el.modalTitle.textContent = 'Edit block';
    el.fieldLabel.value = block.label || '';
    el.fieldStart.value = timeValueFromMinutes(block.start);
    el.fieldHours.value = Math.floor(block.duration / 60);
    el.fieldMinutes.value = block.duration % 60;
    selectCategory(block.category || 'other');
    el.deleteBtn.style.display = '';
  }
  el.modalWarning.textContent = '';
  el.overlay.classList.add('dp-show');
  el.fieldLabel.focus();
}
function selectCategory(catId) {
  el.catPicker.querySelectorAll('.dp-cat-btn').forEach(btn => {
    const on = btn.dataset.cat === catId;
    btn.classList.toggle('dp-selected', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}
function closeModal() {
  el.overlay.classList.remove('dp-show');
  modalState = null;
}
function saveModal() {
  if (!modalState) return;
  const label = el.fieldLabel.value.trim() || 'Untitled';
  const selectedBtn = el.catPicker.querySelector('.dp-cat-btn.dp-selected');
  const category = selectedBtn ? selectedBtn.dataset.cat : 'other';

  const [hh, mm] = (el.fieldStart.value || '09:00').split(':').map(Number);
  const start = minutesFromTimeValue(hh, mm);
  const hours = Math.max(0, parseInt(el.fieldHours.value, 10) || 0);
  const minutesPart = Math.max(0, parseInt(el.fieldMinutes.value, 10) || 0);
  let duration = Math.round((hours * 60 + minutesPart) / SLOT) * SLOT;
  duration = Math.max(SLOT, duration);

  const excludeId = modalState.mode === 'edit' ? modalState.id : null;
  const { lower, upper } = freeBounds(excludeId, start);
  const clampedStart = clamp(start, lower, Math.max(lower, upper - SLOT));
  const clampedDuration = clamp(duration, SLOT, Math.max(SLOT, upper - clampedStart));

  if (upper - clampedStart < SLOT) {
    el.modalWarning.textContent = 'No free room at that time — try a different start.';
    return;
  }
  if (clampedDuration < duration || clampedStart !== start) {
    el.modalWarning.textContent = 'Adjusted to fit the available time and avoid overlapping another block.';
  }

  if (modalState.mode === 'create') {
    const block = { id: uid(), start: clampedStart, duration: clampedDuration, label, category, synced: false };
    state.blocks.push(block);
    persistBlock(block);
  } else {
    const block = state.blocks.find(b => b.id === modalState.id);
    if (!block) return closeModal();
    block.label = label; block.category = category;
    block.start = clampedStart; block.duration = clampedDuration;
    persistBlock(block);
  }
  renderTrack();
  renderBudget();
  closeModal();
}

// ---------------------------------------------------------
// Live "now" line
// ---------------------------------------------------------
function updateNowLine() {
  if (state.date !== todayStr()) return;
  renderTrack();
}

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
async function init() {
  allData = loadAllLocal();
  buildStaticDOM();
  wireStaticHandlers();
  await loadDate(todayStr());
  setInterval(updateNowLine, 60000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
