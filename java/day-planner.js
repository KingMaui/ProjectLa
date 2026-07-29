/* ==========================================================
   Day Planner
   ----------------------------------------------------------
   Vanilla JS, no build step, no external dependencies.

   Data model (per block):
     { id, bar: 'day'|'night', start (min from bar start, 0-719),
       duration (min), label, category, synced (bool) }

   - "day" bar covers 06:00–18:00 (720 min)
   - "night" bar covers 18:00–06:00 (720 min, wraps midnight)

   Storage:
     - Always saved to localStorage first (source of truth offline).
     - If a PocketBase auth session is found in localStorage under
       the key PocketBase's JS SDK uses by default ("pocketbase_auth",
       shape: {token, model:{id,...}}), changes are also synced to a
       `planner_blocks` collection. If your site's auth.js stores the
       session under a different key, change AUTH_LOCAL_KEY below —
       everything else (guest mode, offline fallback) keeps working
       either way.
   ========================================================== */

const PB_URL = window.PB_URL || '';
const COLLECTION = 'planner_blocks';
const LOCAL_KEY = 'dayplanner_data_v1';
const AUTH_LOCAL_KEY = 'pocketbase_auth';

const DAY_LEN = 720;   // minutes per bar
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
let modalState = null;     // { mode:'create'|'edit', bar, id? }

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

