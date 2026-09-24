
import { state } from "@/core/state.js";
import { fuseAndSmooth } from "@/core/fusion.js";
import { createOrb, createGame, gazeToScreen, currentEntropy } from "./chaseme.js";
import "./chase.css";
 
export default {
  raf: 0,
  ctx: null,
  heat: null,
  hctx: null,
  orb: null,
  game: null,
  canvas: null,
  onResize: null,
 
  async mount(container) {
    container.innerHTML = `
      <div class="chase-stage">
        <canvas id="chase-canvas"></canvas>
        <div class="chase-tag">CHASE ME // HOLD THE ORB WITH YOUR EYES</div>
 
        <div class="chase-hud">
          <h1>THE HUNT</h1>
          <div class="crow"><span class="clabel">SCORE</span><span id="c-score" class="cval">0</span></div>
          <div class="crow"><span class="clabel">STREAK</span><span id="c-streak" class="cval">0.0s</span></div>
          <div class="crow"><span class="clabel">BEST</span><span id="c-best" class="cval">0.0s</span></div>
          <div class="crow"><span class="clabel">ORB CHAOS</span><span class="cbar"><i id="c-chaos"></i></span></div>
          <div class="crow"><span class="clabel">STATUS</span><span id="c-status" class="cval">SEEKING</span></div>
        </div>
      </div>
    `;
 
    this.canvas = container.querySelector("#chase-canvas");
    this.ctx = this.canvas.getContext("2d");
 
    // Low-res offscreen heatmap accumulator
    this.heat = document.createElement("canvas");
    this.hctx = this.heat.getContext("2d");
 
    this.orb = createOrb();
    this.game = createGame();
 
    this.hud = {
      score: container.querySelector("#c-score"),
      streak: container.querySelector("#c-streak"),
      best: container.querySelector("#c-best"),
      chaos: container.querySelector("#c-chaos"),
      status: container.querySelector("#c-status"),
    };
 
    this.resize();
    this.onResize = () => this.resize();
    addEventListener("resize", this.onResize);
 
    this.startLoop();
  },
 
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
    this.heat.width = Math.max(2, Math.floor(this.canvas.width / 8));
    this.heat.height = Math.max(2, Math.floor(this.canvas.height / 8));
    this.hctx.fillStyle = "#000";
    this.hctx.fillRect(0, 0, this.heat.width, this.heat.height);
  },
 
  startLoop() {
    let last = performance.now();
    let hudTick = 0;
 
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
 
      fuseAndSmooth();
      const entropy = currentEntropy();
 
      // Physics
      this.orb.update(dt, entropy);
 
      // Gaze -> screen, distance to orb
      const gaze = gazeToScreen(state.gazeSm);
      const dx = gaze.x - this.orb.x;
      const dy = gaze.y - this.orb.y;
      const dist = Math.hypot(dx, dy);
      const facePresent = state.faceSm > 0.5;
 
      // Hit radius scales with the orb's drawn radius plus a forgiving margin
      const hitRadius = this.orb.radius + 0.06;
      if (facePresent) this.game.update(dt, dist, hitRadius);
 
      this.render((now / 1000), gaze, facePresent);
 
      if (++hudTick % 6 === 0) this.updateHUD(entropy, facePresent);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
 
  render(time, gaze, facePresent) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const S = Math.min(w, h);
    const ox = (w - S) / 2;   // letterbox so 0..1 space stays square
    const oy = (h - S) / 2;
 
    const toPx = (nx, ny) => ({ x: ox + nx * S, y: oy + ny * S });
 
    // Void
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
 
    // ---- Gaze heatmap (soft attention trail) ----
    if (facePresent) {
      const hx = gaze.x * this.heat.width;
      const hy = gaze.y * this.heat.height;
      const r = Math.max(3, this.heat.width * 0.12);
      // Fade previous, add new blob additively
      this.hctx.globalCompositeOperation = "source-over";
      this.hctx.fillStyle = "rgba(0,0,0,0.06)";
      this.hctx.fillRect(0, 0, this.heat.width, this.heat.height);
      const grad = this.hctx.createRadialGradient(hx, hy, 0, hx, hy, r);
      grad.addColorStop(0, "rgba(53,224,242,0.16)");
      grad.addColorStop(1, "rgba(53,224,242,0)");
      this.hctx.globalCompositeOperation = "lighter";
      this.hctx.fillStyle = grad;
      this.hctx.fillRect(hx - r, hy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "screen";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.heat, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
 
    // ---- The orb ----
    const p = toPx(this.orb.x, this.orb.y);
    const R = this.orb.radius * S;
    const caught = this.game.onTarget;
 
    // Outer glow, brighter when caught
    const glow = ctx.createRadialGradient(p.x, p.y, R * 0.6, p.x, p.y, R * (caught ? 2.6 : 1.8));
    glow.addColorStop(0, caught ? "rgba(53,224,242,0.45)" : "rgba(53,224,242,0.18)");
    glow.addColorStop(1, "rgba(53,224,242,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - R * 3, p.y - R * 3, R * 6, R * 6);
 
    // Black body
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();
 
    // Cyan ring, pulsing
    const pulse = 0.7 + 0.3 * Math.sin(time * 3.0);
    ctx.lineWidth = Math.max(2, R * 0.14);
    ctx.strokeStyle = caught
      ? `rgba(140,238,249,${(0.8 + 0.2 * pulse).toFixed(3)})`
      : `rgba(53,224,242,${(0.55 + 0.35 * pulse).toFixed(3)})`;
    ctx.stroke();
 
    // Inner cyan core spark
    ctx.beginPath();
    ctx.arc(p.x, p.y, R * 0.18 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(140,238,249,0.9)";
    ctx.fill();
 
    // ---- Gaze reticle ----
    if (facePresent) {
      const gp = toPx(gaze.x, gaze.y);
      ctx.strokeStyle = caught ? "rgba(140,238,249,0.8)" : "rgba(53,224,242,0.4)";
      ctx.lineWidth = 1.5;
      const rr = S * 0.02;
      ctx.beginPath();
      ctx.moveTo(gp.x - rr, gp.y); ctx.lineTo(gp.x + rr, gp.y);
      ctx.moveTo(gp.x, gp.y - rr); ctx.lineTo(gp.x, gp.y + rr);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, rr, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(53,224,242,0.5)";
      ctx.font = "12px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("NO FACE DETECTED - LOOK INTO THE VOID", w / 2, h / 2);
    }
  },
 
  updateHUD(entropy, facePresent) {
    this.hud.score.textContent = this.game.score.toFixed(0);
    this.hud.streak.textContent = this.game.streak.toFixed(1) + "s";
    this.hud.best.textContent = this.game.bestStreak.toFixed(1) + "s";
    this.hud.chaos.style.width = (entropy * 100).toFixed(0) + "%";
    this.hud.status.textContent = !facePresent
      ? "SEEKING FACE"
      : this.game.onTarget ? "LOCKED" : "CHASING";
    this.hud.status.style.color = this.game.onTarget ? "#8ceef9" : "var(--cyan-dim)";
  },
 
  unmount() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.onResize) removeEventListener("resize", this.onResize);
    this.ctx = null;
    this.hctx = null;
    this.orb = null;
    this.game = null;
    this.hud = null;
    this.canvas = null;
  },
};
 