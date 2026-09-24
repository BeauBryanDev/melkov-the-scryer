
import { createRenderer } from "./renderer.js";
import { fuseAndSmooth } from "@/core/fusion.js";
import "./kaleidoscope.css";
 
export default {
  raf: 0,
  renderer: null,
 
  async mount(container) {
    container.innerHTML = `
      <canvas id="kal-canvas"></canvas>
      <div class="kal-tag">SEE YOUR SOUL LIVE</div>
    `;
 
    const canvas = container.querySelector("#kal-canvas");
    this.renderer = createRenderer(canvas);
 
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      fuseAndSmooth();
      this.renderer.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
 
  unmount() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  },
};
 