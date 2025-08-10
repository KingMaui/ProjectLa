
// calendar.js (v2.3.2)
// - Placeholder "add note..." only shows on hover (or tap on mobile), not always
// - Notes are single-line (ellipsis)
// - Check/X selector centered by default; if a note exists, selector sits above the note
// - Month/Year picker opens on hover and overlays above tabs; closes on outside click
// - Mobile support: touch to reveal marks/placeholder, responsive layout tweaks

let pb = window.pb;
async function ensurePB() {
  if (pb) return pb;
  if (!window.PB_URL) return null;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/pocketbase/dist/pocketbase.es.mjs');
    pb = new mod.default(window.PB_URL);
    window.pb = pb;
    return pb;
  } catch { return null; }
}

// ---- State ----
const state = {
  current: new Date(),
  habits: [],           // { id, name, icon, color, okIcon?, badIcon?, noteIncrement?, createdAt? }
  activeId: null,
  logs: {},             // ✓ dates
  negLogs: {},          // ✗ dates
  notes: {},            // habitId -> { 'YYYY-MM-DD': 'note' }
  pending: [],
  _pendingShifts: new Map(),
  timeframe: '6m',
};

// ---- Storage ----
const LS_HABITS = 'habit.habits.v2';
const LS_LOGS  = 'habit.logs.v2';
const LS_NEG   = 'habit.logs.negative.v2';
const LS_NOTES = 'habit.notes.v1';
const LS_PEND  = 'habit.pending.v2';
const LS_TIME  = 'habit.timeframe.v1';

function loadLocal() {
  try {
    state.habits = JSON.parse(localStorage.getItem(LS_HABITS) || '[]');
    const logsObj = JSON.parse(localStorage.getItem(LS_LOGS) || '{}');
    state.logs = Object.fromEntries(Object.entries(logsObj).map(([k,v]) => [k, new Set(v)]));
    const negObj  = JSON.parse(localStorage.getItem(LS_NEG) || '{}');
    state.negLogs = Object.fromEntries(Object.entries(negObj).map(([k,v]) => [k, new Set(v)]));
    state.notes = JSON.parse(localStorage.getItem(LS_NOTES) || '{}');
    state.timeframe = localStorage.getItem(LS_TIME) || '6m';
    state.pending = JSON.parse(localStorage.getItem(LS_PEND) || '[]');
  } catch {}
  if (!state.habits.length) {
    state.habits = [
      { id:'local-1', name:'Study', icon:'📝', color:'var(--primary-color)', okIcon:'✅', badIcon:'❌', noteIncrement:false, createdAt: (new Date()).toISOString().slice(0,10) },
      { id:'local-2', name:'Training', icon:'💪', color:'var(--secondary-color)', okIcon:'✅', badIcon:'❌', noteIncrement:false, createdAt: (new Date()).toISOString().slice(0,10) },
    ];
  }
  if (!state.activeId && state.habits.length) state.activeId = state.habits[0].id;
}
function saveLocal() {
  localStorage.setItem(LS_HABITS, JSON.stringify(state.habits));
  const plainLogs = Object.fromEntries(Object.entries(state.logs).map(([k,v]) => [k, [...v]]));
  localStorage.setItem(LS_LOGS, JSON.stringify(plainLogs));
  const plainNeg  = Object.fromEntries(Object.entries(state.negLogs).map(([k,v]) => [k, [...v]]));
  localStorage.setItem(LS_NEG, JSON.stringify(plainNeg));
  localStorage.setItem(LS_NOTES, JSON.stringify(state.notes || {}));
  localStorage.setItem(LS_TIME, state.timeframe);
  localStorage.setItem(LS_PEND, JSON.stringify(state.pending));
}

