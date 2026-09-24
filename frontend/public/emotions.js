/* ============================================================
   AEGIS SCRYER v5 - NEURAL EMOTION + EYE CONTACT
   EmotiEffLib EfficientNet-B0 (emotieff_b0.onnx, 8 classes)
   running client-side at ~2.5 Hz on face crops provided by the
   FaceMesh landmarks, fused with the existing geometric
   heuristics. Plus an eye-contact tracker so the oracle knows
   whether the mortal dares to look at it.

   Load order (classic scripts, after app.js):
     <script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js"></script>
     <script src="logic/emotion.js"></script>

   Model file: models/emotieff_b0.onnx (16.2 MB, cached by the browser)

   Requires from app.js (see integration notes at the bottom):
     window.Scryer.getFaceBox()   -> {x, y, w, h} in VIDEO pixel coords, or null
     window.Scryer.pushNeuralEmotion(channels, meta)
     window.Scryer.getGazeVector() -> {x, y} (state.gazeSm)
   ============================================================ */

"use strict";

(function () {

const EMO = {
  MODEL_URL: "/models/emotieff_b0.onnx",
  SIZE: 224,                 // EmotiEffLib B0 input: 224x224 RGB aligned face
  INTERVAL_MS: 400,          // ~2.5 Hz: emotions do not change at 60 fps
  CROP_MARGIN: 0.25,         // expand FaceMesh bbox: the model saw full faces
  // ImageNet normalization (EmotiEffLib standard)
  MEAN: [0.485, 0.456, 0.406],
  STD: [0.229, 0.224, 0.225],
};

const CLASSES = ["Anger", "Contempt", "Disgust", "Fear",
                 "Happiness", "Neutral", "Sadness", "Surprise"];

/* 8 EmotiEff classes -> the Scryer's telemetry channels.
   Contempt and Disgust fold into anger (hot rejection family).
   Fear is a NEW channel: exposed to the oracle and boosting entropy;
   wire it to the shader later if you want the eye to widen. */
function toChannels(p) {
  return {
    anger:    p.Anger + 0.6 * p.Contempt + 0.5 * p.Disgust,
    sadness:  p.Sadness,
    surprise: p.Surprise,
    joy:      p.Happiness,
    fear:     p.Fear,
  };
}

let session = null;
let cropCanvas, cropCtx;
let inputName = null;

/* ---------------- Eye contact tracker ----------------
   No calibration needed: the procedural eye hovers near the
   center, so "looking at the mirror" means a small, stable
   gaze vector. We keep a rolling window of the last ~8 s. */

const CONTACT = {
  THRESHOLD: 0.32,     // |gaze| below this counts as looking at the eye
  WINDOW: 20,          // samples at 2.5 Hz = ~8 seconds
  samples: [],
};

function trackEyeContact() {
  const g = window.Scryer?.getGazeVector?.();
  if (!g) return 0.5;
  const looking = Math.hypot(g.x, g.y) < CONTACT.THRESHOLD ? 1 : 0;
  CONTACT.samples.push(looking);
  if (CONTACT.samples.length > CONTACT.WINDOW) CONTACT.samples.shift();
  const sum = CONTACT.samples.reduce((a, b) => a + b, 0);
  return sum / CONTACT.samples.length;   // 0 = always avoiding, 1 = locked on
}

/* ---------------- Model ---------------- */

async function loadModel() {
  session = await ort.InferenceSession.create(EMO.MODEL_URL, {
    executionProviders: ["webgpu", "wasm"],
    graphOptimizationLevel: "all",
  });
  inputName = session.inputNames[0];
  cropCanvas = document.createElement("canvas");
  cropCanvas.width = EMO.SIZE;
  cropCanvas.height = EMO.SIZE;
  cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
  console.log("[SCRYER] emotion net ready:", session.inputNames, "->", session.outputNames);
}

function preprocess(video, box) {
 
  const mx = box.w * EMO.CROP_MARGIN;
  const my = box.h * EMO.CROP_MARGIN;
  const sx = Math.max(0, box.x - mx);
  const sy = Math.max(0, box.y - my);
  const sw = Math.min(video.videoWidth - sx, box.w + 2 * mx);
  const sh = Math.min(video.videoHeight - sy, box.h + 2 * my);
  cropCtx.drawImage(video, sx, sy, sw, sh, 0, 0, EMO.SIZE, EMO.SIZE);

  const { data } = cropCtx.getImageData(0, 0, EMO.SIZE, EMO.SIZE);
  const plane = EMO.SIZE * EMO.SIZE;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    chw[i]             = (data[i * 4]     / 255 - EMO.MEAN[0]) / EMO.STD[0];
    chw[plane + i]     = (data[i * 4 + 1] / 255 - EMO.MEAN[1]) / EMO.STD[1];
    chw[2 * plane + i] = (data[i * 4 + 2] / 255 - EMO.MEAN[2]) / EMO.STD[2];
  }
  return new ort.Tensor("float32", chw, [1, 3, EMO.SIZE, EMO.SIZE]);
}

function softmax(logits) {
  const m = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v - m));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / s);
}

