(() => {
  const CONFIG = window.PHOTOBOOTH_CONFIG || { GAS_POST_URL: "" };

  // Screens
  const screenMode = document.getElementById("screenMode");
  const screenTemplate = document.getElementById("screenTemplate");
  const screenInstructions = document.getElementById("screenInstructions");
  const screenCapture = document.getElementById("screenCapture");

  // Header
  const topTitleSub = document.getElementById("topTitleSub");
  const mobileSub = document.getElementById("mobileSub");

  // Status chip
  const chipDot = document.getElementById("chipDot");
  const chipText = document.getElementById("chipText");

  // Mode buttons
  const modePhotoBtn = document.getElementById("modePhotoBtn");
  const modeGifBtn = document.getElementById("modeGifBtn");
  const modeBoomBtn = document.getElementById("modeBoomBtn");
  const modeContinueBtn = document.getElementById("modeContinueBtn");

  // Template screen buttons
  const templateBackBtn = document.getElementById("templateBackBtn");
  const templateContinueBtn = document.getElementById("templateContinueBtn");

  // Instructions screen buttons
  const instructionsBackBtn = document.getElementById("instructionsBackBtn");
  const beginCaptureBtn = document.getElementById("beginCaptureBtn");
  const instructionsSub = document.getElementById("instructionsSub");

  // Capture + UI
  const framesEl = document.getElementById("frames");
  const frameOverlay = document.getElementById("frameOverlay");
  const video = document.getElementById("video");

  const flashEl = document.getElementById("flash");
  const countdownEl = document.getElementById("countdown");
  const promptEl = document.getElementById("prompt");

  // Capture controls
  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");
  const startBtnMobile = document.getElementById("startBtnMobile");
  const resetBtnMobile = document.getElementById("resetBtnMobile");

  // Result modal
  const modal = document.getElementById("modal");
  const stripPreview = document.getElementById("stripPreview");
  const animPreview = document.getElementById("animPreview");
  const downloadBtn = document.getElementById("downloadBtn");
  const emailInput = document.getElementById("emailInput");
  const emailBtn = document.getElementById("emailBtn");
  const startOverBtn = document.getElementById("startOverBtn");
  const resultTitle = document.getElementById("resultTitle");
  const resultSub = document.getElementById("resultSub");
  const emailNote = document.getElementById("emailNote");

  // Config
  const PHOTO_SHOTS = 3;
  const COUNTDOWN_SECONDS = 3;

  const MODE = {
    PHOTO: "photo",
    GIF: "gif",
    BOOM: "boom"
  };

  const FRAMES = [
    { name: "Gathering Classic", src: "assets/frames/frame-gathering-classic.png" },
    { name: "Killough Maroon",   src: "assets/frames/frame-killough-maroon.png" },
    { name: "Farmers Night",     src: "assets/frames/frame-farmers-night.png" },
    { name: "Texas Star",        src: "assets/frames/frame-texas-star.png" },
  ];

  let selectedMode = null;
  let selectedFrame = 0;

  let stream = null;
  let busy = false;

  // Results
  let resultKind = "image";   // "image" | "video"
  let resultDataUrl = "";     // for image (PNG)
  let resultBlobUrl = "";     // for video (WEBM)
  let resultFilename = "";

  function setChip(state, text) {
    chipText.textContent = text;
    chipDot.classList.remove("ok", "warn", "bad");
    chipDot.classList.add(state);
  }

  function showScreen(el) {
    [screenMode, screenTemplate, screenInstructions, screenCapture].forEach(s => {
      if (s) s.classList.remove("show");
    });
    el.classList.add("show");
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function showPrompt(text, ms = 900) {
    promptEl.textContent = text;
    promptEl.classList.add("show");
    if (ms > 0) setTimeout(() => promptEl.classList.remove("show"), ms);
  }

  function flashFlicker() {
    flashEl.style.transition = "none";
    flashEl.style.opacity = 0.0;

    const steps = [
      { o: 0.95, t: 0 },
      { o: 0.00, t: 80 },
      { o: 0.70, t: 140 },
      { o: 0.00, t: 220 },
    ];

    steps.forEach(s => setTimeout(() => { flashEl.style.opacity = s.o; }, s.t));

    setTimeout(() => {
      flashEl.style.transition = "opacity 220ms ease";
      flashEl.style.opacity = 0;
    }, 260);
  }

  function showCountdown(n) {
    countdownEl.style.opacity = 1;
    countdownEl.textContent = String(n);
  }
  function hideCountdown() {
    countdownEl.style.opacity = 0;
    countdownEl.textContent = "";
  }

  function setButtonsEnabled(enabled) {
    startBtn.disabled = !enabled;
    resetBtn.disabled = !enabled;
    startBtnMobile.disabled = !enabled;
    resetBtnMobile.disabled = !enabled;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function buildFramePicker() {
    framesEl.innerHTML = "";
    FRAMES.forEach((f, i) => {
      const card = document.createElement("div");
      card.className = "frameCard" + (i === selectedFrame ? " selected" : "");
      card.addEventListener("click", () => setFrame(i));

      const thumb = document.createElement("div");
      thumb.className = "frameThumb";
      const img = document.createElement("img");
      img.src = f.src;
      thumb.appendChild(img);

      const name = document.createElement("div");
      name.className = "frameName";
      name.textContent = f.name;

      card.appendChild(thumb);
      card.appendChild(name);
      framesEl.appendChild(card);
    });
  }

  function syncFrameSelectedUI() {
    [...document.querySelectorAll(".frameCard")].forEach((el, idx) => {
      el.classList.toggle("selected", idx === selectedFrame);
    });
  }

  function setFrame(i) {
    selectedFrame = i;
    frameOverlay.src = FRAMES[i].src;
    syncFrameSelectedUI();
  }

  function setMode(mode) {
    selectedMode = mode;

    [modePhotoBtn, modeGifBtn, modeBoomBtn].forEach(b => b.classList.remove("selected"));
    if (mode === MODE.PHOTO) modePhotoBtn.classList.add("selected");
    if (mode === MODE.GIF) modeGifBtn.classList.add("selected");
    if (mode === MODE.BOOM) modeBoomBtn.classList.add("selected");

    modeContinueBtn.disabled = false;

    if (mode === MODE.PHOTO) {
      topTitleSub.textContent = "Photo mode";
      mobileSub.textContent = "Photo mode";
      setChip("ok", "Photo selected");
      instructionsSub.textContent = "You’ll take 3 photos automatically.";
    } else if (mode === MODE.GIF) {
      topTitleSub.textContent = "GIF mode";
      mobileSub.textContent = "GIF mode";
      setChip("ok", "GIF selected");
      instructionsSub.textContent = "You’ll capture a short animated square.";
    } else if (mode === MODE.BOOM) {
      topTitleSub.textContent = "Boomerang mode";
      mobileSub.textContent = "Boomerang mode";
      setChip("ok", "Boomerang selected");
      instructionsSub.textContent = "You’ll capture forward + reverse motion.";
    }
  }

  async function ensureCamera() {
    if (stream) return true;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      video.srcObject = stream;

      await new Promise(resolve => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      setButtonsEnabled(true);
      setChip("ok", "Camera ready");
      return true;
    } catch (e) {
      console.error(e);
      setChip("bad", "Camera blocked");
      alert("Camera blocked. Allow camera for this site, then refresh.");
      return false;
    }
  }

  // Capture a mirrored frame and apply the selected overlay.
  // If square=true, center-crops to square (for GIF/Boomerang).
  async function captureWithOverlay({ square = false } = {}) {
    if (!video.videoWidth || !video.videoHeight) await sleep(200);

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // base canvas size
    let w = vw;
    let h = vh;

    // for square: take the smallest side and crop center
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (square) {
      const side = Math.min(vw, vh);
      sw = sh = side;
      sx = Math.floor((vw - side) / 2);
      sy = Math.floor((vh - side) / 2);
      w = h = side;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // mirror draw
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);

    // draw from cropped source
    // when mirrored, we need to draw the crop region mapped to canvas
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();

    // overlay scaled to canvas size
    try {
      const overlay = await loadImage(FRAMES[selectedFrame].src);
      ctx.drawImage(overlay, 0, 0, w, h);
    } catch (e) {}

    return canvas.toDataURL("image/png", 0.92);
  }

  async function buildPhotoStrip(images) {
    const loaded = await Promise.all(images.map(loadImage));

    // strip size
    const stripW = 900;
    const photoW = stripW;

    // Keep the “desktop look” consistently: use the first image aspect ratio.
    const photoH = Math.round(photoW * (loaded[0].height / loaded[0].width));

    const gap = 20, headerH = 120, footerH = 160;
    const totalH = headerH + (photoH * loaded.length) + (gap * (loaded.length - 1)) + footerH;

    const c = document.createElement("canvas");
    c.width = stripW;
    c.height = totalH;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, c.width, c.height);

    // header
    ctx.fillStyle = "#6b1020";
    ctx.fillRect(0, 0, stripW, headerH);
    ctx.fillStyle = "#fff";
    ctx.font = "900 52px Arial";
    ctx.fillText("THE GATHERING", 28, 68);
    ctx.font = "900 36px Arial";
    ctx.fillText("ON SUMMIT • LHS KILLOUGH", 28, 108);

    let y = headerH;
    for (let i = 0; i < loaded.length; i++) {
      ctx.drawImage(loaded[i], 0, y, photoW, photoH);
      y += photoH + gap;
    }

    // footer
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, c.height - footerH, stripW, footerH);
    ctx.fillStyle = "#fff";
    ctx.font = "900 34px Arial";
    ctx.fillText("GATHERING ON SUMMIT 2026", 28, c.height - 92);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 22px Arial";
    ctx.fillText(new Date().toLocaleString(), 28, c.height - 52);

    // border
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, c.width - 24, c.height - 24);

    return c.toDataURL("image/png", 0.92);
  }

  function openResultImage({ dataUrl, filename, title, sub }) {
    resultKind = "image";
    resultDataUrl = dataUrl;
    resultBlobUrl = "";
    resultFilename = filename;

    // show image, hide video
    stripPreview.src = dataUrl;
    stripPreview.classList.add("show");
    animPreview.classList.remove("show");
    animPreview.removeAttribute("src");
    animPreview.load();

    resultTitle.textContent = title;
    resultSub.textContent = sub;

    // Email enabled for image
    emailBtn.disabled = false;
    emailInput.disabled = false;
    emailNote.textContent = "Tip: for social apps, download first and share from Photos.";

    modal.style.display = "flex";
  }

  function openResultVideo({ blobUrl, posterDataUrl, filename, title, sub }) {
    resultKind = "video";
    resultDataUrl = posterDataUrl || ""; // used for email fallback
    resultBlobUrl = blobUrl;
    resultFilename = filename;

    // show video, hide image
    stripPreview.classList.remove("show");
    stripPreview.removeAttribute("src");

    animPreview.src = blobUrl;
    animPreview.classList.add("show");
    animPreview.play().catch(() => {});

    resultTitle.textContent = title;
    resultSub.textContent = sub;

    // Email: we can only email a PNG via your current GAS (so send poster frame)
    emailBtn.disabled = false;
    emailInput.disabled = false;
    emailNote.textContent = "Email sends a still image. For the animation, use DOWNLOAD.";

    modal.style.display = "flex";
  }

  function closeResult() {
    modal.style.display = "none";
  }

  function startOver() {
    closeResult();
    resultKind = "image";
    resultDataUrl = "";
    if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
    resultBlobUrl = "";
    resultFilename = "";
    emailInput.value = "";
    setChip(stream ? "ok" : "warn", stream ? "Camera ready" : "Ready");
  }

  function downloadResult() {
    if (resultKind === "image") {
      if (!resultDataUrl) return;
      const a = document.createElement("a");
      a.href = resultDataUrl;
      a.download = resultFilename || `GOS_PhotoStrip_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      a.click();
      return;
    }

    // video
    if (!resultBlobUrl) return;
    const a = document.createElement("a");
    a.href = resultBlobUrl;
    a.download = resultFilename || `GOS_Animation_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    a.click();
  }

  async function emailResult() {
    const url = (CONFIG.GAS_POST_URL || "").trim();
    if (!url) {
      alert("Email is not configured. Add your Apps Script URL in config.js.");
      return;
    }

    const email = emailInput.value.trim();
    if (!email) {
      alert("Enter your email.");
      return;
    }

    // For video mode: we only email a still image (poster frame)
    if (!resultDataUrl) {
      alert("No image available to email. Use DOWNLOAD.");
      return;
    }

    emailBtn.disabled = true;
    setChip("warn", "Sending email…");

    const payload = JSON.stringify({ email, pngDataUrl: resultDataUrl });

    try {
      // text/plain avoids CORS preflight on iOS Safari
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload
      });

      setChip("ok", "Email sent");
      alert("Sent! Check your email.");
    } catch (e) {
      console.error(e);
      setChip("bad", "Email failed");
      alert("Email failed. Check your Apps Script deployment access.");
    } finally {
      emailBtn.disabled = false;
    }
  }

  // ===== Animated capture (GIF/Boom) using MediaRecorder on canvas stream =====
  function supportsMediaRecorder() {
    return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined";
  }

  async function recordCanvasAnimation(framesDataUrls, { boomerang = false, fps = 12 } = {}) {
    const imgs = await Promise.all(framesDataUrls.map(loadImage));
    const size = 720;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // build playback list
    let seq = imgs.slice();
    if (boomerang) seq = imgs.concat(imgs.slice().reverse());

    // draw loop
    let idx = 0;
    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);

      const img = seq[idx];
      // cover fit
      const scale = Math.max(size / img.width, size / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);

      idx = (idx + 1) % seq.length;
    };

    // start capturing stream
    const stream = canvas.captureStream(fps);

    // pick a mime type that’s likely available
    const preferred = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];
    const mimeType = preferred.find(t => MediaRecorder.isTypeSupported(t)) || "";

    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

    // animate during recording
    const intervalMs = Math.round(1000 / fps);
    const timer = setInterval(draw, intervalMs);
    draw();

    rec.start();

    // record length: about 2.2 seconds (adjust by frames count)
    const durationMs = Math.max(1800, Math.min(3200, seq.length * intervalMs));
    await sleep(durationMs);

    rec.stop();
    clearInterval(timer);

    await new Promise(resolve => rec.onstop = resolve);

    const blob = new Blob(chunks, { type: chunks[0]?.type || "video/webm" });
    return URL.createObjectURL(blob);
  }

  async function startSession() {
    if (busy) return;
    busy = true;

    try {
      if (!stream) {
        setChip("bad", "Camera not ready");
        alert("Camera not ready. Go back and press START NOW.");
        return;
      }

      // PHOTO MODE (strip)
      if (selectedMode === MODE.PHOTO) {
        setChip("warn", "Get ready…");
        showPrompt("Get ready for 3 photos", 1200);
        await sleep(850);

        setChip("warn", "Capturing…");
        startBtn.disabled = true;
        startBtnMobile.disabled = true;

        const shots = [];
        for (let s = 1; s <= PHOTO_SHOTS; s++) {
          showPrompt(`Photo ${s} of ${PHOTO_SHOTS} • Say cheese`, 950);

          for (let t = COUNTDOWN_SECONDS; t >= 1; t--) {
            showCountdown(t);
            await sleep(900);
          }
          hideCountdown();

          flashFlicker();
          shots.push(await captureWithOverlay({ square: false }));
          await sleep(450);
        }

        setChip("warn", "Building strip…");
        const strip = await buildPhotoStrip(shots);
        openResultImage({
          dataUrl: strip,
          filename: `GOS_PhotoStrip_${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
          title: "Your Photo Strip",
          sub: "Download it or email it to yourself."
        });

        setChip("ok", "Done");
        return;
      }

      // GIF / BOOMERANG MODE (animated square)
      if (!supportsMediaRecorder()) {
        alert("Animated capture is not supported on this browser. Switching to Photo mode.");
        setMode(MODE.PHOTO);
        return;
      }

      setChip("warn", "Get ready…");
      showPrompt(selectedMode === MODE.GIF ? "Capturing animation" : "Capturing boomerang", 1200);
      await sleep(700);

      startBtn.disabled = true;
      startBtnMobile.disabled = true;

      // capture a series of square frames quickly
      const frameCount = 14;
      const frames = [];
      for (let i = 0; i < frameCount; i++) {
        // quick flicker on first and last looks “photo booth”
        if (i === 0 || i === frameCount - 1) flashFlicker();
        frames.push(await captureWithOverlay({ square: true }));
        await sleep(90);
      }

      setChip("warn", "Building animation…");
      const blobUrl = await recordCanvasAnimation(frames, {
        boomerang: selectedMode === MODE.BOOM,
        fps: 12
      });

      // Use the first frame as a poster (email still)
      const poster = frames[0];

      openResultVideo({
        blobUrl,
        posterDataUrl: poster,
        filename: selectedMode === MODE.GIF
          ? `GOS_GIF_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`
          : `GOS_Boomerang_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
        title: selectedMode === MODE.GIF ? "Your GIF" : "Your Boomerang",
        sub: "Download to save. Email sends a still image."
      });

      setChip("ok", "Done");
    } catch (e) {
      console.error(e);
      setChip("bad", "Capture error");
      alert("Capture error: " + (e?.message || e));
    } finally {
      startBtn.disabled = false;
      startBtnMobile.disabled = false;
      busy = false;
    }
  }

  // ===== Navigation =====
  function goMode() {
    showScreen(screenMode);
    topTitleSub.textContent = "Choose a mode";
    mobileSub.textContent = "Photobooth";
    setChip("warn", "Ready");
  }
  function goTemplate() {
    showScreen(screenTemplate);
    topTitleSub.textContent = "Choose a template";
    mobileSub.textContent = "Choose template";
    setChip("warn", "Pick a template");
  }
  function goInstructions() {
    showScreen(screenInstructions);
    topTitleSub.textContent = "Instructions";
    mobileSub.textContent = "Instructions";
    setChip("warn", "Almost ready");
  }
  async function goCapture() {
    showScreen(screenCapture);
    topTitleSub.textContent = "Capture";
    mobileSub.textContent = "Capture";
    setChip("warn", "Starting camera…");

    const ok = await ensureCamera();
    if (!ok) return;

    setChip("ok", "Camera ready");
    showPrompt("Press START when ready", 1200);
  }

  // ===== Mode selection handlers =====
  modePhotoBtn.addEventListener("click", () => setMode(MODE.PHOTO));
  modeGifBtn.addEventListener("click", () => setMode(MODE.GIF));
  modeBoomBtn.addEventListener("click", () => setMode(MODE.BOOM));

  modeContinueBtn.addEventListener("click", () => {
    if (!selectedMode) return;
    goTemplate();
  });

  // template nav
  templateBackBtn.addEventListener("click", goMode);
  templateContinueBtn.addEventListener("click", () => {
    goInstructions();
  });

  // instructions nav
  instructionsBackBtn.addEventListener("click", goTemplate);
  beginCaptureBtn.addEventListener("click", async () => {
    await goCapture();
  });

  // capture buttons
  startBtn.addEventListener("click", startSession);
  resetBtn.addEventListener("click", () => {
    // Reset goes back to template selection (keeps mode)
    startOver();
    goTemplate();
  });

  startBtnMobile.addEventListener("click", startSession);
  resetBtnMobile.addEventListener("click", () => {
    startOver();
    goTemplate();
  });

  // result buttons
  downloadBtn.addEventListener("click", downloadResult);
  emailBtn.addEventListener("click", emailResult);
  startOverBtn.addEventListener("click", () => {
    startOver();
    goTemplate();
  });

  // init
  buildFramePicker();
  setFrame(0);
  setButtonsEnabled(false);
  goMode();
})();
