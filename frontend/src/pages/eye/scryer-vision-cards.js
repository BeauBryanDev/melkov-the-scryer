/* ============================================================
   SCRYER-VISION-CARDS — custom element
   Renders Asher's leisure-tool results (movies, football fixtures/
   teams/standings) as a floating carousel of dark, cyan-glow cards —
   "a vision projected in the mirror." Fed by voice.js after an
   /api/v1/oracle reply carries a visual_payload.

   Dispatches `vision-show` / `vision-hide` CustomEvents on itself so
   the Eye page can fade the burning-eye canvas out/in without this
   component needing to know anything about the renderer.
   ============================================================ */

const PALETTE = {
  cardBg: "rgba(5,7,10,0.88)",
  border: "rgba(139,233,253,0.35)",
  borderGlow: "rgba(53,224,242,0.55)",
  text: "#e6fbff",
  textDim: "#8ceef9",
  accent: "#35e0f2",
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function movieCard(c) {
  const poster = c.poster_url
    ? `<img class="poster" src="${esc(c.poster_url)}" alt="${esc(c.title)}" loading="lazy" />`
    : `<div class="poster poster--none">NO IMAGE</div>`;
  const rating = typeof c.rating === "number" ? c.rating.toFixed(1) : "—";
  return `
    <div class="card card--movie">
      ${poster}
      <div class="body">
        <h3>${esc(c.title)} <span class="year">${esc(c.year)}</span></h3>
        <div class="rating">★ ${rating}</div>
        ${c.genres?.length ? `<div class="chips">${c.genres.map(g => `<span class="chip">${esc(g)}</span>`).join("")}</div>` : ""}
        ${c.overview ? `<p class="overview">${esc(c.overview)}</p>` : ""}
      </div>
    </div>`;
}

function fixtureCard(c) {
  return `
    <div class="card card--fixture">
      <div class="league">${esc(c.league)}</div>
      <div class="matchup">
        <div class="team">
          ${c.home_logo ? `<img class="crest" src="${esc(c.home_logo)}" alt="" loading="lazy" />` : ""}
          <span>${esc(c.home)}</span>
        </div>
        <div class="score">${c.home_goals ?? "-"} : ${c.away_goals ?? "-"}</div>
        <div class="team">
          ${c.away_logo ? `<img class="crest" src="${esc(c.away_logo)}" alt="" loading="lazy" />` : ""}
          <span>${esc(c.away)}</span>
        </div>
      </div>
      <div class="status">${esc(c.status)}</div>
    </div>`;
}

function teamCard(c) {
  return `
    <div class="card card--team">
      ${c.logo ? `<img class="crest crest--lg" src="${esc(c.logo)}" alt="" loading="lazy" />` : ""}
      <div class="body">
        <h3>${esc(c.name)}</h3>
        <p class="meta">${esc(c.country)}${c.founded ? ` · est. ${esc(c.founded)}` : ""}</p>
        ${c.venue ? `<p class="meta">${esc(c.venue)}</p>` : ""}
      </div>
    </div>`;
}

function standingsCard(rows) {
  const body = rows.map(r => `
    <tr>
      <td>${esc(r.rank)}</td>
      <td class="team-name">${esc(r.team)}</td>
      <td>${esc(r.played)}</td>
      <td>${esc(r.win)}</td>
      <td>${esc(r.draw)}</td>
      <td>${esc(r.lose)}</td>
      <td>${esc(r.goals_diff)}</td>
      <td class="pts">${esc(r.points)}</td>
    </tr>`).join("");
  return `
    <div class="card card--standings">
      <table>
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

class ScryerVisionCards extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;

    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>
        :host {
          display: block;
          font-family: "Courier New", monospace;
          letter-spacing: 1px;
          color: ${PALETTE.text};
          opacity: 0;
          pointer-events: none;
          transition: opacity 500ms ease;
        }
        :host(.visible) { opacity: 1; pointer-events: auto; }
        .veil {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, rgba(10,20,24,0.55) 0%, rgba(3,5,7,0.85) 75%);
        }
        .rail {
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
          gap: 22px;
          padding: 0 48px;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
        }
        .card {
          flex: 0 0 auto;
          background: ${PALETTE.cardBg};
          border: 1px solid ${PALETTE.border};
          box-shadow: 0 0 24px ${PALETTE.borderGlow}, inset 0 0 18px rgba(53,224,242,0.06);
          backdrop-filter: blur(8px);
          border-radius: 4px;
          opacity: 0;
          transform: scale(0.9) translateY(12px);
          animation: card-in 480ms ease forwards;
        }
        @keyframes card-in {
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .card--movie { width: 240px; }
        .card--movie .poster { width: 100%; height: 320px; object-fit: cover; display: block; }
        .card--movie .poster--none {
          height: 320px; display: flex; align-items: center; justify-content: center;
          color: ${PALETTE.textDim}; font-size: 11px; letter-spacing: 3px;
          background: rgba(139,233,253,0.06);
        }
        .card--movie .body { padding: 12px 14px 16px; }
        .card--movie h3 { font-size: 14px; color: ${PALETTE.text}; margin-bottom: 4px; }
        .card--movie .year { color: ${PALETTE.textDim}; font-weight: normal; font-size: 12px; }
        .card--movie .rating { color: ${PALETTE.accent}; font-size: 12px; margin-bottom: 8px; }
        .card--movie .overview {
          font-size: 11px; line-height: 1.5; color: rgba(230,251,255,0.75);
          display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
        }
        .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
        .chip {
          font-size: 9px; letter-spacing: 1px; padding: 2px 8px;
          border: 1px solid rgba(139,233,253,0.3); color: ${PALETTE.textDim};
          border-radius: 12px;
        }

        .card--fixture { width: 260px; padding: 16px; }
        .card--fixture .league { font-size: 10px; letter-spacing: 2px; color: ${PALETTE.textDim}; margin-bottom: 10px; text-align: center; }
        .card--fixture .matchup { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .card--fixture .team { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; flex: 1; text-align: center; }
        .card--fixture .crest { width: 32px; height: 32px; object-fit: contain; }
        .card--fixture .score { font-size: 20px; color: ${PALETTE.accent}; font-weight: bold; }
        .card--fixture .status { margin-top: 12px; font-size: 10px; text-align: center; color: rgba(230,251,255,0.6); letter-spacing: 1px; }

        .card--team { width: 260px; padding: 20px; display: flex; align-items: center; gap: 16px; }
        .card--team .crest--lg { width: 56px; height: 56px; object-fit: contain; }
        .card--team h3 { font-size: 14px; margin-bottom: 4px; }
        .card--team .meta { font-size: 11px; color: ${PALETTE.textDim}; }

        .card--standings { padding: 18px; max-height: 70vh; overflow-y: auto; }
        table { border-collapse: collapse; font-size: 11px; }
        th, td { padding: 5px 10px; text-align: center; white-space: nowrap; }
        th { color: ${PALETTE.textDim}; letter-spacing: 1px; font-size: 10px; border-bottom: 1px solid rgba(139,233,253,0.25); }
        td.team-name { text-align: left; color: ${PALETTE.text}; }
        td.pts { color: ${PALETTE.accent}; font-weight: bold; }
        tr:nth-child(even) td { background: rgba(139,233,253,0.04); }
      </style>
      <div class="veil"></div>
      <div class="rail" part="rail"></div>
    `;

    this._rail = this.shadowRoot.querySelector(".rail");
  }

  show(payload) {
    if (!this.shadowRoot) return;
    const cards = Array.isArray(payload) ? payload : [];
    if (!cards.length) return;

    // Standings render as one combined table card instead of one card per row.
    const standingRows = cards.filter(c => c.kind === "standing");
    const others = cards.filter(c => c.kind !== "standing");

    const html = [];
    let delay = 0;
    const withDelay = (markup) => {
      const staggered = markup.replace('class="card', `style="animation-delay:${delay}ms" class="card`);
      delay += 80;
      return staggered;
    };

    for (const c of others) {
      if (c.kind === "movie") html.push(withDelay(movieCard(c)));
      else if (c.kind === "fixture") html.push(withDelay(fixtureCard(c)));
      else if (c.kind === "team") html.push(withDelay(teamCard(c)));
    }
    if (standingRows.length) html.push(withDelay(standingsCard(standingRows)));

    this._rail.innerHTML = html.join("");
    this._rail.scrollLeft = 0;
    this.classList.add("visible");
    this.dispatchEvent(new CustomEvent("vision-show", { bubbles: true }));
  }

  hide() {
    if (!this.classList.contains("visible")) return;
    this.classList.remove("visible");
    this.dispatchEvent(new CustomEvent("vision-hide", { bubbles: true }));
    clearTimeout(this._clearT);
    this._clearT = setTimeout(() => {
      if (this._rail) this._rail.innerHTML = "";
    }, 550);
  }

  disconnectedCallback() {
    clearTimeout(this._clearT);
  }
}

customElements.define("scryer-vision-cards", ScryerVisionCards);
