/* ============================================================
   SHARED STATE
   The single source of truth read by the renderer and HUD, and
   written by the face / hand analyzers. Everything here is plain
   data + generic helpers — no DOM, no WebGL, no MediaPipe.
   ============================================================ */

export const state = {
  raw:    { anger: 0, sadness: 0, surprise: 0, joy: 0 },
  fused:  { anger: 0, sadness: 0, surprise: 0, joy: 0 }, // raw heuristics + CNN
  smooth: { anger: 0, sadness: 0, surprise: 0, joy: 0 },
  // Neural emotion net (logic/emotions.js) writes these at ~2.5 Hz.
  cnn: null,                 // { anger, sadness, surprise, joy, fear } or null
  emotionalEntropy: 0,       // Shannon entropy of the CNN distribution, 0..1
  eyeContact: 0.5,           // 0 = always avoiding, 1 = locked on the eye
  faceBox: null,             // { x, y, w, h } in VIDEO pixel coords, or null
  landmarks: null,           // Most recent face mesh landmarks array, or null
  gaze:   { x: 0, y: 0 },
  gazeSm: { x: 0, y: 0 },
  roll: 0, rollSm: 0,
  mouth: 0, mouthSm: 0,
  facePresent: 0, faceSm: 0,
  blink: 1, blinkSm: 1,
  fear: 0, fearSm: 0,        // neural fear -> the eye widens
  entropy: 0, entropySm: 0,
  symmetry: 0, goldenRatio: 0,   // mirror page geometry; 0 when not measured
  // v3 hands
  tips: new Float32Array(40),        // 10 x vec4 (x, y, intensity, active)
  grab: { x: 0, y: 0 },
  push: 0, pushSm: 0,
  spread: 0, spreadSm: 0,
  handCount: 0,
  gesture: "NONE",
};

export const EMA_EMOTION = 0.06;
export const EMA_MOTION  = 0.15;

export function ema(prev, next, a) { return prev + (next - prev) * a; }

export const clamp01 = v => Math.min(1, Math.max(0, v));
