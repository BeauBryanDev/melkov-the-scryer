/*
 * Compact provenance card for advice retrieved from the book archive.
 * The element lives in the Eye page, while voice.js feeds it from the
 * /api/v1/oracle response.
 */

const esc = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

function sourceLine(source) {
  const parts = [];
  if (source.chapter) parts.push(source.chapter);
  if (source.chunk_index != null) parts.push(`CHUNK ${Number(source.chunk_index) + 1}`);
  if (source.start_page != null) parts.push(`PAGE ${source.start_page}`);
  return parts.join(" · ");
}

class ScryerKnowledgeSource extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: absolute;
          inset: 0;
          z-index: 6;
          pointer-events: none;
          display: block;
          font-family: "Courier New", monospace;
        }

        .card {
          position: absolute;
          left: 50%;
          bottom: 28px;
          width: min(360px, 34vw);
          transform: translate(-50%, 12px);
          padding: 10px 14px;
          box-sizing: border-box;
          color: #dffaff;
          background: rgba(5, 12, 18, 0.86);
          border: 1px solid rgba(53, 224, 242, 0.55);
          border-left: 3px solid #35e0f2;
          box-shadow: 0 0 24px rgba(53, 224, 242, 0.16);
          backdrop-filter: blur(8px);
          opacity: 0;
          visibility: hidden;
          transition: opacity 180ms ease, transform 180ms ease, visibility 180ms ease;
        }

        :host(.visible) .card {
          opacity: 1;
          visibility: visible;
          transform: translate(-50%, 0);
        }

        .eyebrow {
          margin-bottom: 6px;
          color: #8ceef9;
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 2px;
        }

        .book {
          color: #ffffff;
          font-size: 12px;
          line-height: 1.35;
          letter-spacing: 0.5px;
        }

        .source {
          margin-top: 4px;
          color: rgba(223, 250, 255, 0.68);
          font-size: 10px;
          line-height: 1.4;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        @media (max-width: 767px) {
          .card {
            bottom: calc(var(--nav-h, 64px) + 16px);
            width: min(330px, calc(100vw - 32px));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .card { transition: none; }
        }
      </style>
      <section class="card" aria-live="polite" aria-label="Knowledge source">
        <div class="eyebrow">ARCHIVE CONSULTED</div>
        <div class="content"></div>
      </section>
    `;
    this._card = this.shadowRoot.querySelector(".card");
    this._content = this.shadowRoot.querySelector(".content");
  }

  show(sources) {
    const items = Array.isArray(sources) ? sources.filter(Boolean) : [];
    if (!items.length || !this._content) return;

    this._content.innerHTML = items.map((source) => `
      <div class="book">${esc(source.book || "Unknown book")}</div>
      <div class="source">${esc(sourceLine(source))}</div>
    `).join("");
    this.classList.add("visible");
  }

  hide() {
    this.classList.remove("visible");
    if (this._content) this._content.textContent = "";
  }
}

customElements.define("scryer-knowledge-source", ScryerKnowledgeSource);
