/* ============================================================
   AEGIS SCRYER - BOOT
   Core services boot here once and never unmount; pages consume them.
   ============================================================ */
   import { startRouter } from "./router.js";
   import { installScryerBridge } from "./core/fusion.js";


function boot() {
  installScryerBridge();       // permanent: emotions.js and voice.js always have a target
  startRouter();               // camera + voice start on demand (core/permissions.js)
}

boot();
