/*
   VISION-GAMES — IGDB videogame card linking to the game's IGDB page.
   Reuses the movie card's look (.card--movie .poster/.rating/.year from
   vision-movies.js) and only adds its own link/meta rules.
*/

import { PALETTE, esc, safeUrl } from "./vision-shared.js";

export function gameCard(c) {
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

export const styles = `
        .card--game { display: block; text-decoration: none; color: inherit; }
        a.card--game { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
        a.card--game:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }
        .card--game .meta { font-size: 11px; color: ${PALETTE.textDim}; margin-top: 2px; }
`;
