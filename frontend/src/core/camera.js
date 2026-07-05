/* ============================================================
   TEMPLE-LIFETIME PERCEPTION SERVICE
   Boots once, never closes. Pages NEVER call stop(): the
   telemetry must flow in every chamber.

   NOTE ON LOAD ORDER — READ BEFORE MOVING SCRIPT TAGS:
   FaceMesh, Hands and Camera are GLOBALS provided by the three
   MediaPipe CDN <script> tags in the HTML. Those tags are CLASSIC
   (non-module, non-async) scripts placed BEFORE the module entry,
   so they execute during HTML parsing, while every `type="module"`
   script (this one, via main.js) is deferred and runs afterwards.
   That guarantees the globals exist by the time ensurePerception()
   runs. If you ever make the CDN tags `async`/`defer` or move them
   after the module, this ordering breaks — hence the explicit guard.
   ============================================================ */

import { state } from "./state.js";
import { analyze } from "./face_mesh.js";
import { analyzeHands, decayHands } from "./hands.js";

// MediaPipe globals loaded from the CDN classic scripts.
const { FaceMesh, Hands, Camera } = window;

let started = false;
let videoEl = null;

export async function ensurePerception() {
  if (started) return;      // idempotent: safe to call from anywhere
  started = true;

  // The video element must live OUTSIDE #page: the router wipes
  // #page.innerHTML on every navigation.
  videoEl = document.createElement("video");
  videoEl.id = "video";
  videoEl.setAttribute("playsinline", "");
  videoEl.muted = true;
  videoEl.style.display = "none";
  document.body.appendChild(videoEl);

  const statusEl = document.getElementById("status");

  if (!FaceMesh || !Hands || !Camera) {
    if (statusEl) {
      statusEl.textContent = "ERROR: MediaPipe CDN failed to load (check the <script> tags load before the module entry)";
    }
    return;
  }

  try {
    if (statusEl) statusEl.textContent = "LOADING FACE MESH MODEL...";

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

    if (statusEl) statusEl.textContent = "LOADING HAND TRACKER...";

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

    if (statusEl) statusEl.textContent = "REQUESTING CAMERA...";

    // Face and hands alternate frames: each runs at ~half camera rate,
    // which the EMA smoothing absorbs. Running both per frame would
    // fight the fractal shader for compute.
    let frameFlip = 0;
    const camera = new Camera(videoEl, {
      onFrame: async () => {
        if ((frameFlip = 1 - frameFlip) === 1) {
          await faceMesh.send({ image: videoEl });
        } else {
          await hands.send({ image: videoEl });
        }
      },
      width: 480,
      height: 360,
    });
    await camera.start();

    if (statusEl) statusEl.textContent = "CALIBRATING NEUTRAL FACE... HOLD STILL";
    setTimeout(() => {
      const overlay = document.getElementById("start-overlay");
      if (overlay) overlay.style.display = "none";
    }, 900);
  } catch (err) {
    started = false;
    if (statusEl) {
      statusEl.textContent = "ERROR: " + err.message + " (camera needs localhost or https)";
    }
  }
}

export function getVideo() { return videoEl; }
