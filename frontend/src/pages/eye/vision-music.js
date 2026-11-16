/*
   VISION-MUSIC — Deezer cards: track (with audio preview), artist, album.
*/

import { PALETTE, esc, safeUrl } from "./vision-shared.js";

function musicDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return "";
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function musicCard(c) {
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

export function artistCard(c) {
  const picture = safeUrl(c.picture_url);
  const link = safeUrl(c.link);
  const body = `
      ${picture ? `<img class="artist-picture" src="${esc(picture)}" alt="${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer" />` : `<div class="artist-picture artist-picture--none">NO IMAGE</div>`}
      <div class="body"><h3>${esc(c.name)}</h3></div>`;
  return link
    ? `<a class="card card--artist" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${body}</a>`
    : `<div class="card card--artist">${body}</div>`;
}

export function albumCard(c) {
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

export const styles = `
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
`;
