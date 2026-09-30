/*  
   SCRYER-VISION-CARDS — custom element
   Renders Asher's leisure-tool results (movies, football fixtures/
   teams/standings) as a floating carousel of dark, cyan-glow cards —
   "a vision projected in the mirror." Fed by voice.js after an
   /api/v1/oracle reply carries a visual_payload.
*/

const PALETTE = {
  cardBg: "rgba(5,7,10,0.88)",
  border: "rgba(139,233,253,0.35)",
  borderGlow: "rgba(53,224,242,0.55)",
  text: "#e6fbff",
  textDim: "#8ceef9",
  accent: "#35e0f2",
};

const BACKEND = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8001").replace(/\/+$/, "");

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
    <div class="card card--movie"${c.id != null ? ` data-movie-id="${esc(c.id)}"` : ""}>
      ${poster}
      <div class="body">
        <h3>${esc(c.title)} <span class="year">${esc(c.year)}</span></h3>
        <div class="rating">★ ${rating}</div>
        ${c.genres?.length ? `<div class="chips">${c.genres.map(g => `<span class="chip">${esc(g)}</span>`).join("")}</div>` : ""}
        ${c.overview ? `<p class="overview">${esc(c.overview)}</p>` : ""}
      </div>
    </div>`;
}

// data-league / data-season carry the league context so a clicked team can load its table + fixtures.
function ctxAttrs(_teamId, league, season) {
  return `${league != null ? ` data-league="${esc(league)}"` : ""}${season != null ? ` data-season="${esc(season)}"` : ""}`;
}

const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
};

function fixtureRow(f) {
  return `
    <div class="frow" data-fixture-id="${esc(f.id)}"${ctxAttrs(null, f.league_id, f.season)}>
      <span class="fdate">${esc(fmtDate(f.date))}</span>
      <span class="fteam">${esc(f.home)}</span>
      <b class="fscore">${f.home_goals ?? "-"} : ${f.away_goals ?? "-"}</b>
      <span class="fteam">${esc(f.away)}</span>
      <span class="fstat">${esc(f.league)}</span>
    </div>`;
}

const EVENT_ICON = (e) =>
  e.type === "Goal" ? "⚽" :
  e.type === "Card" ? (/red/i.test(e.detail || "") ? "🟥" : "🟨") :
  e.type === "subst" ? "🔁" : e.type === "Var" ? "📺" : "•";

function teamPanelHtml(d) {
  const meta = [d.country, d.founded ? `est. ${d.founded}` : "", d.venue].filter(Boolean).join("  ·  ");
  const rows = (d.standings || []).map(r => `
    <tr${r.team_id === d.id ? ' class="me"' : ` class="clickable" data-team-id="${esc(r.team_id)}"${ctxAttrs(null, r.league_id, r.season)}`}>
      <td>${esc(r.rank)}</td><td class="team-name">${esc(r.team)}</td><td>${esc(r.played)}</td>
      <td>${esc(r.win)}</td><td>${esc(r.draw)}</td><td>${esc(r.lose)}</td><td>${esc(r.goals_diff)}</td><td class="pts">${esc(r.points)}</td>
    </tr>`).join("");
  return `
    <div class="d-top d-top--team">
      ${d.logo ? `<img class="crest crest--xl" src="${esc(d.logo)}" alt="" />` : ""}
      <div class="d-info"><h2>${esc(d.name)}</h2><div class="d-meta">${esc(meta)}</div></div>
    </div>
    ${d.recent?.length ? `<h4>RECENT MATCHES</h4><div class="flist">${d.recent.map(fixtureRow).join("")}</div>` : ""}
    ${d.upcoming?.length ? `<h4>UPCOMING</h4><div class="flist">${d.upcoming.map(fixtureRow).join("")}</div>` : ""}
    ${rows ? `<h4>LEAGUE TABLE</h4>
      <table class="dtable"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    ${!d.recent?.length && !d.upcoming?.length && !rows ? `<div class="msg">NO MORE VISIONS FOR THIS TEAM</div>` : ""}`;
}