// ---- Dates ----
function ymd(d){ return d.toISOString().slice(0,10); }
function startOfMonth(d){ const x=new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
function clampMonth(y, m){ return new Date(y, m, 1); }
function nextDayIso(iso){
  const [Y,M,D] = iso.split('-').map(Number);
  const d = new Date(Y, M-1, D+1); return ymd(d);
}
function prevMonthDate(d){ return new Date(d.getFullYear(), d.getMonth()-1, 1); }
function weekRangeOf(date){
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  const start = new Date(d); start.setDate(d.getDate()-day);
  const end = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
  return { start, end };
}

function setActiveAccent(color){
  const root = document.querySelector('.calendar-app') || document.documentElement;
  if (!color){ root.style.removeProperty('--tab-accent'); return; }
  root.style.setProperty('--tab-accent', color);
}

// ---- PocketBase (optional) ----
async function ensurePBAuth(){ const s=await ensurePB(); return !!(s && pb?.authStore?.isValid); }
async function fetchRemote() {
  const ok = await ensurePBAuth(); if (!ok) return { habits:[], logs:[] };
  try {
    const habits = await pb.collection('habits').getFullList({ sort:'created' });
    const logs   = await pb.collection('habit_logs').getFullList({ sort:'date' });
    return { habits, logs };
  } catch(e){ console.warn('PB fetch failed', e); return { habits:[], logs:[] }; }
}
async function upsertHabit(h) {
  const ok = await ensurePBAuth(); if (!ok) { queue({type:'habit', data:h}); return; }
  try {
    const payload = { name:h.name, icon:h.icon, color:h.color, owner: pb.authStore.model?.id };
    if (h.remote && h.id && !String(h.id).startsWith('local-')) {
      await pb.collection('habits').update(h.id, payload);
      return h.id;
    } else {
      const res = await pb.collection('habits').create(payload);
      h.id = res.id; h.remote = true; return res.id;
    }
  } catch(e){ console.warn('upsertHabit failed, queued', e); queue({type:'habit', data:h}); }
}
async function writeLog(habitId, date, value){
  const ok = await ensurePBAuth(); if (!ok) { queue({type:'log', data:{habitId,date,value}}); return; }
  try {
    const existing = await pb.collection('habit_logs').getFullList({ filter:`habit="${habitId}" && date="${date}" && owner="${pb.authStore.model?.id}"` });
    for (const r of existing) await pb.collection('habit_logs').delete(r.id);
    if (value===true || value===false) {
      await pb.collection('habit_logs').create({ habit:habitId, date, value, owner: pb.authStore.model?.id });
    }
  } catch(e){ console.warn('writeLog failed, queued', e); queue({type:'log', data:{habitId,date,value}}); }
}
function queue(item){ state.pending.push(item); saveLocal(); }
async function flushPending(){
  const ok = await ensurePBAuth(); if (!ok) return;
  const pending = [...state.pending]; state.pending = [];
  for (const p of pending) {
    try{
      if (p.type==='habit') await upsertHabit(p.data);
      if (p.type==='log')   await writeLog(p.data.habitId, p.data.date, p.data.value);
    } catch(e){ console.warn('flush fail', e); state.pending.push(p); }
  }
  saveLocal();
}

// ---- Rendering ----
const el = {};
function render(){
  renderHeaderAccent();
  renderControls();
  renderTabs();
  renderMonth();
  renderChart();
  renderTotals();
}
function renderHeaderAccent(){
  const active = state.habits.find(h=>h.id===state.activeId);
  setActiveAccent(active?.color);
}
function renderTabs(){
  el.tabs.innerHTML='';
  state.habits.forEach(h=>{
    const tab = document.createElement('button');
    tab.className = 'tab' + (h.id===state.activeId ? ' active' : '');
    tab.type = 'button';
    tab.innerHTML = `
      <span class="icon">${h.icon}</span>
      <span class="name">${h.name}</span>
      <span class="close" aria-label="Remove tab" title="Remove">×</span>
    `;
    tab.addEventListener('click', (e)=>{
      if (e.target.closest('.close')) { removeHabit(h.id); return; }
      state.activeId = h.id; saveLocal(); render();
    });
    el.tabs.appendChild(tab);
  });
  const add = document.createElement('button');
  add.className = 'add-tab'; add.type='button'; add.textContent='New tab';
  add.addEventListener('click', openCreateTabModal);
  el.tabs.appendChild(add);
}
function renderControls(){
  const monthName = state.current.toLocaleDateString(undefined, { month:'long', year:'numeric' });
  el.monthTitle.textContent = monthName;

  if (!el.builtControls) {
    const group = document.createElement('div');
    group.className = 'btn-group';
    el.prev = document.createElement('button'); el.prev.className='btn nav'; el.prev.type='button'; el.prev.textContent='‹';
    el.todayBtn = document.createElement('button'); el.todayBtn.className='btn today'; el.todayBtn.type='button'; el.todayBtn.textContent='Today';
    el.next = document.createElement('button'); el.next.className='btn nav'; el.next.type='button'; el.next.textContent='›';
    group.appendChild(el.prev); group.appendChild(el.todayBtn); group.appendChild(el.next);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'title-wrap';
    titleWrap.appendChild(el.monthTitle);

    el.monthPicker = document.createElement('select'); el.monthPicker.className='month-select';
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].forEach((m,i)=>{
      const o=document.createElement('option'); o.value=String(i); o.textContent=m; el.monthPicker.appendChild(o);
    });
    el.yearPicker = document.createElement('input'); el.yearPicker.type='number'; el.yearPicker.className='year-input'; el.yearPicker.min='1970'; el.yearPicker.max='2100';

    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'picker-wrap';
    pickerWrap.appendChild(el.monthPicker);
    pickerWrap.appendChild(el.yearPicker);
    titleWrap.appendChild(pickerWrap);

    el.controls.innerHTML = '';
    el.controls.appendChild(group);
    el.controls.appendChild(titleWrap);

    // Open on hover; keep open while hovering or interacting; close on outside click
    function openPicker(){ titleWrap.classList.add('open'); el.monthTitle.setAttribute('aria-expanded','true'); }
    function closePicker(){ titleWrap.classList.remove('open'); el.monthTitle.setAttribute('aria-expanded','false'); }
    el.monthTitle.addEventListener('mouseenter', openPicker);
    titleWrap.addEventListener('mouseleave', (e)=>{
      // close only if mouse left the whole titleWrap (including picker)
      const related = e.relatedTarget;
      if (!titleWrap.contains(related)) closePicker();
    });
    document.addEventListener('click', (e)=>{ if (!titleWrap.contains(e.target)) closePicker(); });
    // Also support keyboard
    el.monthTitle.setAttribute('role','button'); el.monthTitle.setAttribute('tabindex','0');
    el.monthTitle.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); openPicker(); }});

    // Events
    el.prev.addEventListener('click', ()=>{ state.current.setMonth(state.current.getMonth()-1); syncPickers(); render(); });
    el.next.addEventListener('click', ()=>{ state.current.setMonth(state.current.getMonth()+1); syncPickers(); render(); });
    el.todayBtn.addEventListener('click', ()=>{ state.current=new Date(); syncPickers(); render(); });
    el.monthPicker.addEventListener('change', ()=>{ state.current = clampMonth(state.current.getFullYear(), Number(el.monthPicker.value)); closePicker(); render(); });
    el.yearPicker.addEventListener('change', ()=>{ const y=Number(el.yearPicker.value)||new Date().getFullYear(); state.current = clampMonth(y, state.current.getMonth()); closePicker(); render(); });

    el.builtControls = true;
  }
  syncPickers();
}
function syncPickers(){
  if (!el.monthPicker) return;
  el.monthPicker.value = String(state.current.getMonth());
  el.yearPicker.value  = String(state.current.getFullYear());
}
function renderMonth(){
  el.grid.innerHTML='';
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  weekdays.forEach(w=>{ const d=document.createElement('div'); d.className='wkday'; d.textContent=w; el.grid.appendChild(d); });

  const first = startOfMonth(state.current);
  const padStart = (first.getDay()+7)%7;
  const days = daysInMonth(state.current);

  for (let i=0;i<padStart;i++){ const c=document.createElement('div'); c.className='cell pad pad-start'; el.grid.appendChild(c); }

  const activeId = state.activeId;
  const activeHabit = state.habits.find(h=>h.id===activeId);
  const okIcon = activeHabit?.okIcon || '✅';
  const badIcon= activeHabit?.badIcon || '❌';
  const pos = state.logs[activeId] || new Set();
  const neg = state.negLogs[activeId] || new Set();
  const notes = state.notes[activeId] || {};
  const todayIso = ymd(new Date());

  for (let day=1; day<=days; day++) {
    const d = new Date(state.current.getFullYear(), state.current.getMonth(), day);
    const iso = ymd(d);
    const cell = document.createElement('div');
    const isToday = iso===todayIso;
    const hasCheck = pos.has(iso);
    const hasX = neg.has(iso);
    const has = hasCheck || hasX;
    const noteText = notes[iso] || '';
    const hasNote = !!(noteText && !has);
    cell.className = 'cell' + (has?' has-mark':'') + (hasNote?' has-note':'') + (isToday?' today':'');
    cell.innerHTML = `
      <span class="date">${day}</span>
      ${has ? `<div class="mark-display ${hasCheck?'ok':'bad'}" title="${hasCheck?'Done':'Not done'}">${hasCheck?okIcon:badIcon}</div>` : `
        <div class="marks" role="group" aria-label="Select mark">
          <button class="mark ok${hasCheck?' active':''}" data-mark="check" aria-label="Done">${okIcon}</button>
          <button class="mark bad${hasX?' active':''}" data-mark="x" aria-label="Missed">${badIcon}</button>
        </div>
      `}
      ${(!has && noteText) ? `<div class="note" data-iso="${iso}">${escapeHtml(noteText)}</div>` : ''}
      ${(!has && !noteText) ? `<div class="note placeholder" data-iso="${iso}">add note...</div>` : ''}
    `;

    // Mark buttons (only when unmarked)
    cell.querySelectorAll('button.mark').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const mark = btn.getAttribute('data-mark');
        setMark(activeId, iso, mark);
      });
    });

    // Single-icon mark display for marked days
    const md = cell.querySelector('.mark-display');
    if (md){
      md.addEventListener('dblclick', (e)=>{ e.stopPropagation(); clearPendingShift(activeId, iso); clearMark(activeId, iso); });
    }

    // Note edit (click on note text or placeholder)
    const noteEl = cell.querySelector('.note');
    if (noteEl) {
      noteEl.addEventListener('click', (e)=>{
        e.stopPropagation();
        beginNoteEdit(cell, activeId, iso, noteText);
      });
    }

    // Mobile: tap to reveal marks/placeholder since there's no hover
    cell.addEventListener('touchstart', (e)=>{
      if (has) return; // marked cells show icon; dblclick handled above
      document.querySelectorAll('.cell.show-cta').forEach(c=>c.classList.remove('show-cta'));
      cell.classList.add('show-cta');
    }, {passive:true});

    el.grid.appendChild(cell);
  }

  // Trailing blanks
  const usedCells = padStart + days;
  const tail = (7 - (usedCells % 7)) % 7;
  for (let i=0;i<tail;i++){ const c=document.createElement('div'); c.className='cell pad pad-end'; el.grid.appendChild(c); }

  // Clear mobile CTA when tapping elsewhere
  document.addEventListener('touchstart', (e)=>{
    if (!el.grid.contains(e.target)) {
      document.querySelectorAll('.cell.show-cta').forEach(c=>c.classList.remove('show-cta'));
    }
  }, {passive:true});
}
function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function beginNoteEdit(cell, habitId, iso, initial){
  if (cell.querySelector('.note-edit')) return;
  const editor = document.createElement('textarea');
  editor.className = 'note-edit';
  editor.value = initial || '';
  cell.appendChild(editor);
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);

  function commit(){
    const val = editor.value.trim();
    if (!state.notes[habitId]) state.notes[habitId] = {};
    if (val) state.notes[habitId][iso] = val;
    else delete state.notes[habitId][iso];
    saveLocal();
    renderMonth();
  }
  function cancel(){ renderMonth(); }

  editor.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  editor.addEventListener('blur', commit);
}

