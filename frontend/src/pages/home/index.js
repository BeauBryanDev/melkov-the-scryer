import "./home.css";

const REPO_URL = "https://github.com/BeauBryanDev/aegis-scryer";

const CHAMBERS = [
  { route: "eye",          ico: "◉", name: "THE EYE",      desc: "A burning fractal eye that reads your emotion and answers by voice." },
  { route: "kaleidoscope", ico: "✦", name: "KALEIDOSCOPE", desc: "Your soul rendered as shifting symmetrical light." },
  { route: "mirror",       ico: "◇", name: "MIRROR",       desc: "468 face landmarks drawn as a breathing constellation." },
  { route: "chaseme",      ico: "➤", name: "CHASE ME",     desc: "Follow the light with your gaze and never lose it." },
  { route: "life",         ico: "▦", name: "GAME OF LIFE", desc: "Paint living cells and watch Conway's rules unfold." },
];

const PILLARS = [
  { h: "PRIVATE BY DESIGN", p: "Face, gaze and hand tracking run inside your browser. Only your spoken text and a few numbers reach the server, never video or audio." },
  { h: "THE ORACLE",        p: "Hold SPACE or tap the sigil to speak. Melkov answers in English, Spanish or French." },
  { h: "OPEN SOURCE",       p: "Every line that touches your camera is public. Trust is verified, not promised." },
];

const STACK = ["MediaPipe FaceMesh", "MediaPipe Hands", "EmotiEffLib B0", "WebGL fractals", "Piper TTS", "GPT-4o-mini"];

export default {
  async mount(container) {
    container.innerHTML = `
      <div class="home-scroll">

        <section class="hero">
          <div class="hero-orb">
            <img src="/Scryer_Eye_Orb.webp" alt="The Scryer Eye" width="360" height="360">
            <div class="hero-pulse" aria-hidden="true"></div>
            <div class="hero-pulse hero-pulse-2" aria-hidden="true"></div>
          </div>
          <h1 class="hero-title">AEGIS SCRYER</h1>
          <p class="hero-tagline">The mirror that reads what you carry.</p>
          <a href="#/eye" class="temple-btn hero-cta">ENTER THE TEMPLE</a>
          <p class="hero-note">Your camera is only requested when you enter a chamber.</p>
        </section>

        <section class="home-section">
          <h2 class="section-title">// THE CHAMBERS</h2>
          <div class="chamber-grid">
            ${CHAMBERS.map(c => `
              <a class="chamber-card" href="#/${c.route}">
                <span class="chamber-ico" aria-hidden="true">${c.ico}</span>
                <h3>${c.name}</h3>
                <p>${c.desc}</p>
              </a>`).join("")}
          </div>
        </section>

        <section class="home-section">
          <div class="pillar-grid">
            ${PILLARS.map(p => `
              <div class="pillar">
                <h3>${p.h}</h3>
                <p>${p.p}</p>
              </div>`).join("")}
          </div>
          <div class="stack-list">
            ${STACK.map(t => `<span class="stack-tag">${t}</span>`).join("")}
          </div>
          <a href="${REPO_URL}" target="_blank" rel="noopener" class="temple-btn source-btn">SEE THE SOURCE CODE</a>
        </section>

        <footer class="home-footer">
          <span>AEGIS SCRYER v5</span>
          <span>ALL PERCEPTION IS LOCAL</span>
        </footer>

      </div>
    `;
  },

  unmount() {
    // Pure DOM, no resources to release.
  },
};
