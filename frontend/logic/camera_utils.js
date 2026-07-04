/* ============================================================
   CAMERA + MEDIAPIPE BOOT
   Wires the "WAKE THE EYE" button to: FaceMesh + Hands models,
   the webcam, and the alternating per-frame dispatch. Results
   are fed to the analyzers, which write into the shared state.

   NOTE ON LOAD ORDER — READ BEFORE MOVING SCRIPT TAGS:
   FaceMesh, Hands and Camera are GLOBALS provided by the three
   MediaPipe CDN <script> tags in the HTML. Those tags are CLASSIC
   (non-module, non-async) scripts placed BEFORE the module entry,
   so they execute during HTML parsing, while every `type="module"`
   script (this one, via app.js) is deferred and runs afterwards.
   That guarantees the globals exist by the time boot() runs. If
   you ever make the CDN tags `async`/`defer` or move them after
   the module, this ordering breaks — hence the explicit guard.
   ============================================================ */

import { state } from "./state.js";
import { analyze } from "./face_mesh.js";
import { analyzeHands, decayHands } from "./hands.js";

// MediaPipe globals loaded from the CDN classic scripts.
const { FaceMesh, Hands, Camera } = window;

export function boot() {
  const video = document.getElementById("video");
  const statusEl = document.getElementById("status");
  const btn = document.getElementById("start-btn");

  if (!FaceMesh || !Hands || !Camera) {
    statusEl.textContent = "ERROR: MediaPipe CDN failed to load (check the <script> tags load before app.js)";
    btn.disabled = true;
    return;
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    statusEl.textContent = "LOADING FACE MESH MODEL...";

    try {
      const faceMesh = new FaceMesh({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      faceMesh.onResults(res => {
        if (res.multiFaceLandmarks && res.multiFaceLandmarks.length > 0) {
          state.facePresent = 1;
          analyze(res.multiFaceLandmarks[0]);
        } else {
          state.facePresent = 0;
          state.raw = { anger: 0, sadness: 0, surprise: 0, joy: 0 };
          state.entropy *= 0.98;
          state.faceBox = null;   // stop the emotion net cropping a stale face
        }
      });

      statusEl.textContent = "LOADING HAND TRACKER...";
      const hands = new Hands({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,          // lite model: this app already spends GPU on the shader
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
      hands.onResults(res => {
        if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
          analyzeHands(res);
        } else {
          decayHands();
        }
      });

      statusEl.textContent = "REQUESTING CAMERA...";
      // Face and hands alternate frames: each runs at ~half camera rate,
      // which the EMA smoothing absorbs. Running both per frame would
      // fight the fractal shader for compute.
      let frameFlip = 0;
      const camera = new Camera(video, {
        onFrame: async () => {
          if ((frameFlip = 1 - frameFlip) === 1) {
            await faceMesh.send({ image: video });
          } else {
            await hands.send({ image: video });
          }
        },
        width: 480,
        height: 360,
      });
      await camera.start();

      statusEl.textContent = "CALIBRATING NEUTRAL FACE... HOLD STILL";
      setTimeout(() => {
        document.getElementById("start-overlay").style.display = "none";
      }, 900);
    } catch (err) {
      btn.disabled = false;
      statusEl.textContent = "ERROR: " + err.message + " (camera needs localhost or https)";
    }
  });
}
