// camera.js
// Simple camera feed for VisionOCR (front-end only, no backend)

/* globals navigator */

(function () {
  const video = document.getElementById("cameraPreview");
  const startBtn = document.getElementById("startCamera");
  const stopBtn = document.getElementById("stopCamera");
  const cameraSelect = document.getElementById("cameraSelect");
  const statusEl = document.getElementById("cameraStatus");

  if (!video || !startBtn || !stopBtn || !cameraSelect || !statusEl) {
    // Not on the OCR page or markup missing – do nothing.
    return;
  }

  let currentStream = null;
  let devicesLoaded = false;

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? "crimson" : "";
  }

  function stopStream() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
  }

  async function loadCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setStatus("Camera not supported in this browser.", true);
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === "videoinput");

      cameraSelect.innerHTML = "";

      if (videoDevices.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No camera found";
        cameraSelect.appendChild(opt);
        cameraSelect.disabled = true;
        setStatus("No camera found on this device.", true);
        return;
      }

      videoDevices.forEach((device, index) => {
        const opt = document.createElement("option");
        opt.value = device.deviceId || "";
        opt.textContent = device.label || `Camera ${index + 1}`;
        cameraSelect.appendChild(opt);
      });

      cameraSelect.disabled = false;
      devicesLoaded = true;
    } catch (err) {
      console.error("enumerateDevices error:", err);
      setStatus("Unable to list cameras.", true);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera not supported in this browser.", true);
      return;
    }

    setStatus("Requesting camera access…", false);
    startBtn.disabled = true;
    stopBtn.disabled = true;

    try {
      if (!devicesLoaded) {
        await loadCameras();
      }

      stopStream();

      const selectedId = cameraSelect.value;
      const constraints = {
        audio: false,
        video: selectedId
          ? { deviceId: { exact: selectedId } }
          : { facingMode: "environment" }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      currentStream = stream;

      video.srcObject = stream;
      await video.play();

      setStatus("Camera is on.", false);
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } catch (err) {
      console.error("getUserMedia error:", err);
      if (err.name === "NotAllowedError") {
        setStatus("Camera permission was denied.", true);
      } else if (err.name === "NotFoundError") {
        setStatus("No camera found on this device.", true);
      } else {
        setStatus("Could not start camera.", true);
      }
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  }

  function stopCamera() {
    stopStream();
    setStatus("Camera is off.", false);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }

  // Event listeners
  startBtn.addEventListener("click", startCamera);
  stopBtn.addEventListener("click", stopCamera);
  cameraSelect.addEventListener("change", () => {
    if (currentStream) {
      startCamera().catch(() => {});
    }
  });

  // Try to pre-load camera list (will only succeed after permission in some browsers)
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices()
      .then(() => loadCameras())
      .catch(() => {
        // silently ignore – we'll try again when starting the camera
      });
  }
})();
