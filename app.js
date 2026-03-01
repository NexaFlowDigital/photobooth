(() => {
  const CONFIG = window.PHOTOBOOTH_CONFIG || { GAS_POST_URL: "" };

  // Elements
  const video = document.getElementById("video");
  const frameOverlay = document.getElementById("frameOverlay");

  const chipDot = document.getElementById("chipDot");
  const chipText = document.getElementById("chipText");

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

  const home = document.getElementById("home");
  const beginBtn = document.getElementById("beginBtn");

  // Mobile frames (template picker)
  const framesEl = document.getElementById("frames");
  const framesMobileEl = document.getElementById("framesMobile");
  const toggleFramesBtn = document.getElementById("toggleFramesBtn");
  const mobileFramesWrap = document.getElementById("mobileFramesWrap");

  const boothEl = document.querySelector(".booth");

  // Settings
  const SHOTS = 3;
  const COUNTDOWN_SECONDS = 3;

  // These are your “templates/frames” (same assets)
  const FRAMES = [
    { name: "Gathering Classic", src: "assets/frames/frame-gathering-classic.png" },
    { name: "Killough Maroon",   src: "assets/frames/frame-killough-maroon.png" },
    { name: "Farmers Night",     src: "assets/frames/frame-farmers-night.png" },
    { name: "Texas Star",        src: "assets/frames/frame-texas-star.png" },
  ];

  let selectedFrame = 0;
  let stream = null;
  let stripDataUrl = "";
  let busy = false;

  // ---------- UI helpers ----------
  function setChip(state, text) {
    chipText.textContent = text;
    chipDot.classList.remove("ok", "warn", "bad");
    chipDot.classList.add(state);
  }

  function setButtonsEnabled(enabled) {
    if (startBtn) startBtn.disabled = !enabled;
    if (resetBtn) resetBtn.disabled = !enabled;
    if (startBtnMobile) startBtnMobile.disabled = !enabled;
    if (resetBtnMobile) resetBtnMobile.disabled = !enabled;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function showPrompt(text, ms = 900) {
    promptEl.textContent = text;
    promptEl.classList.add("show");
    if (ms > 0) setTimeout(() => promptEl.classList.remove("show"), ms);
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

    steps.forEach(s => setTimeout(() => { flashEl.style.opacity = s.o; }, s.t));

    setTimeout(() => {
      flashEl.style.transition = "opacity 220ms ease";
      flashEl.style.opacity = 0;
    }, 260);
  }

  // ---------- Template picker ----------
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

  // ---------- Camera ----------
  async function ensureCamera() {
    if (stream) return true;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
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

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * IMPORTANT FIX:
   * Capture crops to the SAME aspect ratio as the booth you see on-screen.
   * This prevents phone portrait camera from producing tall/odd-looking strip photos.
   */
  async function captureWithOverlay() {
    if (!video.videoWidth || !video.videoHeight) await sleep(200);

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const targetAspect = (() => {
      const bw = boothEl?.clientWidth || 4;
      const bh = boothEl?.clientHeight || 3;
      return bw / bh;
    })();

    // Center-crop in SOURCE space to match target aspect
    const srcAspect = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;

    if (srcAspect > targetAspect) {
      // too wide -> crop width
      sw = Math.round(vh * targetAspect);
      sx = Math.round((vw - sw) / 2);
    } else {
      // too tall -> crop height
      sh = Math.round(vw / targetAspect);
      sy = Math.round((vh - sh) / 2);
    }

    // Output size (keeps quality consistent)
    const outW = 1200;
    const outH = Math.round(outW / targetAspect);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    // Mirror like the preview
    ctx.save();
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    ctx.restore();

    // Overlay
    try {
      const overlay = await loadImage(FRAMES[selectedFrame].src);
      ctx.drawImage(overlay, 0, 0, outW, outH);
    } catch (e) {
      // ignore
    }

    return canvas.toDataURL("image/png", 0.92);
  }

  async function buildPhotoStrip(images) {
    const loaded = await Promise.all(images.map(loadImage));

    const stripW = 900;
    const photoW = stripW;

    // Use the captured image aspect (which now matches booth aspect across devices)
    const photoH = Math.round(photoW * (loaded[0].height / loaded[0].width));

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

  // ---------- Result modal ----------
  function openResult(dataUrl) {
    stripDataUrl = dataUrl;
    stripPreview.src = dataUrl;

    modal.style.display = "flex";
    document.body.classList.add("modalOpen");

    // ensure preview starts at top on desktop if any scroll exists
    const preview = document.querySelector(".preview");
    if (preview) {
      preview.scrollTop = 0;
      requestAnimationFrame(() => (preview.scrollTop = 0));
    }
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
    setChip(stream ? "ok" : "warn", stream ? "Camera ready" : "Tap Begin");
  }

  // Change: “Download” behaves like normal save/share sheet on iOS
  function saveStrip() {
    if (!stripDataUrl) return;

    const filename = `GOS_PhotoStrip_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;

    // iOS Safari: opening the image lets user "Save Image" easily
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      const w = window.open();
      if (w) {
        w.document.write(`<title>${filename}</title>`);
        w.document.write(`<img src="${stripDataUrl}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`);
      } else {
        // fallback: normal download
        const a = document.createElement("a");
        a.href = stripDataUrl;
        a.download = filename;
        a.click();
      }
      return;
    }

    // Desktop / others: download
    const a = document.createElement("a");
    a.href = stripDataUrl;
    a.download = filename;
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
      // text/plain avoids CORS preflight issues on iOS Safari
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

  // ---------- Session ----------
  async function startSession() {
    if (busy) return;
    busy = true;

    try {
      if (!stream) {
        alert("Tap BEGIN first.");
        busy = false;
        return;
      }

      setChip("warn", "Get ready…");
      showPrompt("Get ready for 3 photos", 1100);
      await sleep(850);

      setChip("warn", "Capturing…");
      if (startBtn) startBtn.disabled = true;
      if (startBtnMobile) startBtnMobile.disabled = true;

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
      openResult(strip);

      setChip("ok", "Done");
    } catch (e) {
      console.error(e);
      setChip("bad", "Capture error");
      alert("Capture error: " + (e?.message || e));
    } finally {
      if (startBtn) startBtn.disabled = false;
      if (startBtnMobile) startBtnMobile.disabled = false;
      busy = false;
    }
  }

  // ---------- Events ----------
  if (toggleFramesBtn && mobileFramesWrap) {
    toggleFramesBtn.addEventListener("click", () => {
      const open = mobileFramesWrap.classList.toggle("open");
      toggleFramesBtn.textContent = open ? "HIDE" : "SHOW";
    });
  }

  beginBtn.addEventListener("click", async () => {
    const ok = await ensureCamera();
    if (!ok) return;
    home.style.display = "none";
    showPrompt("Choose a template, then press Start", 1200);
  });

  if (startBtn) startBtn.addEventListener("click", startSession);
  if (resetBtn) resetBtn.addEventListener("click", startOver);
  if (startBtnMobile) startBtnMobile.addEventListener("click", startSession);
  if (resetBtnMobile) resetBtnMobile.addEventListener("click", startOver);

  downloadBtn.addEventListener("click", saveStrip);
  emailBtn.addEventListener("click", emailStrip);
  startOverBtn.addEventListener("click", startOver);

  // Init
  buildFramePickerDesktop();
  buildFramePickerMobile();
  setFrame(0);
  setButtonsEnabled(false);
  setChip("warn", "Tap Begin");
})();
