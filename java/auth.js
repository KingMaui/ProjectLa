// auth.js
// PocketBase Auth + Activity Logger
// PB host configurable via window.PB_URL in the HTML.

const PB_URL = window.PB_URL || "https://pb.junxieliang.com";

// --------------------
// State helpers
// --------------------
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

// --------------------
// UI: Build modal (Login <-> Sign Up panels)
// --------------------
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
            <button class="login-secondary" id="logoutBtn" type="button" style="display:none">Log out</button>
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
    </div>
  `;
  document.body.appendChild(overlay);

  // Close when clicking backdrop or ×
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });
  overlay.querySelector("#closeLogin").addEventListener("click", () => overlay.style.display = "none");

  // Bind actions
  overlay.querySelector("#loginSubmit").addEventListener("click", login);
  overlay.querySelector("#signupSubmit").addEventListener("click", signup);
  overlay.querySelector("#logoutBtn").addEventListener("click", doLogout);
  overlay.querySelector("#toSignup").addEventListener("click", showSignup);
  overlay.querySelector("#toLogin").addEventListener("click", showLogin);

  return overlay;
}

function openModal() {
  ensureModal();
  overlay.style.display = "flex";
  showLogin();                  // default panel
  updateAccountButton();        // ensure button text state
  updateLoginUI();              // ensure logout visibility etc.
}

if (loginBtn) {
  loginBtn.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
}

// Panel switches
function showLogin() {
  const L = overlay.querySelector("#panel-login");
  const S = overlay.querySelector("#panel-signup");
  if (L && S) { L.style.display = ""; S.style.display = "none"; }
  setStatus("", true); setSignupStatus("", true);
  // Prefill login email from signup if user just came from there
  const suEmail = overlay.querySelector("#suEmail")?.value?.trim();
  if (suEmail) overlay.querySelector("#authEmail").value = suEmail;
}

function showSignup() {
  const L = overlay.querySelector("#panel-login");
  const S = overlay.querySelector("#panel-signup");
  if (L && S) { L.style.display = "none"; S.style.display = ""; }
  setStatus("", true); setSignupStatus("", true);
  // Prefill signup email from login if present
  const logEmail = overlay.querySelector("#authEmail")?.value?.trim();
  if (logEmail) overlay.querySelector("#suEmail").value = logEmail;
}

function setStatus(msg, ok = false) {
  const el = document.getElementById("loginStatus");
  if (el) {
    el.textContent = msg || "";
    el.style.color = ok ? "green" : "crimson";
  }
}
function setSignupStatus(msg, ok = false) {
  const el = document.getElementById("signupStatus");
  if (el) {
    el.textContent = msg || "";
    el.style.color = ok ? "green" : "crimson";
  }
}

// Keep UI bits in sync
function updateLoginUI() {
  if (!overlay) return;
  const logoutBtn = overlay.querySelector("#logoutBtn");
  if (logoutBtn) logoutBtn.style.display = auth.user ? "inline-block" : "none";
}

// --------------------
// Auth functions
// --------------------
async function login() {
  const email = document.getElementById("authEmail").value.trim();
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
    updateLoginUI();

    // Close a moment after success
    setTimeout(() => overlay && (overlay.style.display = "none"), 600);

    // Log activity: login
    logActivity("login", { ua: navigator.userAgent }).catch(() => {});
  } catch (e) {
    setStatus(e.message || "Login error");
  }
}

async function signup() {
  const username = document.getElementById("suUsername").value.trim();
  const email    = document.getElementById("suEmail").value.trim();
  const password = document.getElementById("suPassword").value;
  setSignupStatus("Creating account...");
  try {
    // Create user with username + email + password
    const createRes = await fetch(`${PB_URL}/api/collections/users/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, passwordConfirm: password })
    });
    if (!createRes.ok) throw new Error(await createRes.text() || "Signup failed");

    setSignupStatus("Account created! Logging you in…", true);

    // Auto-login with the same credentials
    document.getElementById("authEmail").value = email;
    document.getElementById("authPassword").value = password;
    showLogin();
    await login();
  } catch (e) {
    setSignupStatus(e.message || "Signup error");
  }
}

function doLogout() {
  auth.token = "";
  auth.user  = null;
  setStatus("Logged out", true);
  updateAccountButton();
  updateLoginUI();
  setTimeout(() => overlay && (overlay.style.display = "none"), 400);
}

// --------------------
// UI updates (plain text username in navbar)
// --------------------
function updateAccountButton() {
  const btn = document.getElementById("loginBtn");
  if (!btn) return;

  if (auth.user) {
    const name = auth.user?.name || auth.user?.username || auth.user?.email || "User";
    btn.textContent = name; // Plain text like other navbar words
  } else {
    btn.textContent = "Login";
  }
}

// --------------------
// Activity Logger
// --------------------
// Requires an "activities" collection with fields:
// user (relation->users), action (text), meta (json), path (text)
export async function logActivity(action, meta = {}) {
  if (!auth.token || !auth.user) return; // only log when logged in
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
  } catch (_) {
    // ignore logging errors to avoid UI impact
  }
}

// Auto logging for some events
document.addEventListener("DOMContentLoaded", () => {
  updateAccountButton();
  logActivity("page_view", { title: document.title, ref: document.referrer }).catch(() => {});
  document.querySelectorAll(".navbar-links a").forEach(a => {
    a.addEventListener("click", () => {
      logActivity("nav_click", { href: a.getAttribute("href") || "", id: a.id || "" }).catch(() => {});
    });
  });
});

// Expose for other scripts to log custom events
window.PBAuth = { auth, logActivity, openModal, showLogin, showSignup };
