  import PocketBase from "https://unpkg.com/pocketbase@0.21.3/dist/pocketbase.es.mjs";

  const pb = new PocketBase("http://170.9.3.173:8080");

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector(".contact-form");
    if (!form) {
      console.warn("No .contact-form found on this page.");
      return;
    }

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
      submitBtn && (submitBtn.disabled = true);

      try {
        const record = await pb.collection("messages").create({ name, email, message });
        alert("Message sent successfully!");
        form.reset();
        console.log("Created record:", record);
      } catch (err) {
        console.error("Submission error:", err?.response || err?.message || err);
        alert("Failed to send message.");
      } finally {
        submitBtn && (submitBtn.disabled = false);
      }
    });
  });
