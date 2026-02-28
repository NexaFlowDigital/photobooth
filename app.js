(() => {
  const CONFIG = window.PHOTOBOOTH_CONFIG || { GAS_POST_URL: "" };

  // ====== DOM ======
  const chipDot = document.getElementById("chipDot");
  const chipText = document.getElementById("chipText");

  const frameOverlay = document.getElementById("frameOverlay");
  const video = document.getElementById("video");
  const flashEl = document.getElementById("flash");
  const countdownEl = document.getElementById("countdown");
  const promptEl = document.getElementById("prompt");

  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");
  const startBtnMobile = document.getElementById("startBtnMobile");
  const resetBtnMobile = document.getElementById("resetBtnMobile");

  const modal = document.getElementById("modal");
  const stripPreview = document.getElementById("stripPreview");
  const downloadBtn = document.getElementById("downloadBtn");
  const emailInput = document.getElementById("emailInput");
  const emailBtn = document.getElementById("emailBtn");
  const startOverBtn = document.getElementById("startOverBtn");

  const framesEl = document.getElementById("frames");
  const framesMobileEl = document.getElementById("framesMobile");
  const toggleFramesBtn = document.getElementById("toggleFramesBtn");
  const mobileFramesWrap = document.getElementById("mobileFramesWrap");

  // NEW multi-screen elements (must exist in index.html with these IDs)
  const screenHome = document.getElementById("screenHome");
  const screenTemplates = document.getElementById("screenTemplates");
  const screenInstructions = document.getElementById("screenInstructions");
  const screenCapture = document.getElementById("screenCapture");

  const modePhotoBtn = document.getElementById("modePhotoBtn");
  const modeGifBtn = document.getElementById("modeGifBtn");
  const modeBoomBtn = document.getElementById("modeBoomBtn");

  const toTemplatesBtn = document.getElementById("toTemplatesBtn");
  const toInstructionsBtn = document.getElementById("toInstructionsBtn");
  const backToHomeBtn = document.getElementById("backToHomeBtn");
  const backToTemplatesBtn = document.getElementById("backToTemplatesBtn");
  const beginCaptureBtn = document.getElementById("beginCaptureBtn");

  const appTitleEl = document.getElementById("appTitle"); // top-left title text

  // ====== Settings ======
  const MODES = { PHOTO: "photo", GIF: "gif", BOOM: "boomerang" };

  const SHOTS = 3;                 // for PHOTO strip
  const COUNTDOWN_SECONDS = 3;

  // For GIF / Boomerang (simple MVP)
  const GIF_FRAMES = 10;
  const GIF_INTERVAL_MS = 120;

  // IMPORTANT: keep the output strip "vertical" like desktop (avoid portrait stretch)
  const STRIP_W = 900;
  const STRIP_PHOTO_ASPECT = 4 / 3; // width:height for each photo area (matches desktop-like)

  const FRAMES = [
    { name: "Gathering Classic", src: "assets/frames/frame-gathering-classic.png" },
    { name: "Killough Maroon",   src: "assets/frames/frame-killough-maroon.png" },
    { name: "Farmers Night",     src: "assets/frames/frame-farmers-night.png" },
    { name: "Texas Star",        src: "assets/frames/frame-texas-star.png" },
  ];

  // ====== State ======
  let selectedFrame = 0;
  let stream = null;
  let busy = false;
  let stripDataUrl = "";
  let currentMode = MODES.PHOTO;

  // ====== Helpers ======
  function setChip(state, text) {
    chipText.textContent = text;
    chipDot.classList.remove("ok", "warn", "bad");
    chipDot.classList.add(state);
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

  function showScreen(which) {
    const all = [screenHome, screenTemplates, screenInstructions, screenCapture];
    all.forEach(el => { if (el) el.style.display = "none"; });
    if (which) which.style.display = "block";

    // When leaving capture, stop nested scroll surprises
    if (which === screenCapture) document.body.classList.add("inCapture");
    else document.body.classList.remove("inCapture");
  }

  function setAppTitle(text) {
    if (appTitleEl) appTitleEl.textContent = text;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ====== Frames UI ======
  function buildFramePickerDesktop() {
    if (!framesEl) return;
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

  function buildFramePickerMobile() {
    if (!framesMobileEl) return;
    framesMobileEl.innerHTML = "";
    FRAMES.forEach((f, i) => {
      const pill = document.createElement("div");
      pill.className = "framePill" + (i === selectedFrame ? " selected" : "");
      pill.addEventListener("click", () => setFrame(i));

      const img = document.createElement("img");
      img.src = f.src;

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = f.name;

      pill.appendChild(img);
      pill.appendChild(name);
      framesMobileEl.appendChild(pill);
    });
  }

  function syncFrameSelectedUI() {
    [...document.querySelectorAll(".frameCard")].forEach((el, idx) => {
      el.classList.toggle("selected", idx === selectedFrame);
    });
    [...document.querySelectorAll(".framePill")].forEach((el, idx) => {
      el.classList.toggle("selected", idx === selectedFrame);
    });
  }

  function setFrame(i) {
    selectedFrame = i;
    frameOverlay.src = FRAMES[i].src;
    syncFrameSelectedUI();
  }

  // ====== Camera ======
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

  // Capture a frame at the *output aspect ratio* (avoid tall portrait on mobile)
  function drawVideoCover(ctx, videoEl, outW, outH) {
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return;

    const outAspect = outW / outH;
    const vidAspect = vw / vh;

    let sx = 0, sy = 0, sw = vw, sh = vh;

    if (vidAspect > outAspect) {
      // video wider than output -> crop sides
      sw = Math.round(vh * outAspect);
      sx = Math.round((vw - sw) / 2);
    } else {
      // video taller than output -> crop top/bottom
      sh = Math.round(vw / outAspect);
      sy = Math.round((vh - sh) / 2);
    }

    // mirror for selfie
    ctx.save();
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, outW, outH);
    ctx.restore();
  }

  async function captureWithOverlay(outW, outH) {
    if (!video.videoWidth || !video.videoHeight) await sleep(200);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    drawVideoCover(ctx, video, outW, outH);

    try {
      const overlay = await loadImage(FRAMES[selectedFrame].src);
      ctx.drawImage(overlay, 0, 0, outW, outH);
    } catch (e) {}

    return canvas.toDataURL("image/png", 0.92);
  }

  // ====== Photo Strip ======
  async function buildPhotoStrip(images) {
    const loaded = await Promise.all(images.map(loadImage));

    const stripW = STRIP_W;
    const photoW = stripW;

    // force a consistent desktop-like photo height (4:3)
    const photoH = Math.round(photoW / STRIP_PHOTO_ASPECT);

    const gap = 20, headerH = 120, footerH = 160;
    const totalH = headerH + (photoH * loaded.length) + (gap * (loaded.length - 1)) + footerH;

    const c = document.createElement("canvas");
    c.width = stripW;
    c.height = totalH;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "#6b1020";
    ctx.fillRect(0, 0, stripW, headerH);
    ctx.fillStyle = "#fff";
    ctx.font = "900 52px Arial";
    ctx.fillText("THE GATHERING", 28, 68);
    ctx.font = "900 36px Arial";
    ctx.fillText("ON SUMMIT • LHS KILLOUGH", 28, 108);

    let y = headerH;

    // Draw each captured image "cover" into the photo slot (keeps consistent look)
    for (let i = 0; i < loaded.length; i++) {
      const img = loaded[i];
      const outAspect = photoW / photoH;
      const imgAspect = img.width / img.height;

      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgAspect > outAspect) {
        sw = Math.round(img.height * outAspect);
        sx = Math.round((img.width - sw) / 2);
      } else {
        sh = Math.round(img.width / outAspect);
        sy = Math.round((img.height - sh) / 2);
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, y, photoW, photoH);
      y += photoH + gap;
    }

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, c.height - footerH, stripW, footerH);
    ctx.fillStyle = "#fff";
    ctx.font = "900 34px Arial";
    ctx.fillText("GATHERING ON SUMMIT 2026", 28, c.height - 92);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 22px Arial";
    ctx.fillText(new Date().toLocaleString(), 28, c.height - 52);

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, c.width - 24, c.height - 24);

    return c.toDataURL("image/png", 0.92);
  }

  // ====== Result modal ======
  function openResult(dataUrl) {
    stripDataUrl = dataUrl;
    stripPreview.src = dataUrl;
    modal.style.display = "flex";
    document.body.classList.add("modalOpen");

    // hard reset scroll
    requestAnimationFrame(() => {
      modal.scrollTop = 0;
    });
  }

  function closeResult() {
    modal.style.display = "none";
    document.body.classList.remove("modalOpen");
  }

  function startOver() {
    closeResult();
    stripDataUrl = "";
    stripPreview.src = "";
    emailInput.value = "";
    setChip(stream ? "ok" : "warn", stream ? "Camera ready" : "Tap Start");
    showScreen(screenHome);
    setAppTitle("The Gathering on Summit Photo Booth");
  }

  function downloadStrip() {
    if (!stripDataUrl) return;
    const a = document.createElement("a");
    a.href = stripDataUrl;
    a.download = `GOS_PhotoStrip_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    a.click();
  }

  async function emailStrip() {
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
    if (!stripDataUrl) return;

    emailBtn.disabled = true;
    setChip("warn", "Sending email…");

    const payload = JSON.stringify({ email, pngDataUrl: stripDataUrl });

    try {
      // text/plain avoids iOS CORS preflight
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload
      });

      // if Apps Script returns an error page, fetch still "succeeds" – check ok-ish
      if (!res.ok) throw new Error("HTTP " + res.status);

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

  // ====== Sessions ======
  async function runPhotoStrip() {
    setChip("warn", "Get ready…");
    showPrompt("Get ready for 3 photos", 1100);
    await sleep(850);

    setChip("warn", "Capturing…");
    const shots = [];

    // Use consistent output resolution for each shot
    const outW = 1280;
    const outH = 960; // 4:3

    for (let s = 1; s <= SHOTS; s++) {
      showPrompt(`Photo ${s} of ${SHOTS} • Say cheese`, 900);
      for (let t = COUNTDOWN_SECONDS; t >= 1; t--) {
        showCountdown(t);
        await sleep(900);
      }
      hideCountdown();

      flashFlicker();
      shots.push(await captureWithOverlay(outW, outH));
      await sleep(420);
    }

    setChip("warn", "Building strip…");
    const strip = await buildPhotoStrip(shots);
    openResult(strip);
    setChip("ok", "Done");
  }

  // Minimal “GIF/Boomerang” MVP: captures frames and builds a strip-like preview.
  // (We keep the existing Photo strip flow untouched.)
  async function runAltMode(kind) {
    setChip("warn", kind === MODES.GIF ? "Recording GIF…" : "Recording Boomerang…");
    showPrompt(kind === MODES.GIF ? "Recording…" : "Recording…", 900);

    const outW = 720;
    const outH = 540; // 4:3
    const frames = [];

    for (let i = 0; i < GIF_FRAMES; i++) {
      frames.push(await captureWithOverlay(outW, outH));
      await sleep(GIF_INTERVAL_MS);
    }

    // Boomerang = forward + reverse (excluding end duplicates)
    const seq = kind === MODES.BOOM
      ? frames.concat(frames.slice(1, -1).reverse())
      : frames;

    // For now: build a “strip” image from first 3 frames (keeps output consistent)
    const pick = [seq[0], seq[Math.floor(seq.length / 2)], seq[seq.length - 1]];
    setChip("warn", "Building strip…");
    const strip = await buildPhotoStrip(pick);
    openResult(strip);
    setChip("ok", "Done");
  }

  async function startSession() {
    if (busy) return;
    busy = true;

    try {
      if (!stream) {
        alert("Tap Start first.");
        return;
      }

      setButtonsEnabled(false);

      if (currentMode === MODES.PHOTO) {
        await runPhotoStrip();
      } else {
        await runAltMode(currentMode);
      }
    } catch (e) {
      console.error(e);
      setChip("bad", "Capture error");
      alert("Capture error: " + (e?.message || e));
    } finally {
      setButtonsEnabled(true);
      busy = false;
    }
  }

  // ====== Mobile frames toggle ======
  if (toggleFramesBtn && mobileFramesWrap) {
    toggleFramesBtn.addEventListener("click", () => {
      const open = mobileFramesWrap.classList.toggle("open");
      toggleFramesBtn.textContent = open ? "HIDE" : "SHOW";
    });
  }

  // ====== Navigation / Flow ======
  function setMode(mode) {
    currentMode = mode;
    const label =
      mode === MODES.PHOTO ? "Photo" :
      mode === MODES.GIF ? "GIF" : "Boomerang";

    setAppTitle(`The Gathering on Summit • ${label}`);
  }

  async function startFromHome(mode) {
    setMode(mode);

    const ok = await ensureCamera();
    if (!ok) return;

    // go templates
    showScreen(screenTemplates);
    showPrompt("Choose a frame", 900);
    setChip("ok", "Choose a frame");
  }

  // Home mode buttons
  if (modePhotoBtn) modePhotoBtn.addEventListener("click", () => startFromHome(MODES.PHOTO));
  if (modeGifBtn) modeGifBtn.addEventListener("click", () => startFromHome(MODES.GIF));
  if (modeBoomBtn) modeBoomBtn.addEventListener("click", () => startFromHome(MODES.BOOM));

  // Templates -> Instructions
  if (toInstructionsBtn) {
    toInstructionsBtn.addEventListener("click", () => {
      showScreen(screenInstructions);
      setChip("ok", "Ready");
    });
  }

  // Instructions -> Capture
  if (beginCaptureBtn) {
    beginCaptureBtn.addEventListener("click", () => {
      showScreen(screenCapture);
      showPrompt("Press Start when ready", 900);
      setChip("ok", "Camera ready");
    });
  }

  // Back buttons
  if (backToHomeBtn) backToHomeBtn.addEventListener("click", () => {
    showScreen(screenHome);
    setAppTitle("The Gathering on Summit Photo Booth");
    setChip(stream ? "ok" : "warn", stream ? "Camera ready" : "Tap a mode");
  });

  if (backToTemplatesBtn) backToTemplatesBtn.addEventListener("click", () => {
    showScreen(screenTemplates);
    setChip("ok", "Choose a frame");
  });

  // Existing capture controls
  startBtn.addEventListener("click", startSession);
  resetBtn.addEventListener("click", startOver);
  startBtnMobile.addEventListener("click", startSession);
  resetBtnMobile.addEventListener("click", startOver);

  // Result controls
  downloadBtn.addEventListener("click", downloadStrip);
  emailBtn.addEventListener("click", emailStrip);
  startOverBtn.addEventListener("click", startOver);

  // ====== Init ======
  buildFramePickerDesktop();
  buildFramePickerMobile();
  setFrame(0);
  setButtonsEnabled(false);

  showScreen(screenHome);
  setAppTitle("The Gathering on Summit Photo Booth");
  setChip("warn", "Choose a mode");
})();