function fixturePanelHtml(d) {
  const ctx = ctxAttrs(null, d.league_id, d.season);
  const side = (id, name, logo) => `
    <div class="fp-team"${id != null ? ` data-team-id="${esc(id)}"${ctx}` : ""}>
      ${logo ? `<img class="crest crest--lg" src="${esc(logo)}" alt="" />` : ""}<span>${esc(name)}</span>
    </div>`;
  const ht = d.halftime && (d.halftime.home != null) ? `HT ${d.halftime.home}:${d.halftime.away}` : "";
  const meta = [d.league, fmtDate(d.date), d.venue, d.referee ? `Ref: ${d.referee}` : "", ht].filter(Boolean).join("  ·  ");
  const status = d.elapsed && !/finished/i.test(d.status || "") ? `${d.status} · ${d.elapsed}'` : d.status;

  const events = (d.events || []).map(e => `
    <div class="ev ${e.team_id === d.home_id ? "ev--home" : "ev--away"}">
      <span class="ev-min">${esc(e.minute)}'</span><span>${EVENT_ICON(e)}</span>
      <span>${esc(e.player)} <em>${esc(e.detail)}</em></span>
    </div>`).join("");

  const lineups = (d.lineups || []).map(l => `
    <div class="lineup">
      <b>${esc(l.team)} ${l.formation ? `<em>${esc(l.formation)}</em>` : ""}</b>
      ${l.coach ? `<div class="d-meta">Coach: ${esc(l.coach)}</div>` : ""}
      ${(l.start_xi || []).map(p => `<div class="pl"><span>${esc(p.number)}</span>${esc(p.name)}</div>`).join("")}
    </div>`).join("");

  const homeStats = (d.statistics || []).find(x => x.team_id === d.home_id)?.stats || {};
  const awayStats = (d.statistics || []).find(x => x.team_id === d.away_id)?.stats || {};
  const stats = Object.keys(homeStats).map(k => `
    <tr><td>${esc(homeStats[k] ?? "-")}</td><td class="stat-k">${esc(k)}</td><td>${esc(awayStats[k] ?? "-")}</td></tr>`).join("");

  return `
    <div class="fp-head">
      ${side(d.home_id, d.home, d.home_logo)}
      <div class="fp-score"><div>${d.home_goals ?? "-"} : ${d.away_goals ?? "-"}</div><small>${esc(status)}</small></div>
      ${side(d.away_id, d.away, d.away_logo)}
    </div>
    <div class="d-meta fp-meta">${esc(meta)}</div>
    ${events ? `<h4>EVENTS</h4><div class="events">${events}</div>` : ""}
    ${stats ? `<h4>STATISTICS</h4><table class="dtable stats"><tbody>${stats}</tbody></table>` : ""}
    ${lineups ? `<h4>LINEUPS</h4><div class="lineups">${lineups}</div>` : ""}
    ${!events && !stats && !lineups ? `<div class="msg">THE MATCH HOLDS NO MORE SECRETS YET</div>` : ""}`;
}

