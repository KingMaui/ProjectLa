// auth.js
// PocketBase Auth + Activity Logger + Account panel + Activity modal (aesthetic updates)

const PB_URL = window.PB_URL || "https://pb.junxieliang.com";

/* ---------------- State ---------------- */
const auth = {
  get token() { return localStorage.getItem("pb_token") || ""; },
  set token(v) { v ? localStorage.setItem("pb_token", v) : localStorage.removeItem("pb_token"); },
  get user() {
    try { return JSON.parse(localStorage.getItem("pb_user") || "null"); }
    catch { return null; }
  },
  set user(obj) {
    if (!obj) localStorage.removeItem("pb_user");
    else localStorage.setItem("pb_user", JSON.stringify(obj));
  }
};

/* ---------------- Modal (Login <-> Signup <-> Account) ---------------- */
const loginBtn = document.getElementById("loginBtn");
let overlay;
let activityOverlay;

function ensureModal() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "login-modal-overlay";
  overlay.innerHTML = `
    <div class="login-modal-content" role="dialog" aria-modal="true">
      <button class="login-modal-close" id="closeLogin" aria-label="Close">&times;</button>

      <!-- LOGIN PANEL -->
      <div id="panel-login">
        <h2 class="section-title">Sign in to your account</h2>
        <form class="login-form" onsubmit="return false;">
          <div class="form-group">
            <label for="authEmail">Email</label>
            <input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email" required>
          </div>
          <div class="form-group">
            <label for="authPassword">Password</label>
            <input type="password" id="authPassword" placeholder="••••••••" autocomplete="current-password" required>
          </div>
          <div class="login-actions">
            <button class="login-btn" id="loginSubmit" type="button">Log in</button>
            <button class="login-secondary" id="toSignup" type="button">Create account</button>
          </div>
          <div class="login-status" id="loginStatus"></div>
        </form>
      </div>

      <!-- SIGNUP PANEL -->
      <div id="panel-signup" style="display:none">
        <h2 class="section-title">Create your account</h2>
        <form class="login-form" onsubmit="return false;">
          <div class="form-group">
            <label for="suUsername">Username</label>
            <input type="text" id="suUsername" placeholder="yourname" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label for="suEmail">Email</label>
            <input type="email" id="suEmail" placeholder="you@example.com" autocomplete="email" required>
          </div>
          <div class="form-group">
            <label for="suPassword">Password</label>
            <input type="password" id="suPassword" placeholder="••••••••" autocomplete="new-password" required>
          </div>
          <div class="login-actions">
            <button class="login-btn" id="signupSubmit" type="button">Sign up</button>
            <button class="login-secondary" id="toLogin" type="button">Back to login</button>
          </div>
          <div class="login-status" id="signupStatus"></div>
        </form>
      </div>

      <!-- ACCOUNT PANEL -->
      <div id="panel-account" style="display:none">
        <h2 class="section-title">Account</h2>
        <div class="login-status" id="accountStatus"></div>

        <h2 class="section-title" style="margin-top:.25rem">Signed in as</h2>
        <div class="identity-box" id="acctIdentity"></div>

        <h2 class="section-title" style="margin-top:1rem;">Username</h2>
        <div class="identity-box" id="acctUsername"></div>

        <h2 class="section-title" style="margin-top:1rem;">Email</h2>
        <div class="identity-box" id="acctEmail"></div>

        <h2 class="section-title" style="margin-top:1rem;">Change password</h2>
        <form class="login-form" onsubmit="return false;">
          <div class="form-group">
            <label for="cpCurrent">Current password</label>
            <input type="password" id="cpCurrent" placeholder="Current password" autocomplete="current-password">
          </div>
          <div class="form-group">
            <label for="cpNew">New password</label>
            <input type="password" id="cpNew" placeholder="New password" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label for="cpConfirm">Confirm new password</label>
            <input type="password" id="cpConfirm" placeholder="Confirm new password" autocomplete="new-password">
          </div>

          <div class="login-actions" style="justify-content:space-between; width:100%;">
            <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
              <button class="login-btn" id="changePwBtn" type="button">Update password</button>
            </div>
            <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
              <button class="login-secondary" id="activityBtn" type="button">Your activity</button>
              <button class="login-secondary" id="logoutBtn" type="button">Log out</button>
            </div>
          </div>

          <div class="login-status" id="pwStatus"></div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });
  overlay.querySelector("#closeLogin").addEventListener("click", () => overlay.style.display = "none");

  overlay.querySelector("#loginSubmit").addEventListener("click", login);
  overlay.querySelector("#signupSubmit").addEventListener("click", signup);
  overlay.querySelector("#toSignup").addEventListener("click", showSignup);
  overlay.querySelector("#toLogin").addEventListener("click", showLogin);
  overlay.querySelector("#logoutBtn").addEventListener("click", doLogout);
  overlay.querySelector("#changePwBtn").addEventListener("click", changePassword);
  overlay.querySelector("#activityBtn").addEventListener("click", openActivityModal);

  return overlay;
}

function openModal() {
  ensureModal();
  overlay.style.display = "flex";
  if (auth.user) showAccount();
  else showLogin();
  updateAccountButton();
}

if (loginBtn) {
  loginBtn.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
}

/* --------- Panel switches ---------- */
function showLogin() { panel("panel-login"); clearAllStatus(); }
function showSignup() { panel("panel-signup"); clearAllStatus(); }
function showAccount() {
  panel("panel-account"); clearAllStatus();
  const username = auth.user?.name || auth.user?.username || "User";
  const email    = auth.user?.email || "";
  const identity = `${username} (${email})`;
  get("#acctIdentity").textContent = identity;
  get("#acctUsername").textContent = username;
  get("#acctEmail").textContent    = email;
}

function panel(id) {
  ["panel-login","panel-signup","panel-account"].forEach(pid => {
    const el = get(`#${pid}`); if (el) el.style.display = (pid === id) ? "" : "none";
  });
}
function clearAllStatus(){ setStatus("", true); setSignupStatus("", true); setAccountStatus("", true); setPwStatus("", true); }

