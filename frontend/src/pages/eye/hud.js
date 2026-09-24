/* ============================================================
   HUD
   buildHUD(container) injects the "Soul Telemetry" panel + temple
   chrome into the page and caches the element handles. updateHUD()
   paints those handles from the shared state (throttled by caller).

   Element refs are (re)acquired in buildHUD, not at module load, so
   the Eye page can mount/unmount repeatedly without querying a DOM
   that is not there yet.
   ============================================================ */

import { state } from "@/core/state.js";
import { calib } from "@/core/face_mesh.js";

const STATE_NAMES = {
  anger: "FIRE // IRA", sadness: "SNOW // TRISTEZA",
  surprise: "BLOOM // SORPRESA", joy: "GOLD // ALEGRIA",
  neutral: "WATCHING // OBSERVANDO",
};

// Populated by buildHUD(); all reads in updateHUD() go through this.
let el = null;

export function buildHUD(container) {
  const hud = document.createElement("div");
  hud.className = "hud corner-b";
  hud.setAttribute("aria-hidden", "true");

  const tag = document.createElement("div");
  tag.className = "top-tag";
  tag.textContent = "MAGIC MIRROR // IT SEES YOUR SOUL";

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `
    <h1>SOUL TELEMETRY</h1>
    <div class="row"><span class="label">ANGER</span><span class="bar" id="bar-anger"><i></i></span></div>
    <div class="row"><span class="label">SADNESS</span><span class="bar" id="bar-sadness"><i></i></span></div>
    <div class="row"><span class="label">SURPRISE</span><span class="bar" id="bar-surprise"><i></i></span></div>
    <div class="row"><span class="label">JOY</span><span class="bar" id="bar-joy"><i></i></span></div>
    <div class="row"><span class="label">ENTROPY</span><span class="bar" id="bar-entropy"><i></i></span></div>
    <div class="row state-line"><span class="label">STATE</span><span id="state">SCANNING</span></div>
    <div class="row"><span class="label">GAZE</span><span id="gaze">0.00 / 0.00</span></div>
    <div class="row"><span class="label">HANDS</span><span id="hands">NONE</span></div>
  `;

  const audioPanel = document.createElement("div");
  audioPanel.className = "audio-panel";
  audioPanel.innerHTML = `<scryer-audio-chart></scryer-audio-chart>`;

  container.append(hud, tag, panel, audioPanel);

  el = {
    bars: {
      anger:    panel.querySelector("#bar-anger i"),
      sadness:  panel.querySelector("#bar-sadness i"),
      surprise: panel.querySelector("#bar-surprise i"),
      joy:      panel.querySelector("#bar-joy i"),
    },
    entropy: panel.querySelector("#bar-entropy i"),
    state:   panel.querySelector("#state"),
    gaze:    panel.querySelector("#gaze"),
    hands:   panel.querySelector("#hands"),
    audioChart: audioPanel.querySelector("scryer-audio-chart"),
  };
}

export function getAudioChart() {
  return el?.audioChart ?? null;
}

export function updateHUD() {
  if (!el) return;   // not mounted
  const s = state.smooth;
  for (const k of Object.keys(el.bars)) el.bars[k].style.width = (s[k] * 100).toFixed(0) + "%";
  el.entropy.style.width = (state.entropySm * 100).toFixed(0) + "%";
  if (calib.ready) {
    let best = "neutral", bestV = 0.22;
    for (const k of Object.keys(s)) if (s[k] > bestV) { bestV = s[k]; best = k; }
    el.state.textContent = STATE_NAMES[best];
  }
  el.gaze.textContent = state.gazeSm.x.toFixed(2) + " / " + state.gazeSm.y.toFixed(2);
  el.hands.textContent = state.handCount === 0 ? "NONE" : state.handCount + " // " + state.gesture;
}
