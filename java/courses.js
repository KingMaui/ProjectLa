/* =====================================================
   Weekend Birdie — courses.js
   Course Map page logic.
   Loads course data from data/courses-index.json,
   fetches per-course scorecards from data/details/{id}.json
   on demand.
   Dependencies: Leaflet 1.9, Leaflet.markercluster 1.5,
   js/main.js (auth/nav)
   ===================================================== */

/* ── STATE ─────────────────────────────────────────── */
let ALL_COURSES  = [];   // lightweight index rows
let detailCache  = {};   // id -> full detail object, fetched on demand
let map          = null;
let markersLayer = null; // Leaflet.markercluster group
let activeId     = null;
let activeTee    = 'all';
let markerMap    = {};

/* ── BOOT ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadCourses();
  document.getElementById('modal-overlay')
    .addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    });
});

/* ── LOAD DATA ──────────────────────────────────────── */
async function loadCourses() {
  showListLoading();
  try {
    const res  = await fetch('data/courses-index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    ALL_COURSES = data.courses;
    initCourseMap();
    renderSidebar(ALL_COURSES);
    updateResultsCount(ALL_COURSES.length);
    populateCountryFilter();
  } catch (err) {
    console.error('Failed to load courses-index.json:', err);
    document.getElementById('course-list').innerHTML =
      `<div class="list-empty">Could not load course data.<br>Make sure <code>data/courses-index.json</code> is present.</div>`;
  }
}

// Fetch + cache a course's full detail (scorecard, all tees/holes).
async function getCourseDetail(id) {
  if (detailCache[id]) return detailCache[id];
  const res = await fetch(`data/details/${id}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading detail for ${id}`);
  const detail = await res.json();
  detailCache[id] = detail;
  return detail;
}

/* ── MAP INIT ───────────────────────────────────────── */
function initCourseMap() {
  map = L.map('map', {
    center: [37.7749, -122.4194],   // San Francisco, CA
    zoom: 8,
    zoomControl: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // CartoDB Positron — clean, minimal tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> ' +
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);

  markersLayer = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
  });
  map.addLayer(markersLayer);

  placeMarkers(ALL_COURSES);
}

/* ── MARKERS ────────────────────────────────────────── */
function makeIcon(isActive) {
  return L.divIcon({
    className: '',
    html: `<div class="wb-marker${isActive ? ' active' : ''}"><div class="wb-marker-inner"></div></div>`,
    iconSize:    [28, 28],
    iconAnchor:  [14, 28],
    popupAnchor: [0, -32],
  });
}

function placeMarkers(courses) {
  markersLayer.clearLayers();
  markerMap = {};

  courses.forEach(c => {
    const marker = L.marker([c.lat, c.lng], { icon: makeIcon(String(c.id) === String(activeId)) })
      .bindPopup(buildPopup(c), { maxWidth: 300, minWidth: 240, closeButton: false })
      .on('click', () => selectCourse(c.id));

    markersLayer.addLayer(marker);
    markerMap[c.id] = marker;
  });
}

/* ── POPUP BUILDER (index fields only) ─────────────── */
function buildPopup(c) {
  const refTee = c.ref_tee || {};

  const slopeColor =
    refTee.slope < 120 ? '#639922' :
    refTee.slope <= 135 ? '#854F0B' :
    '#993C1D';

  const difficultyLabel = {
    championship: 'Championship',
    tournament:   'Tournament',
    resort:       'Resort',
    public:       'Public',
  }[c.type] || c.type;

  const teeChips = (c.tee_colors || []).map(t => {
    const textColor = t.key === 'white' ? '#333' : 'white';
    return `<span class="popup-tee-chip" style="background:${t.color}; border-color:${t.color}; color:${textColor};">${t.key}</span>`;
  }).join('');

  const holesLabel = c.holes_available.join(' / ') + ' holes';

  return `
    <div class="popup-inner">
      <div class="popup-name">${c.name}</div>
      <div class="popup-location">${c.city}, ${c.state} · ${holesLabel} · ${difficultyLabel}</div>
      <div class="popup-tee-row">${teeChips}</div>
      <div class="popup-stats">
        <div class="popup-stat">
          <div class="popup-stat-val">${c.par_total}</div>
          <div class="popup-stat-lbl">Par</div>
        </div>
        <div class="popup-stat">
          <div class="popup-stat-val" style="color:${slopeColor}">${refTee.slope}</div>
          <div class="popup-stat-lbl">Slope</div>
        </div>
        <div class="popup-stat">
          <div class="popup-stat-val">${refTee.rating}</div>
          <div class="popup-stat-lbl">Rating</div>
        </div>
      </div>
      <button class="popup-btn" onclick="selectAndPlay('${c.id}')">Select this course ›</button>
    </div>`;
}