/* --------- Status helpers ---------- */
function setStatus(msg, ok=false){ setColorText("#loginStatus", msg, ok); }
function setSignupStatus(msg, ok=false){ setColorText("#signupStatus", msg, ok); }
function setAccountStatus(msg, ok=false){ setColorText("#accountStatus", msg, ok); }
function setPwStatus(msg, ok=false){ setColorText("#pwStatus", msg, ok); }
function setColorText(sel, msg, ok){ const el = get(sel); if (el){ el.textContent = msg || ""; el.style.color = ok ? "green" : "crimson"; } }

/* ---------------- Auth ---------------- */
async function login() {
  const email = document.getElementById("authEmail").value.trim().toLowerCase();
  const password = document.getElementById("authPassword").value;
  setStatus("Signing in...");
  try {
    const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password })
    });
    if (!res.ok) throw new Error(await res.text() || "Login failed");

    const data = await res.json();
    auth.token = data?.token || "";
    auth.user  = data?.record || null;

    setStatus("Logged in", true);
    updateAccountButton();
    setTimeout(() => { overlay && (overlay.style.display = "none"); }, 500);
    logActivity("login", { ua: navigator.userAgent }).catch(()=>{});
  } catch (e) { setStatus(cleanErr(e), false); }
}

async function signup() {
  const username = document.getElementById("suUsername").value.trim();
  const email    = document.getElementById("suEmail").value.trim().toLowerCase();
  const password = document.getElementById("suPassword").value;
  setSignupStatus("Creating account...");
  try {
    const createRes = await fetch(`${PB_URL}/api/collections/users/records`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, passwordConfirm: password })
    });
    if (!createRes.ok) throw new Error(await createRes.text() || "Signup failed");

    setSignupStatus("Account created! Signing you in…", true);
    get("#authEmail").value = email;
    get("#authPassword").value = password;
    showLogin();
    await login();
  } catch (e) { setSignupStatus(cleanErr(e), false); }
}

async function changePassword() {
  if (!auth.user || !auth.token) return;
  const current = get("#cpCurrent").value;
  const pw1     = get("#cpNew").value;
  const pw2     = get("#cpConfirm").value;
  if (!pw1 || pw1 !== pw2){ setPwStatus("Passwords do not match.", false); return; }
  setPwStatus("Updating password…");
  try {
    const res = await fetch(`${PB_URL}/api/collections/users/records/${auth.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth.token}` },
      body: JSON.stringify({ oldPassword: current || undefined, password: pw1, passwordConfirm: pw2 })
    });
    if (!res.ok) throw new Error(await res.text() || "Password update failed");
    setPwStatus("Password updated.", true);
  } catch (e) { setPwStatus(cleanErr(e), false); }
}

