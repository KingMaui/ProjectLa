
(function () {
  const video = document.getElementById("cameraPreview");
  const startBtn = document.getElementById("startCamera");
  const stopBtn = document.getElementById("stopCamera");
  const captureBtn = document.getElementById("captureFrame");

  const statusEl = document.getElementById("cameraStatus");
  const ocrStatusEl = document.getElementById("ocrStatus") || document.getElementById("captureHint");

  const canvas = document.getElementById("captureCanvas");
  const imgEl = document.getElementById("capturedImage");
  const ocrOutput = document.getElementById("ocrOutput");

  if (!video || !startBtn || !stopBtn || !captureBtn || !canvas || !ocrOutput) {
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
      video.srcObject = stream;

      startBtn.disabled = true;
      stopBtn.disabled = false;
      captureBtn.disabled = false;

      setCameraStatus("Camera is on.");
    } catch (err) {
      console.error("[visionocr.js] Error starting camera:", err);
      setCameraStatus("Unable to access camera.");
      startBtn.disabled = false;
      stopBtn.disabled = true;
      captureBtn.disabled = true;
    }
  }

  function stopCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
    video.srcObject = null;

    startBtn.disabled = false;
    stopBtn.disabled = true;
    captureBtn.disabled = true;

    setCameraStatus("Camera is off.");
  }

  async function captureAndRunOcr() {
    if (!currentStream || !video.videoWidth || !video.videoHeight) {
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

    if (!window.Tesseract) {
      setOcrStatus("OCR library not loaded.");
      return;
    }

    setOcrStatus("Running OCR…");
    setCameraStatus("Running OCR…");

    try {
      const { data: { text } } = await Tesseract.recognize(canvas, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            const pct = Math.round((m.progress || 0) * 100);
            setOcrStatus("Recognizing text… " + pct + "%");
          }
        },
      });

      ocrOutput.value = text || "";
      setOcrStatus("OCR complete. You can edit the text below.");
      setCameraStatus("Camera is on. OCR complete.");
    } catch (err) {
      console.error("[visionocr.js] OCR error:", err);
      setOcrStatus("Error running OCR. Please try again.");
      setCameraStatus("OCR error.");
    }
  }

  startBtn.addEventListener("click", startCamera);
  stopBtn.addEventListener("click", stopCamera);
  captureBtn.addEventListener("click", captureAndRunOcr);

  window.addEventListener("beforeunload", stopCamera);
})();
