// auth.js
// PocketBase Auth + Activity Logger (+ Account panel with password change & activity log)

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
            <input type="email" id="authEmail" autocomplete="email" required>
          </div>
          <div class="form-group">
            <label for="authPassword">Password</label>
            <input type="password" id="authPassword" autocomplete="current-password" required>
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
            <input type="text" id="suUsername" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label for="suEmail">Email</label>
            <input type="email" id="suEmail" autocomplete="email" required>
          </div>
          <div class="form-group">
            <label for="suPassword">Password</label>
            <input type="password" id="suPassword" autocomplete="new-password" required>
          </div>
          <div class="login-actions">
            <button class="login-btn" id="signupSubmit" type="button">Sign up</button>
            <button class="login-secondary" id="toLogin" type="button">Back to login</button>
          </div>
          <div class="login-status" id="signupStatus"></div>
        </form>
      </div>

      <!-- ACCOUNT PANEL (shown when logged in) -->
      <div id="panel-account" style="display:none">
        <h2>Account</h2>
        <div class="login-status" id="accountStatus"></div>

        <form class="login-form" onsubmit="return false;">
          <div class="form-group">
            <label>Signed in as</label>
            <input type="text" id="acctIdentity" readonly>
          </div>

          <h3 style="margin:.5rem 0 0.25rem;">Change password</h3>
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
          <div class="login-actions">
            <button class="login-btn" id="changePwBtn" type="button">Update password</button>
            <button class="login-secondary" id="logoutBtn" type="button">Log out</button>
          </div>
          <div class="login-status" id="pwStatus"></div>
        </form>

        <h3 style="margin:1rem 0 .5rem;">Your activity</h3>
        <div id="activityList" style="max-height: 300px; overflow:auto; border:1px solid #000; border-radius:8px; padding:.5rem;">
          <div style="opacity:.7;">Loading…</div>
        </div>
        <div class="login-actions" style="justify-content:flex-end; margin-top:.5rem;">
          <button class="login-secondary" id="moreActivities" type="button">Load more</button>
        </div>
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

  return overlay;
}

function openModal() {
  ensureModal();
  overlay.style.display = "flex";
  if (auth.user) {
    showAccount();
  } else {
    showLogin();
  }
  updateAccountButton();
}

if (loginBtn) {
  // If logged in and user clicks their name → open Account panel (not login)
  loginBtn.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
}

/* --------- Panel switches ---------- */
function showLogin() {
  panel("panel-login");
  setStatus("", true); setSignupStatus("", true); setAccountStatus("", true); setPwStatus("", true);
}

function showSignup() {
  panel("panel-signup");
  setStatus("", true); setSignupStatus("", true); setAccountStatus("", true); setPwStatus("", true);
  const logEmail = overlay.querySelector("#authEmail")?.value?.trim();
  if (logEmail) overlay.querySelector("#suEmail").value = logEmail;
}

function showAccount() {
  panel("panel-account");
  setStatus("", true); setSignupStatus("", true); setAccountStatus("", true); setPwStatus("", true);
  // Fill identity
  const idField = overlay.querySelector("#acctIdentity");
  const name = auth.user?.name || auth.user?.username || auth.user?.email || "User";
  if (idField) idField.value = name + "  (" + (auth.user?.email || "") + ")";
  // Load activities
  activities.reset();
  loadActivities().catch(()=>{});
}

function panel(id) {
  const ids = ["panel-login","panel-signup","panel-account"];
  ids.forEach(pid => {
    const el = overlay.querySelector("#"+pid);
    if (el) el.style.display = (pid === id) ? "" : "none";
  });
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
    // Auto login with same credentials
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
    // Update the authed user's record. PocketBase accepts oldPassword + password + passwordConfirm for auth collections.
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
    // Optional: force re-login? For now, keep session.
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

/* ---------------- Activity Logger + Viewer ---------------- */
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

const activities = {
  page: 1,
  perPage: 20,
  done: false,
  reset(){ this.page = 1; this.done = false; const list = get("#activityList"); if (list) list.innerHTML = '<div style="opacity:.7;">Loading…</div>'; }
};

async function loadActivities() {
  if (!auth.user || !auth.token || activities.done) return;
  const list = get("#activityList");
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
    const data = await res.json(); // { page, perPage, totalItems, items: [...] }

    const items = data?.items || [];
    if (activities.page === 1) list.innerHTML = "";
    if (items.length === 0) {
      if (activities.page === 1) list.innerHTML = `<div style="opacity:.7;">No activity yet.</div>`;
      activities.done = true;
      return;
    }

    items.forEach(rec => {
      const d = new Date(rec.created);
      const row = document.createElement("div");
      row.style.padding = ".35rem 0";
      row.style.borderBottom = "1px dashed #ddd";
      row.innerHTML = `
        <div style="font-weight:600">${escapeHtml(rec.action || "")}</div>
        <div style="opacity:.8;font-size:.9rem">${escapeHtml(rec.path || "")}</div>
        <div style="opacity:.6;font-size:.85rem">${d.toLocaleString()}</div>
      `;
      list.appendChild(row);
    });

    // pagination
    const totalPages = Math.ceil((data.totalItems || 0) / activities.perPage);
    activities.page++;
    activities.done = activities.page > totalPages;

    // toggle "Load more"
    const more = get("#moreActivities");
    if (more) more.style.display = activities.done ? "none" : "";
    if (more && !more._bound) {
      more._bound = true;
      more.addEventListener("click", () => loadActivities());
    }
  } catch (e) {
    list.innerHTML = `<div style="color:crimson">${cleanErr(e)}</div>`;
  }
}

/* ---------------- Utilities ---------------- */
function get(sel){ return overlay?.querySelector(sel); }
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
window.PBAuth = { auth, logActivity, openModal, showLogin, showSignup, showAccount };
