
import { styles as baseStyles } from "./vision-styles.js";
import { enableDragScroll } from "./vision-drag.js";
import { movieCard, moviePanel, styles as movieStyles } from "./vision-movies.js";
import {
  fixtureCard, teamCard, standingsCard, teamPanel, fixturePanel, styles as footballStyles,
} from "./vision-football.js";
import { weatherCard, styles as weatherStyles } from "./vision-weather.js";
import { placeCard, styles as placeStyles } from "./vision-places.js";
import { newsCard, styles as newsStyles } from "./vision-news.js";
import { gameCard, styles as gameStyles } from "./vision-games.js";
import { bookCard, styles as bookStyles } from "./vision-books.js";
import { musicCard, artistCard, albumCard, styles as musicStyles } from "./vision-music.js";

/** payload item `kind` -> the function that renders ONE card for it. */
const CARD_RENDERERS = {
  movie: movieCard,
  fixture: fixtureCard,
  team: teamCard,
  weather: weatherCard,
  place: placeCard,
  news: newsCard,
  game: gameCard,
  book: bookCard,
  music: musicCard,
  artist: artistCard,
  album: albumCard,
};

/** "standing" items are the exception: all rows merge into ONE table card. */
const STANDING_KIND = "standing";

/** detail panel `type` -> { url(target) -> backend endpoint, render(data) -> html }. */
const PANELS = {
  movie: moviePanel,
  team: teamPanel,
  fixture: fixturePanel,
};

/** Shared chrome first, then each domain. Movies stay before games (games reuse the movie look). */
const DOMAIN_STYLES = [
  baseStyles,
  movieStyles,
  footballStyles,
  weatherStyles,
  placeStyles,
  bookStyles,
  musicStyles,
  gameStyles,
  newsStyles,
].join("\n");

const CARD_STAGGER_MS = 80;        // delay between each card's fade-in
const ARROW_SCROLL_FRACTION = 0.8; // an arrow click scrolls 80% of the rail width
const RAIL_CLEAR_DELAY_MS = 550;   // wait for the host fade-out before emptying the rail
const PANEL_CLEAR_DELAY_MS = 300;  // wait for the panel fade-out before emptying it

const TEMPLATE = `
  <style>${DOMAIN_STYLES}</style>
  <div class="veil"></div>
  <div class="rail" part="rail"></div>
  <button class="arrow arrow--prev" data-action="prev" aria-label="Previous" hidden>‹</button>
  <button class="arrow arrow--next" data-action="next" aria-label="Next" hidden>›</button>
  <div class="detail" part="detail"></div>
`;

const BACK_BUTTON = `<button class="btn" data-action="back">← BACK</button>`;
const panelMessage = (text) => `${BACK_BUTTON}<div class="msg">${text}</div>`;

/** Turn a visual_payload into the rail's card markup, each card fading in a beat after the last. */
function renderCards(payload) {
  let delay = 0;
  const staggered = (cardHtml) => {
    const html = cardHtml.replace('class="card', `style="animation-delay:${delay}ms" class="card`);
    delay += CARD_STAGGER_MS;
    return html;
  };

  const html = [];
  for (const item of payload) {
    const render = CARD_RENDERERS[item.kind];
    if (render) html.push(staggered(render(item)));
  }
  const standingRows = payload.filter(item => item.kind === STANDING_KIND);
  if (standingRows.length) html.push(staggered(standingsCard(standingRows)));
  return html.join("");
}

class ScryerVisionCards extends HTMLElement {


  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = TEMPLATE;

    this._rail = root.querySelector(".rail");
    this._detail = root.querySelector(".detail");
    this._prevArrow = root.querySelector(".arrow--prev");
    this._nextArrow = root.querySelector(".arrow--next");
    this._panelTrail = [];       // panels opened before the current one (drives BACK)
    this._currentPanel = null;   // the target of the open panel, or null
    this._justDragged = false;   // true for one tick after a drag, to swallow its click

    this._enableDrag(this._rail);
    this._rail.addEventListener("wheel", (e) => this._onRailWheel(e), { passive: false });
    this._rail.addEventListener("scroll", () => this._updateArrows(), { passive: true });
    root.addEventListener("click", (e) => this._onClick(e));

