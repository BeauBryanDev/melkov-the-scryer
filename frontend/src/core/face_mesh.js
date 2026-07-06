/* ============================================================
   FACE ANALYSIS + ENTROPY ENGINE
   Turns a MediaPipe FaceMesh landmark array into emotion, gaze,
   roll, mouth, blink and an entropy (facial-chaos) index, all
   written into the shared state. Geometric approach, calibrated
   against a neutral face captured in the first CALIB_FRAMES.
   ============================================================ */

import { state, clamp01 } from "./state.js";

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Cached <video> for turning normalized landmarks into pixel bounds,
// which is what the neural emotion net (emotions.js) crops against.
let videoEl = null;

function updateFaceBox(lm) {
  videoEl = videoEl || document.getElementById("video");
  const vw = videoEl?.videoWidth || 0;
  const vh = videoEl?.videoHeight || 0;
  if (!vw || !vh) { state.faceBox = null; return; }

  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  state.faceBox = {
    x: minX * vw, y: minY * vh,
    w: (maxX - minX) * vw, h: (maxY - minY) * vh,
  };
}

export const calib = { n: 0, brow: 0, smile: 0, eye: 0, ready: false };
const CALIB_FRAMES = 50;

/* ---------- Entropy: chaos over a rolling window ----------
   variance of landmark motion + rate of emotional change +
   raw emotional magnitude. High entropy = deeper fractal,
   stronger feedback, wider eye. */
const entropyWin = { motion: [], emo: [], size: 45 };
let prevLm = null;
let prevEmoVec = [0, 0, 0, 0];

function pushWindow(arr, v, size) {
  arr.push(v);
  if (arr.length > size) arr.shift();
}
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function variance(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length;
}

function computeEntropy(lm, emoVec) {
  // Mean landmark displacement over a stable subset (cheap proxy for motion energy)
  const IDX = [1, 33, 61, 105, 152, 263, 291, 334, 13, 14];
  let motion = 0;
  if (prevLm) {
    for (const i of IDX) {
      motion += Math.hypot(lm[i].x - prevLm[i].x, lm[i].y - prevLm[i].y);
    }
    motion /= IDX.length;
  }
  prevLm = IDX.reduce((o, i) => (o[i] = { x: lm[i].x, y: lm[i].y }, o), {});

  let emoDelta = 0;
  for (let i = 0; i < 4; i++) emoDelta += Math.abs(emoVec[i] - prevEmoVec[i]);
  prevEmoVec = emoVec.slice();

  pushWindow(entropyWin.motion, motion, entropyWin.size);
  pushWindow(entropyWin.emo, emoDelta, entropyWin.size);

  const motionEnergy = mean(entropyWin.motion) * 260;
  const motionChaos  = Math.sqrt(variance(entropyWin.motion)) * 700;
  const emoChaos     = mean(entropyWin.emo) * 14;
  const emoMagnitude = (emoVec[0] + emoVec[1] + emoVec[2] + emoVec[3]) * 0.35;

  state.entropy = Math.min(1, motionEnergy + motionChaos + emoChaos + emoMagnitude);
}

export function analyze(lm) {
  const faceH = dist(lm[10], lm[152]);
  if (faceH < 1e-6) return;

  // Publish the pixel-space face box every frame so the neural
  // emotion net can crop the current face (even during calibration).
  updateFaceBox(lm);

  const mouthOpen  = dist(lm[13], lm[14]) / faceH;
  const cornerY    = (lm[61].y + lm[291].y) / 2;
  const lipCenterY = (lm[13].y + lm[14].y) / 2;
  const smile      = (lipCenterY - cornerY) / faceH;
  const brow       = (dist(lm[105], lm[159]) + dist(lm[334], lm[386])) / 2 / faceH;
  const eyeOpen    = (dist(lm[159], lm[145]) + dist(lm[386], lm[374])) / 2 / faceH;

  if (!calib.ready) {
    calib.brow += brow; calib.smile += smile; calib.eye += eyeOpen;
    if (++calib.n >= CALIB_FRAMES) {
      calib.brow /= calib.n; calib.smile /= calib.n; calib.eye /= calib.n;
      calib.ready = true;
      const stateLabel = document.getElementById("state");
      if (stateLabel) {
        stateLabel.textContent = "THE EYE IS OPEN";
      }
    }
    return;
  }

  state.landmarks = lm;

  const dBrow  = brow    - calib.brow;
  const dSmile = smile   - calib.smile;
  const dEye   = eyeOpen - calib.eye;

  const surprise = clamp01(dBrow * 24 + dEye * 22 + mouthOpen * 3.5 - 0.25);
  const joy      = clamp01(dSmile * 30 - 0.10);
  const anger    = clamp01(-dBrow * 34 - 0.12) * clamp01(1.0 - mouthOpen * 8);
  const sadness  = clamp01(-dSmile * 26 - 0.10) * clamp01(1.0 - anger * 0.7) * clamp01(1.0 - mouthOpen * 6);

  state.raw = { anger, sadness, surprise, joy };

  // Cache the current face landmarks for the mirror page and downstream analysis.
  state.landmarks = lm;

  // The mirror blinks with you: eye aperture relative to your neutral
  state.blink = clamp01(eyeOpen / calib.eye);

  const gx = (outer, inner, iris) => {
    const w = lm[inner].x - lm[outer].x;
    return w !== 0 ? ((lm[iris].x - lm[outer].x) / w - 0.5) * 2 : 0;
  };
  const gy = (top, bot, iris) => {
    const h = lm[bot].y - lm[top].y;
    return h !== 0 ? ((lm[iris].y - lm[top].y) / h - 0.5) * 2 : 0;
  };
  state.gaze.x = Math.max(-1, Math.min(1, (gx(33, 133, 468) + gx(362, 263, 473)) / 2 * 1.6));
  state.gaze.y = Math.max(-1, Math.min(1, (gy(159, 145, 468) + gy(386, 374, 473)) / 2 * 1.6));
  state.roll = Math.atan2(lm[263].y - lm[33].y, lm[263].x - lm[33].x);
  state.mouth = clamp01(mouthOpen * 9);

  computeEntropy(lm, [anger, sadness, surprise, joy]);
}
