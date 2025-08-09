// auth.js
// PocketBase Auth + Activity Logger + Account panel + Activity modal

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
        <h2 id="loginTitle">Sign in to your account</h2>
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
        <h2>Create your account</h2>
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

      <!-- ACCOUNT PANEL (when logged in) -->
      <div id="panel-account" style="display:none">
        <h2>Account</h2>

        <div class="login-form" style="margin-bottom:.75rem;">
          <div class="form-group">
            <div style="font-size: 1.5rem;">Signed in as</div>
            <div id="acctIdentity" style="font-size: 1rem;padding:.2rem;">
              <!-- filled in showAccount() -->
            </div>
          </div>
        </div>

        <h3 style="margin:.25rem 0 .25rem;font-size: 1.5rem;">Change password</h3>
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
          <div class="login-status" id="accountStatus"></div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });
  overlay.querySelector("#closeLogin").addEventListener("click", () => overlay.style.display = "none");

  // Bind actions
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
function showLogin() {
  panel("panel-login");
  clearAllStatus();
}
function showSignup() {
  panel("panel-signup");
  clearAllStatus();
  const logEmail = overlay.querySelector("#authEmail")?.value?.trim();
  if (logEmail) overlay.querySelector("#suEmail").value = logEmail;
}
function showAccount() {
  panel("panel-account");
  clearAllStatus();
  const name = auth.user?.name || auth.user?.username || auth.user?.email || "User";
  const email = auth.user?.email || "";
  const idBox = overlay.querySelector("#acctIdentity");
  if (idBox) idBox.textContent = `${name} (${email})`;
}

function panel(id) {
  ["panel-login","panel-signup","panel-account"].forEach(pid => {
    const el = overlay.querySelector("#"+pid);
    if (el) el.style.display = (pid === id) ? "" : "none";
  });
}
function clearAllStatus(){
  setStatus("", true); setSignupStatus("", true); setAccountStatus("", true); setPwStatus("", true);
}

/* --------- Status helpers ---------- */
function setStatus(msg, ok=false){ setColorText("#loginStatus", msg, ok); }
function setSignupStatus(msg, ok=false){ setColorText("#signupStatus", msg, ok); }
function setAccountStatus(msg, ok=false){ setColorText("#accountStatus", msg, ok); }
function setPwStatus(msg, ok=false){ setColorText("#pwStatus", msg, ok); }
function setColorText(sel, msg, ok){
  const el = overlay?.querySelector(sel);
  if (el){ el.textContent = msg || ""; el.style.color = ok ? "green" : "crimson"; }
}

/* ---------------- Auth ---------------- */
async function login() {
  const email = document.getElementById("authEmail").value.trim().toLowerCase();
  const password = document.getElementById("authPassword").value;
  setStatus("Signing in...");
  try {
    const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  } catch (e) {
    setStatus(cleanErr(e), false);
  }
}

