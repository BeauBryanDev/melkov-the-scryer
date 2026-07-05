/* ============================================================
   HAND ANALYSIS (v3)
   MediaPipe Hands, 21 landmarks per hand, up to 2 hands.
   Landmark indices: 0 wrist, 4 thumb_tip, 8 index_tip,
   12 middle_tip, 16 ring_tip, 20 pinky_tip, 9 middle_mcp.
   All geometry is normalized by handSize = dist(wrist, middle_mcp)
   so gestures are distance-invariant, and handSize itself is the
   proximity proxy (bigger hand = closer to camera).
   Writes fingertip trails, pinch-drag, push and portal-spread
   into the shared state.
   ============================================================ */

import { state } from "./state.js";

const TIP_IDX = [4, 8, 12, 16, 20];
const prevTips = new Array(10).fill(null);
let pinchPrev = [null, null];
let tipDecayTimer = 0;

// Video-normalized -> scene space, horizontally mirrored like a real mirror.
// The scene fills the viewport, so the GL canvas aspect (width/height, both
// = inner*dpr*scale) reduces to the window aspect — no need to reach into the
// page's renderer for the canvas (which would invert core->page layering and,
// at import time, boot a stray GL context). Recomputed per call so it tracks
// window resizes for free.
function toScene(lm) {
  const aspect = window.innerWidth / window.innerHeight;
  return { x: (0.5 - lm.x) * aspect, y: 0.5 - lm.y };
}

export function analyzeHands(res) {
  const hands = res.multiHandLandmarks || [];
  state.handCount = hands.length;
  state.tips.fill(0);
  let anyPush = 0;
  let gesture = hands.length ? "PAINTING" : "NONE";

  const wrists = [];

  for (let h = 0; h < Math.min(hands.length, 2); h++) {
    const lm = hands[h];
    const handSize = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
    if (handSize < 1e-6) continue;
    wrists.push(toScene(lm[0]));

    // Finger extension: tip far from wrist relative to hand size
    const ext = TIP_IDX.map(i =>
      Math.hypot(lm[i].x - lm[0].x, lm[i].y - lm[0].y) / handSize);
    const extendedCount = ext.filter(e => e > 1.55).length;

    // Open palm pushed toward camera: all fingers extended + hand large
    const proximity = Math.min(1, Math.max(0, (handSize - 0.22) * 5.5));
    if (extendedCount >= 4 && proximity > 0.15) {
      anyPush = Math.max(anyPush, proximity);
      gesture = "PUSH // RETREAT";
    }

    // Pinch: thumb_tip close to index_tip
    const pinchD = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / handSize;
    const pinchPos = toScene(lm[8]);
    if (pinchD < 0.35) {
      if (pinchPrev[h]) {
        // Dragging the world: move opposite so the fractal follows the hand
        state.grab.x -= (pinchPos.x - pinchPrev[h].x) * 1.2;
        state.grab.y -= (pinchPos.y - pinchPrev[h].y) * 1.2;
        state.grab.x = Math.max(-1.2, Math.min(1.2, state.grab.x));
        state.grab.y = Math.max(-1.2, Math.min(1.2, state.grab.y));
      }
      pinchPrev[h] = pinchPos;
      gesture = "PINCH // GRAB";
    } else {
      pinchPrev[h] = null;
    }

    // Fingertip painting: position + velocity-driven intensity
    for (let f = 0; f < 5; f++) {
      const slot = h * 5 + f;
      const p = toScene(lm[TIP_IDX[f]]);
      let vel = 0;
      if (prevTips[slot]) {
        vel = Math.hypot(p.x - prevTips[slot].x, p.y - prevTips[slot].y);
      }
      prevTips[slot] = p;
      const o = slot * 4;
      state.tips[o]     = p.x;
      state.tips[o + 1] = p.y;
      state.tips[o + 2] = Math.min(1.4, vel * 34);   // fast strokes burn brighter
      state.tips[o + 3] = 1;
    }
  }

  for (let s = hands.length * 5; s < 10; s++) prevTips[s] = null;
  if (hands.length < 2) pinchPrev[1] = null;
  if (hands.length < 1) pinchPrev[0] = null;

  // Portal: both hands present, spread measured between wrists
  if (wrists.length === 2) {
    const d = Math.hypot(wrists[0].x - wrists[1].x, wrists[0].y - wrists[1].y);
    state.spread = Math.min(1, Math.max(0, (d - 0.35) * 1.6));
    if (state.spread > 0.4) gesture = "PORTAL // OPEN";
  } else {
    state.spread = 0;
  }

  state.push = anyPush;
  state.gesture = gesture;
  tipDecayTimer = 12; // frames of grace before tips vanish
}

export function decayHands() {
  if (tipDecayTimer > 0) { tipDecayTimer--; return; }
  state.tips.fill(0);
  state.handCount = 0;
  state.push = 0;
  state.spread = 0;
  state.gesture = "NONE";
}
