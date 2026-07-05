/* ============================================================
   EYE STATE ENGINE  (was the standalone app entry)
   No longer a self-running module: the Eye page (pages/eye/index.js)
   owns the RAF loop, renderer and HUD, and drives this file.

   Exports:
     fuseAndSmooth()          - one step of CNN/heuristic fusion + EMA
                                smoothing, called each frame BEFORE the
                                renderer reads state.
     installScryerBridge()    - defines window.Scryer (telemetry + the
                                emotion-net seam that emotions.js/voice.js
                                consume). Call in mount().
     uninstallScryerBridge()  - removes it in unmount() so the emotion
                                net (a permanent classic script) no-ops
                                while the Eye page is not on screen.
   ============================================================ */

import { state, ema, EMA_EMOTION, EMA_MOTION } from "@/core/state.js";

// Fuse the fast per-frame geometric heuristics with the slower (~2.5 Hz)
// neural read, then EMA-smooth everything the renderer will sample.
export function fuseAndSmooth() {
  const W_CNN = 0.55;
  for (const k of Object.keys(state.fused)) {
    const cnn = state.cnn ? state.cnn[k] : state.raw[k];
    state.fused[k] = state.raw[k] * (1 - W_CNN) + cnn * W_CNN;
  }
  for (const k of Object.keys(state.smooth)) state.smooth[k] = ema(state.smooth[k], state.fused[k], EMA_EMOTION);
  state.gazeSm.x = ema(state.gazeSm.x, state.gaze.x, EMA_MOTION);
  state.gazeSm.y = ema(state.gazeSm.y, state.gaze.y, EMA_MOTION);
  state.rollSm   = ema(state.rollSm, state.roll, EMA_MOTION);
  state.mouthSm  = ema(state.mouthSm, state.mouth, EMA_MOTION);
  state.faceSm   = ema(state.faceSm, state.facePresent, 0.05);
  state.blinkSm  = ema(state.blinkSm, state.blink, 0.45); // blinks must be fast
  state.fearSm   = ema(state.fearSm, state.cnn?.fear ?? 0, 0.10);
  // Entropy Engine: motion chaos (face_mesh) blended with real emotional
  // entropy (spread of the CNN distribution).
  const entTarget = 0.6 * state.entropy + 0.4 * (state.emotionalEntropy ?? 0);
  state.entropySm = ema(state.entropySm, entTarget, 0.03);
  state.pushSm   = ema(state.pushSm, state.push, 0.12);
  state.spreadSm = ema(state.spreadSm, state.spread, 0.10);
}

export function installScryerBridge() {
  window.Scryer = {
    getTelemetry() {
      const s = state.smooth;
      let dominant = "neutral", best = 0.22;
      for (const k of Object.keys(s)) if (s[k] > best) { best = s[k]; dominant = k; }
      const g = Math.hypot(state.gazeSm.x, state.gazeSm.y);
      return {
        anger: s.anger, sadness: s.sadness, surprise: s.surprise, joy: s.joy,
        entropy: state.entropySm,
        dominant_state: dominant,
        gaze_behavior: g < 0.25 ? "steady" : g < 0.6 ? "wandering" : "avoiding",
        face_present: state.faceSm > 0.5,
        fear: state.cnn?.fear ?? 0,
        eye_contact: state.eyeContact ?? 0.5,
      };
    },
    // ---- Neural emotion net bridge (core/emotions.js) ----
    getFaceBox() { return state.faceBox || null; },
    getGazeVector() { return state.gazeSm; },
    pushNeuralEmotion(channels, meta) {
      if (channels) state.cnn = channels;
      if (meta) {
        if (meta.emotional_entropy != null) state.emotionalEntropy = meta.emotional_entropy;
        if (meta.eye_contact != null) state.eyeContact = meta.eye_contact;
      }
    },
    setMood(hint) {
      // Simplest effective version: bias the raw emotion channel that
      // matches the hint for ~10s so the eye tints while it speaks.
      const map = { ember: "anger", frost: "sadness", bloom: "surprise", gold: "joy" };
      const k = map[hint];
      if (k) state.moodBias = { channel: k, strength: 0.5, decay: 0.995 };
    },
    setSpeaking(level) {
      state.speaking = level;   // add uniform u_speaking, pulse the eye:
                                // irisR *= 1.0 + u_speaking * 0.12;
                                // corona *= 1.0 + u_speaking * 0.8;
    },
  };
}

export function uninstallScryerBridge() {
  delete window.Scryer;
}
