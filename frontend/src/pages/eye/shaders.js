/* ============================================================
   GLSL SHADER SOURCE
   Pure string constants, no WebGL calls. Consumed by renderer.js.
   ============================================================ */

export const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

/* ---------- PASS A: scene + feedback accumulation ---------- */
export const SCENE_FRAG = `
precision highp float;

uniform sampler2D u_prev;
uniform vec2  u_res;
uniform float u_time;
uniform float u_phase;     // integrated fractal clock (renderer.js): never jumps when the mood changes speed
uniform float u_step;      // frame time in 60 fps units, keeps the feedback loop frame-rate independent
uniform vec4  u_emotion;   // x=anger y=sadness z=surprise w=joy
uniform vec2  u_gaze;
uniform float u_roll;
uniform float u_mouth;
uniform float u_face;
uniform float u_entropy;   // 0..1 chaos index
uniform float u_blink;     // 0 closed .. 1 open
uniform float u_fear;      // 0..1 neural fear: the eye widens

/* v3 hand uniforms */
uniform vec4  u_tips[10];  // xy scene pos, z intensity (velocity), w active 0/1
uniform vec2  u_grab;      // accumulated pinch-drag offset
uniform float u_push;      // 0..1 open palm pushed toward camera
uniform float u_spread;    // 0..1 two-hand portal spread

#define PI 3.14159265

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

/* ---------- Bicolor grade: black -> cyan ----------
   Every frame's final color is collapsed to a single intensity and
   remapped along this ramp, so the eye stays strictly black + cyan
   (dark cyan in the shadows, light cyan in the highlights) no matter
   what the emotion palettes above produce. */
vec3 cyanRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  t = pow(t, 1.25);                        // steeper gamma: darker mids, deeper shadows
  vec3 shadow = vec3(0.00, 0.05, 0.07);    // near-black, cold
  vec3 dark   = vec3(0.00, 0.17, 0.23);    // dark cyan
  vec3 mid    = vec3(0.00, 0.36, 0.44);    // cyan
  vec3 light  = vec3(0.13, 0.52, 0.60);    // muted cyan peak, well short of white
  vec3 c = mix(vec3(0.0), shadow, smoothstep(0.0, 0.12, t));
  c = mix(c, dark, smoothstep(0.10, 0.35, t));
  c = mix(c, mid,  smoothstep(0.35, 0.68, t));
  c = mix(c, light, smoothstep(0.68, 1.0, t));
  return c;
}

vec2 rot(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float snowLayer(vec2 uv, float t, float scale, float speed) {
  vec2 q = uv * scale;
  q.y += t * speed;
  q.x += sin(t * 0.4 + q.y * 0.7) * 0.3;
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  vec2 jit = vec2(hash(cell) - 0.5, hash(cell + 7.0) - 0.5) * 0.6;
  return smoothstep(0.05 + hash(cell + 3.0) * 0.06, 0.0, length(f - jit));
}

float emberLayer(vec2 uv, float t, float scale, float speed) {
  vec2 q = uv * scale;
  q.y -= t * speed;
  q.x += sin(t + q.y * 2.0) * 0.15;
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  vec2 jit = vec2(hash(cell) - 0.5, hash(cell + 11.0) - 0.5) * 0.7;
  float flick = 0.5 + 0.5 * sin(t * 6.0 + hash(cell) * 40.0);
  return smoothstep(0.06, 0.0, length(f - jit)) * flick;
}

/* ---------- THE EYE ----------
   Returns rgb premultiplied by its own alpha in .rgb and
   coverage mask in .a, so the caller can composite over the
   fractal background. p is scene-space relative to eye center. */
// Overall size of the eye, in the same units as irisR below (screen-heights).
// Lower = smaller and reads as "further back" in the scene; was 0.30. Users found
// the eye sitting too close to the front of the screen, overwhelming and a bit scary.
#define EYE_SCALE 0.64

vec4 magicEye(vec2 p, float t, float anger, float entropy, float blink, float push, float fear) {
  vec4 result = vec4(0.0);

  // Fear flings the lid open (can exceed 1.0: taller than wide, a startled stare)
  // and dilates everything. An open palm still overrides it and shuts the eye.
  blink = mix(blink, 1.22, fear * 0.7);
  blink *= (1.0 - push * 0.92);
  float irisR = (0.30 + entropy * 0.10 + fear * 0.11) * EYE_SCALE * (1.0 - push * 0.45);
  float r = length(p);
  float a = atan(p.y, p.x);

  if (r > irisR * 2.2) return result;           // early out

  // Eyelid: vertical squash. blink=0 fully closed.
  float lid = max(blink, 0.02);
  vec2 pe = vec2(p.x, p.y / lid);
  float re = length(pe);

  // --- Iris: radial fire filaments (fbm in polar space) ---
  float filaments = fbm(vec2(a * 6.0, re * 9.0 - t * 1.4));
  filaments += 0.5 * fbm(vec2(a * 14.0 + t * 0.3, re * 22.0 - t * 2.2));
  float irisMask = smoothstep(irisR, irisR * 0.92, re);
  float heat = filaments * (1.0 - smoothstep(0.0, irisR, re) * 0.55);
  vec3 irisCol = pal(heat + 0.05,
    vec3(0.55, 0.16, 0.03), vec3(0.55, 0.34, 0.10),
    vec3(1.0), vec3(0.0, 0.13, 0.26));
  irisCol += vec3(1.0, 0.55, 0.12) * pow(filaments, 3.0) * (1.2 + anger * 1.5);

  // --- Pupil: vertical slit, breathes with entropy ---
  float slitW = 0.045 + 0.02 * sin(t * 0.7) - entropy * 0.015 + fear * 0.05;
  float slitH = irisR * (0.75 + entropy * 0.2 + fear * 0.12);
  float slit = length(vec2(pe.x / max(slitW, 0.012), pe.y / slitH));
  float pupilMask = smoothstep(1.0, 0.75, slit);
  vec3 pupilCol = vec3(0.0);
  // faint void glow at the very center
  pupilCol += vec3(0.12, 0.0, 0.02) * smoothstep(0.4, 0.0, slit);

  // --- Corona: flames licking outward past the iris ---
  float flame = fbm(vec2(a * 4.0 + sin(t * 0.5), re * 6.0 - t * 2.5));
  float coronaBand = smoothstep(irisR * 1.9, irisR, re) * smoothstep(irisR * 0.85, irisR * 1.05, re);
  float corona = coronaBand * pow(flame, 1.5) * (1.0 + anger * 1.2 + entropy);
  vec3 coronaCol = vec3(1.0, 0.42, 0.08) * corona;

  vec3 col = mix(irisCol, pupilCol, pupilMask) * irisMask + coronaCol;
  float alpha = max(irisMask, corona * 0.85);

  // closed eye: a burning horizontal seam remains
  float seam = smoothstep(0.02, 0.0, abs(p.y)) * smoothstep(irisR * 1.4, 0.0, abs(p.x));
  col += vec3(1.0, 0.3, 0.05) * seam * (1.0 - blink) * 1.5;
  alpha = max(alpha, seam * (1.0 - blink));

  return vec4(col * alpha, alpha);
}

void main() {
  float anger    = u_emotion.x;
  float sadness  = u_emotion.y;
  float surprise = u_emotion.z;
  float joy      = u_emotion.w;
  float neutral  = clamp(1.0 - (anger + sadness + surprise + joy), 0.0, 1.0);
  float ent      = u_entropy;

  float t = u_phase;

  vec2 st = gl_FragCoord.xy / u_res;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  // Eye center drifts with the user's gaze (mirrored)
  vec2 eyeC = u_gaze * vec2(-0.30, 0.24) * EYE_SCALE;

  /* ---------- Fractal background ---------- */
  vec2 fuv = uv;
  fuv += u_gaze * vec2(-0.45, 0.35);
  fuv += u_grab;                                   // pinch-drag moves the world
  fuv = rot(fuv, -u_roll + t * 0.03);
  fuv *= mix(1.35, 0.55, clamp(u_mouth * 1.6, 0.0, 1.0));
  fuv *= mix(1.0, 0.45, u_spread);                 // two hands apart: dive through the portal

  // Fixed petal count: it used to change in whole steps with surprise/entropy, popping the whole symmetry
  float seg = 8.0;
  float ang = atan(fuv.y, fuv.x);
  float rad = length(fuv);
  ang = abs(mod(ang, 2.0 * PI / seg) - PI / seg);
  vec2 kuv = rad * vec2(cos(ang), sin(ang));

  float warpAmp = 0.09 + anger * 0.35 + ent * 0.22 + joy * 0.08;   // domain-warp jitter, toned down further
  vec2 flameDrift = vec2(0.0, -t * (0.4 + anger * 0.8));
  vec2 warp = vec2(fbm(kuv * 3.0 + flameDrift),
                   fbm(kuv * 3.0 + flameDrift + vec2(5.2, 1.3)));
  kuv += (warp - 0.5) * warpAmp;

  // Julia with entropy-gated depth: more chaos, deeper iteration
  vec2 z = kuv * 1.9;
  float cAng = t * 0.13;   // slower shape morph
  vec2 c = vec2(cos(cAng), sin(cAng * 1.3)) * (0.72 + 0.06 * sin(t * 0.5));
  float maxIt = 22.0 + ent * 38.0;
  float m = 0.0;
  float trap = 1e9;
  for (int i = 0; i < 60; i++) {
    if (float(i) >= maxIt) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(dot(z, z) - 0.8));
    if (dot(z, z) > 16.0) break;
    m += 1.0;
  }
  float f = m / maxIt;
  float glow = exp(-trap * 2.4) * 0.45;
  float tt = f + glow * 0.35 + fbm(kuv * 2.0 + t * 0.1) * 0.25;

  // Neutral anchored in cold frequencies; red belongs to anger only
  vec3 colNeutral = pal(tt + t * 0.04,
    vec3(0.50), vec3(0.45), vec3(1.0), vec3(0.55, 0.40, 0.60));
  vec3 colFire = pal(tt * 1.2,
    vec3(0.55, 0.18, 0.04), vec3(0.55, 0.35, 0.12), vec3(1.0), vec3(0.0, 0.12, 0.25));
  colFire += vec3(1.0, 0.45, 0.1) * glow * anger * 2.0;
  vec3 colSnow = mix(vec3(0.02, 0.06, 0.16), vec3(0.85, 0.93, 1.0), pow(tt, 1.4));
  colSnow = mix(colSnow, vec3(0.45, 0.65, 0.95), glow);
  vec3 colFlower = pal(tt,
    vec3(0.62, 0.35, 0.50), vec3(0.45, 0.40, 0.35), vec3(1.0, 1.0, 0.8), vec3(0.90, 0.25, 0.45));
  colFlower += vec3(1.0, 0.7, 0.9) * pow(glow, 2.0) * surprise;
  vec3 colJoy = pal(tt + t * 0.06,
    vec3(0.60, 0.45, 0.20), vec3(0.45, 0.40, 0.25), vec3(1.2, 1.0, 0.8), vec3(0.05, 0.20, 0.40));

  vec3 col = colNeutral * neutral + colFire * anger + colSnow * sadness
           + colFlower * surprise + colJoy * joy;

  // Particles - driven by u_phase (the same calmed clock as everything else above), not raw
  // u_time: these used to ignore the slow-down entirely and kept drifting at full speed.
  float snow = snowLayer(uv, t, 9.0, 0.22) + snowLayer(uv, t, 16.0, 0.38) * 0.6;
  col += vec3(0.9, 0.95, 1.0) * snow * sadness;
  float ember = emberLayer(uv, t, 12.0, 0.5) + emberLayer(uv, t, 20.0, 0.9) * 0.6;
  col += vec3(1.0, 0.5, 0.15) * ember * (anger + ent * 0.4);

  /* ---------- The Eye, composited on top ---------- */
  vec4 eye = magicEye(uv - eyeC, u_time, anger, ent, u_blink, u_push, u_fear);
  col = col * (1.0 - eye.a * 0.85) + eye.rgb;

  /* ---------- Fingertip light injection ----------
     Written before the feedback sample so every stroke is
     eaten by the dream loop and becomes a living trail.
     Trail color obeys the emotional state:
     anger paints fire, sadness paints snow, surprise paints
     petals, joy paints gold, neutral paints pure light. */
  vec3 rayCol = vec3(0.72, 0.90, 1.00)
              + pal(t * 0.12, vec3(0.0), vec3(0.18), vec3(1.0), vec3(0.0, 0.33, 0.67));
  vec3 trailCol = rayCol * neutral
                + vec3(1.00, 0.42, 0.08) * anger
                + vec3(0.80, 0.90, 1.00) * sadness
                + vec3(1.00, 0.55, 0.85) * surprise
                + vec3(1.00, 0.85, 0.35) * joy;
  for (int i = 0; i < 10; i++) {
    vec4 tip = u_tips[i];
    if (tip.w < 0.5) continue;
    float d2 = dot(uv - tip.xy, uv - tip.xy);
    float core  = exp(-d2 * 2200.0) * 1.6;              // hot core
    float halo  = exp(-d2 * 180.0) * 0.35;              // soft halo
    float spark = exp(-d2 * 600.0)
                * step(0.86, hash(floor(uv * 90.0) + floor(u_time * 24.0))) * 1.2;
    col += trailCol * (core + halo + spark) * (0.25 + tip.z);
  }

  /* ---------- Deep dream feedback ----------
     Sample the previous frame pulled toward the eye center,
     slightly rotated and fbm-warped, with a small channel
     rotation for the hue-drift hallucination effect. */
  vec2 ecSt = (eyeC * u_res.y + 0.5 * u_res) / u_res;
  vec2 d = st - ecSt;
  d = rot(d, (0.0005 + ent * 0.002) * u_step);
  d *= 1.0 - (0.0013 + ent * 0.004 + u_mouth * 0.003) * u_step;
  vec2 wobble = (vec2(fbm(st * 5.0 + u_time * 0.08), fbm(st * 5.0 + 31.7 - u_time * 0.06)) - 0.5)
              * (0.001 + ent * 0.003);
  vec3 prev = texture2D(u_prev, ecSt + d + wobble).rgb;
  prev = mix(prev, prev.gbr, 0.02 + ent * 0.03);   // slow hue rotation
  float decay = pow(0.54 + ent * 0.33 + sadness * 0.06, u_step); // entropy makes trails persist
  col = max(col, prev * decay);

  // No face: fade to breathing silver
  float breath = 0.55 + 0.15 * sin(u_time * 0.8);
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))) * breath * vec3(0.75, 0.8, 0.88), col, u_face);

  // Collapse to a single intensity, then grade to the black->cyan ramp.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = cyanRamp(lum);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------- PASS B: display with post-processing ---------- */
export const POST_FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_time;
uniform float u_entropy;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 st = gl_FragCoord.xy / u_res;
  vec2 cen = st - 0.5;

  // Gentle chromatic aberration (kept subtle so it stays in the cyan family)
  float ca = 0.0006 + u_entropy * 0.0018;
  vec2 dir = cen * ca;
  vec3 col;
  col.r = texture2D(u_tex, st + dir).r;
  col.g = texture2D(u_tex, st).g;
  col.b = texture2D(u_tex, st - dir).b;

  // Soft barrel glow lift
  col += texture2D(u_tex, st + cen * -0.02).rgb * 0.08;

  // Faint film grain (monochrome, tuned down so the image reads as clean)
  col += (hash(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) * 0.02;

  // Vignette
  col *= smoothstep(1.35, 0.35, length(cen * vec2(u_res.x / u_res.y, 1.0) * 2.0) * 0.5 + length(cen));

  gl_FragColor = vec4(col, 1.0);
}
`;
