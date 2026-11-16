/*
   VISION-BOOKS — book card (cover, authors, facts, description, preview/buy links).
*/

import { PALETTE, esc, safeUrl } from "./vision-shared.js";

export function bookCard(c) {
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

export const styles = `
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
`;
