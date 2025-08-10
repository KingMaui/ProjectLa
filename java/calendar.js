
// calendar.js (v2.4.0)
// Local-first calendar that transparently syncs to PocketBase when the user logs in via auth.js.
// - Guests: everything saved to localStorage.
// - Logged-in (auth.js present): habits, marks, and notes sync to PocketBase and load on next visit/login.
// - Robust merge: local items are pushed up; remote items pulled down; conflicts are unioned.
// - Works even if notes collection isn't present on server (notes stay local).
//
// Requires: include auth.js before this file (so window.PBAuth is available).
// <script src="auth.js" defer></script>
// <script src="calendar.js" defer></script>

// ------------------------ Config / Utilities ------------------------
const PB_BASE = window.PB_URL || "https://pb.junxieliang.com"; // same default as auth.js

function authState() {
  const a = window.PBAuth?.auth;
  if (a?.token && a?.user) return { token: a.token, user: a.user };
  // fallback to localStorage (auth.js stores these keys)
  try {
    const token = localStorage.getItem("pb_token") || "";
    const user  = JSON.parse(localStorage.getItem("pb_user") || "null");
    if (token && user?.id) return { token, user };
  } catch {}
  return { token:"", user:null };
}
function authed() { const a = authState(); return !!(a.token && a.user); }
function pbFetch(path, opts={}){
  const { token } = authState();
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (token) headers["Authorization"] = "Bearer " + token;
  return fetch(PB_BASE + path, Object.assign({}, opts, { headers }));
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function ymd(d){ return d.toISOString().slice(0,10); }
function nextDayIso(iso){
  const [Y,M,D] = iso.split('-').map(Number);
  const d = new Date(Y, M-1, D+1); return ymd(d);
}
function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ------------------------ State ------------------------
let pbNotesSupported = true; // auto-disabled if server lacks collection
const state = {
  current: new Date(),
  habits: [],
  activeId: null,
  logs: {},             // { habitId: Set('YYYY-MM-DD') }  (✓)
  negLogs: {},          // { habitId: Set('YYYY-MM-DD') }  (✗)
  notes: {},            // { habitId: { 'YYYY-MM-DD': 'text' } }
  pending: [],          // queued ops when offline/not authed
  timeframe: localStorage.getItem('habit.timeframe.v1') || '6m',
  _lastAuthSig: '',     // detect login/logout
};

// ------------------------ Local Storage ------------------------
const LS_HABITS = 'habit.habits.v2';
const LS_LOGS  = 'habit.logs.v2';
const LS_NEG   = 'habit.logs.negative.v2';
const LS_NOTES = 'habit.notes.v1';
const LS_PEND  = 'habit.pending.v3'; // bumped schema for REST ops
const LS_TIME  = 'habit.timeframe.v1';

function saveLocal() {
  localStorage.setItem(LS_HABITS, JSON.stringify(state.habits));
  const plainLogs = Object.fromEntries(Object.entries(state.logs).map(([k,v]) => [k, [...v]]));
  localStorage.setItem(LS_LOGS, JSON.stringify(plainLogs));
  const plainNeg  = Object.fromEntries(Object.entries(state.negLogs).map(([k,v]) => [k, [...v]]));
  localStorage.setItem(LS_NEG, JSON.stringify(plainNeg));
  localStorage.setItem(LS_NOTES, JSON.stringify(state.notes || {}));
  localStorage.setItem(LS_PEND, JSON.stringify(state.pending));
  localStorage.setItem(LS_TIME, state.timeframe);
}
function loadLocal() {
  try {
    state.habits = JSON.parse(localStorage.getItem(LS_HABITS) || '[]');
    const logsObj = JSON.parse(localStorage.getItem(LS_LOGS) || '{}');
    state.logs = Object.fromEntries(Object.entries(logsObj).map(([k,v]) => [k, new Set(v)]));
    const negObj  = JSON.parse(localStorage.getItem(LS_NEG) || '{}');
    state.negLogs = Object.fromEntries(Object.entries(negObj).map(([k,v]) => [k, new Set(v)]));
    state.notes = JSON.parse(localStorage.getItem(LS_NOTES) || '{}');
    state.pending = JSON.parse(localStorage.getItem(LS_PEND) || '[]');
  } catch {}
  if (!state.habits.length) {
    const today = ymd(new Date());
    state.habits = [
      { id:'local-1', name:'Study', icon:'📝', color:'var(--primary-color)', okIcon:'✅', badIcon:'❌', noteIncrement:false, createdAt: today },
      { id:'local-2', name:'Training', icon:'💪', color:'var(--secondary-color)', okIcon:'✅', badIcon:'❌', noteIncrement:false, createdAt: today },
    ];
  }
  if (!state.activeId && state.habits.length) state.activeId = state.habits[0].id;
}

// ------------------------ Remote API (PocketBase REST) ------------------------
const api = {
  async listHabits(){
    const a = authState(); if (!a.user) return [];
    const qs = new URLSearchParams({ page:"1", perPage:"200", sort:"-created", filter:`owner="${a.user.id}"` });
    const res = await pbFetch(`/api/collections/habits/records?${qs}`);
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()).items || [];
  },
  async createHabit(h){
    const a = authState(); if (!a.user) return null;
    const body = {
      name: h.name, icon: h.icon, color: h.color, owner: a.user.id,
      okIcon: h.okIcon || '✅', badIcon: h.badIcon || '❌',
      noteIncrement: !!h.noteIncrement, createdAt: h.createdAt || ymd(new Date())
    };
    const res = await pbFetch(`/api/collections/habits/records`, { method:'POST', body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  },
  async updateHabit(id, patch){
    const res = await pbFetch(`/api/collections/habits/records/${id}`, { method:'PATCH', body: JSON.stringify(patch) });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  },
  async listLogs(){
    const a = authState(); if (!a.user) return [];
    const qs = new URLSearchParams({ page:"1", perPage:"10000", sort:"date", filter:`owner="${a.user.id}"` });
    const res = await pbFetch(`/api/collections/habit_logs/records?${qs}`);
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()).items || [];
  },
  async deleteLogById(id){
    const res = await pbFetch(`/api/collections/habit_logs/records/${id}`, { method:'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    return true;
  },
  async upsertLog(habitId, dateISO, value){ // value: true, false, or null (clear)
    const a = authState(); if (!a.user) return;
    // find existing record for habit+date
    const qs = new URLSearchParams({
      page:"1", perPage:"2",
      filter:`habit="${habitId}" && date="${dateISO}" && owner="${a.user.id}"`
    });
    const res = await pbFetch(`/api/collections/habit_logs/records?${qs}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const existing = (data.items || [])[0];
    if (existing){
      await api.deleteLogById(existing.id);
    }
    if (value===true || value===false){
      const pay = { habit: habitId, date: dateISO, value, owner: a.user.id };
      const res2 = await pbFetch(`/api/collections/habit_logs/records`, { method:'POST', body: JSON.stringify(pay) });
      if (!res2.ok) throw new Error(await res2.text());
      return await res2.json();
    }
    return null;
  },
  async listNotes(){
    if (!pbNotesSupported) return [];
    const a = authState(); if (!a.user) return [];
    const qs = new URLSearchParams({ page:"1", perPage:"10000", sort:"date", filter:`owner="${a.user.id}"` });
    const res = await pbFetch(`/api/collections/habit_notes/records?${qs}`);
    if (res.status===404){ pbNotesSupported=false; return []; }
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()).items || [];
  },
  async upsertNote(habitId, dateISO, text){
    if (!pbNotesSupported) return;
    const a = authState(); if (!a.user) return;
    const qs = new URLSearchParams({ page:"1", perPage:"2", filter:`habit="${habitId}" && date="${dateISO}" && owner="${a.user.id}"` });
    const res = await pbFetch(`/api/collections/habit_notes/records?${qs}`);
    if (res.status===404){ pbNotesSupported=false; return; }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const existing = (data.items || [])[0];
    if (!text){ // delete if exists
      if (existing){
        const del = await pbFetch(`/api/collections/habit_notes/records/${existing.id}`, { method:'DELETE' });
        if (!del.ok) throw new Error(await del.text());
      }
      return;
    }
    if (existing){
      const upd = await pbFetch(`/api/collections/habit_notes/records/${existing.id}`, { method:'PATCH', body: JSON.stringify({ text }) });
      if (!upd.ok) throw new Error(await upd.text());
      return await upd.json();
    } else {
      const pay = { habit: habitId, date: dateISO, text, owner: a.user.id };
      const crt = await pbFetch(`/api/collections/habit_notes/records`, { method:'POST', body: JSON.stringify(pay) });
      if (!crt.ok) throw new Error(await crt.text());
      return await crt.json();
    }
  }
};

// ------------------------ Pending queue (works offline) ------------------------
// ops: {type:'habit:create'|'habit:update'|'log'|'note', data:{...}}
function queue(op){ state.pending.push(op); saveLocal(); }
async function flushPending(){
  if (!authed() || !state.pending.length) return;
  const ops = [...state.pending]; state.pending = [];
  for (const op of ops){
    try {
      if (op.type==='habit:create'){
        const res = await api.createHabit(op.data);
        if (res?.id){
          // remap local habit id to remote id
          remapHabitId(op.data.localId, res.id);
        }
      } else if (op.type==='habit:update'){
        if (op.data.id && !String(op.data.id).startsWith('local-')){
          await api.updateHabit(op.data.id, op.data.patch || {});
        } else {
          // if still local, retry later
          queue(op);
        }
      } else if (op.type==='log'){
        await api.upsertLog(op.data.habitId, op.data.date, op.data.value);
      } else if (op.type==='note'){
        await api.upsertNote(op.data.habitId, op.data.date, op.data.text);
      }
    } catch(e){
      // Put it back for later
      queue(op);
    }
  }
  saveLocal();
}

// ------------------------ Merge / Sync ------------------------
function remapHabitId(oldId, newId){
  if (oldId===newId) return;
  // move logs
  if (state.logs[oldId]){
    state.logs[newId] = new Set([...(state.logs[newId]||new Set()), ...state.logs[oldId]]);
    delete state.logs[oldId];
  }
  if (state.negLogs[oldId]){
    state.negLogs[newId] = new Set([...(state.negLogs[newId]||new Set()), ...state.negLogs[oldId]]);
    delete state.negLogs[oldId];
  }
  if (state.notes[oldId]){
    state.notes[newId] = Object.assign({}, state.notes[newId]||{}, state.notes[oldId]);
    delete state.notes[oldId];
  }
  // update habit record in array
  state.habits = state.habits.map(h => h.id===oldId ? { ...h, id:newId, remote:true } : h);
  if (state.activeId===oldId) state.activeId = newId;
}

function nameKey(s){ return String(s||'').trim().toLowerCase(); }

async function hydrateRemote(){
  if (!authed()) return;
  try {
    // 1) Push *local* habits that don't exist remotely (by name)
    const remoteHabits = await api.listHabits(); // [{id,name,icon,color,okIcon,badIcon,noteIncrement,createdAt}]
    const rByName = new Map(remoteHabits.map(h => [nameKey(h.name), h]));

    for (const h of state.habits){
      const match = rByName.get(nameKey(h.name));
      if (!match){
        // create remotely (queue if fails)
        const localId = h.id;
        try {
          const res = await api.createHabit({ ...h, localId });
          if (res?.id) remapHabitId(localId, res.id);
        } catch {
          queue({ type:'habit:create', data:{ ...h, localId } });
        }
      } else {
        // ensure we point to remote id
        remapHabitId(h.id, match.id);
        // if visual fields changed locally, send patch
        const patch = {};
        if (h.icon    && h.icon!==match.icon) patch.icon = h.icon;
        if (h.color   && h.color!==match.color) patch.color = h.color;
        if (h.okIcon  && h.okIcon!==match.okIcon) patch.okIcon = h.okIcon;
        if (h.badIcon && h.badIcon!==match.badIcon) patch.badIcon = h.badIcon;
        if (typeof h.noteIncrement==='boolean' && h.noteIncrement!==!!match.noteIncrement) patch.noteIncrement = !!h.noteIncrement;
        if (Object.keys(patch).length){
          try { await api.updateHabit(match.id, patch); } catch { queue({type:'habit:update', data:{ id: match.id, patch }}); }
        }
      }
    }

    // 2) Pull *remote* habits we don't have locally
    const localByName = new Map(state.habits.map(h => [nameKey(h.name), h]));
    for (const rh of remoteHabits){
      if (!localByName.get(nameKey(rh.name))){
        state.habits.push({
          id: rh.id, name: rh.name, icon: rh.icon, color: rh.color,
          okIcon: rh.okIcon || '✅', badIcon: rh.badIcon || '❌',
          noteIncrement: !!rh.noteIncrement, createdAt: rh.createdAt || ymd(new Date()),
          remote: true
        });
      }
    }
    if (!state.activeId && state.habits.length) state.activeId = state.habits[0].id;

    // 3) Merge logs (union)
    const logs = await api.listLogs(); // items have: {habit,date,value}
    for (const rec of logs){
      const hid = rec.habit;
      if (rec.value){
        if (!state.logs[hid]) state.logs[hid]=new Set();
        state.logs[hid].add(rec.date.slice(0,10));
      } else {
        if (!state.negLogs[hid]) state.negLogs[hid]=new Set();
        state.negLogs[hid].add(rec.date.slice(0,10));
      }
    }

    // 4) Merge notes (if supported)
    const noteRecs = await api.listNotes();
    for (const n of noteRecs){
      const hid = n.habit, iso = n.date.slice(0,10), txt = n.text || '';
      if (!state.notes[hid]) state.notes[hid] = {};
      if (txt) state.notes[hid][iso] = txt;
    }

    saveLocal();
    render(); // re-render UI after sync
  } catch(e){
    // silent; local works regardless
    console.warn('hydrateRemote error', e);
  }
}

// Watch auth changes
function authSignature(){
  const a = authState();
  return (a.user?.id || '') + '|' + (a.token ? '1':'0');
}
async function checkAuthLoop(){
  const sig = authSignature();
  if (sig !== state._lastAuthSig){
    state._lastAuthSig = sig;
    if (authed()){
      await flushPending();
      await hydrateRemote();
    }
  }
  setTimeout(checkAuthLoop, 1000); // lightweight
}

// ------------------------ UI / App (existing features preserved) ------------------------
// Many parts below are retained from v2.3.x with minimal changes: where we write data,
// we now call queue()/flush & api.* when authed.

const el = {};
function setActiveAccent(color){
  const root = document.querySelector('.calendar-app') || document.documentElement;
  if (!color){ root.style.removeProperty('--tab-accent'); return; }
  root.style.setProperty('--tab-accent', color);
}

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
  if (!el.tabs) return;
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

function startOfMonth(d){ const x=new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
function clampMonth(y, m){ return new Date(y, m, 1); }
function prevMonthDate(d){ return new Date(d.getFullYear(), d.getMonth()-1, 1); }
function weekRangeOf(date){
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  const start = new Date(d); start.setDate(d.getDate()-day);
  const end = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
  return { start, end };
}

function renderControls(){
  if (!el.controls) return;
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

    function openPicker(){ titleWrap.classList.add('open'); el.monthTitle.setAttribute('aria-expanded','true'); }
    function closePicker(){ titleWrap.classList.remove('open'); el.monthTitle.setAttribute('aria-expanded','false'); }
    el.monthTitle.addEventListener('mouseenter', openPicker);
    titleWrap.addEventListener('mouseleave', (e)=>{
      const related = e.relatedTarget;
      if (!titleWrap.contains(related)) closePicker();
    });
    document.addEventListener('click', (e)=>{ if (!titleWrap.contains(e.target)) closePicker(); });
    el.monthTitle.setAttribute('role','button'); el.monthTitle.setAttribute('tabindex','0');
    el.monthTitle.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); openPicker(); }});

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
  if (!el.grid) return;
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
    cell.className = 'cell' + (has?' has-mark':'') + (isToday?' today':'');
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

    // mark buttons
    cell.querySelectorAll('button.mark').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const mark = btn.getAttribute('data-mark');
        setMark(activeId, iso, mark);
      });
    });

    // dblclick to clear mark
    const md = cell.querySelector('.mark-display');
    if (md){
      md.addEventListener('dblclick', (e)=>{ e.stopPropagation(); clearMark(activeId, iso); });
    }

    // Note edit
    const noteEl = cell.querySelector('.note');
    if (noteEl) {
      noteEl.addEventListener('click', (e)=>{
        e.stopPropagation();
        beginNoteEdit(cell, activeId, iso, noteText);
      });
    }

    // Touch: reveal controls
    cell.addEventListener('touchstart', ()=>{
      if (has) return;
      document.querySelectorAll('.cell.show-cta').forEach(c=>c.classList.remove('show-cta'));
      cell.classList.add('show-cta');
    }, {passive:true});

    el.grid.appendChild(cell);
  }

  // trailing blanks
  const usedCells = padStart + days;
  const tail = (7 - (usedCells % 7)) % 7;
  for (let i=0;i<tail;i++){ const c=document.createElement('div'); c.className='cell pad pad-end'; el.grid.appendChild(c); }

  document.addEventListener('touchstart', (e)=>{
    if (!el.grid.contains(e.target)) document.querySelectorAll('.cell.show-cta').forEach(c=>c.classList.remove('show-cta'));
  }, {passive:true});
}

function beginNoteEdit(cell, habitId, iso, initial){
  if (cell.querySelector('.note-edit')) return;
  const editor = document.createElement('textarea');
  editor.className = 'note-edit';
  editor.value = initial || '';
  cell.appendChild(editor);
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);

  async function commit(){
    const val = editor.value.trim();
    if (!state.notes[habitId]) state.notes[habitId] = {};
    if (val) state.notes[habitId][iso] = val;
    else delete state.notes[habitId][iso];
    saveLocal();

    if (authed()){
      // push remote (queue on error)
      try { await api.upsertNote(habitId, iso, val || ""); }
      catch { queue({ type:'note', data:{ habitId, date: iso, text: val||"" } }); }
    }
    renderMonth();
  }
  function cancel(){ renderMonth(); }

  editor.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  editor.addEventListener('blur', commit);
}

// ---- Marks / actions ----
function setMark(habitId, iso, mark){
  const pos = state.logs[habitId] || new Set();
  const neg = state.negLogs[habitId] || new Set();
  pos.delete(iso); neg.delete(iso);
  if (mark==='check') pos.add(iso);
  if (mark==='x')     neg.add(iso);
  state.logs[habitId]=pos; state.negLogs[habitId]=neg;
  saveLocal();

  // Note increment shift if X and enabled
  const habit = state.habits.find(h=>h.id===habitId);
  if (mark==='x' && habit?.noteIncrement){
    shiftNotesForward(habitId, iso);
  }

  // Remote sync for log
  if (authed()){
    const value = (mark==='check') ? true : (mark==='x' ? false : null);
    api.upsertLog(habitId, iso, value).catch(()=>{
      queue({ type:'log', data:{ habitId, date: iso, value } });
    });
  }

  renderMonth(); renderChart(); renderTotals();
}
function clearMark(habitId, iso){
  const pos = state.logs[habitId] || new Set();
  const neg = state.negLogs[habitId] || new Set();
  pos.delete(iso); neg.delete(iso);
  state.logs[habitId]=pos; state.negLogs[habitId]=neg;
  saveLocal();

  if (authed()){
    api.upsertLog(habitId, iso, null).catch(()=>{
      queue({ type:'log', data:{ habitId, date: iso, value: null } });
    });
  }

  renderMonth(); renderChart(); renderTotals();
}

function shiftNotesForward(habitId, startIso){
  if (!state.notes[habitId]) return;
  const notes = state.notes[habitId];
  const keys = Object.keys(notes).filter(k => k >= startIso).sort().reverse();
  const updates = [];
  for (const k of keys) {
    const target = nextDayIso(k);
    const val = notes[k];
    if (notes[target]) { notes[target] = notes[target] + ' • ' + val; }
    else { notes[target] = val; }
    updates.push({ from:k, to:target, text: notes[target] });
    delete notes[k];
  }
  saveLocal();
  // remote sync for notes shift
  if (authed() && pbNotesSupported){
    (async ()=>{
      for (const u of updates){
        try {
          await api.upsertNote(habitId, u.from, "");   // delete from source
          await api.upsertNote(habitId, u.to, u.text); // set on target
        } catch {
          // queue both operations
          queue({ type:'note', data:{ habitId, date: u.from, text: "" } });
          queue({ type:'note', data:{ habitId, date: u.to,   text: u.text } });
        }
      }
    })();
  }
}

// ---- KPIs / Chart (unchanged from 2.3.x) ----
function renderChart(){
  if (!el.chart) return;
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
      localStorage.setItem(LS_TIME, state.timeframe);
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

// KPIs
function setText(elm, v){ if (elm) elm.textContent = String(v); }
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

function renderTotals(){
  if (!el.kpiTotal) return;
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

// ------------------------ Create / Remove calendar tabs ------------------------
function openCreateTabModal(){
  let overlay=document.getElementById('cal-create-overlay');
  if (!overlay){
    overlay=document.createElement('div'); overlay.id='cal-create-overlay';
    overlay.innerHTML=`
      <div class="cal-modal" role="dialog" aria-modal="true">
        <button class="cal-close" id="calModalClose" aria-label="Close">×</button>
        <h2>Create New Calendar</h2>

        <form id="calCreateForm">
          <div class="cal-row cal-row-1">
            <label class="cal-field">
              <h4>Name</h4>
              <input id="calName" type="text" placeholder="e.g., Study plan" required>
            </label>
          </div>

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

          <div class="cal-row">
            <div class="cal-field">
              <h4>Done</h4>
              <select id="okIconSelect" aria-label="Done mark">
                <option>✅</option><option>✔️</option><option>✓</option><option>☑️</option>
                <option>📈</option><option>👍</option><option>🌞</option><option>❤️</option><option>☀️</option>
              </select>
            </div>
            <div class="cal-field">
              <h4>Not Done</h4>
              <select id="badIconSelect" aria-label="Missed mark">
                <option>❌</option><option>✖️</option><option>✗</option><option>✘</option>
                <option>📉</option><option>👎</option><option>🌚</option><option>💔</option><option>⛈️</option>
              </select>
            </div>
          </div>

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

    overlay.querySelector('#calCreateForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const name = overlay.querySelector('#calName').value.trim();
      const icon = overlay.querySelector('#calEmoji').value;
      const color= overlay.querySelector('#calColor').value;
      const okIcon = overlay.querySelector('#okIconSelect').value || '✅';
      const badIcon= overlay.querySelector('#badIconSelect').value || '❌';
      const noteIncrement = !!overlay.querySelector('#noteInc').checked;
      if (!name) return;
      const localId = 'local-'+Math.random().toString(36).slice(2);
      const h = { id: localId, name, icon, color, okIcon, badIcon, noteIncrement, createdAt: ymd(new Date()) };
      state.habits.push(h); state.activeId=h.id; saveLocal(); render();

      if (authed()){
        try {
          const res = await api.createHabit({ ...h, localId });
          if (res?.id) remapHabitId(localId, res.id);
        } catch {
          queue({ type:'habit:create', data:{ ...h, localId } });
        }
      }
      closeCreateTabModal();
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

// ------------------------ Boot ------------------------
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

  // initial sync if logged in
  if (authed()){
    await flushPending();
    await hydrateRemote();
  }

  // react to future auth changes
  state._lastAuthSig = authSignature();
  checkAuthLoop();
}

window.addEventListener('DOMContentLoaded', init);