    this._onKey = (e) => { if (e.key === "Escape" && this._isPanelOpen()) this._goBack(); };
    this._onResize = () => this._updateArrows();
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("resize", this._onResize);
  }

  disconnectedCallback() {
    clearTimeout(this._railClearTimer);
    clearTimeout(this._panelClearTimer);
    this._panelRequest?.abort();
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("resize", this._onResize);
  }


  /** Project a vision: `payload` is the oracle's visual_payload (array of `{ kind, ... }` cards). */
  show(payload) {
    if (!this.shadowRoot) return;
    const cards = Array.isArray(payload) ? payload : [];
    if (!cards.length) return;

    this._rail.innerHTML = renderCards(cards);
    this._rail.scrollLeft = 0;
    this._closePanel();
    this.classList.add("visible");
    requestAnimationFrame(() => this._updateArrows());
    this.dispatchEvent(new CustomEvent("vision-show", { bubbles: true }));
  }

  /** Fade the vision out, then empty the rail once the fade has finished. */
  hide() {
    if (!this.classList.contains("visible")) return;
    this.classList.remove("visible");
    this._closePanel();
    this.dispatchEvent(new CustomEvent("vision-hide", { bubbles: true }));
    clearTimeout(this._railClearTimer);
    this._railClearTimer = setTimeout(() => {
      if (this._rail) this._rail.innerHTML = "";
    }, RAIL_CLEAR_DELAY_MS);
  }

  _enableDrag(scroller) {
    enableDragScroll(scroller, () => {
      this._justDragged = true;
      setTimeout(() => { this._justDragged = false; }, 0);
    });
  }

  /** A vertical wheel scrolls the rail sideways (the standings table keeps its own scroll). */
  _onRailWheel(e) {
    if (e.target.closest?.(".card--standings")) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      this._rail.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }

  _scrollRail(direction) {
    this._rail.scrollBy({ left: direction * this._rail.clientWidth * ARROW_SCROLL_FRACTION, behavior: "smooth" });
  }

  /** Show an arrow only when there is something left to scroll to on that side. */
  _updateArrows() {
    const rail = this._rail;
    if (!rail) return;
    const overflows = rail.scrollWidth > rail.clientWidth + 4;
    this._prevArrow.hidden = !overflows || rail.scrollLeft < 8;
    this._nextArrow.hidden = !overflows || rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
  }


  _onClick(e) {
    if (this._justDragged) { e.preventDefault(); return; }   // a drag must not follow a link

    const actionEl = e.target.closest("[data-action]");
    switch (actionEl?.dataset.action) {
      case "prev": return this._scrollRail(-1);
      case "next": return this._scrollRail(+1);
      case "back": return this._goBack();
      case "trailer": return this._playTrailer(actionEl.closest(".trailer"));
      default: return this._openPanel(this._panelTargetFor(e.target));
    }
  }

  /**
   * Which detail panel does a clicked element ask for?
   * Cards/rows declare it with data-fixture-id / data-team-id / data-movie-id
   * (+ data-league / data-season for the football context). Null if none.
   */
  _panelTargetFor(clicked) {
    const fixtureEl = clicked.closest("[data-fixture-id]");
    if (fixtureEl) return { type: "fixture", id: Number(fixtureEl.dataset.fixtureId) };

    const teamEl = clicked.closest("[data-team-id]");
    if (teamEl) {
      return {
        type: "team",
        id: Number(teamEl.dataset.teamId),
        league: Number(teamEl.dataset.league) || undefined,
        season: Number(teamEl.dataset.season) || undefined,
      };
    }

    const movieEl = clicked.closest("[data-movie-id]");
    if (movieEl) return { type: "movie", id: Number(movieEl.dataset.movieId) };

    return null;
  }

  _playTrailer(trailerBox) {
    trailerBox.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${trailerBox.dataset.key}?autoplay=1&rel=0"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  }

  _isPanelOpen() {
    return this._detail.classList.contains("open");
  }

  /**
   * Open (or drill into) a detail panel.
   * @param target  { type: "movie" | "team" | "fixture", id, league?, season? }
   * @param push    remember the current panel so BACK returns to it
   */
  async _openPanel(target, { push = true } = {}) {
    const panel = target && PANELS[target.type];
    if (!panel || !Number.isFinite(target.id)) return;

    if (push && this._currentPanel) this._panelTrail.push(this._currentPanel);
    this._currentPanel = target;

    this._detail.innerHTML = panelMessage("SUMMONING…");
    this._detail.classList.add("open");
    this._detail.scrollTop = 0;

    // Only the latest request may paint: a newer click cancels the older fetch.
    this._panelRequest?.abort();
    this._panelRequest = new AbortController();
    try {
      const res = await fetch(panel.url(target), { signal: this._panelRequest.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      this._detail.innerHTML = BACK_BUTTON + panel.render(data);
      this._detail.scrollTop = 0;
      this._detail.querySelectorAll("[data-strip]").forEach((strip) => this._enableDrag(strip));
    } catch (err) {
      if (err.name === "AbortError") return;
      this._detail.innerHTML = panelMessage("THE VISION FADES.");
    }
  }

  /** BACK / Esc: return to the previous panel, or close when there is none. */
  _goBack() {
    if (this._panelTrail.length) {
      this._openPanel(this._panelTrail.pop(), { push: false });
    } else {
      this._closePanel();
    }
  }

  _closePanel() {
    this._panelRequest?.abort();
    this._panelTrail = [];
    this._currentPanel = null;
    this._detail?.classList.remove("open");
    // Empty it after the fade so a playing trailer (iframe) stops with the panel.
    clearTimeout(this._panelClearTimer);
    this._panelClearTimer = setTimeout(() => {
      if (this._detail) this._detail.innerHTML = "";
    }, PANEL_CLEAR_DELAY_MS);
  }
}

customElements.define("scryer-vision-cards", ScryerVisionCards);
