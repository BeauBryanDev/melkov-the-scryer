/* 
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
*/

import { createRenderer } from "./renderer.js";
import { buildHUD, updateHUD, getAudioChart } from "./hud.js";
import { fuseAndSmooth } from "@/core/fusion.js";
import { attachAudioVisualizer, attachFibonacciCard, attachVisionCards, attachKnowledgeSources } from "@/core/voice.js";
import "./scryer-audio-chart.js";
import "./scryer-vision-cards.js";
import "./fibonacci-card.js";
import "./scryer-knowledge-source.js";
import "./eye.css";

export default {
  raf: 0,
  renderer: null,
  canvas: null,
  onVisionShow: null,
  onVisionHide: null,

  async mount(container) {
    // Render surface. eye.css positions #glcanvas fullscreen; the hidden
    // #video lives on document.body (permanent perception service).
    container.innerHTML = `
      <canvas id="glcanvas"></canvas>
      <scryer-vision-cards></scryer-vision-cards>
      <scryer-fibonacci-card></scryer-fibonacci-card>
      <scryer-knowledge-source></scryer-knowledge-source>
    `;
    buildHUD(container);
    attachAudioVisualizer(getAudioChart());

    this.canvas = container.querySelector("#glcanvas");
    const visionEl = container.querySelector("scryer-vision-cards");
    const fibonacciEl = container.querySelector("scryer-fibonacci-card");
    const knowledgeEl = container.querySelector("scryer-knowledge-source");
    attachVisionCards(visionEl);
    attachFibonacciCard(fibonacciEl);
    attachKnowledgeSources(knowledgeEl);

    // The vision is a projection in place of the eye: hide the burning eye
    // while a vision is shown, restore it once dismissed.
    this.onVisionShow = () => this.canvas.classList.add("eye-hidden");
    this.onVisionHide = () => this.canvas.classList.remove("eye-hidden");
    visionEl.addEventListener("vision-show", this.onVisionShow);
    visionEl.addEventListener("vision-hide", this.onVisionHide);
    fibonacciEl.addEventListener("fibonacci-show", this.onVisionShow);
    fibonacciEl.addEventListener("fibonacci-hide", this.onVisionHide);

    this.renderer = createRenderer(this.canvas);   // GL context, programs, FBOs

    const t0 = performance.now();
    let hudTick = 0;
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      fuseAndSmooth();  // CNN + heuristic fusion, EMA smoothing
      this.renderer.frame(t); // reads state, draws two passes (kept alive even while hidden)
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
    attachVisionCards(null);
    attachFibonacciCard(null);
    attachKnowledgeSources(null);
    this.canvas = null;
    this.onVisionShow = null;
    this.onVisionHide = null;
  },
};
