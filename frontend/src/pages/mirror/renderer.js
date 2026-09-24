
import { CONFIG } from "@/core/config.js";

export function createMirrorRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  const VIDEO_ASPECT = CONFIG.CAMERA.WIDTH / CONFIG.CAMERA.HEIGHT;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, CONFIG.RENDER.MAX_DPR);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
  const onResize = () => resize();
  addEventListener("resize", onResize);
  resize();
 
  /* Map a video-normalized landmark to canvas pixels.
     Horizontally mirrored, like a real mirror. Cover-fit so the
     face keeps its aspect on any viewport. */
  function toCanvas(p) {
    const w = canvas.width;
    const h = canvas.height;
    let sx, sy;
    if (w / h > VIDEO_ASPECT) {
      sx = w;
      sy = w / VIDEO_ASPECT;
    } else {
      sy = h;
      sx = h * VIDEO_ASPECT;
    }
    return {
      x: w / 2 + (0.5 - p.x) * sx,
      y: h / 2 + (p.y - 0.5) * sy,
    };
  }
 
  return {
    frame(t, lm, geometry, gaze, facePresent) {
      const w = canvas.width;
      const h = canvas.height;

      // Void black, absolute
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      if (!lm || !facePresent) return;

      // Breathing alpha for the constellation
      const breathe = 0.75 + 0.25 * Math.sin(t * 1.6);
      const dot = Math.max(2.5, w * 0.0028);

      // ---- 468 points of light ----
      ctx.fillStyle = `rgba(120, 240, 255, ${breathe.toFixed(3)})`;
      for (let i = 0; i < lm.length; i++) {
        const p = toCanvas(lm[i]);
        ctx.fillRect(p.x - dot / 2, p.y - dot / 2, dot, dot);
      }

      // ---- Symmetry axis: forehead to chin ----
      const axTop = toCanvas(lm[10]);
      const axBot = toCanvas(lm[152]);
      ctx.strokeStyle = "rgba(53, 224, 242, 0.30)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(axTop.x, axTop.y);
      ctx.lineTo(axBot.x, axBot.y);
      ctx.stroke();
      ctx.setLineDash([]);
    },

    dispose() {
      removeEventListener("resize", onResize);
      // Canvas 2D holds no GPU resources beyond the elements themselves
    },
  };
}
 