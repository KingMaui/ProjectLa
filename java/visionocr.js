// visionocr.js
// Camera + upload + OCR + dropdown behavior

(function () {
  const video = document.getElementById("cameraPreview");
  const startBtn = document.getElementById("startCamera");
  const stopBtn = document.getElementById("stopCamera");
  const captureBtn = document.getElementById("captureFrame");

  const statusEl = document.getElementById("cameraStatus");
  const ocrStatusEl = document.getElementById("ocrStatus");

  const canvas = document.getElementById("captureCanvas");
  const imgEl = document.getElementById("capturedImage");
  const ocrOutput = document.getElementById("ocrOutput");

  const fileInput = document.getElementById("fileInput");
  const runFileOcrBtn = document.getElementById("runFileOcrBtn");
  const fileInputBtn = document.getElementById("fileInputBtn");


  const cameraToggle = document.getElementById("cameraToggle");
  const cameraPanel = document.getElementById("cameraPanel");
  const uploadToggle = document.getElementById("uploadToggle");
  const uploadPanel = document.getElementById("uploadPanel");

  if (!canvas || !ocrOutput) {
    console.warn("[visionocr.js] Required DOM elements not found. Check IDs.");
    return;
  }

  let currentStream = null;

  function setCameraStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function setOcrStatus(msg) {
    if (ocrStatusEl) ocrStatusEl.textContent = msg;
  }

  async function startCamera() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus("Camera API not supported in this browser.");
        return;
      }

      if (currentStream) return; // already running

      const constraints = {
        video: { facingMode: "environment" },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      currentStream = stream;
      if (video) video.srcObject = stream;

      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
      if (captureBtn) captureBtn.disabled = false;

      setCameraStatus("Camera is on.");
    } catch (err) {
      console.error("[visionocr.js] Error starting camera:", err);
      setCameraStatus("Unable to access camera.");
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      if (captureBtn) captureBtn.disabled = true;
    }
  }

  function stopCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
    if (video) video.srcObject = null;

    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (captureBtn) captureBtn.disabled = true;

    setCameraStatus("Camera is off.");
  }

  // Core OCR runner using Tesseract on the current canvas
  async function runOcrOnCanvas() {
    if (!window.Tesseract) {
      setOcrStatus("OCR library (Tesseract) not loaded.");
      return "";
    }

    setOcrStatus("Running OCR…");
    setCameraStatus("Running OCR…");

    try {
      const {
        data: { text },
      } = await Tesseract.recognize(canvas, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            const pct = Math.round((m.progress || 0) * 100);
            setOcrStatus("Recognizing text… " + pct + "%");
          }
        },
      });

      const finalText = text || "";
      ocrOutput.value = finalText;
      setOcrStatus("OCR complete. You can edit the text below.");

      return finalText;
    } catch (err) {
      console.error("[visionocr.js] OCR error:", err);
      setOcrStatus("Error running OCR. Please try again.");
      setCameraStatus("OCR error.");
      return "";
    }
  }

  // Camera capture + OCR
  async function captureAndRunOcr() {
    if (!currentStream || !video || !video.videoWidth || !video.videoHeight) {
      setOcrStatus("Camera not ready. Try again.");
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    // show image preview
    canvas.toBlob(
      (blob) => {
        if (!blob || !imgEl) return;
        const url = URL.createObjectURL(blob);
        imgEl.src = url;
        imgEl.style.display = "block";
      },
      "image/jpeg",
      0.9
    );

    try {
      await runOcrOnCanvas();
      setCameraStatus("OCR complete. Camera stopped.");
    } finally {
      // stop the camera after each Capture + OCR
      stopCamera();
    }
  }

  // Draw an uploaded image file onto canvas
  function drawImageFileToCanvas(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const maxDim = 1600;
          let { width, height } = img;

          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // preview
          canvas.toBlob(
            (blob) => {
              if (!blob || !imgEl) {
                resolve();
                return;
              }
              const url = URL.createObjectURL(blob);
              imgEl.src = url;
              imgEl.style.display = "block";
              resolve();
            },
            "image/jpeg",
            0.9
          );
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // File upload OCR handler (images only for now)
  async function runFileOcr() {
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      setOcrStatus("Please choose an image file first.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setOcrStatus("Unsupported file type. Use an image (jpg, png, etc.).");
      return;
    }

    ocrOutput.value = "";
    setOcrStatus("Preparing file for OCR…");

    try {
      await drawImageFileToCanvas(file);
      await runOcrOnCanvas();
    } catch (err) {
      console.error("[visionocr.js] File OCR error:", err);
      setOcrStatus("Error processing file. Please try again.");
    }
  }
  const fileNameDisplay = document.getElementById("fileNameDisplay");

  if (fileInput) {
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    let name = file.name;

    // Optional: shorten very long names but keep extension
    if (name.length > 40) {
      const parts = name.split(".");
      const ext = parts.length > 1 ? "." + parts.pop() : "";
      const base = parts.join(".");
      const shortBase = base.length > 20 ? base.slice(0, 20) + "…" : base;
      name = shortBase + ext;
    }

    if (fileNameDisplay) {
      fileNameDisplay.textContent = "Selected: " + name;
      fileNameDisplay.style.display = "block";
    }
  } else if (fileNameDisplay) {
    fileNameDisplay.style.display = "none";
  }
});

}


if (fileInputBtn) {
  fileInputBtn.addEventListener("click", () => {
    if (fileInput) fileInput.click();
  });
}

  // Simple accordion behavior
function setupToggle(toggleBtn, panel) {
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener("click", () => {
    const isOpen = panel.classList.contains("open");

    if (isOpen) {
      panel.classList.remove("open");
      toggleBtn.classList.remove("open");
    } else {
      panel.classList.add("open");
      toggleBtn.classList.add("open");
    }
  });
}

  // Init dropdowns (both collapsed by default)
  setupToggle(cameraToggle, cameraPanel);
  setupToggle(uploadToggle, uploadPanel);

  // Event listeners
  if (startBtn) startBtn.addEventListener("click", startCamera);
  if (stopBtn) stopBtn.addEventListener("click", stopCamera);
  if (captureBtn) captureBtn.addEventListener("click", captureAndRunOcr);
  if (runFileOcrBtn) runFileOcrBtn.addEventListener("click", runFileOcr);

  window.addEventListener("beforeunload", stopCamera);
})();
