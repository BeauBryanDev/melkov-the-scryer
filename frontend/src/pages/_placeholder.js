/* Placeholder page factory: every route resolves from day one.
   Replace each pages/<name>/index.js with the real page as it is built;
   the contract (mount/unmount) stays identical. */

export function makePlaceholder(title, subtitle) {
  let mounted = false;

  return {
    async mount(container) {
      mounted = true;
      container.innerHTML = `
        <div class="page-scroll">
          <h1 class="temple-title">${title}</h1>
          <div class="temple-panel">
            <p>${subtitle}</p>
            <p style="margin-top: 12px; color: var(--cyan-dim);">
              THIS CHAMBER IS STILL BEING CARVED.
            </p>
          </div>
        </div>
      `;
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      // Placeholders hold no resources. Real pages release
      // rAF loops, GL contexts, FBOs, and listeners here.
    },
  };
}
