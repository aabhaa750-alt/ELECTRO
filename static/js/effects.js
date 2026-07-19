/* ============================================================
   ElectroMart Effects Engine
   - Sound effects generated live with the Web Audio API (no
     external audio files, so nothing to download and nothing
     that can 404).
   - Confetti / cracker bursts via the canvas-confetti library.
   - Floating balloons via lightweight CSS animation.
   - Optional soft background music (ambient pad, muted by default).
   - Periodic "flash message" offer ticker.
   Loaded once, globally, from base.html — every page gets it.
   ============================================================ */

const EM_FX = {
  soundOn: JSON.parse(localStorage.getItem("em_sound_on") ?? "true"),
  musicOn: JSON.parse(localStorage.getItem("em_music_on") ?? "false"),
  audioCtx: null,
  musicNodes: null,
};

function emGetAudioCtx() {
  if (!EM_FX.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    EM_FX.audioCtx = new Ctx();
  }
  if (EM_FX.audioCtx.state === "suspended") EM_FX.audioCtx.resume();
  return EM_FX.audioCtx;
}

function emTone(freq, duration = 0.15, type = "sine", startDelay = 0, volume = 0.18) {
  if (!EM_FX.soundOn) return;
  try {
    const ctx = emGetAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + startDelay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch (e) { /* audio not available - fail silently */ }
}

/* ---------- SFX presets ---------- */
function playAddToCartSound() {
  emTone(523.25, 0.09, "triangle", 0, 0.16);
  emTone(783.99, 0.12, "triangle", 0.07, 0.16);
}
function playSuccessSound() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => emTone(f, 0.16, "triangle", i * 0.09, 0.17));
}
function playCouponSound() {
  emTone(880, 0.1, "square", 0, 0.12);
  emTone(1174.66, 0.14, "square", 0.08, 0.12);
}
function playErrorSound() {
  emTone(220, 0.18, "sawtooth", 0, 0.13);
  emTone(160, 0.22, "sawtooth", 0.1, 0.13);
}
function playUnlockSound() {
  [659.25, 987.77, 1318.51].forEach((f, i) => emTone(f, 0.14, "sine", i * 0.06, 0.16));
}
function playClickSound() {
  emTone(700, 0.06, "sine", 0, 0.1);
}

/* ---------- Confetti & crackers (canvas-confetti) ---------- */
const EM_COLORS = ["#4f46e5", "#7c3aed", "#00d9ff", "#17c964", "#ffb020", "#ff3b5c"];

function fireConfetti(opts = {}) {
  if (typeof confetti !== "function") return;
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors: EM_COLORS, ...opts });
}

function fireCrackers() {
  if (typeof confetti !== "function") return;
  const end = Date.now() + 800;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors: ["#ff3b5c", "#ffb020", "#4f46e5"] });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors: ["#17c964", "#00d9ff", "#7c3aed"] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/* ---------- Floating balloons ---------- */
const BALLOON_COLORS = ["#ff3b5c", "#ffb020", "#17c964", "#4f46e5", "#00d9ff", "#7c3aed"];

function launchBalloons(count = 10) {
  const container = document.getElementById("emBalloonLayer");
  if (!container) return;
  for (let i = 0; i < count; i++) {
    const b = document.createElement("div");
    b.className = "em-balloon";
    const color = BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
    b.style.left = Math.random() * 96 + "vw";
    b.style.background = `radial-gradient(circle at 30% 28%, ${color}, ${color})`;
    b.style.animationDuration = (6 + Math.random() * 4) + "s";
    b.style.animationDelay = (Math.random() * 1.2) + "s";
    container.appendChild(b);
    setTimeout(() => b.remove(), 11500);
  }
}

/* ---------- Background music (soft ambient pad, off by default) ---------- */
function startBackgroundMusic() {
  const ctx = emGetAudioCtx();
  if (!ctx || EM_FX.musicNodes) return;
  const master = ctx.createGain();
  master.gain.value = 0.032;
  master.connect(ctx.destination);
  const freqs = [261.63, 329.63, 392.0]; // soft C-major pad
  const oscs = freqs.map((f) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    osc.connect(master);
    osc.start();
    return osc;
  });
  EM_FX.musicNodes = { master, oscs };
}
function stopBackgroundMusic() {
  if (!EM_FX.musicNodes) return;
  EM_FX.musicNodes.oscs.forEach((o) => { try { o.stop(); } catch (e) {} });
  EM_FX.musicNodes = null;
}
function toggleMusic() {
  EM_FX.musicOn = !EM_FX.musicOn;
  localStorage.setItem("em_music_on", JSON.stringify(EM_FX.musicOn));
  if (EM_FX.musicOn) startBackgroundMusic(); else stopBackgroundMusic();
  emSyncToggleButtons();
}
function toggleSound() {
  EM_FX.soundOn = !EM_FX.soundOn;
  localStorage.setItem("em_sound_on", JSON.stringify(EM_FX.soundOn));
  if (EM_FX.soundOn) playClickSound();
  emSyncToggleButtons();
}
function emSyncToggleButtons() {
  const s = document.getElementById("soundToggleBtn");
  const m = document.getElementById("musicToggleBtn");
  if (s) s.innerHTML = EM_FX.soundOn ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
  if (m) m.innerHTML = EM_FX.musicOn ? '<i class="fa-solid fa-music"></i>' : '<i class="fa-solid fa-music" style="opacity:.4"></i>';
}

/* ---------- Flash offer ticker ---------- */
const EM_OFFER_MESSAGES = [
  "🔥 Flash Sale ends soon — grab your deal before the timer runs out!",
  "🎉 Spend ₹1,999+ and unlock 5% OFF instantly",
  "🎁 Use code WELCOME10 for 10% off your first order",
  "⚡ Buy 3 of any item and save an extra 10% automatically",
  "💥 Today's Deals refresh often — don't miss the best discounts",
  "🛍️ Free delivery on every order above ₹499",
];
let emOfferTickerStarted = false;
function startOfferTicker() {
  if (emOfferTickerStarted) return;
  emOfferTickerStarted = true;
  setInterval(() => {
    const msg = EM_OFFER_MESSAGES[Math.floor(Math.random() * EM_OFFER_MESSAGES.length)];
    if (typeof showToast === "function") showToast(msg, "offer");
  }, 45000);
}

/* ---------- Light / dark theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("em_theme", theme);
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.innerHTML = theme === "dark" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
  playClickSound();
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("em_theme") || "light");
  emSyncToggleButtons();
  // Browsers block audio until a user gesture — arm music/audio-context resume on first interaction.
  const armAudio = () => {
    emGetAudioCtx();
    if (EM_FX.musicOn) startBackgroundMusic();
    document.removeEventListener("click", armAudio);
  };
  document.addEventListener("click", armAudio, { once: true });
});
