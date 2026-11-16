/*
   VISION-PLACES — place card (name, address, rating, open-now) linking out to maps.
*/

import { PALETTE, esc, safeUrl } from "./vision-shared.js";

export function placeCard(c) {
  const url = safeUrl(c.maps_url);
  const rating = typeof c.rating === "number" ? `★ ${c.rating.toFixed(1)}` : "";
  const reviews = typeof c.user_ratings_total === "number"
    ? `${c.user_ratings_total.toLocaleString()} reviews`
    : "";
  const status = c.open_now == null ? "" : c.open_now ? "OPEN NOW" : "CLOSED NOW";
  const body = `
    <div class="place-mark" aria-hidden="true">⌖</div>
    <div class="body">
      <h3>${esc(c.name)}</h3>
      ${c.address ? `<p class="place-address">${esc(c.address)}</p>` : ""}
      <div class="place-facts">
        ${rating ? `<span class="place-rating">${rating}</span>` : ""}
        ${reviews ? `<span>${esc(reviews)}</span>` : ""}
        ${status ? `<span class="place-status ${c.open_now ? "place-status--open" : ""}">${status}</span>` : ""}
      </div>
      ${url ? `<span class="place-link">OPEN IN MAPS ↗</span>` : ""}
    </div>`;
  return url
    ? `<a class="card card--place" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
    : `<div class="card card--place">${body}</div>`;
}

export const styles = `
        .card--place { width: 280px; min-height: 178px; display: flex; color: inherit; text-decoration: none; }
        .card--place:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }
        .card--place .place-mark {
          display: flex; align-items: center; justify-content: center; flex: 0 0 58px;
          color: ${PALETTE.accent}; font-size: 34px; border-right: 1px solid ${PALETTE.border};
          background: rgba(53,224,242,0.06);
        }
        .card--place .body { padding: 18px 16px; min-width: 0; }
        .card--place h3 { color: ${PALETTE.text}; font-size: 17px; line-height: 1.35; margin-bottom: 8px; }
        .place-address { color: rgba(230,251,255,0.75); font-size: 12px; line-height: 1.45; margin-bottom: 12px; }
        .place-facts { display: flex; flex-wrap: wrap; gap: 5px 10px; color: ${PALETTE.textDim}; font-size: 11px; line-height: 1.4; }
        .place-rating, .place-status--open { color: ${PALETTE.accent}; }
        .place-status { letter-spacing: 1px; }
        .place-link { display: inline-block; color: ${PALETTE.accent}; font-size: 11px; letter-spacing: 1px; margin-top: 16px; }
`;
