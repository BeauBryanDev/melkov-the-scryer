/* ============================================================
   SCRYER-AUDIO-CHART — custom element
   Classic oscilloscope waveform + spectrum bars in blue-cyan.
   Fed by voice.js during push-to-talk (mic) and TTS playback.
   ============================================================ */

const PALETTE = {
  bg: "rgba(5,7,10,0.72)",
  grid: "rgba(63,159,176,0.14)",
  gridMid: "rgba(63,159,176,0.28)",
  mic: "#5fc4d6",
  micGlow: "rgba(95,196,214,0.45)",
  tts: "#8be9fd",
  ttsGlow: "rgba(139,233,253,0.5)",
  barLo: "#2f7f8c",
  barHi: "#a6f2ff",
  border: "rgba(139,233,253,0.32)",
  idle: "rgba(63,159,176,0.35)",
};

class ScryerAudioChart extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;

    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>
        :host {
          display: block;
          width: 280px;
          font-family: "Courier New", monospace;
          letter-spacing: 2px;
          pointer-events: none;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 10px;
          color: #6b7280;
        }
        .head span.active-mic { color: #5fc4d6; text-shadow: 0 0 10px rgba(95,196,214,0.6); }
        .head span.active-tts { color: #8be9fd; text-shadow: 0 0 10px rgba(139,233,253,0.65); }
        canvas {
          display: block;
          width: 100%;
          height: 72px;
          border: 1px solid rgba(139,233,253,0.25);
          background: rgba(5,7,10,0.55);
          backdrop-filter: blur(6px);
        }
      </style>
      <div class="head">
        <strong>VOICE FIELD</strong>
        <span id="mode">IDLE</span>
      </div>
      <canvas part="canvas"></canvas>
    `;

    this._modeEl = this.shadowRoot.getElementById("mode");
    this._canvas = this.shadowRoot.querySelector("canvas");
    this._ctx = this._canvas.getContext("2d");
    this._source = null;
    this._time = new Uint8Array(1024);
    this._freq = new Uint8Array(512);
    this._level = 0;
    this._idlePhase = 0;
    this._w = 280;
    this._h = 72;

    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(this);
    this._resize();
    this._raf = requestAnimationFrame(this._loop);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
  }

  setSource(source) {
    this._source = source;
    if (!this._modeEl) return;
    this._modeEl.textContent = source === "mic" ? "LISTENING"
      : source === "tts" ? "ORACLE"
      : "IDLE";
    this._modeEl.className = source === "mic" ? "active-mic"
      : source === "tts" ? "active-tts"
      : "";
  }

  push({ time, freq, source }) {
    if (time?.length) {
      const n = Math.min(time.length, this._time.length);
      this._time.set(time.subarray(0, n));
    }
    if (freq?.length) {
      const n = Math.min(freq.length, this._freq.length);
      this._freq.set(freq.subarray(0, n));
      let sum = 0;
      for (let i = 0; i < n; i++) sum += freq[i];
      this._level = sum / n / 255;
    }
    if (source) this.setSource(source);
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._w = this.clientWidth || 280;
    this._h = 72;
    this._canvas.width = Math.round(this._w * dpr);
    this._canvas.height = Math.round(this._h * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _loop() {
    this._draw();
    this._raf = requestAnimationFrame(this._loop);
  }

  _drawGrid(w, h) {
    const ctx = this._ctx;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      const x = (w * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const mid = h * 0.5;
    ctx.strokeStyle = PALETTE.gridMid;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
  }

  _drawWaveform(w, h, color, glow) {
    const ctx = this._ctx;
    const mid = h * 0.5;
    const amp = h * 0.36;
    const step = this._time.length / w;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const v = (this._time[Math.floor(x * step)] - 128) / 128;
      const y = mid + v * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Mirrored trace — classic audio-app look.
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const v = (this._time[Math.floor(x * step)] - 128) / 128;
      const y = mid - v * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawBars(w, h, source) {
    const ctx = this._ctx;
    const bars = 40;
    const barW = w / bars;
    const maxH = h * 0.42;
    const base = h - 2;

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * this._freq.length);
      const mag = this._freq[idx] / 255;
      const bh = Math.max(1, mag * maxH);
      const x = i * barW + 1;

      const grad = ctx.createLinearGradient(0, base, 0, base - bh);
      grad.addColorStop(0, PALETTE.barLo);
      grad.addColorStop(0.55, source === "tts" ? PALETTE.tts : PALETTE.mic);
      grad.addColorStop(1, PALETTE.barHi);

      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.55 + mag * 0.45;
      ctx.fillRect(x, base - bh, barW - 2, bh);

      // Symmetric peak mirror above center.
      ctx.globalAlpha = 0.18 + mag * 0.22;
      ctx.fillRect(x, 2, barW - 2, bh * 0.35);
    }
    ctx.globalAlpha = 1;
  }

  _drawIdle(w, h) {
    const ctx = this._ctx;
    const mid = h * 0.5;
    this._idlePhase += 0.035;
    const breathe = 0.04 + Math.sin(this._idlePhase) * 0.015;

    ctx.strokeStyle = PALETTE.idle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const t = x / w;
      const y = mid + Math.sin(t * Math.PI * 6 + this._idlePhase) * h * breathe;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _draw() {
    const ctx = this._ctx;
    const w = this._w;
    const h = this._h;
    this._drawGrid(w, h);

    if (this._source === "mic") {
      this._drawBars(w, h, "mic");
      this._drawWaveform(w, h, PALETTE.mic, PALETTE.micGlow);
    } else if (this._source === "tts") {
      this._drawBars(w, h, "tts");
      this._drawWaveform(w, h, PALETTE.tts, PALETTE.ttsGlow);
    } else {
      this._level *= 0.92;
      this._drawIdle(w, h);
    }

    ctx.strokeStyle = PALETTE.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }
}

customElements.define("scryer-audio-chart", ScryerAudioChart);