function doLogout() {
  auth.token = ""; auth.user = null;
  updateAccountButton();
  setAccountStatus("Logged out.", true);
  setTimeout(()=> overlay && (overlay.style.display = "none"), 400);
}

/* ---------------- UI (navbar text) ---------------- */
function updateAccountButton() {
  const btn = document.getElementById("loginBtn");
  if (!btn) return;
  if (auth.user) {
    const name = auth.user?.name || auth.user?.username || auth.user?.email || "User";
    btn.textContent = name;
  } else { btn.textContent = "Login"; }
}

/* ---------------- Activity Logger ---------------- */
export async function logActivity(action, meta = {}) {
  if (!auth.token || !auth.user) return;
  try {
    await fetch(`${PB_URL}/api/collections/activities/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth.token}` },
      body: JSON.stringify({ user: auth.user.id, action, meta, path: location.pathname })
    });
  } catch {}
}

/* ---------------- Activity Modal (bigger, no pagination) ---------------- */
function ensureActivityModal() {
  if (activityOverlay) return activityOverlay;
  activityOverlay = document.createElement("div");
  activityOverlay.className = "activity-modal-overlay";
  activityOverlay.innerHTML = `
    <div class="activity-modal-content" role="dialog" aria-modal="true">
      <button class="login-modal-close" id="closeActivity" aria-label="Close">&times;</button>
      <h2>Your activity</h2>
      <div id="activityList"><div style="opacity:.7; padding:.5rem;">Loading…</div></div>
    </div>
  `;
  document.body.appendChild(activityOverlay);
  activityOverlay.addEventListener("click", (e) => { if (e.target === activityOverlay) activityOverlay.style.display = "none"; });
  activityOverlay.querySelector("#closeActivity").addEventListener("click", () => activityOverlay.style.display = "none");
  return activityOverlay;
}

function openActivityModal() {
  if (!auth.user) return;
  ensureActivityModal();
  renderActivities([]);            // clear
  activityOverlay.style.display = "flex";
  loadAllActivities().catch(()=>{});
}

// Fetch a large page once; no "load more"
async function loadAllActivities() {
  const list = document.getElementById("activityList");
  try {
    const params = new URLSearchParams({
      page: "1", perPage: "100", sort: "-created", filter: `user="${auth.user.id}"`
    });
    const res = await fetch(`${PB_URL}/api/collections/activities/records?` + params.toString(), {
      headers: { "Authorization": `Bearer ${auth.token}` }
    });
    if (!res.ok) throw new Error(await res.text() || "Failed to load activities");
    const data = await res.json();
    renderActivities(data?.items || []);
  } catch (e) {
    list.innerHTML = `<div style="color:crimson; padding:.5rem;">${cleanErr(e)}</div>`;
  }
}

function renderActivities(items) {
  const list = document.getElementById("activityList");
  if (!list) return;
  if (!items.length) { list.innerHTML = `<div style="opacity:.7;padding:.5rem;">No activity yet.</div>`; return; }
  list.innerHTML = "";
  items.forEach(rec => {
    const d = new Date(rec.created);
    const row = document.createElement("div");
    row.className = "activity-row";
    const left = document.createElement("div");
    left.className = "left";
    left.innerHTML = `
      <div class="act">T ${escapeHtml(rec.action || "")}</div>
      <div class="path">T ${escapeHtml(rec.path || "")}</div>
    `;
    const right = document.createElement("div");
    right.className = "right";
    right.textContent = d.toLocaleString();
    row.appendChild(left); row.appendChild(right);
    list.appendChild(row);
  });
}

/* ---------------- Utilities ---------------- */
function get(sel){ return overlay?.querySelector(sel); }
function cleanErr(e){ return (e && e.message) ? e.message : String(e || "Error"); }
function escapeHtml(s){ return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------------- Boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  updateAccountButton();
  logActivity("page_view", { title: document.title, ref: document.referrer }).catch(()=>{});
  document.querySelectorAll(".navbar-links a").forEach(a => {
    a.addEventListener("click", () => {
      logActivity("nav_click", { href: a.getAttribute("href") || "", id: a.id || "" }).catch(()=>{});
    });
  });
});

window.PBAuth = { auth, logActivity, openModal };
