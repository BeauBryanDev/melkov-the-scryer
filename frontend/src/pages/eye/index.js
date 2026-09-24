/* ============================================================
   THE EYE — page module
   Owns the burning fractal eye: builds its DOM (GL canvas, hidden
   video, telemetry HUD, wake overlay), drives the RAF loop, and
   releases every resource on unmount.

   Contract: default-exports { mount(container), unmount() }.

   Camera/perception is a permanent core service (main.js); this page
   only installs the window.Scryer bridge on mount and drives the loop.

   The emotion net (public/emotions.js) is a permanent classic script
   in the shell; it no-ops through window.Scryer?.* while this page
   is unmounted, and comes alive again when the bridge is reinstalled.
   ============================================================ */

import { createRenderer } from "./renderer.js";
import { buildHUD, updateHUD, getAudioChart } from "./hud.js";
import { fuseAndSmooth } from "@/core/fusion.js";
import { attachAudioVisualizer } from "@/core/voice.js";
import "./scryer-audio-chart.js";
import "./eye.css";

export default {
  raf: 0,
  renderer: null,

  async mount(container) {
    // Render surface. eye.css positions #glcanvas fullscreen; the hidden
    // #video lives on document.body (permanent perception service).
    container.innerHTML = `
      <canvas id="glcanvas"></canvas>
    `;
    buildHUD(container);
    attachAudioVisualizer(getAudioChart());

    const canvas = container.querySelector("#glcanvas");
    this.renderer = createRenderer(canvas);   // GL context, programs, FBOs

    const t0 = performance.now();
    let hudTick = 0;
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      fuseAndSmooth();                 // CNN + heuristic fusion, EMA smoothing
      this.renderer.frame(t);          // reads state, draws two passes
      if (++hudTick % 4 === 0) updateHUD();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },

  unmount() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;

    if (this.renderer) { this.renderer.dispose(); this.renderer = null; }

    attachAudioVisualizer(null);
  },
};
