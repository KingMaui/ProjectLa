// contact-sumbit.js
import PocketBase from "https://unpkg.com/pocketbase@0.21.3/dist/pocketbase.es.mjs";

const PB_URL = window.PB_URL || "https://pb.junxieliang.com";
const pb = new PocketBase(PB_URL);

async function pbDiagnostics() {
  try {
    const res = await fetch(`${PB_URL}/api/health`, { cache: "no-store" });
    const ok = res.ok;
    const text = await res.text().catch(() => "");
    console.group("%cPocketBase Diagnostics", "color:#0aa;padding:2px 6px;border:1px solid #0aa;border-radius:4px;");
    console.log("Health endpoint status:", res.status, ok ? "OK" : "NOT OK");
    console.log("Health endpoint body:", text);
    console.log("Using PB_URL:", PB_URL);
    console.log("Site protocol:", location.protocol);
    console.log("CORS note: Make sure your PB allows this site origin.");
    console.groupEnd();
  } catch (e) {
    console.group("%cPocketBase Diagnostics", "color:#a00;padding:2px 6px;border:1px solid #a00;border-radius:4px;");
    console.error("Health check failed:", e);
    console.groupEnd();
  }
}

function setStatus(msg, ok = false) {
  const el = document.getElementById("contactStatus");
  if (el) {
    el.textContent = msg || "";
    el.style.color = ok ? "green" : "crimson";
  } else {
    // fallback
    if (msg) (ok ? console.log : console.error)(msg);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Prefer the modal form; otherwise any .contact-form on the page
  const form = document.getElementById("contactFormModal") || document.querySelector(".contact-form");
  if (!form) {
    console.warn("No contact form found.");
    return;
  }

  pbDiagnostics();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = document.getElementById("fullName")?.value?.trim() || "";
    const email = document.getElementById("email")?.value?.trim() || "";
    const message = document.getElementById("message")?.value?.trim() || "";

    if (!fullName || !email || !message) {
      setStatus("Please fill out name, email, and message.");
      return;
    }

    const submitBtn = form.querySelector("[type=submit]");
    if (submitBtn) submitBtn.disabled = true;
    setStatus("Sending...");

    try {
      // Collection "messages" should have fields: fullName (text), email (email), message (text)
      const record = await pb.collection("messages").create({ fullName, email, message });
      setStatus("Message sent successfully!", true);
      form.reset();
      console.log("Created record:", record);

      // optional: auto-close after success
      setTimeout(() => {
        if (window.ContactModal?.close) window.ContactModal.close();
      }, 800);
    } catch (err) {
      const payload = err?.response || err;
      console.error("Submission error:", payload);
      setStatus("Failed to send message. Please try again.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
