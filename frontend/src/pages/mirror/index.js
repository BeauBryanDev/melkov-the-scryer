
import { state } from "@/core/state.js";
import { fuseAndSmooth } from "@/core/fusion.js";
import { createMirrorRenderer } from "./renderer.js";
import { analyzeGeometry, resetGeometry, PHI } from "./analysis.js";
import "./mirror.css";
 
export default {
  raf: 0,
  renderer: null,
  hud: null,
 
  async mount(container) {
    container.innerHTML = `
      <div class="mirror-stage">
        <canvas id="mirror-canvas"></canvas>
        <div class="mirror-tag">MIRROR // YOU ARE 468 POINTS OF LIGHT</div>
 
        <div class="mirror-hud">
          <h1>FACIAL GEOMETRY</h1>
          <div class="mrow main"><span class="mlabel">SYMMETRY INDEX</span><span id="m-fsi" class="mval">--</span></div>
          <div class="mrow main"><span class="mlabel">GOLDEN INDEX</span><span id="m-golden" class="mval gold">--</span></div>
          <div class="mdivider">PHI = ${PHI.toFixed(6)}</div>
          <div id="m-ratios"></div>
          <div class="mdivider"></div>
          <div class="mrow"><span class="mlabel">FACE</span><span id="m-face" class="mval">SEARCHING</span></div>
        </div>
      </div>
    `;
 
    const canvas = container.querySelector("#mirror-canvas");
    this.renderer = createMirrorRenderer(canvas);
    resetGeometry();
 
    this.hud = {
      fsi: container.querySelector("#m-fsi"),
      golden: container.querySelector("#m-golden"),
      ratios: container.querySelector("#m-ratios"),
      face: container.querySelector("#m-face"),
    };
 
    const t0 = performance.now();
    let hudTick = 0;
 
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      fuseAndSmooth();
 
      const lm = state.landmarks;
      const present = state.faceSm > 0.5;
      const geometry = present && lm ? analyzeGeometry(lm) : null;
 
      // Publish for the oracle telemetry (fusion.js reads these)
      if (geometry) {
        state.symmetry = geometry.fsi;
        state.goldenRatio = geometry.golden;
      }
 
      this.renderer.frame(t, lm, geometry, state.gazeSm, present);
 
      if (++hudTick % 6 === 0) this.updateHUD(geometry, present);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
 
  updateHUD(g, present) {
    this.hud.face.textContent = present ? "LOCKED" : "SEARCHING";
    if (!g) return;
 
    this.hud.fsi.textContent = g.fsi.toFixed(3);
    this.hud.golden.textContent = g.golden.toFixed(3);
 
    this.hud.ratios.innerHTML = g.ratios
      .map(
        (r) => `
        <div class="mrow ratio">
          <span class="mlabel">${r.name}</span>
          <span class="mval">${r.value.toFixed(3)}</span>
          <span class="mphi">${(r.phiScore * 100).toFixed(0)}%</span>
        </div>`
      )
      .join("");
  },
 
  unmount() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.hud = null;
  },
};
 