/* ---------------- Inference loop ---------------- */

async function tick() {
  const video = document.getElementById("video");
  const box = window.Scryer?.getFaceBox?.();
  const eyeContact = trackEyeContact();

  if (session && video && video.readyState >= 2 && box) {
    try {
      const tensor = preprocess(video, box);
      const out = await session.run({ [inputName]: tensor });
      const logits = Array.from(out[session.outputNames[0]].data);
      const probs = softmax(logits);

      const scores = {};
      CLASSES.forEach((c, i) => (scores[c] = probs[i]));

      // Shannon entropy of the distribution, normalized to 0..1:
      // real EMOTIONAL entropy for the Entropy Engine, not just motion.
      let H = 0;
      for (const p of probs) if (p > 1e-9) H -= p * Math.log(p);
      H /= Math.log(CLASSES.length);

      let dominant = "Neutral", best = 0;
      CLASSES.forEach(c => { if (scores[c] > best) { best = scores[c]; dominant = c; } });

      window.Scryer?.pushNeuralEmotion?.(toChannels(scores), {
        scores,
        dominant,
        confidence: best,
        emotional_entropy: H,
        eye_contact: eyeContact,
      });
    } catch (err) {
      console.error("[SCRYER] emotion inference failed:", err);
    }
  } else {
    // No face: still report contact decay so the oracle notices absence
    window.Scryer?.pushNeuralEmotion?.(null, { eye_contact: eyeContact });
  }

  setTimeout(tick, EMO.INTERVAL_MS);
}

loadModel()
  .then(tick)
  .catch(err => console.error("[SCRYER] emotion net failed to load:", err));

/* ============================================================
   INTEGRATION NOTES for app.js

   1. Face box from the landmarks you already have (in analyze()):

        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const p of lm) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
        state.faceBox = {
          x: minX * video.videoWidth,  y: minY * video.videoHeight,
          w: (maxX - minX) * video.videoWidth,
          h: (maxY - minY) * video.videoHeight,
        };

      window.Scryer.getFaceBox   = () => state.faceBox || null;
      window.Scryer.getGazeVector = () => state.gazeSm;

   2. Fusion: heuristics stay as the fast per-frame signal, the CNN
      anchors and corrects at 2.5 Hz. In pushNeuralEmotion:

        window.Scryer.pushNeuralEmotion = (channels, meta) => {
          if (channels) state.cnn = channels;
          state.emotionalEntropy = meta.emotional_entropy ?? state.emotionalEntropy;
          state.eyeContact = meta.eye_contact;
        };

      Then, in frame(), before the EMA smoothing:

        const W_CNN = 0.55;
        for (const k of ["anger", "sadness", "surprise", "joy"]) {
          const cnn = state.cnn ? state.cnn[k] : state.raw[k];
          state.fused[k] = state.raw[k] * (1 - W_CNN) + cnn * W_CNN;
        }
        // then smooth state.fused instead of state.raw

      And blend emotional entropy into the Entropy Engine:
        entropy = 0.6 * motionEntropy + 0.4 * (state.emotionalEntropy ?? 0);

   3. Telemetry for the oracle (getTelemetry): add
        fear: state.cnn?.fear ?? 0,
        eye_contact: state.eyeContact ?? 0.5,

   BACKEND: in schemas/oracle.py Telemetry add
        fear: float = Field(0.0, ge=0.0, le=1.0)
        eye_contact: float = Field(0.5, ge=0.0, le=1.0)
   and in build_context_line append
        f"fear={t.fear:.2f} eye_contact={t.eye_contact:.2f} "
   The existing prompt already tells the Scryer to comment on what it
   sees: with eye_contact=0.1 it will produce the "do I scare you,
   mortal?" moment on its own.
   ============================================================ */

})();
