
export const PHI = 1.6180339887;
 
/* Anatomically stable symmetric pairs (official mesh indices).
   Chosen from rigid facial structure, avoiding lips-only points
   that deform heavily with speech. */
export const SYMMETRY_PAIRS = [
  { name: "OUTER EYES", left: 33, right: 263 },
  { name: "INNER EYES", left: 133, right: 362 },
  { name: "BROW PEAKS", left: 105, right: 334 },
  { name: "CHEEKBONES", left: 234, right: 454 },
  { name: "NOSE WINGS", left: 48, right: 278 },
  { name: "MOUTH CORNERS", left: 61, right: 291 },
  { name: "JAW ANGLES", left: 172, right: 397 },
  { name: "JAWLINE MID", left: 132, right: 361 },
];
 
/* Golden ratio measurements. Each entry is two 3D distances
   whose quotient is compared against phi. */
export const GOLDEN_RATIOS = [
  { name: "HEIGHT / WIDTH", a: [10, 152], b: [234, 454] },
  { name: "FACE / JAW", a: [234, 454], b: [172, 397] },
  { name: "MOUTH / NOSE", a: [61, 291], b: [48, 278] },
  { name: "NOSE-CHIN / LIPS-CHIN", a: [1, 152], b: [14, 152] },
  { name: "EYES / NOSE", a: [133, 362], b: [48, 278] },
];
 
/* Midline landmarks defining the facial symmetry axis. */
const AXIS_TOP = 10;     // forehead / hairline
const AXIS_BOTTOM = 152; // chin
 
const clamp01 = (v) => Math.min(1, Math.max(0, v));
 
/* 3D euclidean distance on native MediaPipe coordinates. */
export function dist3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
 
/* Perpendicular distance from point p to the 2D line through a and b.
   2D on purpose: the symmetry axis is a projection onto the image
   plane, and roll-invariance comes from using the axis itself. */
function perpDistance(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = Math.hypot(abx, aby);
  if (len < 1e-9) return 0;
  // Cross product magnitude / axis length = perpendicular distance
  return Math.abs(abx * (a.y - p.y) - (a.x - p.x) * aby) / len;
}
 
/* Facial Symmetry Index over all pairs.
   Returns { fsi, pairs: [{ name, left, right, score }] } */
export function computeSymmetry(lm) {
  const top = lm[AXIS_TOP];
  const bottom = lm[AXIS_BOTTOM];
 
  const pairs = SYMMETRY_PAIRS.map((p) => {
    const dL = perpDistance(lm[p.left], top, bottom);
    const dR = perpDistance(lm[p.right], top, bottom);
    const hi = Math.max(dL, dR);
    const score = hi < 1e-9 ? 1 : Math.min(dL, dR) / hi;
    return { ...p, score };
  });
 
  const fsi = pairs.reduce((s, p) => s + p.score, 0) / pairs.length;
  return { fsi, pairs };
}
 
/* Golden ratio analysis.
   Returns { golden, ratios: [{ name, value, phiScore }] } */
export function computeGolden(lm) {
  const ratios = GOLDEN_RATIOS.map((r) => {
    const da = dist3D(lm[r.a[0]], lm[r.a[1]]);
    const db = dist3D(lm[r.b[0]], lm[r.b[1]]);
    const value = db < 1e-9 ? 0 : da / db;
    const phiScore = clamp01(1 - Math.abs(value - PHI) / PHI);
    return { ...r, value, phiScore };
  });
 
  const golden = ratios.reduce((s, r) => s + r.phiScore, 0) / ratios.length;
  return { golden, ratios };
}
 
/*
   Smoothed geometry tracker.
   Landmarks vibrate frame to frame; raw ratios flicker in the
   HUD. This wrapper EMA-smooths every published number so the
   mirror reads as calm measurement, not jitter.
*/
 
const EMA_A = 0.08;
const ema = (prev, next) => prev + (next - prev) * EMA_A;
 
const smooth = {
  fsi: 0,
  golden: 0,
  pairScores: new Array(SYMMETRY_PAIRS.length).fill(0),
  ratioValues: new Array(GOLDEN_RATIOS.length).fill(0),
  ratioScores: new Array(GOLDEN_RATIOS.length).fill(0),
  ready: false,
};
 
export function analyzeGeometry(lm) {
  if (!lm || lm.length < 468) return null;
 
  const sym = computeSymmetry(lm);
  const gold = computeGolden(lm);
 
  if (!smooth.ready) {
    // First frame: adopt values directly instead of easing from zero
    smooth.fsi = sym.fsi;
    smooth.golden = gold.golden;
    sym.pairs.forEach((p, i) => (smooth.pairScores[i] = p.score));
    gold.ratios.forEach((r, i) => {
      smooth.ratioValues[i] = r.value;
      smooth.ratioScores[i] = r.phiScore;
    });
    smooth.ready = true;
  } else {
    smooth.fsi = ema(smooth.fsi, sym.fsi);
    smooth.golden = ema(smooth.golden, gold.golden);
    sym.pairs.forEach((p, i) => (smooth.pairScores[i] = ema(smooth.pairScores[i], p.score)));
    gold.ratios.forEach((r, i) => {
      smooth.ratioValues[i] = ema(smooth.ratioValues[i], r.value);
      smooth.ratioScores[i] = ema(smooth.ratioScores[i], r.phiScore);
    });
  }
 
  return {
    fsi: smooth.fsi,
    golden: smooth.golden,
    pairs: sym.pairs.map((p, i) => ({ ...p, score: smooth.pairScores[i] })),
    ratios: gold.ratios.map((r, i) => ({
      ...r,
      value: smooth.ratioValues[i],
      phiScore: smooth.ratioScores[i],
    })),
  };
}
 
export function resetGeometry() {
  smooth.ready = false;
}