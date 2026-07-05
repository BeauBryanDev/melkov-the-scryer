/* ============================================================
   AEGIS SCRYER - BOOT
   Core services boot here once and never unmount; pages consume them.
   ============================================================ */
   import { startRouter } from "./router.js";
   import { ensurePerception } from "./core/camera.js";
   import { bootVoice } from "./core/voice.js";
   import { installScryerBridge } from "./core/fusion.js";


function setNavStatus(text) {
  const el = document.getElementById("nav-status");
  if (el) el.textContent = text;
}

async function boot() {
  setNavStatus("AWAKENING");
  installScryerBridge();       // permanent: emotions.js and voice.js always have a target
  startRouter();
  await ensurePerception();
  bootVoice();
  setNavStatus("THE EYE IS OPEN");
}

boot();
