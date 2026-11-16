/*
   VISION-NEWS — GNews headline card; opens the source article in a new tab.
*/

import { PALETTE, esc, safeUrl, timeAgo } from "./vision-shared.js";

export function newsCard(c) {
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

export const styles = `
        .card--news { width: 260px; display: block; text-decoration: none; color: inherit; }
        a.card--news { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
        a.card--news:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 0 34px ${PALETTE.accent}; }
        .card--news .news-img { width: 100%; height: 140px; object-fit: cover; display: block; }
        .card--news .news-img--none { display: flex; align-items: center; justify-content: center; color: ${PALETTE.textDim}; font-size: 11px; border-bottom: 1px solid ${PALETTE.border}; }
        .card--news .body { padding: 12px 14px 16px; }
        .card--news h3 { font-size: 13px; line-height: 1.35; margin-bottom: 6px; color: ${PALETTE.text}; }
        .card--news .meta { font-size: 11px; color: ${PALETTE.textDim}; }
`;