function detailHtml(d) {
  const poster = d.poster_url
    ? `<img class="d-poster" src="${esc(d.poster_url)}" alt="${esc(d.title)}" />`
    : `<div class="d-poster d-poster--none">NO IMAGE</div>`;
  const runtime = d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}min` : "";
  const meta = [d.year, runtime, typeof d.rating === "number" ? `★ ${d.rating.toFixed(1)}` : ""].filter(Boolean).join("  ·  ");
  const cast = (d.cast || []).map(a => `
    <div class="actor">
      ${a.photo_url ? `<img src="${esc(a.photo_url)}" alt="" loading="lazy" />` : `<div class="actor-none"></div>`}
      <b>${esc(a.name)}</b><span>${esc(a.character)}</span>
    </div>`).join("");
  const recs = (d.recommendations || []).map(movieCard).join("");
  return `
    <div class="d-top">
      ${poster}
      <div class="d-info">
        <h2>${esc(d.title)}</h2>
        ${d.tagline ? `<p class="tagline">${esc(d.tagline)}</p>` : ""}
        <div class="d-meta">${esc(meta)}</div>
        ${d.directors?.length ? `<div class="d-meta">DIRECTED BY ${esc(d.directors.join(", "))}</div>` : ""}
        ${d.genres?.length ? `<div class="chips">${d.genres.map(g => `<span class="chip">${esc(g)}</span>`).join("")}</div>` : ""}
        ${d.overview ? `<p class="d-overview">${esc(d.overview)}</p>` : ""}
        ${d.trailer_key ? `<div class="trailer" data-key="${esc(d.trailer_key)}"><button class="btn" data-action="trailer">▶ PLAY TRAILER</button></div>` : ""}
      </div>
    </div>
    ${cast ? `<h4>CAST</h4><div class="strip" data-strip>${cast}</div>` : ""}
    ${recs ? `<h4>RECOMMENDATIONS</h4><div class="strip strip--cards" data-strip>${recs}</div>` : ""}`;
}

function fixtureCard(c) {
  return `
    <div class="card card--fixture"${c.id != null ? ` data-fixture-id="${esc(c.id)}"` : ""}${ctxAttrs(c.home_id, c.league_id, c.season)}>
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
    <div class="card card--team"${c.id != null ? ` data-team-id="${esc(c.id)}"` : ""}>
      ${c.logo ? `<img class="crest crest--lg" src="${esc(c.logo)}" alt="" loading="lazy" />` : ""}
      <div class="body">
        <h3>${esc(c.name)}</h3>
        <p class="meta">${esc(c.country)}${c.founded ? ` · est. ${esc(c.founded)}` : ""}</p>
        ${c.venue ? `<p class="meta">${esc(c.venue)}</p>` : ""}
      </div>
    </div>`;
}

function weatherCard(c) {
  const where = [c.place, c.region && c.region !== c.place ? c.region : null, c.country].filter(Boolean).join(", ");
  const days = (c.days || []).map(d => `
    <div class="wx-day">
      <span class="wx-dow">${esc(new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }))}</span>
      <span class="wx-cond">${esc(d.condition || "")}</span>
      <span class="wx-range">${esc(Math.round(d.temp_max))}° / ${esc(Math.round(d.temp_min))}°</span>
      ${d.rain_chance != null ? `<span class="wx-rain">${esc(d.rain_chance)}%</span>` : ""}
    </div>`).join("");
  return `
    <div class="card card--weather">
      <p class="wx-place">${esc(where)}</p>
      <div class="wx-now">
        <span class="wx-temp">${c.temperature != null ? esc(Math.round(c.temperature)) : "–"}°C</span>
        <span class="wx-desc">${esc(c.condition || "")}</span>
      </div>
      <p class="meta">feels ${c.feels_like != null ? esc(Math.round(c.feels_like)) : "–"}° · humidity ${esc(c.humidity ?? "–")}% · wind ${c.wind_kmh != null ? esc(Math.round(c.wind_kmh)) : "–"} km/h</p>
      <div class="wx-days">${days}</div>
    </div>`;
}

function timeAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const h = Math.floor((Date.now() - t) / 3600000);
  if (h < 1) return "under 1h ago";
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

// Only http(s) links are ever opened, whatever the API hands back.
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

function bookCard(c) {
  const cover = safeUrl(c.cover_url);
  const buyLink = safeUrl(c.buy_link);
  const previewLink = safeUrl(c.preview_link);
  const authors = Array.isArray(c.authors) ? c.authors.filter(Boolean).join(" · ") : "";
  const categories = Array.isArray(c.categories) ? c.categories.filter(Boolean) : [];
  const rating = typeof c.rating === "number" ? `★ ${esc(c.rating.toFixed(1))}` : "";
  const links = [
    previewLink ? `<a class="book-link" href="${esc(previewLink)}" target="_blank" rel="noopener noreferrer">PREVIEW</a>` : "",
    buyLink ? `<a class="book-link" href="${esc(buyLink)}" target="_blank" rel="noopener noreferrer">${c.price ? `BUY · ${esc(c.price)}` : "OPEN BOOK"}</a>` : "",
  ].filter(Boolean).join("");
  return `
    <article class="card card--book">
      ${cover ? `<img class="book-cover" src="${esc(cover)}" alt="${esc(c.title)}" loading="lazy" referrerpolicy="no-referrer" />` : `<div class="book-cover book-cover--none">NO COVER</div>`}
      <div class="body">
        <h3>${esc(c.title)}</h3>
        ${authors ? `<p class="book-authors">${esc(authors)}</p>` : ""}
        <div class="book-facts">
          ${c.published_date ? `<span>${esc(c.published_date)}</span>` : ""}
          ${c.publisher ? `<span>${esc(c.publisher)}</span>` : ""}
          ${c.page_count != null ? `<span>${esc(c.page_count)} pages</span>` : ""}
          ${rating ? `<span class="book-rating">${rating}</span>` : ""}
          ${c.price ? `<span>${esc(c.price)}</span>` : ""}
          ${c.id ? `<span>ID: ${esc(c.id)}</span>` : ""}
        </div>
        ${categories.length ? `<div class="chips">${categories.map(category => `<span class="chip">${esc(category)}</span>`).join("")}</div>` : ""}
        ${c.description ? `<p class="book-description">${esc(c.description)}</p>` : ""}
        ${links ? `<div class="book-links">${links}</div>` : ""}
      </div>
    </article>`;
}

function musicDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return "";
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function musicCard(c) {
  const cover = safeUrl(c.cover_url);
  const preview = safeUrl(c.preview_url);
  const link = safeUrl(c.link);
  const body = `
      ${cover ? `<img class="music-cover" src="${esc(cover)}" alt="${esc(c.title)}" loading="lazy" referrerpolicy="no-referrer" />` : `<div class="music-cover music-cover--none">NO COVER</div>`}
      <div class="body">
        <h3>${esc(c.title)}</h3>
        <p class="meta">${esc(c.artist || "Unknown artist")}</p>
        ${c.album ? `<p class="meta">${esc(c.album)}</p>` : ""}
        <div class="music-meta">${c.duration != null ? esc(musicDuration(c.duration)) : ""}</div>
        ${preview ? `<audio class="music-preview" controls preload="none" src="${esc(preview)}"></audio>` : ""}
        ${link ? `<a class="music-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">OPEN IN DEEZER</a>` : ""}
      </div>`;
  return `<div class="card card--music">${body}</div>`;
}

function artistCard(c) {
  const picture = safeUrl(c.picture_url);
  const link = safeUrl(c.link);
  const body = `
      ${picture ? `<img class="artist-picture" src="${esc(picture)}" alt="${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer" />` : `<div class="artist-picture artist-picture--none">NO IMAGE</div>`}
      <div class="body"><h3>${esc(c.name)}</h3></div>`;
  return link
    ? `<a class="card card--artist" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${body}</a>`
    : `<div class="card card--artist">${body}</div>`;
}

function albumCard(c) {
  const cover = safeUrl(c.cover_url);
  const link = safeUrl(c.link);
  const body = `
      ${cover ? `<img class="album-cover" src="${esc(cover)}" alt="${esc(c.title)}" loading="lazy" referrerpolicy="no-referrer" />` : `<div class="album-cover album-cover--none">NO COVER</div>`}
      <div class="body">
        <h3>${esc(c.title)}</h3>
        ${c.artist ? `<p class="meta">${esc(c.artist)}</p>` : ""}
        ${c.release_date ? `<p class="meta">Released ${esc(c.release_date)}</p>` : ""}
      </div>`;
  return link
    ? `<a class="card card--album" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${body}</a>`
    : `<div class="card card--album">${body}</div>`;
}

function newsCard(c) {
  const url = safeUrl(c.url);
  const img = safeUrl(c.image);
  const body = `
      ${img ? `<img class="news-img" src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : `<div class="news-img news-img--none">NO IMAGE</div>`}
      <div class="body">
        <h3>${esc(c.title)}</h3>
        <p class="meta">${esc(c.source || "")}${c.published_at ? ` · ${esc(timeAgo(c.published_at))}` : ""}</p>
      </div>`;
  return url
    ? `<a class="card card--news" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
    : `<div class="card card--news">${body}</div>`;
}

function gameCard(c) {
  const url = safeUrl(c.url);
  const cover = safeUrl(c.cover_url);
  const body = `
      ${cover ? `<img class="poster" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : `<div class="poster poster--none">NO IMAGE</div>`}
      <div class="body">
        <h3>${esc(c.title)}${c.year ? ` <span class="year">(${esc(c.year)})</span>` : ""}</h3>
        ${c.rating != null ? `<p class="rating">★ ${esc(c.rating)}/100</p>` : ""}
        ${c.genres?.length ? `<p class="meta">${esc(c.genres.join(" · "))}</p>` : ""}
        ${c.platforms?.length ? `<p class="meta">${esc(c.platforms.join(" · "))}</p>` : ""}
      </div>`;
  return url
    ? `<a class="card card--movie card--game" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
    : `<div class="card card--movie card--game">${body}</div>`;
}

function standingsCard(rows) {
  const body = rows.map(r => `
    <tr${r.team_id != null ? ` class="clickable" data-team-id="${esc(r.team_id)}"${ctxAttrs(null, r.league_id, r.season)}` : ""}>
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
        .rail { scroll-snap-type: x proximity; scroll-padding: 0 48px; cursor: grab; }
        .rail.dragging, .strip.dragging { scroll-snap-type: none; cursor: grabbing; user-select: none; }
        .card { scroll-snap-align: start; user-select: none; -webkit-user-select: none; }
        img { -webkit-user-drag: none; }
        .card[data-movie-id] { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
        .card[data-movie-id]:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }
        .arrow {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
          width: 44px; height: 64px; border: 1px solid ${PALETTE.border}; background: ${PALETTE.cardBg};
          color: ${PALETTE.accent}; font-size: 22px; cursor: pointer; border-radius: 4px;
          box-shadow: 0 0 14px ${PALETTE.borderGlow}; transition: opacity 200ms ease;
        }
        .arrow:hover { background: rgba(53,224,242,0.15); }
        .arrow--prev { left: 6px; } .arrow--next { right: 6px; }
        .arrow[hidden] { display: none; }

        .detail {
          position: absolute; inset: 0; z-index: 3; overflow-y: auto; padding: 28px 48px 48px;
          background: rgba(3,5,7,0.94); opacity: 0; pointer-events: none; transition: opacity 250ms ease;
        }
        .detail.open { opacity: 1; pointer-events: auto; }
        .btn {
          font: inherit; letter-spacing: 2px; font-size: 12px; padding: 9px 16px; cursor: pointer;
          color: ${PALETTE.accent}; background: rgba(53,224,242,0.08); border: 1px solid ${PALETTE.border}; border-radius: 4px;
        }
        .btn:hover { background: rgba(53,224,242,0.2); box-shadow: 0 0 14px ${PALETTE.borderGlow}; }
        .d-top { display: flex; gap: 28px; margin-top: 18px; align-items: flex-start; }
        .d-poster { width: 260px; flex: 0 0 auto; border-radius: 4px; box-shadow: 0 0 24px ${PALETTE.borderGlow}; }
        .d-poster--none { height: 380px; display: flex; align-items: center; justify-content: center; color: ${PALETTE.textDim}; }
        .d-info { flex: 1; min-width: 0; }
        .d-info h2 { font-size: 24px; margin-bottom: 6px; }
        .tagline { font-style: italic; color: ${PALETTE.textDim}; font-size: 12px; margin-bottom: 10px; }
        .d-meta { color: ${PALETTE.textDim}; font-size: 12px; margin-bottom: 8px; }
        .d-overview { font-size: 13px; line-height: 1.6; color: rgba(230,251,255,0.85); margin: 12px 0 16px; letter-spacing: 0.5px; }
        .trailer iframe { width: 100%; max-width: 640px; aspect-ratio: 16 / 9; border: 1px solid ${PALETTE.border}; border-radius: 4px; }
        h4 { margin: 28px 0 10px; font-size: 11px; letter-spacing: 3px; color: ${PALETTE.textDim}; }
        .strip { display: flex; gap: 14px; overflow-x: auto; padding: 4px 2px 12px; cursor: grab; scrollbar-width: thin; }
        .actor { flex: 0 0 auto; width: 110px; text-align: center; font-size: 10px; user-select: none; }
        .actor img, .actor-none { width: 110px; height: 140px; object-fit: cover; border-radius: 4px; border: 1px solid ${PALETTE.border}; display: block; margin-bottom: 6px; background: rgba(139,233,253,0.06); }
        .actor b { display: block; color: ${PALETTE.text}; font-weight: normal; }
        .actor span { color: ${PALETTE.textDim}; }
        .strip--cards .card--movie { width: 150px; animation: none; opacity: 1; transform: none; }
        .strip--cards .card--movie:hover { transform: translateY(-4px); }
        .strip--cards .card--movie .poster, .strip--cards .card--movie .poster--none { height: 210px; }
        .strip--cards .card--movie .body { padding: 8px 10px 10px; }
        .strip--cards .card--movie h3 { font-size: 11px; }
        .strip--cards .card--movie .overview, .strip--cards .card--movie .chips { display: none; }
        .card--fixture[data-fixture-id], .card--team[data-team-id] { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
        .card--fixture[data-fixture-id]:hover, .card--team[data-team-id]:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }
        tr.clickable { cursor: pointer; } tr.clickable:hover td { background: rgba(53,224,242,0.14); }
        tr.me td { background: rgba(53,224,242,0.22); color: ${PALETTE.text}; }
        .crest--xl { width: 96px; height: 96px; object-fit: contain; }
        .crest--lg { width: 64px; height: 64px; object-fit: contain; }
        .d-top--team { align-items: center; }
        .flist { display: flex; flex-direction: column; gap: 4px; }
        .frow {
          display: grid; grid-template-columns: 96px 1fr 64px 1fr 1.2fr; gap: 10px; align-items: center;
          padding: 8px 12px; font-size: 12px; border: 1px solid transparent; border-radius: 4px; cursor: pointer;
          background: rgba(139,233,253,0.04);
        }
        .frow:hover { border-color: ${PALETTE.border}; background: rgba(53,224,242,0.1); }
        .frow .fdate, .frow .fstat { color: ${PALETTE.textDim}; font-size: 10px; }
        .frow .fteam:first-of-type { text-align: right; }
        .frow .fscore { text-align: center; color: ${PALETTE.accent}; }
        .dtable { border-collapse: collapse; font-size: 12px; width: 100%; max-width: 640px; }
        .dtable td.stat-k { color: ${PALETTE.textDim}; font-size: 10px; letter-spacing: 1px; }
        .fp-head { display: flex; align-items: center; justify-content: center; gap: 28px; margin-top: 22px; }
        .fp-team { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; max-width: 240px; text-align: center; font-size: 14px; }
        .fp-team[data-team-id] { cursor: pointer; } .fp-team[data-team-id]:hover span { color: ${PALETTE.accent}; }
        .fp-score { text-align: center; font-size: 40px; color: ${PALETTE.accent}; font-weight: bold; }
        .fp-score small { display: block; font-size: 11px; color: ${PALETTE.textDim}; font-weight: normal; letter-spacing: 2px; }
        .fp-meta { text-align: center; margin-top: 14px; }
        .events { max-width: 640px; display: flex; flex-direction: column; gap: 3px; }
        .ev { display: grid; grid-template-columns: 44px 26px 1fr; font-size: 12px; padding: 4px 8px; border-left: 2px solid ${PALETTE.border}; }
        .ev--away { border-left-color: transparent; border-right: 2px solid ${PALETTE.border}; }
        .ev-min { color: ${PALETTE.textDim}; } .ev em, .lineup em { color: ${PALETTE.textDim}; font-size: 10px; font-style: normal; }
        .lineups { display: flex; gap: 40px; flex-wrap: wrap; }
        .lineup { min-width: 200px; font-size: 12px; }
        .pl { padding: 2px 0; } .pl span { display: inline-block; width: 28px; color: ${PALETTE.textDim}; }
        .msg { margin-top: 40px; text-align: center; color: ${PALETTE.textDim}; letter-spacing: 3px; font-size: 12px; }
        @media (max-width: 767px) {
          .detail { padding: 18px 16px 32px; }
          .d-top { flex-direction: column; }
          .d-poster { width: 180px; }
          .arrow { display: none; }
          .frow { grid-template-columns: 1fr 52px 1fr; } .frow .fdate, .frow .fstat { display: none; }
          .fp-head { gap: 10px; } .fp-score { font-size: 28px; }
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

        .card--weather { width: 280px; padding: 18px; }
        .card--weather .wx-place { font-size: 10px; letter-spacing: 2px; color: ${PALETTE.textDim}; text-transform: uppercase; margin-bottom: 10px; }
        .card--weather .wx-now { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; }
        .card--weather .wx-temp { font-size: 36px; color: ${PALETTE.accent}; font-weight: bold; }
        .card--weather .wx-desc { font-size: 13px; text-transform: capitalize; }
        .card--weather .meta { font-size: 11px; color: ${PALETTE.textDim}; }
        .card--weather .wx-days { margin-top: 14px; border-top: 1px solid ${PALETTE.border}; padding-top: 8px; }
        .card--weather .wx-day { display: grid; grid-template-columns: 34px 1fr auto 34px; gap: 8px; font-size: 11px; padding: 4px 0; align-items: center; }
        .card--weather .wx-cond { text-transform: capitalize; color: ${PALETTE.textDim}; }
        .card--weather .wx-rain { text-align: right; color: ${PALETTE.accent}; }

        .card--book { width: 290px; display: block; }
        .book-cover { width: 100%; height: 300px; object-fit: cover; display: block; }
        .book-cover--none { display: flex; align-items: center; justify-content: center; color: ${PALETTE.textDim}; background: rgba(139,233,253,0.06); font-size: 11px; letter-spacing: 2px; }
        .card--book .body { padding: 12px 14px 16px; }
        .card--book h3 { color: ${PALETTE.text}; font-size: 15px; line-height: 1.35; margin-bottom: 6px; }
        .book-authors { color: ${PALETTE.accent}; font-size: 11px; line-height: 1.4; margin-bottom: 8px; }
        .book-facts { display: flex; flex-wrap: wrap; gap: 4px 8px; color: ${PALETTE.textDim}; font-size: 10px; line-height: 1.4; margin-bottom: 8px; }
        .book-facts span + span::before { content: "·"; margin-right: 8px; color: ${PALETTE.borderGlow}; }
        .book-rating { color: ${PALETTE.accent}; }
        .book-description { color: rgba(230,251,255,0.78); font-size: 11px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 7; -webkit-box-orient: vertical; overflow: hidden; margin: 10px 0; }
        .book-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .book-link { color: ${PALETTE.accent}; font-size: 10px; letter-spacing: 1px; text-decoration: none; }
        .book-link:hover { text-decoration: underline; }

        .card--music, .card--artist, .card--album { width: 240px; display: block; color: inherit; text-decoration: none; }
        .card--music .music-cover, .card--artist .artist-picture, .card--album .album-cover { width: 100%; height: 210px; object-fit: cover; display: block; }
        .music-cover--none, .artist-picture--none, .album-cover--none { display: flex !important; align-items: center; justify-content: center; color: ${PALETTE.textDim}; background: rgba(139,233,253,0.06); font-size: 11px; letter-spacing: 2px; }
        .card--music .body, .card--artist .body, .card--album .body { padding: 12px 14px 16px; }
        .card--music h3, .card--artist h3, .card--album h3 { color: ${PALETTE.text}; font-size: 14px; margin-bottom: 6px; }
        .card--music .meta, .card--artist .meta, .card--album .meta { color: ${PALETTE.textDim}; font-size: 11px; margin: 3px 0; }
        .music-meta { color: ${PALETTE.accent}; font-size: 11px; margin-top: 8px; }
        .music-preview { width: 100%; height: 32px; margin-top: 10px; }
        .music-link { display: inline-block; color: ${PALETTE.accent}; font-size: 10px; letter-spacing: 1px; margin-top: 10px; }
        .card--artist:hover, .card--album:hover, .card--music:hover { transform: translateY(-6px) scale(1.02); }

        .card--game { display: block; text-decoration: none; color: inherit; }
        a.card--game { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
        a.card--game:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }
        .card--game .meta { font-size: 11px; color: ${PALETTE.textDim}; margin-top: 2px; }

        .card--news { width: 260px; display: block; text-decoration: none; color: inherit; }
        a.card--news { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
        a.card--news:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }
        .card--news .news-img { width: 100%; height: 140px; object-fit: cover; display: block; }
        .card--news .news-img--none { display: flex; align-items: center; justify-content: center; color: ${PALETTE.textDim}; font-size: 11px; border-bottom: 1px solid ${PALETTE.border}; }
        .card--news .body { padding: 12px 14px 16px; }
        .card--news h3 { font-size: 13px; line-height: 1.35; margin-bottom: 6px; color: ${PALETTE.text}; }
        .card--news .meta { font-size: 11px; color: ${PALETTE.textDim}; }

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
      <button class="arrow arrow--prev" data-action="prev" aria-label="Previous" hidden>‹</button>
      <button class="arrow arrow--next" data-action="next" aria-label="Next" hidden>›</button>
      <div class="detail" part="detail"></div>
    `;

    const root = this.shadowRoot;
    this._rail = root.querySelector(".rail");
    this._detail = root.querySelector(".detail");
    this._prev = root.querySelector(".arrow--prev");
    this._next = root.querySelector(".arrow--next");
    this._trail = [];
    this._current = null;

    this._wireDrag(this._rail);
    // Vertical wheel scrolls the rail sideways (standings table keeps its own scroll).
    this._rail.addEventListener("wheel", (e) => {
      if (e.target.closest?.(".card--standings")) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        this._rail.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
    this._rail.addEventListener("scroll", () => this._updateArrows(), { passive: true });

    root.addEventListener("click", (e) => this._onClick(e));
    this._onKey = (e) => { if (e.key === "Escape" && this._detail.classList.contains("open")) this._back(); };
    window.addEventListener("keydown", this._onKey);
    this._onResize = () => this._updateArrows();
    window.addEventListener("resize", this._onResize);
  }

  /** Mouse drag-to-scroll (touch already scrolls natively). Suppresses the click that ends a drag. */
  _wireDrag(el) {
    let down = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      down = { x: e.clientX, left: el.scrollLeft, moved: false };
    });
    el.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (!down.moved && Math.abs(dx) > 5) {
        down.moved = true;
        el.classList.add("dragging");
        el.setPointerCapture(e.pointerId);
      }
      if (down.moved) el.scrollLeft = down.left - dx;
    });
    const end = () => {
      if (down?.moved) {
        this._dragged = true;
        setTimeout(() => { this._dragged = false; }, 0);
      }
      el.classList.remove("dragging");
      down = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("dragstart", (e) => e.preventDefault());
  }

  _updateArrows() {
    const r = this._rail;
    if (!r) return;
    const overflow = r.scrollWidth > r.clientWidth + 4;
    this._prev.hidden = !overflow || r.scrollLeft < 8;
    this._next.hidden = !overflow || r.scrollLeft + r.clientWidth >= r.scrollWidth - 8;
  }

  _onClick(e) {
    if (this._dragged) { e.preventDefault(); return; }   // a drag must not follow a news link
    const actionEl = e.target.closest("[data-action]");
    const action = actionEl?.dataset.action;
    if (action === "prev" || action === "next") {
      this._rail.scrollBy({ left: (action === "next" ? 1 : -1) * this._rail.clientWidth * 0.8, behavior: "smooth" });
    } else if (action === "back") {
      this._back();
    } else if (action === "trailer") {
      const box = actionEl.closest(".trailer");
      box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${box.dataset.key}?autoplay=1&rel=0"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    } else {
      const ctx = (el) => ({ league: Number(el.dataset.league) || undefined, season: Number(el.dataset.season) || undefined });
      const fx = e.target.closest("[data-fixture-id]");
      const tm = e.target.closest("[data-team-id]");
      const mv = e.target.closest("[data-movie-id]");
      if (fx) this._openPanel({ type: "fixture", id: Number(fx.dataset.fixtureId) });
      else if (tm) this._openPanel({ type: "team", id: Number(tm.dataset.teamId), ...ctx(tm) });
      else if (mv) this._openPanel({ type: "movie", id: Number(mv.dataset.movieId) });
    }
  }

  /** Open (or drill into) a detail panel: { type: "movie" | "team" | "fixture", id, league?, season? }. */
  async _openPanel(target, { push = true } = {}) {
    if (!target || !Number.isFinite(target.id)) return;
    if (push && this._current) this._trail.push(this._current);
    this._current = target;
    const back = `<button class="btn" data-action="back">← BACK</button>`;
    this._detail.innerHTML = `${back}<div class="msg">SUMMONING…</div>`;
    this._detail.classList.add("open");
    this._detail.scrollTop = 0;

    const { type, id, league, season } = target;
    const qs = new URLSearchParams();
    if (league) qs.set("league", league);
    if (season) qs.set("season", season);
    const url = type === "movie" ? `${BACKEND}/api/v1/movies/${id}`
      : type === "team" ? `${BACKEND}/api/v1/football/team/${id}${qs.size ? `?${qs}` : ""}`
      : `${BACKEND}/api/v1/football/fixture/${id}`;
    const render = type === "movie" ? detailHtml : type === "team" ? teamPanelHtml : fixturePanelHtml;

    this._abort?.abort();
    this._abort = new AbortController();
    try {
      const res = await fetch(url, { signal: this._abort.signal });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      this._detail.innerHTML = back + render(d);
      this._detail.scrollTop = 0;
      this._detail.querySelectorAll("[data-strip]").forEach((el) => this._wireDrag(el));
    } catch (err) {
      if (err.name === "AbortError") return;
      this._detail.innerHTML = `${back}<div class="msg">THE VISION FADES.</div>`;
    }
  }

  _back() {
    if (this._trail.length) {
      this._openPanel(this._trail.pop(), { push: false });
    } else {
      this._closeDetail();
    }
  }

  _closeDetail() {
    this._abort?.abort();
    this._trail = [];
    this._current = null;
    this._detail?.classList.remove("open");
    // Drop the iframe so a playing trailer stops with the panel.
    clearTimeout(this._detailT);
    this._detailT = setTimeout(() => { if (this._detail) this._detail.innerHTML = ""; }, 300);
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
      else if (c.kind === "weather") html.push(withDelay(weatherCard(c)));
      else if (c.kind === "news") html.push(withDelay(newsCard(c)));
      else if (c.kind === "game") html.push(withDelay(gameCard(c)));
      else if (c.kind === "book") html.push(withDelay(bookCard(c)));
      else if (c.kind === "music") html.push(withDelay(musicCard(c)));
      else if (c.kind === "artist") html.push(withDelay(artistCard(c)));
      else if (c.kind === "album") html.push(withDelay(albumCard(c)));
    }
    if (standingRows.length) html.push(withDelay(standingsCard(standingRows)));

    this._rail.innerHTML = html.join("");
    this._rail.scrollLeft = 0;
    this._closeDetail();
    this.classList.add("visible");
    requestAnimationFrame(() => this._updateArrows());
    this.dispatchEvent(new CustomEvent("vision-show", { bubbles: true }));
  }

  hide() {
    if (!this.classList.contains("visible")) return;
    this.classList.remove("visible");
    this._closeDetail();
    this.dispatchEvent(new CustomEvent("vision-hide", { bubbles: true }));
    clearTimeout(this._clearT);
    this._clearT = setTimeout(() => {
      if (this._rail) this._rail.innerHTML = "";
    }, 550);
  }

  disconnectedCallback() {
    clearTimeout(this._clearT);
    clearTimeout(this._detailT);
    this._abort?.abort();
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("resize", this._onResize);
  }
}

customElements.define("scryer-vision-cards", ScryerVisionCards);
