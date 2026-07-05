/* ============================================================
   AEGIS SCRYER - TEMPLE ROUTER
   Hash-based, zero dependencies.

   Page contract: every page module default-exports
     {
       async mount(container)   // build DOM, acquire page resources,
                                // start render loops
       unmount()                // cancel rAF, release GL contexts and
                                // framebuffers, remove listeners.
                                // MUST be safe to call once.
     }

   Core services (camera, FaceMesh, emotion net, voice) are NOT pages:
   they boot once in main.js and never unmount. Pages only own what
   they render.
   ============================================================ */

const routes = {
  "/home":         () => import("./pages/home/index.js"),
  "/eye":          () => import("./pages/eye/index.js"),
  "/kaleidoscope": () => import("./pages/kaleidoscope/index.js"),
  "/mirror":       () => import("./pages/mirror/index.js"),
  "/graph":        () => import("./pages/graph/index.js"),
  "/life":         () => import("./pages/life/index.js"),
};

const DEFAULT_ROUTE = "/home";

let currentPage = null;
let navToken = 0;   // guards against out-of-order async navigations

function currentPath() {
  const path = location.hash.slice(1);
  return routes[path] ? path : DEFAULT_ROUTE;
}

function updateNav(path) {
  document.querySelectorAll("#temple-nav .nav-links a").forEach(a => {
    a.classList.toggle("active", a.dataset.route === path);
  });
}

async function navigate() {
  const token = ++navToken;
  const path = currentPath();
  const container = document.getElementById("page");

  // Unmount the outgoing page BEFORE loading the incoming one:
  // GL contexts, FBOs and rAF loops must be released first.
  if (currentPage?.unmount) {
    try {
      currentPage.unmount();
    } catch (err) {
      console.error("[ROUTER] unmount failed:", err);
    }
    currentPage = null;
  }
  container.innerHTML = "";

  let mod;
  try {
    mod = await routes[path]();
  } catch (err) {
    console.error("[ROUTER] failed to load page", path, err);
    container.innerHTML =
      `<div class="page-scroll"><div class="temple-panel">` +
      `THE TEMPLE DOOR IS SEALED. (${path} failed to load, see console)</div></div>`;
    return;
  }

  // A newer navigation started while this module was loading: abandon.
  if (token !== navToken) return;

  const page = mod.default;
  try {
    await page.mount(container);
  } catch (err) {
    console.error("[ROUTER] mount failed for", path, err);
    container.innerHTML =
      `<div class="page-scroll"><div class="temple-panel">` +
      `THE CHAMBER COLLAPSED WHILE OPENING. (see console)</div></div>`;
    return;
  }

  if (token !== navToken) {
    // Navigation raced past us during mount: clean up immediately.
    page.unmount?.();
    return;
  }

  currentPage = page;
  updateNav(path);
  container.focus({ preventScroll: true });
}

export function startRouter() {
  window.addEventListener("hashchange", navigate);
  if (!location.hash) location.hash = "#" + DEFAULT_ROUTE;
  navigate();
}
