/*
   VISION-DRAG — mouse drag-to-scroll for a horizontal scroller (the card rail
   and the strips inside a detail panel). Touch is left alone: it already
   scrolls natively.
*/

const DRAG_THRESHOLD_PX = 5;   // below this a press is still a click, not a drag

/**
 * Make `el` scroll sideways while the mouse drags it.
 * @param {HTMLElement} el          the horizontal scroller
 * @param {() => void} onDragEnd    called when a real drag (not a click) ends,
 *                                  so the caller can ignore the click that follows
 */
export function enableDragScroll(el, onDragEnd) {
  let press = null;   // { startX, startScroll, isDrag } while the button is down

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    press = { startX: e.clientX, startScroll: el.scrollLeft, isDrag: false };
  });

  el.addEventListener("pointermove", (e) => {
    if (!press) return;
    const dx = e.clientX - press.startX;
    if (!press.isDrag && Math.abs(dx) > DRAG_THRESHOLD_PX) {
      press.isDrag = true;
      el.classList.add("dragging");
      el.setPointerCapture(e.pointerId);
    }
    if (press.isDrag) el.scrollLeft = press.startScroll - dx;
  });

  const release = () => {
    if (press?.isDrag) onDragEnd?.();
    el.classList.remove("dragging");
    press = null;
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("dragstart", (e) => e.preventDefault());   // no ghost-image drag of posters
}
