/* ============================================================
   HUD
   Reads the shared state and paints the "Soul Telemetry" panel.
   Throttled by the caller (updated every few frames).
   ============================================================ */

import { state } from "./state.js";
import { calib } from "./face_mesh.js";

const bars = {
  anger:    document.querySelector("#bar-anger i"),
  sadness:  document.querySelector("#bar-sadness i"),
  surprise: document.querySelector("#bar-surprise i"),
  joy:      document.querySelector("#bar-joy i"),
};
const entropyBar = document.querySelector("#bar-entropy i");
const stateEl = document.getElementById("state");
const gazeEl  = document.getElementById("gaze");
const handsEl = document.getElementById("hands");

const STATE_NAMES = {
  anger: "FIRE // IRA", sadness: "SNOW // TRISTEZA",
  surprise: "BLOOM // SORPRESA", joy: "GOLD // ALEGRIA",
  neutral: "WATCHING // OBSERVANDO",
};

export function updateHUD() {
  const s = state.smooth;
  for (const k of Object.keys(bars)) bars[k].style.width = (s[k] * 100).toFixed(0) + "%";
  entropyBar.style.width = (state.entropySm * 100).toFixed(0) + "%";
  if (calib.ready) {
    let best = "neutral", bestV = 0.22;
    for (const k of Object.keys(s)) if (s[k] > bestV) { bestV = s[k]; best = k; }
    stateEl.textContent = STATE_NAMES[best];
  }
  gazeEl.textContent = state.gazeSm.x.toFixed(2) + " / " + state.gazeSm.y.toFixed(2);
  handsEl.textContent = state.handCount === 0 ? "NONE" : state.handCount + " // " + state.gesture;
}
