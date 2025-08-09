import PocketBase from "https://unpkg.com/pocketbase@0.21.3/dist/pocketbase.es.mjs";


const PB_URL = "https://pb.junxieliang.com";
const pb = new PocketBase(PB_URL);

// Helpful startup diagnostics in the console
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
    console.log("CORS note: Make sure pb.junxieliang.com allows your site origin in PocketBase settings.");
    console.groupEnd();
  } catch (e) {
    console.group("%cPocketBase Diagnostics", "color:#a00;padding:2px 6px;border:1px solid #a00;border-radius:4px;");
    console.error("Health check failed to fetch:", e);
    console.groupEnd();
  }
}

// Warn if site is HTTPS but PB is HTTP (mixed content) — not expected now
if (location.protocol === "https:" && PB_URL.startsWith("http://")) {
  console.error("Mixed content: Your site is HTTPS but PocketBase is HTTP. Put PB behind HTTPS.");
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".contact-form");
  if (!form) {
    console.warn("No .contact-form found on this page.");
    return;
  }

  // Run diagnostics as soon as the page loads (visible in browser devtools)
  pbDiagnostics();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("fullName")?.value?.trim() || "";
    const email = document.getElementById("email")?.value?.trim() || "";
    const message = document.getElementById("message")?.value?.trim() || "";

    if (!name || !email || !message) {
      alert("Please fill out name, email, and message.");
      return;
    }

    const submitBtn = form.querySelector("[type=submit]");
    if (submitBtn) submitBtn.disabled = true;

    try {
      // Try creating a record in collection "messages"
      // Ensure this collection exists in PB with fields: name (text), email (email), message (text)
      // and that the Create rule allows unauthenticated: leave rule empty or set to true.
      const record = await pb.collection("messages").create({ name, email, message });
      alert("Message sent successfully!");
      form.reset();
      console.log("Created record:", record);
    } catch (err) {
      // Surface PocketBase JSON errors in console
      const payload = (err && err.response) ? err.response : err;
      console.error("Submission error:", payload);
      alert("Failed to send message. See console for details.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
