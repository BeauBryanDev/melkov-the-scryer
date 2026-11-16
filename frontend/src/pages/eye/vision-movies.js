/*
   VISION-MOVIES — TMDB movie card + the movie detail panel (cast, trailer,
   recommendations). Its base card styles (.card--movie, .poster, .rating,
   .year) are also reused by vision-games.js.
*/

import { PALETTE, BACKEND, esc } from "./vision-shared.js";

export function movieCard(c) {
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

function moviePanelHtml(d) {
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

/** Detail panel: { url(target) -> endpoint, render(data) -> html }. */
export const moviePanel = {
  url: ({ id }) => `${BACKEND}/api/v1/movies/${id}`,
  render: moviePanelHtml,
};

export const styles = `
        .card[data-movie-id] { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
        .card[data-movie-id]:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }

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

        .d-poster { width: 260px; flex: 0 0 auto; border-radius: 4px; box-shadow: 0 0 24px ${PALETTE.borderGlow}; }
        .d-poster--none { height: 380px; display: flex; align-items: center; justify-content: center; color: ${PALETTE.textDim}; }
        .tagline { font-style: italic; color: ${PALETTE.textDim}; font-size: 12px; margin-bottom: 10px; }
        .d-overview { font-size: 13px; line-height: 1.6; color: rgba(230,251,255,0.85); margin: 12px 0 16px; letter-spacing: 0.5px; }
        .trailer iframe { width: 100%; max-width: 640px; aspect-ratio: 16 / 9; border: 1px solid ${PALETTE.border}; border-radius: 4px; }
        .actor { flex: 0 0 auto; width: 110px; text-align: center; font-size: 10px; user-select: none; }
        .actor img, .actor-none { width: 110px; height: 140px; object-fit: cover; border-radius: 4px; border: 1px solid ${PALETTE.border}; display: block; margin-bottom: 6px; background: rgba(139,233,253,0.06); }
        .actor b { display: block; color: ${PALETTE.text}; font-weight: normal; }
        .actor span { color: ${PALETTE.textDim}; }
        /* Recommendation strip: must stay after the .card[data-movie-id]:hover rule above (same specificity). */
        .strip--cards .card--movie { width: 150px; animation: none; opacity: 1; transform: none; }
        .strip--cards .card--movie:hover { transform: translateY(-4px); }
        .strip--cards .card--movie .poster, .strip--cards .card--movie .poster--none { height: 210px; }
        .strip--cards .card--movie .body { padding: 8px 10px 10px; }
        .strip--cards .card--movie h3 { font-size: 11px; }
        .strip--cards .card--movie .overview, .strip--cards .card--movie .chips { display: none; }
        @media (max-width: 767px) {
          .d-poster { width: 180px; }
        }
`;
