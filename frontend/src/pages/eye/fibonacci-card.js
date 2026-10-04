/* Standalone Fibonacci projection: geometry and presentation live here. */
const CYAN = "#35e0f2";
const BLUE = "#286cff";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
function sequenceFor(card) {
  if (Array.isArray(card.sequence) && card.sequence.length) return card.sequence;
  const n = Math.max(0, Math.min(500, Math.floor(Number(card.n) || 0)));
  const sequence = [0, 1];
  for (let i = 2; i <= n; i += 1) sequence.push(sequence[i - 1] + sequence[i - 2]);
  return sequence.slice(0, n + 1);
}
export function fibonacciGeometry(sequence) {
  const values = sequence.map((value) => Number(value) || 0);
  const largest = Math.max(...values, 1);
  const directions = ["right", "up", "left", "down"];
  const squares = [];
  let previous = { x: 0, y: 0, size: values[0] / largest };
  squares.push({ ...previous, index: 0, direction: "right" });
  for (let index = 1; index < values.length; index += 1) {
    const size = values[index] / largest;
    const direction = directions[(index - 1) % directions.length];
    let { x, y } = previous;
    if (direction === "right") x += previous.size;
    if (direction === "up") y -= size;
    if (direction === "left") x -= size;
    if (direction === "down") y += previous.size;
    const square = { x, y, size, index, direction };
    squares.push(square);
    previous = square;
  }
  const visible = squares.filter((square) => square.size > 0);
  const minX = Math.min(...visible.map((square) => square.x), 0);
  const minY = Math.min(...visible.map((square) => square.y), 0);
  const maxX = Math.max(...visible.map((square) => square.x + square.size), 1);
  const maxY = Math.max(...visible.map((square) => square.y + square.size), 1);
  return { squares, bounds: { minX, minY, width: maxX - minX, height: maxY - minY } };
}
function arcPath(square, ox, oy) {
  const x = square.x + ox, y = square.y + oy, s = square.size;
  if (square.direction === "right") return `M ${x} ${y + s} A ${s} ${s} 0 0 1 ${x + s} ${y}`;
  if (square.direction === "up") return `M ${x + s} ${y + s} A ${s} ${s} 0 0 1 ${x} ${y}`;
  if (square.direction === "left") return `M ${x + s} ${y} A ${s} ${s} 0 0 1 ${x} ${y + s}`;
  return `M ${x} ${y} A ${s} ${s} 0 0 1 ${x + s} ${y + s}`;
}
export function renderFibonacciSvg(card) {
  const { squares, bounds } = fibonacciGeometry(sequenceFor(card));
  const pad = Math.max(bounds.width, bounds.height) * 0.1 + 0.04;
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`;
  // Keep geometry and viewBox in the same coordinate system.
  const geometry = squares.filter((square) => square.size > 0).map((square) => `
    <rect class="fib-square" x="${square.x}" y="${square.y}" width="${square.size}" height="${square.size}" />
    <path class="fib-arc" d="${arcPath(square, 0, 0)}" />`).join("");
  return `<svg class="fib-svg" viewBox="${viewBox}" role="img" aria-label="Fibonacci spiral for n ${esc(card.n)}"><defs>
    <filter id="fib-cyan-glow"><feGaussianBlur stdDeviation=".018" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="fib-blue-glow"><feGaussianBlur stdDeviation=".022" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>${geometry}</svg>`;
}
class FibonacciCard extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { display:block; position:absolute; inset:0; z-index:6; pointer-events:none; opacity:0; transition:opacity 420ms ease; font-family:"Courier New",monospace; color:#e6fbff; }
      :host(.visible) { opacity:1; pointer-events:auto; }
      .veil { position:absolute; inset:0; background:radial-gradient(circle at center,rgba(5,22,35,.62),rgba(3,5,7,.92) 76%); }
      .card { position:relative; width:min(560px,calc(100vw - 42px)); max-height:calc(100% - 42px); margin:auto; top:50%; transform:translateY(-50%); padding:18px 20px 16px; box-sizing:border-box; border:1px solid rgba(53,224,242,.5); border-radius:6px; background:rgba(4,10,18,.9); box-shadow:0 0 32px rgba(40,108,255,.28),inset 0 0 24px rgba(53,224,242,.06); backdrop-filter:blur(10px); }
      .head { display:flex; align-items:baseline; justify-content:space-between; gap:18px; margin-bottom:10px; } h2 { margin:0; font-size:14px; letter-spacing:3px; color:${CYAN}; } .value { color:#b8c9ff; font-size:11px; letter-spacing:1px; }
      .graph { height:min(55vh,390px); min-height:240px; border:1px solid rgba(53,224,242,.16); background:linear-gradient(rgba(53,224,242,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(53,224,242,.035) 1px,transparent 1px); background-size:24px 24px; overflow:hidden; }
      .fib-svg { display:block; width:100%; height:100%; padding:14px; box-sizing:border-box; overflow:visible; } .fib-square { fill:rgba(53,224,242,.035); stroke:${CYAN}; stroke-width:.012; vector-effect:non-scaling-stroke; filter:url(#fib-cyan-glow); } .fib-arc { fill:none; stroke:${BLUE}; stroke-width:.022; stroke-linecap:round; vector-effect:non-scaling-stroke; filter:url(#fib-blue-glow); }
      .legend { display:flex; gap:18px; margin-top:10px; color:rgba(230,251,255,.6); font-size:10px; letter-spacing:1px; } .legend span::before { content:""; display:inline-block; width:18px; border-top:2px solid currentColor; margin:0 6px 3px 0; } .square-key { color:${CYAN}; } .arc-key { color:${BLUE}; }
    </style><div class="veil"></div><section class="card"><div class="head"><h2>FIBONACCI SPIRAL</h2><span class="value"></span></div><div class="graph"></div><div class="legend"><span class="square-key">SQUARES / NORMALIZED</span><span class="arc-key">90° ARCS</span></div></section>`;
    this._value = this.shadowRoot.querySelector(".value");
    this._graph = this.shadowRoot.querySelector(".graph");
    this.shadowRoot.querySelector(".veil").addEventListener("click", () => this.hide());
  }
  show(payload) {
    const card = (Array.isArray(payload) ? payload : []).find((item) => item.kind === "fibonacci");
    if (!card) return;
    this._value.textContent = `N = ${card.n ?? "—"} · F(N) = ${card.value ?? "—"}`;
    this._graph.innerHTML = renderFibonacciSvg(card);
    this.classList.add("visible");
    this.dispatchEvent(new CustomEvent("fibonacci-show", { bubbles: true }));
  }
  hide() { if (!this.classList.contains("visible")) return; this.classList.remove("visible"); this.dispatchEvent(new CustomEvent("fibonacci-hide", { bubbles: true })); }
}
customElements.define("scryer-fibonacci-card", FibonacciCard);
