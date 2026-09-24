
import { CONFIG } from "@/core/config.js";
import { createSimulation } from "./simulation.js";
import "./life.css";

const C = CONFIG.GAME_OF_LIFE;

/* Traditional Conway's Game of Life.
   The mortal paints living cells with the mouse; B3/S23 does the rest.
   No score, no decay, no timer — just the classic automaton. */
export default {
  raf: 0,
  sim: null,
  paintQueue: [],
  painting: false,
  paused: false,
  generation: 0,
  listeners: [],

  async mount(container) {
    container.innerHTML = `
      <div class="life-stage">
        <canvas id="life-canvas"></canvas>
        <div class="life-tag">GAME OF LIFE // CLICK &amp; DRAG TO SOW LIFE</div>

        <div class="life-hud">
          <h1>CONWAY'S LIFE</h1>
          <div class="lrow"><span class="llabel">GENERATION</span><span id="l-gen" class="lval">0</span></div>
          <div class="lrow"><span class="llabel">POPULATION</span><span id="l-pop" class="lval">0</span></div>
          <div class="ldivider"></div>
          <div class="life-controls">
            <button class="ctl-btn" id="l-pause">PAUSE</button>
            <button class="ctl-btn" id="l-step">STEP</button>
            <button class="ctl-btn" id="l-random">RANDOM</button>
            <button class="ctl-btn" id="l-clear">CLEAR</button>
          </div>
          <p class="life-hint">Rules: a living cell with 2–3 neighbours survives; a dead cell with exactly 3 is born.</p>
        </div>
      </div>
    `;

    const canvas = container.querySelector("#life-canvas");
    this.sim = createSimulation(canvas, C.GRID);
    this.paintQueue = [];
    this.generation = 0;
    this.paused = false;

    this.hud = {
      gen: container.querySelector("#l-gen"),
      pop: container.querySelector("#l-pop"),
      pause: container.querySelector("#l-pause"),
    };

    this.bindInput(container, canvas);
    this.startLoop();
  },

  on(target, ev, fn) {
    target.addEventListener(ev, fn);
    this.listeners.push([target, ev, fn]);
  },

  bindInput(container, canvas) {
    const sow = (e) => {
      const rect = canvas.getBoundingClientRect();
      const cell = this.sim.screenToCell(e.clientX - rect.left, e.clientY - rect.top);
      if (cell) this.paintQueue.push(cell);
    };

    this.on(canvas, "pointerdown", (e) => { this.painting = true; sow(e); });
    this.on(canvas, "pointermove", (e) => { if (this.painting) sow(e); });
    this.on(window, "pointerup", () => { this.painting = false; });

    this.on(this.hud.pause, "click", () => {
      this.paused = !this.paused;
      this.hud.pause.textContent = this.paused ? "RESUME" : "PAUSE";
      this.hud.pause.classList.toggle("active", this.paused);
    });
    this.on(container.querySelector("#l-step"), "click", () => {
      this.sim.step(this.paintQueue.splice(0, 32));
      this.generation++;
    });
    this.on(container.querySelector("#l-random"), "click", () => {
      this.sim.randomize();
      this.generation = 0;
    });
    this.on(container.querySelector("#l-clear"), "click", () => {
      this.sim.clear();
      this.paintQueue = [];
      this.generation = 0;
    });
  },

  startLoop() {
    const tickInterval = 1 / C.TICKS_PER_S;
    let last = performance.now();
    let simAccum = 0;
    let popAccum = 0;
    const t0 = last;

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (this.paused) {
        // Still let the mouse draw while paused: paint instantly, no generation.
        if (this.paintQueue.length) {
          this.sim.paint(this.paintQueue.splice(0));
        }
      } else {
        simAccum += dt;
        while (simAccum >= tickInterval) {
          simAccum -= tickInterval;
          this.sim.step(this.paintQueue.splice(0, 32));
          this.generation++;
        }
      }

      popAccum += dt;
      if (popAccum >= 0.4) {
        popAccum = 0;
        this.hud.gen.textContent = this.generation.toString();
        this.hud.pop.textContent = this.sim.countPopulation().toLocaleString();
      }

      this.sim.render((now - t0) / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },

  unmount() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const [t, ev, fn] of this.listeners) t.removeEventListener(ev, fn);
    this.listeners = [];
    if (this.sim) {
      this.sim.dispose();
      this.sim = null;
    }
    this.hud = null;
  },
};
