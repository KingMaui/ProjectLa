const API = 'https://api.junxieliang.com';
let allCourses = [];

const WEATHER_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️'
};

function weatherIcon(code) {
  return WEATHER_ICONS[code] || '🌡️';
}

function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter(l => {
    const key = l.url;
    if (seen.has(key) || !l.text || l.text.toLowerCase().includes('facebook')) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function renderCard(c) {
  const w = c.weather || {};
  const forecast = (w.forecast || []).slice(0, 3);
  const links = dedupeLinks(c.tee_times || []);

  const metaBadges = [
    c.holes ? `${c.holes} Holes` : null,
    c.par ? `Par ${c.par}` : null,
    c.course_rating ? `Rating ${c.course_rating}` : null,
    c.slope ? `Slope ${c.slope}` : null,
  ].filter(Boolean).map(b => `<span class="badge">${b}</span>`).join('');

  const weatherHTML = w.temperature != null ? `
    <div class="weather">
      <div class="weather-current">
        <div class="weather-temp">${Math.round(w.temperature)}°F ${weatherIcon(w.weathercode)}</div>
        <div class="weather-details">
          <div>💨 ${w.windspeed} mph</div>
          <div>🌧️ ${w.precipitation}" precip</div>
        </div>
      </div>
      <div class="weather-forecast">
        ${forecast.map(f => `
          <div class="forecast-day">
            <div class="date">${formatDate(f.date)}</div>
            <div>${weatherIcon(f.weathercode)}</div>
            <div class="temps">${Math.round(f.max_temp)}° / ${Math.round(f.min_temp)}°</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const teeHTML = links.length ? `
    <div class="tee-times">
      <h4>Book Tee Time</h4>
      ${links.map(l => `<a class="booking-link" href="${l.url}" target="_blank" rel="noopener">${l.text || l.url}</a>`).join('')}
    </div>
  ` : `<div class="tee-times"><h4>Book Tee Time</h4><span class="no-booking">No booking link found</span></div>`;

  return `
    <div class="card">
      <div class="card-header">
        <h2>${c.name}</h2>
        <div class="city">${c.city}</div>
      </div>
      ${metaBadges ? `<div class="card-meta">${metaBadges}</div>` : ''}

      ${weatherHTML}
      ${teeHTML}
      <div class="card-footer">
        <span class="phone">${c.phone || ''}</span>
        <a class="visit-link" href="${c.url}" target="_blank" rel="noopener">Visit Site →</a>
      </div>
    </div>
  `;
}

function filterCourses() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const city = document.getElementById('cityFilter').value;
  const filtered = allCourses.filter(c => {
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q);
    const matchCity = !city || c.city === city;
    return matchQ && matchCity;
  });
  document.getElementById('content').innerHTML = filtered.length
    ? `<div class="grid">${filtered.map(renderCard).join('')}</div>`
    : `<div class="state-msg">No courses found.</div>`;
  document.getElementById('countLabel').textContent = `${filtered.length} courses`;
}

async function loadCourses() {
  try {
    const res = await fetch(`${API}/courses`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    allCourses = data.courses || [];

    const updated = data.last_updated ? new Date(data.last_updated).toLocaleString() : 'Unknown';
    document.getElementById('statusBar').innerHTML = `<span>●</span> Live — Last updated: ${updated}`;

    const cities = [...new Set(allCourses.map(c => c.city))].sort();
    const sel = document.getElementById('cityFilter');
    cities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      sel.appendChild(opt);
    });

    filterCourses();
  } catch (e) {
    document.getElementById('content').innerHTML = `
      <div class="state-msg">Failed to load course data. Make sure the API is running.<br><br>${e.message}</div>
    `;
    document.getElementById('statusBar').textContent = 'API offline';
  }
}

loadCourses();