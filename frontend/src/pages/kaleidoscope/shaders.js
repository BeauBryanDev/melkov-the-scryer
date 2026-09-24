
export const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;
 
export const FRAG = `
precision highp float;
 
uniform vec2  u_res;
uniform float u_time;
uniform float u_phase;   // integrated, slowed animation phase (see renderer.js)
uniform vec4  u_emotion;   // x=anger y=sadness z=surprise w=joy
uniform vec2  u_gaze;
uniform float u_roll;
uniform float u_mouth;
uniform float u_face;
uniform float u_entropy;
 
#define PI  3.14159265
#define TAU 6.28318530
 
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
 
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), f.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
 
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}
 
// Nested warp: fbm of coordinates already warped by fbm.
// Produces organic dendritic branching: neurons, roots, veins.
vec2 neuralWarp(vec2 p, float t, float amp) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.12)),
                fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.08),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.06));
  return (r - 0.5) * amp;
}
 
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}
 
vec2 rot(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
 
// Particle layers
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
 
// Petal particles: slow floating shapes with subtle rotation
float petalLayer(vec2 uv, float t, float scale) {
  vec2 q = uv * scale;
  q.y += t * 0.18;
  q.x += sin(t * 0.3 + q.y * 0.5) * 0.4;
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  vec2 jit = vec2(hash(cell) - 0.5, hash(cell + 17.0) - 0.5) * 0.55;
  vec2 d = f - jit;
  float angle = t * 0.5 + hash(cell + 3.0) * TAU;
  d = rot(d, angle);
  // Elongated petal shape
  float petal = length(d * vec2(2.4, 1.0));
  return smoothstep(0.08, 0.0, petal) * 0.7;
}
 
void main() {
  float anger    = u_emotion.x;
  float sadness  = u_emotion.y;
  float surprise = u_emotion.z;
  float joy      = u_emotion.w;
  float neutral  = clamp(1.0 - (anger + sadness + surprise + joy), 0.0, 1.0);
  float ent      = u_entropy;
 
  float t = u_phase;   // speed is already folded in on the JS side
 
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
 
  // Gaze steers, roll rotates, mouth zooms
  uv += u_gaze * vec2(-0.16, 0.12);
  uv = rot(uv, -u_roll * 0.5 + t * 0.025);
  uv *= mix(1.30, 0.90, clamp(u_mouth * 1.2, 0.0, 1.0));
 
  // ---- Kaleidoscope fold ----
  // Base symmetry: 6 (snowflake). Surprise adds petals, entropy adds complexity.
  // Joy creates star shapes (lower fold), anger creates organic chaos (higher fold).
  float seg = 6.0 + floor(surprise * 5.0) + floor(ent * 3.0) - floor(joy * 2.0);
  seg = max(3.0, seg);
  float ang = atan(uv.y, uv.x);
  float rad = length(uv);
  ang = abs(mod(ang, TAU / seg) - PI / seg);
  vec2 kuv = rad * vec2(cos(ang), sin(ang));
 
  // ---- Neural domain warp ----
  // Nested fbm creates dendritic branching: neurons when calm,
  // flame turbulence when angry, crystalline when sad.
  float warpAmp = 0.10 + anger * 0.30 + ent * 0.18 + joy * 0.06;
  vec2 flameDrift = vec2(0.0, -t * (0.30 + anger * 0.8));
  vec2 nw = neuralWarp(kuv * 2.5 + flameDrift, t, warpAmp);
  kuv += nw;
 
  // ---- Julia set with multi-trap orbit coloring ----
  vec2 z = kuv * 1.85;
  float cAng = t * 0.18;
  float cRad = 0.72 + 0.07 * sin(t * 0.45) + ent * 0.04;
  vec2 c = vec2(cos(cAng), sin(cAng * 1.3)) * cRad;
 
  float maxIt = 24.0 + ent * 36.0;
  float m = 0.0;
 
  // Multiple orbit traps for richer structure:
  float trapRing = 1e9;     // circular trap: the classic glow rings
  float trapLineX = 1e9;    // horizontal line trap: branching dendrites
  float trapLineY = 1e9;    // vertical line trap: root structures
  float trapCross = 1e9;    // diagonal cross: star filaments
 
  for (int i = 0; i < 60; i++) {
    if (float(i) >= maxIt) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
 
    float zz = dot(z, z);
    trapRing  = min(trapRing,  abs(zz - 0.8));
    trapLineX = min(trapLineX, abs(z.y));
    trapLineY = min(trapLineY, abs(z.x));
    trapCross = min(trapCross, abs(z.x - z.y) * 0.707);
 
    if (zz > 16.0) break;
    m += 1.0;
  }
 
  float f = m / maxIt;
 
  // Blend traps by emotion: anger wants dendrites, joy wants rings,
  // surprise wants stars, sadness wants the vertical roots.
  float glowRing  = exp(-trapRing  * 2.2);
  float glowLineX = exp(-trapLineX * 5.5);
  float glowLineY = exp(-trapLineY * 5.5);
  float glowCross = exp(-trapCross * 4.0);
 
  float dendrite = max(glowLineX, glowLineY) * 0.65;
  float stars    = glowCross * 0.55;
 
  float glow = glowRing * (0.35 + joy * 0.5 + neutral * 0.3)
             + dendrite * (0.25 + anger * 0.6 + sadness * 0.4)
             + stars * (0.15 + surprise * 0.7);
 
  // Texture coordinate for palette sampling
  float tt = f
           + glow * 0.40
           + fbm(kuv * 2.0 + t * 0.08) * 0.22
           + dendrite * 0.3 * anger
           + stars * 0.25 * surprise;
 
  // ---- Full color palettes per emotion ----
  // Neutral: rainbow cycle (the soul at rest drifts through all colors)
  vec3 colNeutral = pal(tt + t * 0.04,
    vec3(0.50), vec3(0.50), vec3(1.00), vec3(0.00, 0.33, 0.67));
 
  // Anger: deep reds, burning oranges, black veins
  vec3 colFire = pal(tt * 1.3,
    vec3(0.55, 0.12, 0.03), vec3(0.55, 0.30, 0.10),
    vec3(1.0), vec3(0.00, 0.10, 0.22));
  colFire += vec3(1.0, 0.40, 0.08) * glowRing * anger * 1.5;
  colFire += vec3(0.8, 0.15, 0.0) * dendrite * anger;
 
  // Sadness: deep blues, pale frost, silver branches
  vec3 colSnow = mix(
    vec3(0.01, 0.04, 0.14),
    vec3(0.82, 0.92, 1.00),
    pow(tt, 1.5));
  colSnow = mix(colSnow, vec3(0.40, 0.62, 0.92), glowRing * 0.55);
  colSnow += vec3(0.6, 0.7, 0.9) * dendrite * 0.5; // frost dendrites
 
  // Surprise: magenta blooms, violet petals, golden sparks
  vec3 colFlower = pal(tt,
    vec3(0.62, 0.30, 0.52), vec3(0.48, 0.42, 0.38),
    vec3(1.0, 1.0, 0.80), vec3(0.88, 0.22, 0.42));
  colFlower += vec3(1.0, 0.65, 0.88) * pow(glowRing, 2.0) * surprise * 0.8;
  colFlower += vec3(1.0, 0.9, 0.5) * stars * surprise; // star sparks
 
  // Joy: warm golds, amber, honey light
  vec3 colJoy = pal(tt + t * 0.05,
    vec3(0.62, 0.48, 0.22), vec3(0.48, 0.42, 0.28),
    vec3(1.20, 1.00, 0.80), vec3(0.04, 0.18, 0.38));
  colJoy += vec3(1.0, 0.85, 0.4) * glowRing * joy * 0.6;
 
  vec3 col = colNeutral * neutral
           + colFire    * anger
           + colSnow    * sadness
           + colFlower  * surprise
           + colJoy     * joy;
 
  // Dendrite brightening: the neural branches glow in white regardless of palette
  col += vec3(0.7, 0.8, 0.95) * dendrite * (0.12 + ent * 0.35);
 
  // ---- Particle overlays ----
  vec2 suv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
 
  // Snow
  float snow = snowLayer(suv, u_time, 9.0, 0.30)
             + snowLayer(suv, u_time, 18.0, 0.55) * 0.6
             + snowLayer(suv, u_time, 28.0, 0.85) * 0.35;
  col += vec3(0.88, 0.94, 1.0) * snow * sadness;
 
  // Embers
  float ember = emberLayer(suv, u_time, 10.0, 0.7)
              + emberLayer(suv, u_time, 18.0, 1.3) * 0.6;
  col += vec3(1.0, 0.45, 0.12) * ember * (anger + ent * 0.3);
 
  // Petals
  float petal = petalLayer(suv, u_time, 7.0)
              + petalLayer(suv, u_time, 12.0) * 0.5;
  col += vec3(1.0, 0.6, 0.8) * petal * surprise;
 
  // ---- No face: silver breathing ----
  float breath = 0.50 + 0.18 * sin(u_time * 0.7);
  vec3 dormant = vec3(dot(col, vec3(0.299, 0.587, 0.114))) * breath * vec3(0.72, 0.78, 0.86);
  col = mix(dormant, col, u_face);
 
  // ---- Vignette ----
  col *= smoothstep(1.40, 0.30, length(suv));
 
  gl_FragColor = vec4(col, 1.0);
}
`;