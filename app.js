/* app.js — Full file (Photo + GIF + Boomerang) + Email for ALL + Better download types */
(() => {
  const CONFIG = window.PHOTOBOOTH_CONFIG || { GAS_POST_URL: "" };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const topTitleSub = $("topTitleSub");
  const mobileSub = $("mobileSub");

  const screenMode = $("screenMode");
  const screenTemplate = $("screenTemplate");
  const screenInstructions = $("screenInstructions");
  const screenCapture = $("screenCapture");

  const modePhotoBtn = $("modePhotoBtn");
  const modeGifBtn = $("modeGifBtn");
  const modeBoomBtn = $("modeBoomBtn");
  const modeContinueBtn = $("modeContinueBtn");

  const framesEl = $("frames");
  const templateBackBtn = $("templateBackBtn");
  const templateContinueBtn = $("templateContinueBtn");

  const instructionsSub = $("instructionsSub");
  const instructionsBackBtn = $("instructionsBackBtn");
  const beginCaptureBtn = $("beginCaptureBtn");

  const frameOverlay = $("frameOverlay");
  const video = $("video");
  const boothEl = document.querySelector(".booth");

  const chipDot = $("chipDot");
  const chipText = $("chipText");

  const flashEl = $("flash");
  const countdownEl = $("countdown");
  const promptEl = $("prompt");

  const startBtn = $("startBtn");
  const resetBtn = $("resetBtn");
  const startBtnMobile = $("startBtnMobile");
  const resetBtnMobile = $("resetBtnMobile");

  const modal = $("modal");
  const stripPreview = $("stripPreview");
  const animPreview = $("animPreview");
  const resultTitle = $("resultTitle");
  const resultSub = $("resultSub");

  const downloadBtn = $("downloadBtn");
  const emailInput = $("emailInput");
  const emailBtn = $("emailBtn");
  const startOverBtn = $("startOverBtn");

  // ---------- CONFIG ----------
  const MODES = { PHOTO: "photo", GIF: "gif", BOOM: "boom" };

  // Photo strip
  const SHOTS = 3;
  const COUNTDOWN_SECONDS = 3;

  // GIF (3 stills -> animated loop)
  const GIF_SHOTS = 3;
  const GIF_FPS = 2;
  const GIF_LOOP_SECONDS = 4; // exported as video (mp4/webm)

  // BOOMERANG timing
  const BOOM_RECORD_MS = 1200; // actual “recording” time
  const BOOM_FPS = 18;
  const BOOM_EXPORT_MS = 2400; // forward + reverse export length

  // Make sure these file paths exist in your repo.
  const FRAMES = [
  { name: "classic",    src: "assets/frames/classic.png" },
  { name: "Lewisville", src: "assets/frames/Lewisville.png" },
  { name: "LHS",        src: "assets/frames/LHS.png" },
  { name: "Gathering",  src: "assets/frames/Gathering.png" },
];

  // ---------- STATE ----------
  let selectedMode = null;
  let selectedFrame = 0;

  let stream = null;
  let busy = false;

  // Results
  let stripDataUrl = "";        // photo result (png dataURL)
  let animBlobUrl = "";         // animation result (objectURL)
  let animMime = "";            // recorder mime
  let lastResultType = "photo"; // "photo" | "anim"

  // ---------- UI HELPERS ----------
  function setChip(state, text) {
    chipText.textContent = text;
    chipDot.classList.remove("ok", "warn", "bad");
    chipDot.classList.add(state);
  }

  function showPrompt(text, ms = 900) {
    if (!promptEl) return;
    promptEl.textContent = text;
    promptEl.classList.add("show");
    if (ms > 0) setTimeout(() => promptEl.classList.remove("show"), ms);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function showCountdown(n) {
    countdownEl.style.opacity = 1;
    countdownEl.textContent = String(n);
  }
  function hideCountdown() {
    countdownEl.style.opacity = 0;
    countdownEl.textContent = "";
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
    steps.forEach((s) => setTimeout(() => { flashEl.style.opacity = s.o; }, s.t));

    setTimeout(() => {
      flashEl.style.transition = "opacity 220ms ease";
      flashEl.style.opacity = 0;
    }, 260);
  }

  function setButtonsEnabled(enabled) {
    startBtn.disabled = !enabled;
    resetBtn.disabled = !enabled;
    startBtnMobile.disabled = !enabled;
    resetBtnMobile.disabled = !enabled;
  }

  function setScreen(activeEl) {
    [screenMode, screenTemplate, screenInstructions, screenCapture].forEach((el) => {
      if (!el) return;
      el.classList.toggle("show", el === activeEl);
    });

    const captureActive = activeEl === screenCapture;
    document.body.classList.toggle("captureActive", captureActive);

    // top labels
    if (captureActive) {
      topTitleSub.textContent = "Capture";
      mobileSub.textContent = "Capture";
    } else if (activeEl === screenMode) {
      topTitleSub.textContent = "Choose a mode";
      mobileSub.textContent = "Photobooth";
    } else if (activeEl === screenTemplate) {
      topTitleSub.textContent = "Choose a template";
      mobileSub.textContent = "Template";
    } else if (activeEl === screenInstructions) {
      topTitleSub.textContent = "Instructions";
      mobileSub.textContent = "Instructions";
    }
  }

  // ---------- FRAMES ----------
  function buildFramePicker() {
    framesEl.innerHTML = "";
    FRAMES.forEach((f, i) => {
      const card = document.createElement("div");
      card.className = "frameCard" + (i === selectedFrame ? " selected" : "");
      card.addEventListener("click", () => {
        selectedFrame = i;
        frameOverlay.src = FRAMES[i].src;
        syncFrameSelectedUI();
        templateContinueBtn.disabled = false;
      });

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

  // ---------- CAMERA ----------
  async function ensureCamera() {
    if (stream) return true;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      video.srcObject = stream;

      await new Promise((resolve) => {
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

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Crop capture to match booth aspect ratio
  async function captureWithOverlay() {
    if (!video.videoWidth || !video.videoHeight) await sleep(200);

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const boothW = boothEl?.clientWidth || 4;
    const boothH = boothEl?.clientHeight || 3;
    const targetAspect = boothW / boothH;

    const srcAspect = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;

    if (srcAspect > targetAspect) {
      sw = Math.round(vh * targetAspect);
      sx = Math.round((vw - sw) / 2);
    } else {
      sh = Math.round(vw / targetAspect);
      sy = Math.round((vh - sh) / 2);
    }

    const outW = 1200;
    const outH = Math.round(outW / targetAspect);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    // mirror like preview
    ctx.save();
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    ctx.restore();

    try {
      const overlay = await loadImage(FRAMES[selectedFrame].src);
      ctx.drawImage(overlay, 0, 0, outW, outH);
    } catch (e) {}

    return canvas.toDataURL("image/png", 0.92);
  }

  async function buildPhotoStrip(images) {
    const loaded = await Promise.all(images.map(loadImage));

    const stripW = 900;
    const photoW = stripW;
    const photoH = Math.round(photoW * (loaded[0].height / loaded[0].width));
    const gap = 20, headerH = 120, footerH = 160;

    const totalH =
      headerH + (photoH * loaded.length) + (gap * (loaded.length - 1)) + footerH;

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
    for (let i = 0; i < loaded.length; i++) {
      ctx.drawImage(loaded[i], 0, y, photoW, photoH);
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

  // ---------- ANIMATION HELPERS (Video export: tries MP4 then WebM) ----------
  function revokeAnimUrl() {
    if (animBlobUrl) {
      URL.revokeObjectURL(animBlobUrl);
      animBlobUrl = "";
    }
  }

  function pickRecorderMime() {
    // MP4 is NOT widely supported in MediaRecorder (Chrome usually NO, Safari sometimes YES).
    // We try anyway, then fall back to WebM.
    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  function mimeToExtension(mime) {
    const m = (mime || "").toLowerCase();
    if (m.includes("mp4")) return "mp4";
    if (m.includes("webm")) return "webm";
    return "webm";
  }

  async function drawSquareFrameToCanvas(ctx, size) {
    if (!video.videoWidth || !video.videoHeight) await sleep(120);

    const vw = video.videoWidth, vh = video.videoHeight;

    // square crop from center of source
    const side = Math.min(vw, vh);
    const sx = Math.floor((vw - side) / 2);
    const sy = Math.floor((vh - side) / 2);

    // mirror like preview
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    ctx.restore();

    try {
      const overlayImg = await loadImage(FRAMES[selectedFrame].src);
      ctx.drawImage(overlayImg, 0, 0, size, size);
    } catch (e) {}
  }

  async function recordCanvasVideo(canvas, fps, ms) {
    const stream2 = canvas.captureStream(fps);
    const mime = pickRecorderMime();
    animMime = mime || "video/webm";

    return await new Promise((resolve, reject) => {
      const chunks = [];
      let rec;
      try {
        rec = mime ? new MediaRecorder(stream2, { mimeType: mime }) : new MediaRecorder(stream2);
      } catch (err) {
        reject(err);
        return;
      }

      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = (e) => reject(e.error || e);

      rec.onstop = () => {
        try {
          const blob = new Blob(chunks, { type: animMime });
          resolve(blob);
        } catch (err) {
          reject(err);
        }
      };

      rec.start(100);
      setTimeout(() => {
        try { rec.stop(); } catch (e) {}
      }, ms);
    });
  }

  // ---------- RESULT MODAL ----------
  function openResultPhoto(dataUrl) {
    lastResultType = "photo";
    stripDataUrl = dataUrl;

    revokeAnimUrl();
    animPreview.pause();
    animPreview.classList.remove("show");
    animPreview.removeAttribute("src");

    resultTitle.textContent = "Your Photo Strip";
    resultSub.textContent = "Download it or email it to yourself.";

    stripPreview.src = dataUrl;
    stripPreview.classList.add("show");

    // email enabled
    emailBtn.disabled = false;
    emailInput.disabled = false;

    modal.style.display = "flex";
    document.body.classList.add("modalOpen");
  }

  function openResultAnim(blob) {
    revokeAnimUrl();
    lastResultType = "anim";
    stripDataUrl = "";

    animBlobUrl = URL.createObjectURL(blob);
    const ext = mimeToExtension(animMime);

    resultTitle.textContent = selectedMode === MODES.BOOM ? "Your Boomerang" : "Your GIF";
    resultSub.textContent =
      (selectedMode === MODES.BOOM)
        ? `Recorded ${Math.round(BOOM_RECORD_MS / 100) / 10}s • Download video (${ext.toUpperCase()}) or email it`
        : `3-photo loop • About ${GIF_LOOP_SECONDS}s • Download video (${ext.toUpperCase()}) or email it`;

    stripPreview.classList.remove("show");
    stripPreview.removeAttribute("src");

    animPreview.src = animBlobUrl;
    animPreview.classList.add("show");
    animPreview.currentTime = 0;
    animPreview.play().catch(() => {});

    // email ENABLED for animations now
    emailBtn.disabled = false;
    emailInput.disabled = false;

    modal.style.display = "flex";
    document.body.classList.add("modalOpen");
  }

  function closeResult() {
    modal.style.display = "none";
    document.body.classList.remove("modalOpen");
  }

  function resetCaptureState() {
    closeResult();

    stripDataUrl = "";
    stripPreview.src = "";
    stripPreview.classList.remove("show");

    revokeAnimUrl();
    animPreview.pause();
    animPreview.classList.remove("show");
    animPreview.removeAttribute("src");

    emailInput.value = "";
    emailBtn.disabled = false;
    emailInput.disabled = false;

    setChip(stream ? "ok" : "warn", stream ? "Camera ready" : "Ready");
    showPrompt("Press START when ready", 1200);
  }

  // ---------- DOWNLOAD ----------
  async function downloadResult() {
    const isAnim = lastResultType === "anim";
    const isMobile = matchMedia("(max-width: 980px)").matches;

    async function dataUrlToBlob(dataUrl) {
      const res = await fetch(dataUrl);
      return await res.blob();
    }

    let blob, filename, mime;

    if (isAnim) {
      if (!animBlobUrl) return;
      blob = await (await fetch(animBlobUrl)).blob();
      mime = animMime || blob.type || "video/webm";
      const ext = mimeToExtension(mime);

      filename = `GOS_${selectedMode === MODES.BOOM ? "Boomerang" : "GIF"}_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.${ext}`;
    } else {
      if (!stripDataUrl) return;
      mime = "image/png";
      blob = await dataUrlToBlob(stripDataUrl);
      filename = `GOS_PhotoStrip_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    }

    // Mobile share sheet if possible
    if (isMobile && navigator.share) {
      try {
        const file = new File([blob], filename, { type: mime });
        const canShareFiles = !navigator.canShare || navigator.canShare({ files: [file] });
        if (canShareFiles) {
          await navigator.share({
            files: [file],
            title: "Photo Booth Download",
            text: "Save or share your photo booth result.",
          });
          return;
        }
      } catch (e) {
        // user canceled or share failed -> fall back to normal download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // ---------- EMAIL (Photo + Animations) ----------
  async function blobToBase64(blob) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // reader.result is "data:...;base64,AAAA"
        const s = String(reader.result || "");
        const comma = s.indexOf(",");
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
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

    emailBtn.disabled = true;
    setChip("warn", "Sending email…");

    try {
      let payloadObj;

      if (lastResultType === "photo") {
        if (!stripDataUrl) throw new Error("No photo available to email.");
        payloadObj = {
          email,
          type: "photo",
          filename: `GOS_PhotoStrip_${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
          mimeType: "image/png",
          pngDataUrl: stripDataUrl,
        };
      } else {
        if (!animBlobUrl) throw new Error("No animation available to email.");
        const blob = await (await fetch(animBlobUrl)).blob();
        const mime = animMime || blob.type || "video/webm";
        const ext = mimeToExtension(mime);
        const base64 = await blobToBase64(blob);

        payloadObj = {
          email,
          type: selectedMode === MODES.BOOM ? "boomerang" : "gif",
          filename: `GOS_${selectedMode === MODES.BOOM ? "Boomerang" : "GIF"}_${new Date()
            .toISOString()
            .replace(/[:.]/g, "-")}.${ext}`,
          mimeType: mime,
          fileBase64: base64,
        };
      }

      // Keep text/plain to avoid CORS preflight issues with Apps Script
      const payload = JSON.stringify(payloadObj);

      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload,
      });

      setChip("ok", "Email sent");
      alert("Sent! Check your email (and spam/junk just in case).");
    } catch (e) {
      console.error(e);
      setChip("bad", "Email failed");
      alert("Email failed. Check your Apps Script deployment + permissions.");
    } finally {
      emailBtn.disabled = false;
    }
  }

  // ---------- CAPTURE MODES ----------
  async function runPhotoCapture() {
    setChip("warn", "Get ready…");
    showPrompt("You’ll take 3 photos", 1200);
    await sleep(900);

    startBtn.disabled = true;
    startBtnMobile.disabled = true;

    const shots = [];
    for (let s = 1; s <= SHOTS; s++) {
      showPrompt(`Photo ${s} of ${SHOTS} • Say cheese`, 950);

      for (let t = COUNTDOWN_SECONDS; t >= 1; t--) {
        showCountdown(t);
        await sleep(900);
      }
      hideCountdown();

      flashFlicker();
      shots.push(await captureWithOverlay());
      await sleep(450);
    }

    setChip("warn", "Building strip…");
    const strip = await buildPhotoStrip(shots);
    openResultPhoto(strip);
    setChip("ok", "Done");
  }

  async function runGifCapture() {
    const size = 720;

    setChip("warn", "Get ready…");
    showPrompt(`You’ll take ${GIF_SHOTS} photos`, 1200);
    await sleep(900);

    startBtn.disabled = true;
    startBtnMobile.disabled = true;

    const stills = [];

    for (let s = 1; s <= GIF_SHOTS; s++) {
      showPrompt(`GIF photo ${s} of ${GIF_SHOTS}`, 900);

      for (let t = COUNTDOWN_SECONDS; t >= 1; t--) {
        showCountdown(t);
        await sleep(900);
      }
      hideCountdown();

      flashFlicker();

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      await drawSquareFrameToCanvas(ctx, size);

      stills.push(await createImageBitmap(canvas));
      await sleep(450);
    }

    setChip("warn", "Building GIF…");
    showPrompt("Building animation…", 900);

    const out = document.createElement("canvas");
    out.width = size;
    out.height = size;
    const outCtx = out.getContext("2d");

    let frameIndex = 0;
    let playing = true;

    const playback = () => {
      if (!playing) return;
      outCtx.clearRect(0, 0, size, size);
      outCtx.drawImage(stills[frameIndex], 0, 0, size, size);
      frameIndex = (frameIndex + 1) % stills.length;
      setTimeout(playback, Math.round(1000 / GIF_FPS));
    };

    playback();

    const blob = await recordCanvasVideo(out, GIF_FPS, GIF_LOOP_SECONDS * 1000);
    playing = false;

    stills.forEach((b) => b.close && b.close());

    openResultAnim(blob);
    setChip("ok", "Done");
  }

  async function runBoomerangCapture() {
    const size = 720;
    const fps = BOOM_FPS;

    setChip("warn", "Boomerang recording…");
    showPrompt(`Recording ${Math.round(BOOM_RECORD_MS / 100) / 10}s — keep moving`, 1200);

    const captureMs = BOOM_RECORD_MS;
    const totalMs = BOOM_EXPORT_MS;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const frames = [];
    const temp = document.createElement("canvas");
    temp.width = size;
    temp.height = size;
    const tctx = temp.getContext("2d");

    const start = performance.now();
    while (performance.now() - start < captureMs) {
      await drawSquareFrameToCanvas(tctx, size);
      const bmp = await createImageBitmap(temp);
      frames.push(bmp);
      await sleep(1000 / fps);
    }

    let i = 0;
    let dir = 1;
    let playing = true;

    const playback = async () => {
      if (!playing) return;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(frames[i], 0, 0, size, size);

      i += dir;
      if (i >= frames.length - 1) dir = -1;
      if (i <= 0 && dir === -1) dir = 1;

      setTimeout(playback, Math.round(1000 / fps));
    };

    playback();
    const blob = await recordCanvasVideo(canvas, fps, totalMs);
    playing = false;

    frames.forEach((b) => b.close && b.close());

    openResultAnim(blob);
    setChip("ok", "Done");
  }

  // ---------- MAIN SESSION ----------
  async function startSession() {
    if (busy) return;
    busy = true;

    try {
      if (!stream) {
        setChip("warn", "Starting camera…");
        const ok = await ensureCamera();
        if (!ok) return;
      }

      if (selectedMode === MODES.GIF) {
        setChip("warn", "Capturing GIF…");
        await runGifCapture();
        return;
      }

      if (selectedMode === MODES.BOOM) {
        await runBoomerangCapture();
        return;
      }

      await runPhotoCapture();
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

  // ---------- FLOW ----------
  function selectMode(mode) {
    selectedMode = mode;

    [modePhotoBtn, modeGifBtn, modeBoomBtn].forEach((b) => b.classList.remove("selected"));
    if (mode === MODES.PHOTO) modePhotoBtn.classList.add("selected");
    if (mode === MODES.GIF) modeGifBtn.classList.add("selected");
    if (mode === MODES.BOOM) modeBoomBtn.classList.add("selected");

    modeContinueBtn.disabled = false;
    setChip("warn", "Mode selected");
  }

  function updateInstructionsCopy() {
    if (selectedMode === MODES.PHOTO) {
      instructionsSub.textContent =
        "You’ll take 3 photos. Hold still during each countdown. We’ll combine them into a photo strip.";
      return;
    }

    if (selectedMode === MODES.GIF) {
      instructionsSub.textContent =
        `You’ll take ${GIF_SHOTS} photos. After the last shot, we’ll combine them into a looping animation (about ${GIF_LOOP_SECONDS}s).`;
      return;
    }

    if (selectedMode === MODES.BOOM) {
      instructionsSub.textContent =
        `Boomerang records for ${Math.round(BOOM_RECORD_MS / 100) / 10}s. Start moving when you press START and keep moving until it finishes.`;
      return;
    }

    instructionsSub.textContent = "Choose a mode first.";
  }

  // ---------- EVENTS ----------
  modePhotoBtn.addEventListener("click", () => selectMode(MODES.PHOTO));
  modeGifBtn.addEventListener("click", () => selectMode(MODES.GIF));
  modeBoomBtn.addEventListener("click", () => selectMode(MODES.BOOM));

  modeContinueBtn.addEventListener("click", () => {
    if (!selectedMode) return;
    setScreen(screenTemplate);
    setChip("warn", "Choose a template");
  });

  templateBackBtn.addEventListener("click", () => {
    setScreen(screenMode);
    setChip("warn", "Choose a mode");
  });

  templateContinueBtn.addEventListener("click", () => {
    updateInstructionsCopy();
    setScreen(screenInstructions);
    setChip("warn", "Read instructions");
  });

  instructionsBackBtn.addEventListener("click", () => {
    setScreen(screenTemplate);
    setChip("warn", "Choose a template");
  });

  beginCaptureBtn.addEventListener("click", async () => {
    setScreen(screenCapture);
    setChip("warn", "Starting camera…");
    const ok = await ensureCamera();
    if (!ok) return;
    showPrompt("Press START when ready", 1200);
  });

  startBtn.addEventListener("click", startSession);
  startBtnMobile.addEventListener("click", startSession);

  resetBtn.addEventListener("click", resetCaptureState);
  resetBtnMobile.addEventListener("click", resetCaptureState);

  downloadBtn.addEventListener("click", downloadResult);
  emailBtn.addEventListener("click", emailResult);
  startOverBtn.addEventListener("click", resetCaptureState);

  // ---------- INIT ----------
  buildFramePicker();
  frameOverlay.src = FRAMES[0].src;

  modeContinueBtn.disabled = true;
  templateContinueBtn.disabled = true;

  setButtonsEnabled(false);
  setScreen(screenMode);
  setChip("warn", "Choose a mode");
})();
