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
// UI: Build modal styled like contact modal
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
          <button class="login-secondary" id="signupSubmit" type="button">Sign up</button>
          <button class="login-secondary" id="logoutBtn" type="button" style="display:none">Log out</button>
        </div>
        <div class="login-status" id="loginStatus"></div>
      </form>
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

  return overlay;
}

function openModal() {
  ensureModal();
  overlay.style.display = "flex";
  updateLoginUI();
}

if (loginBtn) {
  loginBtn.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
}

function setStatus(msg, ok = false) {
  const el = document.getElementById("loginStatus");
  if (el) {
    el.textContent = msg || "";
    el.style.color = ok ? "green" : "crimson";
  }
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
    auth.user = data?.record || null;
    setStatus("Logged in", true);

    overlay?.querySelector("#logoutBtn")?.style?.setProperty("display", "inline-block");
    updateAccountButton();
    overlay && setTimeout(() => overlay.style.display = "none", 600);

    // Log activity: login
    logActivity("login", { ua: navigator.userAgent }).catch(() => {});
  } catch (e) {
    setStatus(e.message || "Login error");
  }
}

async function signup() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  setStatus("Creating account...");
  try {
    const createRes = await fetch(`${PB_URL}/api/collections/users/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, passwordConfirm: password })
    });
    if (!createRes.ok) throw new Error(await createRes.text() || "Signup failed");

    // Auto login
    await login();
  } catch (e) {
    setStatus(e.message || "Signup error");
  }
}

function doLogout() {
  auth.token = "";
  auth.user = null;
  setStatus("Logged out", true);
  updateAccountButton();
  overlay && setTimeout(() => overlay.style.display = "none", 400);
}

// --------------------
// UI updates (button text and chip)
// --------------------
function updateAccountButton() {
  const btn = document.getElementById("loginBtn");
  if (!btn) return;
  if (auth.user) {
    const name = auth.user?.name || auth.user?.username || auth.user?.email || "User";
    const initials = String(name).trim().slice(0, 2).toUpperCase();
    btn.innerHTML = `<span class="user-chip"><span class="user-initials">${initials}</span>${name}</span>`;
  } else {
    btn.textContent = "Login";
  }
  if (overlay) {
    overlay.querySelector("#logoutBtn").style.display = auth.user ? "inline-block" : "none";
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
window.PBAuth = { auth, logActivity, openModal };