async function signup() {
  const username = document.getElementById("suUsername").value.trim();
  const email    = document.getElementById("suEmail").value.trim().toLowerCase();
  const password = document.getElementById("suPassword").value;
  setSignupStatus("Creating account...");
  try {
    const createRes = await fetch(`${PB_URL}/api/collections/users/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, passwordConfirm: password })
    });
    if (!createRes.ok) throw new Error(await createRes.text() || "Signup failed");

    setSignupStatus("Account created! Signing you in…", true);
    overlay.querySelector("#authEmail").value = email;
    overlay.querySelector("#authPassword").value = password;
    showLogin();
    await login();
  } catch (e) {
    setSignupStatus(cleanErr(e), false);
  }
}

async function changePassword() {
  if (!auth.user || !auth.token) return;
  const current = overlay.querySelector("#cpCurrent").value;
  const pw1     = overlay.querySelector("#cpNew").value;
  const pw2     = overlay.querySelector("#cpConfirm").value;

  if (!pw1 || pw1 !== pw2){ setPwStatus("Passwords do not match.", false); return; }
  setPwStatus("Updating password…");

  try {
    const res = await fetch(`${PB_URL}/api/collections/users/records/${auth.user.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${auth.token}`
      },
      body: JSON.stringify({
        oldPassword: current || undefined,
        password: pw1,
        passwordConfirm: pw2
      })
    });
    if (!res.ok) throw new Error(await res.text() || "Password update failed");
    setPwStatus("Password updated.", true);
  } catch (e) {
    setPwStatus(cleanErr(e), false);
  }
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
  } else {
    btn.textContent = "Login";
  }
}

/* ---------------- Activity Logger ---------------- */
export async function logActivity(action, meta = {}) {
  if (!auth.token || !auth.user) return;
  try {
    await fetch(`${PB_URL}/api/collections/activities/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${auth.token}`
      },
      body: JSON.stringify({
        user: auth.user.id,
        action,
        meta,
        path: location.pathname
      })
    });
  } catch { /* ignore */ }
}

/* ---------------- Activity Modal (separate popup) ---------------- */
function ensureActivityModal() {
  if (activityOverlay) return activityOverlay;
  activityOverlay = document.createElement("div");
  activityOverlay.className = "login-modal-overlay";
  activityOverlay.innerHTML = `
    <div class="login-modal-content" role="dialog" aria-modal="true">
      <button class="login-modal-close" id="closeActivity" aria-label="Close">&times;</button>
      <h2>Your activity</h2>
      <div id="activityList" style="max-height: 360px; overflow:auto; border:1px solid #000; border-radius:8px;">
        <div style="opacity:.7; padding:.5rem;">Loading…</div>
      </div>
      <div class="login-actions" style="justify-content:flex-end; margin-top:.5rem;">
        
      </div>
    </div>
  `;
  document.body.appendChild(activityOverlay);

  activityOverlay.addEventListener("click", (e) => { if (e.target === activityOverlay) activityOverlay.style.display = "none"; });
  activityOverlay.querySelector("#closeActivity").addEventListener("click", () => activityOverlay.style.display = "none");

  // wire load more
  const more = activityOverlay.querySelector("#moreActivities");
  if (more && !more._bound) {
    more._bound = true;
    more.addEventListener("click", () => loadActivities());
  }

  return activityOverlay;
}

const activities = {
  page: 1,
  perPage: 20,
  done: false,
  reset(){
    this.page = 1; this.done = false;
    const list = document.querySelector("#activityList");
    if (list) list.innerHTML = `<div style="opacity:.7; padding:.5rem;">Loading…</div>`;
  }
};

function openActivityModal() {
  if (!auth.user) return;
  ensureActivityModal();
  activities.reset();
  activityOverlay.style.display = "flex";
  loadActivities().catch(()=>{});
}

async function loadActivities() {
  if (!auth.user || !auth.token || activities.done) return;
  const list = document.querySelector("#activityList");
  if (!list) return;

  try {
    const params = new URLSearchParams({
      page: String(activities.page),
      perPage: String(activities.perPage),
      sort: "-created",
      filter: `user="${auth.user.id}"`
    });
    const res = await fetch(`${PB_URL}/api/collections/activities/records?` + params.toString(), {
      headers: { "Authorization": `Bearer ${auth.token}` }
    });
    if (!res.ok) throw new Error(await res.text() || "Failed to load activities");
    const data = await res.json();

    const items = data?.items || [];
    if (activities.page === 1) list.innerHTML = "";
    if (items.length === 0) {
      if (activities.page === 1) list.innerHTML = `<div style="opacity:.7;padding:.5rem;">No activity yet.</div>`;
      activities.done = true;
      return;
    }

    // Render: one row per item
    items.forEach(rec => {
      const d = new Date(rec.created);
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto";
      row.style.alignItems = "center";
      row.style.gap = ".5rem";
      row.style.padding = ".5rem .6rem";
      row.style.borderBottom = "1px solid #eee";

      const left = document.createElement("div");
      left.style.minWidth = 0;
      left.innerHTML = `
        <div style="font-size: 1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(rec.action || "")}</div>
        <div style="opacity:.75; font-size:.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(rec.path || "")}</div>
      `;

      const right = document.createElement("div");
      right.style.opacity = ".65";
      right.style.fontSize = ".85rem";
      right.textContent = d.toLocaleString();

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });

    const totalPages = Math.ceil((data.totalItems || 0) / activities.perPage);
    activities.page++;
    activities.done = activities.page > totalPages;

    const more = document.querySelector("#moreActivities");
    if (more) more.style.display = activities.done ? "none" : "";
  } catch (e) {
    list.innerHTML = `<div style="color:crimson; padding:.5rem;">${cleanErr(e)}</div>`;
  }
}

/* ---------------- Utilities ---------------- */
function cleanErr(e){ return (e && e.message) ? e.message : String(e || "Error"); }
function escapeHtml(s){ return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------------- Boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  updateAccountButton();
  // Auto-log page view
  logActivity("page_view", { title: document.title, ref: document.referrer }).catch(()=>{});
  // Log nav clicks
  document.querySelectorAll(".navbar-links a").forEach(a => {
    a.addEventListener("click", () => {
      logActivity("nav_click", { href: a.getAttribute("href") || "", id: a.id || "" }).catch(()=>{});
    });
  });
});

// expose for other scripts
window.PBAuth = { auth, logActivity, openModal };
