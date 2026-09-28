/* 
   GLOBAL MEDIA GATE
   One camera request for the whole temple, never on /home.
   The first non-home route shows a single "awaken" overlay; once
   perception is live it never appears again. The microphone is
   NOT requested here — voice.js asks on the first push-to-talk.
*/

import { ensurePerception } from "./camera.js";
import { bootVoice } from "./voice.js";

const HOME = "/home";
let phase = "idle";        // idle | awakening | open | denied
let gateEl = null;
let msgEl = null;
let btnEl = null;

const NAV_LABEL = {
  idle: "DORMANT",
  awakening: "AWAKENING",
  open: "THE EYE IS OPEN",
  denied: "EYE SEALED",
};

function paintStatus() {
  const nav = document.getElementById("nav-status");
  if (nav) {
    nav.textContent = NAV_LABEL[phase];
    nav.dataset.phase = phase;
  }
}

function buildGate() {
  gateEl = document.createElement("div");
  gateEl.className = "awaken-gate";
  gateEl.hidden = true;
  gateEl.innerHTML = `
    <div class="awaken-card">
      <h2>AWAKEN THE MIRROR</h2>
      <p>The temple needs your camera to read your face, gaze and hands.
         Everything is processed in your browser. No video ever leaves it.</p>
      <button class="temple-btn awaken-btn" type="button">ALLOW CAMERA</button>
      <div class="awaken-msg" role="status"></div>
    </div>`;
  msgEl = gateEl.querySelector(".awaken-msg");
  btnEl = gateEl.querySelector(".awaken-btn");
  btnEl.addEventListener("click", awakenMirror);
  document.body.appendChild(gateEl);
}

export async function awakenMirror() {
  if (phase === "awakening" || phase === "open") return;
  phase = "awakening";
  btnEl.disabled = true;
  msgEl.textContent = "";
  paintStatus();

  const ok = await ensurePerception(m => { msgEl.textContent = m; });
  if (ok) {
    phase = "open";
    gateEl.hidden = true;
    bootVoice().catch(err => console.warn("[SCRYER] voice boot failed:", err));
  } else {
    phase = "denied";
    btnEl.disabled = false;
    btnEl.textContent = "TRY AGAIN";
    msgEl.textContent = (msgEl.textContent || "Camera unavailable") +
      " (camera needs localhost or https)";
  }
  paintStatus();
}

/** Called by the router on every navigation. */
export function syncGate(path) {
  if (!gateEl) { buildGate(); paintStatus(); }
  gateEl.hidden = path === HOME || phase === "open";
}
