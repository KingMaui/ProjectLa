
const PB_URL = window.PB_URL || "https://pb.junxieliang.com";

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

const loginBtn = document.getElementById("loginBtn");
let overlay;

function ensureModal() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "login-modal-overlay";
  overlay.innerHTML = `
    <div class="login-modal" role="dialog" aria-modal="true">
      <h2 id="loginTitle">Account</h2>
      <div class="auth-panel">
        <div class="form-group">
          <label for="authEmail">Email</label>
          <input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email">
        </div>
        <div class="form-group">
          <label for="authPassword">Password</label>
          <input type="password" id="authPassword" placeholder="••••••••" autocomplete="current-password">
        </div>
        <div class="login-actions">
          <button class="primary" id="loginSubmit">Log in</button>
          <button id="signupSubmit">Sign up</button>
          <button id="logoutBtn" style="display:none">Log out</button>
          <button id="closeLogin">Close</button>
        </div>
        <div class="login-status" id="loginStatus"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.style.display = "none";
  });
  overlay.querySelector("#closeLogin").addEventListener("click", () => overlay.style.display = "none");
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

export async function logActivity(action, meta = {}) {
  if (!auth.token || !auth.user) return;
  try {
    await fetch(`${PB_URL}/api/collections/activities/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `User ${auth.token}`
      },
      body: JSON.stringify({
        user: auth.user.id,
        action,
        meta,
        path: location.pathname
      })
    });
  } catch (_) {
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateAccountButton();
  logActivity("page_view", { title: document.title, ref: document.referrer }).catch(() => {});
  document.querySelectorAll(".navbar-links a").forEach(a => {
    a.addEventListener("click", () => {
      logActivity("nav_click", { href: a.getAttribute("href") || "", id: a.id || "" }).catch(() => {});
    });
  });
});

window.PBAuth = { auth, logActivity, openModal };