/* ── SELECTION ──────────────────────────────────────── */
function selectCourse(id) {
  activeId = id;

  document.querySelectorAll('.course-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === String(id));
  });

  const el = document.querySelector(`.course-item[data-id="${id}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  Object.entries(markerMap).forEach(([cid, marker]) => {
    marker.setIcon(makeIcon(String(cid) === String(id)));
  });
}

function flyTo(id) {
  const c = ALL_COURSES.find(x => x.id === id);
  if (!c || !map) return;
  map.flyTo([c.lat, c.lng], 13, { duration: 1.0 });
  setTimeout(() => {
    const marker = markerMap[id];
    if (!marker) return;
    // If the marker is currently inside a cluster, zoom into it first
    if (markersLayer.hasLayer(marker)) {
      markersLayer.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
      marker.openPopup();
    }
  }, 1100);
}

function selectAndPlay(id) {
  selectCourse(id);
  openQuickScorecard(id);
}

/* ── QUICK SCORECARD PANEL ───────────────────────── */
let qscCourse = null;
let qscTee    = null;

async function openQuickScorecard(id) {
  const indexRow = ALL_COURSES.find(c => c.id === id);
  if (!indexRow) return;

  // Show panel immediately with what we know from the index
  document.getElementById('qsc-course-name').textContent = indexRow.name;
  document.getElementById('qsc-course-meta').textContent =
    indexRow.city + ', ' + indexRow.state + ' · Par ' + indexRow.par_total;

  document.getElementById('qsc-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('qsc-table-container').innerHTML =
    '<p style="color:var(--text-muted);text-align:center;padding:24px;font-size:13px">Loading scorecard…</p>';
  document.getElementById('qsc-save-btn').disabled = true;

  let detail;
  try {
    detail = await getCourseDetail(id);
  } catch (err) {
    console.error('Failed to load course detail:', err);
    document.getElementById('qsc-table-container').innerHTML =
      '<p style="color:var(--text-muted);text-align:center;padding:24px;font-size:13px">Could not load scorecard. Please try again.</p>';
    return;
  }

  // If the user closed/switched courses while the fetch was in flight, bail
  if (!document.getElementById('qsc-overlay').classList.contains('open')) return;
  if (indexRow.id !== id) return;

  qscCourse = { ...indexRow, map: detail.map, scorecard: detail.scorecard };
  qscTee = null;

  const d  = new Date();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  document.getElementById('qsc-date').value = d.getFullYear() + '-' + mm + '-' + dd;

  const teeSel = document.getElementById('qsc-tee-select');
  teeSel.innerHTML = '';
  Object.entries(qscCourse.map.tees).forEach(([key, t]) => {
    const opt = document.createElement('option');
    opt.value = key;
    const yds = qscCourse.scorecard.yardage[key]?.men || qscCourse.scorecard.yardage[key]?.women || '?';
    opt.textContent = capitalize(key) + ' — ' + t.rating + '/' + t.slope + ' (' + yds + ' yds)';
    teeSel.appendChild(opt);
  });
  const teeKeys = Object.keys(qscCourse.map.tees);
  teeSel.value = teeKeys.includes('blue') ? 'blue' : teeKeys[0];
  qscOnTeeChange();

  const holesSel = document.getElementById('qsc-holes-select');
  holesSel.innerHTML = '';
  if (qscCourse.holes_available.includes(18)) {
    holesSel.innerHTML += '<option value="18">18 holes</option>';
    if (qscCourse.scorecard.holes.length >= 18) {
      holesSel.innerHTML += '<option value="9F">Front 9</option>';
      holesSel.innerHTML += '<option value="9B">Back 9</option>';
    }
  } else {
    holesSel.innerHTML += '<option value="9">9 holes</option>';
  }
  holesSel.selectedIndex = 0;

  document.getElementById('qsc-login-note').style.display = PB.isLoggedIn() ? 'none' : 'block';
}

function closeQuickScorecard(e) {
  if (e && e.target !== document.getElementById('qsc-overlay')) return;
  document.getElementById('qsc-overlay').classList.remove('open');
  document.body.style.overflow = '';
  qscCourse = null; qscTee = null;
}

function qscOnTeeChange() {
  const key = document.getElementById('qsc-tee-select').value;
  if (!qscCourse || !key) return;
  qscTee = { key, ...qscCourse.map.tees[key] };
  document.getElementById('qsc-live-rating').textContent = qscTee.rating || '—';
  document.getElementById('qsc-live-slope').textContent  = qscTee.slope  || '—';
  qscBuildTable();
}

function qscBuildTable() {
  if (!qscCourse || !qscTee) return;
  const holesVal = document.getElementById('qsc-holes-select').value;
  const allHoles = (qscCourse.scorecard.holes || [])
    .slice()
    .sort((a, b) => parseInt(a.hole) - parseInt(b.hole));
  let holes;
  if      (holesVal === '9F') holes = allHoles.slice(0, 9);
  else if (holesVal === '9B') holes = allHoles.slice(9, 18);
  else if (holesVal === '9')  holes = allHoles.slice(0, 9);
  else                        holes = allHoles;

  const container = document.getElementById('qsc-table-container');
  if (!holes.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;font-size:13px">No hole data for this course yet.</p>';
    document.getElementById('qsc-save-btn').disabled = true;
    return;
  }

  const teeKey   = qscTee.key;
  const parTotal = holes.reduce((s, h) => s + h.par, 0);
  const ydsTotal = holes.reduce((s, h) => { const y = h.yards?.[teeKey]; return y ? s+y : s; }, 0);

  let html = '<div class="qsc-table-wrap"><table class="qsc-table"><thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Yds</th><th>Score</th><th>+/−</th></tr></thead><tbody id="qsc-tbody">';
  holes.forEach((h, idx) => {
    const yards    = h.yards?.[teeKey] ?? '—';
    const si       = h.stroke_index_men ?? '—';
    const divClass = idx === 8 && holes.length === 18 ? ' class="qsc-nine-divider"' : '';
    html += '<tr data-hole="'+parseInt(h.hole)+'" data-par="'+h.par+'"'+divClass+'>'+
      '<td>'+parseInt(h.hole)+'</td>'+
      '<td class="qsc-par-cell">'+h.par+'</td>'+
      '<td class="qsc-si-cell">'+si+'</td>'+
      '<td class="qsc-yds-cell">'+yards+'</td>'+
      '<td><input type="number" min="1" max="20" class="qsc-score-input" id="qsc-score-'+parseInt(h.hole)+'" placeholder="'+h.par+'" oninput="qscOnScoreInput(this,'+h.par+','+parseInt(h.hole)+')"></td>'+
      '<td class="qsc-rel-cell" id="qsc-rel-'+parseInt(h.hole)+'">—</td>'+
      '</tr>';
  });
  html += '<tr class="qsc-totals-row"><td>Total</td><td id="qsc-total-par">'+parTotal+'</td><td>—</td><td>'+(ydsTotal||'—')+'</td><td id="qsc-total-score">—</td><td id="qsc-total-rel">—</td></tr></tbody></table></div>';
  container.innerHTML = html;
  qscUpdateDiffBar();
}

function qscOnScoreInput(input, par, hole) {
  const score = parseInt(input.value);
  input.className = 'qsc-score-input';
  const relCell = document.getElementById('qsc-rel-'+hole);
  if (!isNaN(score) && score > 0) {
    const rel = score - par;
    if      (rel <= -2) input.classList.add('eagle');
    else if (rel === -1) input.classList.add('birdie');
    else if (rel ===  0) input.classList.add('par');
    else if (rel ===  1) input.classList.add('bogey');
    else if (rel ===  2) input.classList.add('double');
    else                 input.classList.add('triple');
    relCell.textContent = rel === 0 ? 'E' : (rel > 0 ? '+'+rel : rel);
    relCell.style.color = rel < 0 ? 'var(--green-mid)' : rel === 0 ? 'var(--text-muted)' : rel === 1 ? '#8a6200' : '#c0392b';
  } else {
    relCell.textContent = '—';
    relCell.style.color = 'var(--text-muted)';
  }
  qscUpdateDiffBar();
}

function qscUpdateDiffBar() {
  const rows = document.querySelectorAll('#qsc-tbody tr[data-hole]');
  let gross = 0, parTotal = 0, filled = 0;
  rows.forEach(row => {
    const hole  = parseInt(row.dataset.hole);
    const par   = parseInt(row.dataset.par);
    const score = parseInt(document.getElementById('qsc-score-'+hole)?.value);
    parTotal += par;
    if (!isNaN(score) && score > 0) { gross += score; filled++; }
  });
  document.getElementById('qsc-total-par').textContent = parTotal;
  if (filled === 0) {
    document.getElementById('qsc-live-gross').textContent  = '—';
    document.getElementById('qsc-live-diff').textContent   = '—';
    document.getElementById('qsc-total-score').textContent = '—';
    document.getElementById('qsc-total-rel').textContent   = '—';
    document.getElementById('qsc-save-btn').disabled = true;
    return;
  }
  document.getElementById('qsc-total-score').textContent = gross;
  const rel = gross - parTotal;
  document.getElementById('qsc-total-rel').textContent  = rel === 0 ? 'E' : (rel > 0 ? '+'+rel : rel);
  document.getElementById('qsc-live-gross').textContent = gross;
  if (filled === rows.length && qscTee?.rating && qscTee?.slope) {
    const diff = ((113 / qscTee.slope) * (gross - qscTee.rating)).toFixed(1);
    document.getElementById('qsc-live-diff').textContent = diff;
    document.getElementById('qsc-save-btn').disabled = false;
  } else {
    document.getElementById('qsc-live-diff').textContent = '—';
    document.getElementById('qsc-save-btn').disabled = true;
  }
}

async function qscSaveRound() {
  if (!qscCourse || !qscTee) return;
  if (!PB.isLoggedIn()) { openModal(null, 'login'); return; }

  const rows = document.querySelectorAll('#qsc-tbody tr[data-hole]');
  let scores = {}, gross = 0;
  rows.forEach(row => {
    const hole  = parseInt(row.dataset.hole);
    const score = parseInt(document.getElementById('qsc-score-'+hole)?.value);
    scores[hole] = score; gross += score || 0;
  });

  const diff     = parseFloat(((113 / qscTee.slope) * (gross - qscTee.rating)).toFixed(1));
  const holesVal = document.getElementById('qsc-holes-select').value;
  const dateVal  = document.getElementById('qsc-date').value;
  const parTotal = parseInt(document.getElementById('qsc-total-par').textContent);

  const round = {
    date: dateVal, courseId: qscCourse.id, courseName: qscCourse.name,
    city: qscCourse.city, teeKey: qscTee.key, teeColor: qscTee.color,
    rating: qscTee.rating, slope: qscTee.slope, holes: holesVal,
    gross, diff, scores, par: parTotal
  };

  const btn = document.getElementById('qsc-save-btn');
  btn.textContent = 'Saving...'; btn.disabled = true;

  try {
    await PB.saveRound(round);
    qscShowToast('Round saved! ⛳ View it in My Stats.');
    setTimeout(() => closeQuickScorecard(), 1800);
  } catch(err) {
    qscShowToast(err.message || 'Failed to save. Please try again.');
    btn.textContent = 'Save round to my stats'; btn.disabled = false;
  }
}

let _qscToastTimer;
function qscShowToast(msg) {
  const t = document.getElementById('qsc-toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_qscToastTimer);
  _qscToastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

/* ── SIDEBAR RENDER ─────────────────────────────────── */
function renderSidebar(courses) {
  const list = document.getElementById('course-list');

  if (courses.length === 0) {
    list.innerHTML = `<div class="list-empty">No courses match your filters.<br>Try broadening your search.</div>`;
    return;
  }

  // Group by state
  const byState = {};
  courses.forEach(c => {
    if (!byState[c.state]) byState[c.state] = [];
    byState[c.state].push(c);
  });

  list.innerHTML = Object.entries(byState).map(([state, stateCourses]) => {
    const items = stateCourses.map(c => {
      const refTee     = c.ref_tee || {};
      const slopeLabel =
        refTee.slope < 120  ? 'Easy' :
        refTee.slope <= 135 ? 'Medium' :
        'Challenging';

      const holesLabel = c.holes_available.join('/') + ' holes';

      return `<div class="course-item" data-id="${c.id}"
          onclick="selectCourse('${c.id}'); flyTo('${c.id}');">
        <div class="course-item-name">${c.name}</div>
        <div class="course-item-meta">
          <span class="meta-tag">${c.city}</span>
          <span class="meta-tag">${holesLabel}</span>
        </div>
        <div class="course-item-badges">
          <span class="badge badge-par">Par ${c.par_total}</span>
          <span class="badge badge-slope">Slope ${refTee.slope} · ${slopeLabel}</span>
          <span class="badge badge-rating">Rating ${refTee.rating}</span>
        </div>
      </div>`;
    }).join('');

    return `
      <div style="padding: 8px 20px 4px; font-size:10px; font-weight:500;
                  text-transform:uppercase; letter-spacing:0.1em;
                  color:var(--text-muted); background:var(--cream);">
        ${state}
      </div>
      ${items}`;
  }).join('');
}

function showListLoading() {
  document.getElementById('course-list').innerHTML =
    `<div class="list-loading">Loading courses…</div>`;
}

function updateResultsCount(n) {
  document.getElementById('results-count').innerHTML =
    `<strong>${n}</strong> course${n !== 1 ? 's' : ''}`;
  document.getElementById('sidebar-sub').textContent =
    `${n} course${n !== 1 ? 's' : ''} available · More regions coming soon`;
}

/* ── FILTERS ────────────────────────────────────────── */
function setTeePill(el) {
  document.querySelectorAll('.filter-pill[data-tee]')
    .forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  activeTee = el.dataset.tee;
  applyFilters();
}

function applyFilters() {
  if (!ALL_COURSES.length) return;

  const query    = document.getElementById('course-search').value.toLowerCase().trim();
  const par      = document.getElementById('filter-par').value;
  const slope    = document.getElementById('filter-slope').value;
  const holes    = document.getElementById('filter-holes').value;
  const country  = document.getElementById('filter-country').value;

  const filtered = ALL_COURSES.filter(c => {
    // Text search — name, city, state, country
    if (query) {
      const haystack = `${c.name} ${c.city} ${c.state} ${c.country}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    // Country
    if (country !== 'all' && c.country !== country) return false;

    // Par
    if (par !== 'all' && c.par_total !== +par) return false;

    // Holes (any of the available options includes the filter value)
    if (holes !== 'all' && !c.holes_available.includes(+holes)) return false;

    // Tee availability — index only stores tee_colors (key + color)
    if (activeTee !== 'all' && !(c.tee_colors || []).some(t => t.key === activeTee)) return false;

    // Slope (uses the pre-computed ref_tee from the index)
    const s = (c.ref_tee || {}).slope;
    if (slope === 'easy'   && s >= 120)             return false;
    if (slope === 'medium' && (s < 120 || s > 135)) return false;
    if (slope === 'hard'   && s <= 135)             return false;

    return true;
  });

  renderSidebar(filtered);
  placeMarkers(filtered);
  updateResultsCount(filtered.length);
}

function resetFilters() {
  document.getElementById('course-search').value  = '';
  document.getElementById('filter-par').value     = 'all';
  document.getElementById('filter-slope').value   = 'all';
  document.getElementById('filter-holes').value   = 'all';
  document.getElementById('filter-country').value = 'all';
  document.querySelectorAll('.filter-pill[data-tee]')
    .forEach(p => p.classList.remove('active'));
  document.querySelector('.filter-pill[data-tee="all"]').classList.add('active');
  activeTee = 'all';

  renderSidebar(ALL_COURSES);
  placeMarkers(ALL_COURSES);
  updateResultsCount(ALL_COURSES.length);
  map.flyTo([37.7749, -122.4194], 8, { duration: 1.2 });
}

/* ── POPULATE COUNTRY DROPDOWN DYNAMICALLY ────────── */
function populateCountryFilter() {
  const countries = [...new Set(ALL_COURSES.map(c => c.country))].sort();
  const sel = document.getElementById('filter-country');
  countries.forEach(ctry => {
    const opt = document.createElement('option');
    opt.value = ctry;
    opt.textContent = ctry;
    sel.appendChild(opt);
  });
}