// ---- Chart ----
function renderChart(){
  el.chart.innerHTML='';

  if (!el.chartHeaderBuilt){
    const header = document.createElement('div');
    header.className = 'chart-header';
    const title = document.createElement('div');
    title.className = 'chart-title';
    title.textContent = 'Process';
    const picker = document.createElement('select');
    picker.id = 'chartRange';
    picker.innerHTML = `
      <option value="7d">Last 7 days</option>
      <option value="30d">Last 30 days</option>
      <option value="90d">Last 90 days</option>
      <option value="6m">Last 6 months</option>
      <option value="12m">Last 12 months</option>
      <option value="lastYear">Last year</option>
      <option value="thisYear">This year</option>
    `;
    el.chart.before(header);
    header.appendChild(title);
    header.appendChild(picker);
    el.chartHeader = header;
    el.chartRange = picker;
    el.chartHeaderBuilt = true;

    el.chartRange.value = state.timeframe || '6m';
    el.chartRange.addEventListener('change', ()=>{
      state.timeframe = el.chartRange.value;
      saveLocal();
      renderChart();
    });
  } else {
    el.chartRange.value = state.timeframe || '6m';
  }

  const series = buildSeries(state.activeId, state.timeframe);
  drawLineChart(el.chart, series);
}

function buildSeries(habitId, timeframe){
  const set = state.logs[habitId] || new Set();
  const now = new Date(); now.setHours(0,0,0,0);

  function dailyBetween(days){
    const arr=[];
    for (let i=days-1;i>=0;i--){
      const d = new Date(now); d.setDate(now.getDate()-i);
      const iso = ymd(d);
      arr.push([iso, set.has(iso) ? 1 : 0]);
    }
    return arr;
  }
  function monthlyLast(n){
    const arr=[];
    for (let i=n-1;i>=0;i--){
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      arr.push([d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'), getMonthTotal(habitId, d)]);
    }
    return arr;
  }
  function monthlyYear(year){
    const arr=[];
    for (let m=0;m<12;m++){
      const d = new Date(year, m, 1);
      arr.push([year+'-'+String(m+1).padStart(2,'0'), getMonthTotal(habitId, d)]);
    }
    return arr;
  }

  switch(timeframe){
    case '7d': return dailyBetween(7);
    case '30d': return dailyBetween(30);
    case '90d': return dailyBetween(90);
    case '12m': return monthlyLast(12);
    case 'lastYear': return monthlyYear(now.getFullYear()-1);
    case 'thisYear': return monthlyYear(now.getFullYear());
    case '6m':
    default: return monthlyLast(6);
  }
}

function drawLineChart(container, series){
  const svgNS='http://www.w3.org/2000/svg';
  const width=600, height=160;
  const leftPad=30, rightPad=30, topPad=10, bottomPad=20;
  const svg=document.createElementNS(svgNS,'svg'); svg.setAttribute('class','chart'); svg.setAttribute('viewBox',`0 0 ${width} ${height}`);

  const values = series.map(s=>s[1]);
  const max=Math.max(1,...values);
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;
  const stepX = plotW/(Math.max(1, series.length-1));
  const pts = series.map((s,i)=>`${leftPad + i*stepX},${height - bottomPad - (s[1]/max)*plotH}`).join(' ');
  const poly=document.createElementNS(svgNS,'polyline'); poly.setAttribute('fill','none'); poly.setAttribute('stroke','currentColor'); poly.setAttribute('stroke-width','2'); poly.setAttribute('points',pts); svg.appendChild(poly);
  series.forEach((s,i)=>{ const cx=leftPad + i*stepX, cy=height - bottomPad - (s[1]/max)*plotH; const dot=document.createElementNS(svgNS,'circle'); dot.setAttribute('cx',cx); dot.setAttribute('cy',cy); dot.setAttribute('r','3.5'); dot.setAttribute('fill','currentColor'); svg.appendChild(dot); });
  container.appendChild(svg);
}

// ---- Totals / KPIs ----
function renderTotals(){
  const id = state.activeId;
  const now = new Date();
  const lastMonthDate = prevMonthDate(state.current);
  const thisWeek = weekRangeOf(now);
  const lastWeekStart = new Date(thisWeek.start); lastWeekStart.setDate(thisWeek.start.getDate()-7);
  const lastWeek = { start: lastWeekStart, end: new Date(thisWeek.start - 1) };

  setText(el.kpiTotal, getTotalAll(id));
  setText(el.kpiYear,  getYearTotal(id, now));
  setText(el.kpiMonth, getMonthTotal(id, state.current));
  setText(el.kpiLastMonth, getMonthTotal(id, lastMonthDate));
  setText(el.kpiThisWeek, countInRange(id, thisWeek.start, thisWeek.end));
  setText(el.kpiLastWeek, countInRange(id, lastWeek.start, lastWeek.end));

  const lastCheck = getLastCheckDate(id);
  setText(el.kpiLastCheck, lastCheck ? formatLocal(lastCheck) : '—');
  setText(el.kpiMaxStreak, getMaxConsecutiveChecks(id));

  const habit = state.habits.find(h=>h.id===id);
  const created = habit?.createdAt ? new Date(habit.createdAt+'T00:00:00') : null;
  setText(el.kpiCreated, created ? formatLocal(created) : '—');
  setText(el.kpiDaysElapsed, created ? daysBetween(created, now)+1 : '—');
}
function setText(elm, v){ if (elm) elm.textContent = String(v); }

// ---- Actions ----
function openCreateTabModal(){
  let overlay=document.getElementById('cal-create-overlay');
  if (!overlay){
    overlay=document.createElement('div'); overlay.id='cal-create-overlay';
    overlay.innerHTML=`
      <div class="cal-modal" role="dialog" aria-modal="true">
        <button class="cal-close" id="calModalClose" aria-label="Close">×</button>
        <h2>Create New Calendar</h2>

        <form id="calCreateForm">
          <!-- Name -->
          <div class="cal-row cal-row-1">
            <label class="cal-field">
              <h4>Name</h4>
              <input id="calName" type="text" placeholder="e.g., Study plan" required>
            </label>
          </div>

          <!-- Color & Emoji -->
          <div class="cal-row">
            <div class="cal-field">
              <h4>Color</h4>
              <select id="calColor" aria-label="Color">
                <option value="var(--primary-color)">Primary</option>
                <option value="var(--secondary-color)">Secondary</option>
                <option value="var(--accent-color)">Accent</option>
                <option value="var(--danger-color)">Danger</option>
                <option value="var(--neutral-400)">Neutral</option>
              </select>
            </div>
            <div class="cal-field">
              <h4>Emoji</h4>
              <select id="calEmoji" aria-label="Emoji">
                <option>📝</option><option>📚</option><option>💪</option><option>🧠</option>
                <option>🏃‍♂️</option><option>🧘</option><option>🧪</option><option>💼</option><option>🎯</option><option>☕️</option>
              </select>
            </div>
          </div>

          <!-- Done / Not Done marks (kept from v2.3.1 custom lists) -->
          <div class="cal-row">
            <div class="cal-field">
              <h4>Done</h4>
              <select id="okIconSelect" aria-label="Done mark">
                <option>✅</option>
                <option>✔️</option>
                <option>✓</option>
                <option>☑️</option>
                <option>📈</option>
                <option>👍</option>
                <option>🌞</option>
                <option>❤️</option>
                <option>☀️</option>
              </select>
            </div>
            <div class="cal-field">
              <h4>Not Done</h4>
              <select id="badIconSelect" aria-label="Missed mark">
                <option>❌</option>
                <option>✖️</option>
                <option>✗</option>
                <option>✘</option>
                <option>📉</option>
                <option>👎</option>
                <option>🌚</option>
                <option>💔</option>
                <option>⛈️</option>
              </select>
            </div>
          </div>

          <!-- Note Increment -->
          <div class="cal-row cal-row-1">
            <label class="cal-check">
              <input type="checkbox" id="noteInc">
              <h4>Note Increment</h4>
            </label>
          </div>

          <div class="cal-actions">
            <button type="submit" class="primary">Create</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e)=>{ if (e.target===overlay) closeCreateTabModal(); });
    overlay.querySelector('#calModalClose').addEventListener('click', closeCreateTabModal);

    overlay.querySelector('#calCreateForm').addEventListener('submit', (e)=>{
      e.preventDefault();
      const name = overlay.querySelector('#calName').value.trim();
      const icon = overlay.querySelector('#calEmoji').value;
      const color= overlay.querySelector('#calColor').value;
      const okIcon = overlay.querySelector('#okIconSelect').value || '✅';
      const badIcon= overlay.querySelector('#badIconSelect').value || '❌';
      const noteIncrement = !!overlay.querySelector('#noteInc').checked;
      if (!name) return;
      const h = { id:'local-'+Math.random().toString(36).slice(2), name, icon, color, okIcon, badIcon, noteIncrement, createdAt: (new Date()).toISOString().slice(0,10) };
      state.habits.push(h); state.activeId=h.id; saveLocal(); upsertHabit(h); render(); closeCreateTabModal();
    });
  }
  overlay.style.display='grid';
}
function closeCreateTabModal(){ const o=document.getElementById('cal-create-overlay'); if (o) o.style.display='none'; }
function removeHabit(id){
  if (!confirm('Remove this calendar-tab? Data stays local unless synced.')) return;
  state.habits = state.habits.filter(h=>h.id!==id);
  delete state.logs[id]; delete state.negLogs[id]; delete state.notes[id];
  if (state.activeId===id) state.activeId = state.habits[0]?.id || null;
  saveLocal(); render();
}

function clearPendingShift(habitId, iso){
  const key = habitId+':'+iso;
  const id = state._pendingShifts.get(key);
  if (id){ clearTimeout(id); state._pendingShifts.delete(key); }
}
function setMark(habitId, iso, mark){
  const pos = state.logs[habitId] || new Set();
  const neg = state.negLogs[habitId] || new Set();
  const prevNeg = neg.has(iso);

  pos.delete(iso); neg.delete(iso);
  if (mark==='check') pos.add(iso);
  if (mark==='x')     neg.add(iso);
  state.logs[habitId]=pos; state.negLogs[habitId]=neg;

  const habit = state.habits.find(h=>h.id===habitId);
  if (mark==='x' && habit?.noteIncrement && !prevNeg) {
    const key = habitId+':'+iso;
    clearPendingShift(habitId, iso);
    const tid = setTimeout(()=>{
      shiftNotesForward(habitId, iso);
      state._pendingShifts.delete(key);
      saveLocal(); renderMonth();
    }, 240);
    state._pendingShifts.set(key, tid);
  }

  saveLocal(); writeLog(habitId, iso, mark==='check' ? true : (mark==='x' ? false : null));
  renderMonth(); renderChart(); renderTotals();
}
function clearMark(habitId, iso){
  const pos = state.logs[habitId] || new Set();
  const neg = state.negLogs[habitId] || new Set();
  pos.delete(iso); neg.delete(iso);
  state.logs[habitId]=pos; state.negLogs[habitId]=neg;
  saveLocal(); writeLog(habitId, iso, null);
  renderMonth(); renderChart(); renderTotals();
}

function shiftNotesForward(habitId, startIso){
  if (!state.notes[habitId]) return;
  const notes = state.notes[habitId];
  const keys = Object.keys(notes).filter(k => k >= startIso).sort().reverse();
  for (const k of keys) {
    const target = nextDayIso(k);
    if (notes[target]) { notes[target] = notes[target] + ' • ' + notes[k]; }
    else { notes[target] = notes[k]; }
    delete notes[k];
  }
}

// ---- Metrics ----
function getMonthTotal(habitId, d=new Date()){
  const set=state.logs[habitId]||new Set(); const m=d.getMonth(), y=d.getFullYear();
  let n=0; for (const iso of set){ const dd=new Date(iso+'T00:00:00'); if (dd.getMonth()===m && dd.getFullYear()===y) n++; } return n;
}
function getYearTotal(habitId, d){ const set=state.logs[habitId]||new Set(); const y=d.getFullYear(); let n=0; for (const iso of set){ const dd=new Date(iso+'T00:00:00'); if (dd.getFullYear()===y) n++; } return n; }
function getTotalAll(habitId){ return (state.logs[habitId]||new Set()).size; }
function countInRange(habitId, start, end){
  const set=state.logs[habitId]||new Set(); let n=0;
  for (const iso of set){ const dd=new Date(iso+'T00:00:00'); if (dd>=start && dd<=end) n++; } return n;
}
function getLastCheckDate(habitId){
  const set=state.logs[habitId]||new Set(); let max=null;
  for (const iso of set){ if (!max || iso>max) max=iso; }
  return max ? new Date(max+'T00:00:00') : null;
}
function getMaxConsecutiveChecks(habitId){
  const set=state.logs[habitId]||new Set(); const arr=[...set].sort();
  let best=0, cur=0, prev=null;
  for (const iso of arr){
    if (prev && iso===nextDayIso(prev)) cur+=1; else cur=1;
    prev=iso; if (cur>best) best=cur;
  }
  return best;
}
function daysBetween(a,b){ const ms=24*60*60*1000; const d = Math.floor((b - a)/ms); return d; }
function formatLocal(d){ return d.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}); }

// ---- Init ----
async function init(){
  const root = document.getElementById('calendarApp');
  if (!root) return;
  root.innerHTML = `
    <div class="calendar-app">
      <div class="month-bar" id="controls">
        <div class="month-title" id="monthTitle" role="heading" aria-level="2">Month YYYY</div>
      </div>
      <div class="tabs" id="tabs"></div>
      <div class="month-grid" id="grid"></div>
      <div class="chart-card">
        <!-- chart-header is injected -->
        <div class="chart" id="chart"></div>
        <div class="totals">
          <div class="kpi"><div class="label">Total</div><div class="value" id="kpiTotal">0</div></div>
          <div class="kpi"><div class="label">This year</div><div class="value" id="kpiYear">0</div></div>
          <div class="kpi"><div class="label">This month</div><div class="value" id="kpiMonth">0</div></div>
          <div class="kpi"><div class="label">Last month</div><div class="value" id="kpiLastMonth">0</div></div>
          <div class="kpi"><div class="label">This week</div><div class="value" id="kpiThisWeek">0</div></div>
          <div class="kpi"><div class="label">Last week</div><div class="value" id="kpiLastWeek">0</div></div>
          <div class="kpi"><div class="label">Last check date</div><div class="value" id="kpiLastCheck">—</div></div>
          <div class="kpi"><div class="label">Max consecutive checks</div><div class="value" id="kpiMaxStreak">0</div></div>
          <div class="kpi"><div class="label">Creation date</div><div class="value" id="kpiCreated">—</div></div>
          <div class="kpi"><div class="label">Days elapsed</div><div class="value" id="kpiDaysElapsed">—</div></div>
        </div>
      </div>
    </div>
  `;

  el.controls   = document.getElementById('controls');
  el.monthTitle = document.getElementById('monthTitle');
  el.tabs       = document.getElementById('tabs');
  el.grid       = document.getElementById('grid');
  el.chart      = document.getElementById('chart');
  el.kpiTotal   = document.getElementById('kpiTotal');
  el.kpiYear    = document.getElementById('kpiYear');
  el.kpiMonth   = document.getElementById('kpiMonth');
  el.kpiLastMonth = document.getElementById('kpiLastMonth');
  el.kpiThisWeek  = document.getElementById('kpiThisWeek');
  el.kpiLastWeek  = document.getElementById('kpiLastWeek');
  el.kpiLastCheck = document.getElementById('kpiLastCheck');
  el.kpiMaxStreak = document.getElementById('kpiMaxStreak');
  el.kpiCreated   = document.getElementById('kpiCreated');
  el.kpiDaysElapsed = document.getElementById('kpiDaysElapsed');

  loadLocal(); render();

  try {
    await ensurePB();
    if (pb?.authStore) pb.authStore.onChange(async ()=>{ await hydrateRemote(); });
    await hydrateRemote();
  } catch {}
}
async function hydrateRemote(){
  const { habits, logs } = await fetchRemote();
  if (habits.length){
    const byName=new Map(habits.map(h=>[h.name,h]));
    state.habits = state.habits.map(h=>{
      const r=byName.get(h.name); return r ? { ...h, id:r.id, remote:true } : h;
    });
    for (const h of habits){ if (!state.habits.find(x=>x.name===h.name)) state.habits.push({ id:h.id, name:h.name, icon:h.icon, color:h.color, remote:true }); }
  }
  if (logs.length){
    for (const r of logs){
      const hid=r.habit;
      if (!state.logs[hid]) state.logs[hid]=new Set();
      if (!state.negLogs[hid]) state.negLogs[hid]=new Set();
      const day=r.date.slice(0,10); if (r.value) state.logs[hid].add(day); else state.negLogs[hid].add(day);
    }
  }
  if (!state.activeId && state.habits.length) state.activeId=state.habits[0].id;
  saveLocal(); await flushPending(); render();
}
window.addEventListener('DOMContentLoaded', init);