function absMinuteOf(bar, minInBar) {
  return bar === 'day' ? (360 + minInBar) % 1440 : (1080 + minInBar) % 1440;
}
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
function barHours(bar) {
  return bar === 'day' ? [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] : [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
}
function clockToBarMinutes(bar, hh, mm) {
  const raw = hh * 60 + mm;
  if (bar === 'day') return clamp(raw - 360, 0, 719);
  let v = raw - 1080;
  if (v < 0) v += 1440;
  return clamp(v, 0, 719);
}
function barMinutesToTimeValue(bar, minInBar) {
  const abs = absMinuteOf(bar, minInBar);
  return `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
function safeCapture(elm, id) { try { elm.setPointerCapture && elm.setPointerCapture(id); } catch (e) { /* not supported — drag still works via document listeners */ } }
function safeRelease(elm, id) { try { elm.releasePointerCapture && elm.releasePointerCapture(id); } catch (e) { /* no-op */ } }
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function uid() {
  return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
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
    user: userId, date, bar: block.bar,
    start_min: block.start, duration_min: block.duration,
    label: block.label, category: block.category,
  };
}
function fromRemote(rec) {
  return {
    id: rec.id, bar: rec.bar, start: rec.start_min, duration: rec.duration_min,
    label: rec.label, category: rec.category, synced: true,
  };
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
  renderTracks();
  renderBudget();
  const auth = getAuth();
  if (!auth || !PB_URL || !block.synced) return;
  try { await pbDelete(block.id, auth.token); setSyncStatus('synced'); }
  catch (err) { console.warn('Day planner: PocketBase delete failed.', err); setSyncStatus('offline'); }
}
async function loadDate(date) {
  saveLocalAll(); // persist whatever we had for the previous date first
  state.date = date;
  state.blocks = clone(allData[date] || []);
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
    renderTracks();
    renderBudget();
  } catch (err) {
    console.warn('Day planner: could not reach PocketBase, using data saved on this device.', err);
    setSyncStatus('offline');
  }
}

// ---------------------------------------------------------
// Collision-free drag bounds
// ---------------------------------------------------------
function freeBounds(bar, excludeId, aroundMin) {
  const blocks = state.blocks.filter(b => b.bar === bar && b.id !== excludeId).sort((a, b) => a.start - b.start);

  // For move/resize, aroundMin is the dragged block's own original start, which by
  // invariant never sits inside another block. For create, a typed/clicked start
  // can land inside an existing block — in that case push forward to its end
  // (like "next available time"), chaining through any back-to-back blocks.
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
      <div class="dp-budget-bar" id="dpBudgetBar"></div>

      <div class="dp-timeline-wrap">
        <div class="dp-bar dp-bar-day">
          <div class="dp-bar-head"><span class="dp-icon">☀</span> Day · 6 AM – 6 PM</div>
          <div class="dp-track" id="dpTrackDay" data-bar="day"></div>
        </div>
        <div class="dp-bar dp-bar-night">
          <div class="dp-bar-head"><span class="dp-icon">☾</span> Night · 6 PM – 6 AM</div>
          <div class="dp-track" id="dpTrackNight" data-bar="night"></div>
        </div>
      </div>

      <div class="dp-summary">
        <div class="dp-summary-head">
          <div class="dp-summary-title">Time budget</div>
          <div class="dp-summary-sub">24h, split across both bars</div>
        </div>
        <div class="dp-totals" id="dpTotals"></div>
        <div class="dp-cat-rows" id="dpCatRows"></div>
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
          <label for="dpFieldDuration">Duration (min)</label>
          <input type="number" id="dpFieldDuration" min="15" step="15" value="60">
        </div>
      </div>
      <div class="dp-row dp-row-1">
        <div class="dp-field">
          <label>Category</label>
          <div class="dp-swatches" id="dpSwatches"></div>
        </div>
      </div>
      <p class="dp-summary-sub" id="dpModalWarning" style="min-height:1.1em; margin:8px 0 0;"></p>
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
    budgetBar: document.getElementById('dpBudgetBar'),
    trackDay: document.getElementById('dpTrackDay'),
    trackNight: document.getElementById('dpTrackNight'),
    totals: document.getElementById('dpTotals'),
    catRows: document.getElementById('dpCatRows'),
    overlay: modalWrap,
    modalTitle: document.getElementById('dpModalTitle'),
    modalClose: document.getElementById('dpModalClose'),
    fieldLabel: document.getElementById('dpFieldLabel'),
    fieldStart: document.getElementById('dpFieldStart'),
    fieldDuration: document.getElementById('dpFieldDuration'),
    swatches: document.getElementById('dpSwatches'),
    modalWarning: document.getElementById('dpModalWarning'),
    deleteBtn: document.getElementById('dpDeleteBtn'),
    saveBtn: document.getElementById('dpSaveBtn'),
  };

  // legend (static content)
  el.legend.innerHTML = CATEGORIES.map(c =>
    `<span class="dp-chip"><span class="dp-dot" style="background:${c.color}"></span>${c.label}</span>`
  ).join('');

  // category swatches inside modal
  el.swatches.innerHTML = CATEGORIES.map(c =>
    `<button type="button" class="dp-swatch" data-cat="${c.id}" style="background:${c.color}" title="${c.label}" aria-pressed="false"></button>`
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
    // default: next free 60-minute slot in the day bar, starting from 9am (min 180)
    const { lower, upper } = freeBounds('day', null, 180);
    const start = clamp(180, lower, Math.max(lower, upper - SLOT));
    const duration = clamp(60, SLOT, Math.max(SLOT, upper - start));
    openModal('create', { bar: 'day', start, duration });
  });

  wireTrackCreateDrag(el.trackDay, 'day');
  wireTrackCreateDrag(el.trackNight, 'night');

  el.modalClose.addEventListener('click', closeModal);
  el.overlay.addEventListener('click', (e) => { if (e.target === el.overlay) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.overlay.classList.contains('dp-show')) closeModal();
  });
  el.swatches.addEventListener('click', (e) => {
    const btn = e.target.closest('.dp-swatch');
    if (!btn) return;
    el.swatches.querySelectorAll('.dp-swatch').forEach(s => { s.classList.remove('dp-selected'); s.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('dp-selected');
    btn.setAttribute('aria-pressed', 'true');
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
  renderTracks();
  renderBudget();
}

function renderTracks() {
  renderTrack(el.trackDay, 'day');
  renderTrack(el.trackNight, 'night');
}

function renderTrack(trackEl, bar) {
  trackEl.innerHTML = '';

  // hour grid
  barHours(bar).forEach((h, i) => {
    const col = document.createElement('div');
    col.className = 'dp-hourcol';
    col.style.left = (i / 12 * 100) + '%';
    col.style.width = (100 / 12) + '%';
    const label = document.createElement('span');
    label.className = 'dp-hour-label';
    label.textContent = hourLabel(h);
    col.appendChild(label);
    trackEl.appendChild(col);
  });

  // empty-state hint
  const blocksForBar = state.blocks.filter(b => b.bar === bar);
  if (blocksForBar.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'dp-summary-sub';
    hint.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; text-align:center; padding:0 10px;';
    hint.textContent = 'Click or drag to add a block';
    trackEl.appendChild(hint);
  }

  // now line
  if (state.date === todayStr()) {
    const now = new Date();
    const nowAbs = now.getHours() * 60 + now.getMinutes();
    const inThisBar = bar === 'day' ? (nowAbs >= 360 && nowAbs < 1080) : (nowAbs >= 1080 || nowAbs < 360);
    if (inThisBar) {
      const minInBar = bar === 'day' ? nowAbs - 360 : (nowAbs >= 1080 ? nowAbs - 1080 : nowAbs + 360);
      const line = document.createElement('div');
      line.className = 'dp-now-line';
      line.style.left = (minInBar / DAY_LEN * 100) + '%';
      trackEl.appendChild(line);
    }
  }

  // blocks
  blocksForBar.forEach(block => renderBlockEl(trackEl, block));
}

function renderBlockEl(trackEl, block) {
  const cat = CATEGORY_MAP[block.category] || CATEGORY_MAP.other;
  const wrap = document.createElement('div');
  wrap.className = 'dp-block';
  wrap.tabIndex = 0;
  wrap.dataset.id = block.id;
  wrap.style.borderLeftColor = cat.color;

  const labelEl = document.createElement('div');
  labelEl.className = 'dp-block-label';
  const timeEl = document.createElement('div');
  timeEl.className = 'dp-block-time';

  const delBtn = document.createElement('button');
  delBtn.className = 'dp-block-del';
  delBtn.type = 'button';
  delBtn.setAttribute('aria-label', 'Delete block');
  delBtn.textContent = '×';

  const handleLeft = document.createElement('div');
  handleLeft.className = 'dp-block-handle dp-h-left';
  const handleRight = document.createElement('div');
  handleRight.className = 'dp-block-handle dp-h-right';

  wrap.append(labelEl, timeEl, delBtn, handleLeft, handleRight);
  trackEl.appendChild(wrap);

  positionBlockEl(wrap, block);

  // move
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.dp-block-handle') || e.target.closest('.dp-block-del')) return;
    e.preventDefault();
    const rect = trackEl.getBoundingClientRect();
    const startClientX = e.clientX;
    const origStart = block.start;
    const { lower, upper } = freeBounds(block.bar, block.id, block.start);
    let moved = false;
    safeCapture(wrap, e.pointerId);
    wrap.classList.add('dp-dragging');

    function onMove(ev) {
      if (Math.abs(ev.clientX - startClientX) > 3) moved = true;
      const dxMin = (ev.clientX - startClientX) / rect.width * DAY_LEN;
      block.start = clamp(snap(origStart + dxMin), lower, upper - block.duration);
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

  // resize — left edge
  handleLeft.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = trackEl.getBoundingClientRect();
    const startClientX = e.clientX;
    const origStart = block.start, end = block.start + block.duration;
    const { lower } = freeBounds(block.bar, block.id, block.start);
    safeCapture(handleLeft, e.pointerId);
    function onMove(ev) {
      const dxMin = (ev.clientX - startClientX) / rect.width * DAY_LEN;
      const newStart = clamp(snap(origStart + dxMin), lower, end - SLOT);
      block.start = newStart;
      block.duration = end - newStart;
      positionBlockEl(wrap, block);
    }
    function onUp() {
      safeRelease(handleLeft, e.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      persistBlock(block);
      renderBudget();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  // resize — right edge
  handleRight.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = trackEl.getBoundingClientRect();
    const startClientX = e.clientX;
    const start = block.start, origDuration = block.duration;
    const { upper } = freeBounds(block.bar, block.id, block.start);
    safeCapture(handleRight, e.pointerId);
    function onMove(ev) {
      const dxMin = (ev.clientX - startClientX) / rect.width * DAY_LEN;
      const newEnd = clamp(snap(start + origDuration + dxMin), start + SLOT, upper);
      block.duration = newEnd - start;
      positionBlockEl(wrap, block);
    }
    function onUp() {
      safeRelease(handleRight, e.pointerId);
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
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const { lower, upper } = freeBounds(block.bar, block.id, block.start);
      const dir = e.key === 'ArrowLeft' ? -SLOT : SLOT;
      block.start = clamp(block.start + dir, lower, upper - block.duration);
      positionBlockEl(wrap, block);
      persistBlock(block);
      renderBudget();
    }
  });
}

function positionBlockEl(wrap, block) {
  wrap.style.left = (block.start / DAY_LEN * 100) + '%';
  wrap.style.width = (block.duration / DAY_LEN * 100) + '%';
  wrap.classList.toggle('dp-narrow', block.duration < 90);
  wrap.classList.toggle('dp-xnarrow', block.duration < 40);
  const labelEl = wrap.querySelector('.dp-block-label');
  const timeEl = wrap.querySelector('.dp-block-time');
  labelEl.textContent = block.label || 'Untitled';
  const startAbs = absMinuteOf(block.bar, block.start);
  const endAbs = absMinuteOf(block.bar, block.start + block.duration);
  timeEl.textContent = `${formatClock(startAbs)} – ${formatClock(endAbs)}`;
  const cat = CATEGORY_MAP[block.category] || CATEGORY_MAP.other;
  wrap.style.borderLeftColor = cat.color;
}

function wireTrackCreateDrag(trackEl, bar) {
  trackEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.dp-block')) return;
    e.preventDefault();
    const rect = trackEl.getBoundingClientRect();
    const pxToMin = (clientX) => clamp((clientX - rect.left) / rect.width * DAY_LEN, 0, DAY_LEN);
    const startMin = snap(pxToMin(e.clientX));
    let curMin = startMin;

    const ghost = document.createElement('div');
    ghost.className = 'dp-ghost';
    trackEl.appendChild(ghost);
    updateGhost();

    function updateGhost() {
      const lo = Math.min(startMin, curMin), hi = Math.max(startMin, curMin);
      const dur = Math.max(hi - lo, SLOT);
      ghost.style.left = (lo / DAY_LEN * 100) + '%';
      ghost.style.width = (dur / DAY_LEN * 100) + '%';
    }
    function onMove(ev) { curMin = snap(pxToMin(ev.clientX)); updateGhost(); }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      ghost.remove();
      const lo = Math.min(startMin, curMin);
      const hi = Math.max(startMin, curMin);
      let dur = hi - lo;
      if (dur < SLOT) dur = 60; // plain click → default 60-minute block
      const { lower, upper } = freeBounds(bar, null, lo + dur / 2);
      const clampedStart = clamp(lo, lower, Math.max(lower, upper - SLOT));
      const clampedDur = clamp(dur, SLOT, Math.max(SLOT, upper - clampedStart));
      if (upper - clampedStart < SLOT) return; // no room here
      openModal('create', { bar, start: clampedStart, duration: clampedDur });
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
    modalState = { mode, bar: payload.bar, id: null };
    el.modalTitle.textContent = 'Add block';
    el.fieldLabel.value = '';
    el.fieldStart.value = barMinutesToTimeValue(payload.bar, payload.start);
    el.fieldDuration.value = payload.duration;
    selectSwatch('work');
    el.deleteBtn.style.display = 'none';
  } else {
    const block = payload;
    modalState = { mode, bar: block.bar, id: block.id };
    el.modalTitle.textContent = 'Edit block';
    el.fieldLabel.value = block.label || '';
    el.fieldStart.value = barMinutesToTimeValue(block.bar, block.start);
    el.fieldDuration.value = block.duration;
    selectSwatch(block.category || 'other');
    el.deleteBtn.style.display = '';
  }
  el.modalWarning.textContent = '';
  el.overlay.classList.add('dp-show');
  el.fieldLabel.focus();
}
function selectSwatch(catId) {
  el.swatches.querySelectorAll('.dp-swatch').forEach(s => {
    const on = s.dataset.cat === catId;
    s.classList.toggle('dp-selected', on);
    s.setAttribute('aria-pressed', String(on));
  });
}
function closeModal() {
  el.overlay.classList.remove('dp-show');
  modalState = null;
}
function saveModal() {
  if (!modalState) return;
  const bar = modalState.bar;
  const label = el.fieldLabel.value.trim() || 'Untitled';
  const selectedSwatch = el.swatches.querySelector('.dp-swatch.dp-selected');
  const category = selectedSwatch ? selectedSwatch.dataset.cat : 'other';

  const [hh, mm] = (el.fieldStart.value || '09:00').split(':').map(Number);
  const start = clockToBarMinutes(bar, hh, mm);
  let duration = Math.round((parseInt(el.fieldDuration.value, 10) || 60) / SLOT) * SLOT;
  duration = Math.max(SLOT, duration);

  const excludeId = modalState.mode === 'edit' ? modalState.id : null;
  const { lower, upper } = freeBounds(bar, excludeId, start);
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
    const block = { id: uid(), bar, start: clampedStart, duration: clampedDuration, label, category, synced: false };
    state.blocks.push(block);
    persistBlock(block);
  } else {
    const block = state.blocks.find(b => b.id === modalState.id);
    if (!block) return closeModal();
    block.label = label; block.category = category;
    block.start = clampedStart; block.duration = clampedDuration;
    persistBlock(block);
  }
  renderTracks();
  renderBudget();
  closeModal();
}

// ---------------------------------------------------------
// Live "now" line
// ---------------------------------------------------------
function updateNowLine() {
  if (state.date !== todayStr()) return;
  renderTracks();
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
