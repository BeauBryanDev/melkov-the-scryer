
import { state } from "@/core/state.js";
import { CONFIG } from "@/core/config.js";
import { VERT, FRAG } from "./shaders.js";
 
export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    antialias: false, depth: false, stencil: false,
  });
  if (!gl) throw new Error("webgl not available");
 
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }
 
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);
 
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const locP = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(locP);
  gl.vertexAttribPointer(locP, 2, gl.FLOAT, false, 0, 0);
 
  const U = {};
  for (const n of ["res", "time", "phase", "emotion", "gaze", "roll", "mouth", "face", "entropy"]) {
    U[n] = gl.getUniformLocation(prog, "u_" + n);
  }
 
  const { SCALE, MAX_DPR } = CONFIG.RENDER;
 
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
    canvas.width  = Math.floor(innerWidth  * dpr * SCALE);
    canvas.height = Math.floor(innerHeight * dpr * SCALE);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
 
  const onResize = () => resize();
  addEventListener("resize", onResize);
  resize();
 
  // Calm layer: a second, slow low-pass on top of the shared smoothing so
  // the face jitter never reaches the fractal. TAU = seconds to settle.
  const TAU = 0.9;
  const SPEED_SCALE = 0.4;   // global slow-down of the fractal animation
  const calm = { anger: 0, sadness: 0, surprise: 0, joy: 0, gx: 0, gy: 0, roll: 0, mouth: 0, face: 0, ent: 0 };
  let phase = 0;
  let lastT = null;
  const lp = (cur, target, k) => cur + (target - cur) * k;

  return {
    frame(t) {
      const dt = lastT === null ? 0 : Math.min(t - lastT, 0.1);
      lastT = t;
      const k = 1 - Math.exp(-dt / TAU);

      const s = state.smooth;
      calm.anger    = lp(calm.anger,    s.anger,    k);
      calm.sadness  = lp(calm.sadness,  s.sadness,  k);
      calm.surprise = lp(calm.surprise, s.surprise, k);
      calm.joy      = lp(calm.joy,      s.joy,      k);
      calm.gx       = lp(calm.gx,       state.gazeSm.x, k);
      calm.gy       = lp(calm.gy,       state.gazeSm.y, k);
      calm.roll     = lp(calm.roll,     state.rollSm,   k);
      calm.mouth    = lp(calm.mouth,    state.mouthSm,  k);
      calm.face     = lp(calm.face,     state.faceSm,   k);
      calm.ent      = lp(calm.ent,      state.entropySm, k);

      // Integrate the animation phase instead of multiplying time by a
      // changing speed (which made the picture jump on every emotion shift).
      const speed = 0.15 + calm.anger * 0.7 + calm.joy * 0.35 + calm.surprise * 0.25
                  + calm.ent * 0.3 - calm.sadness * 0.10;
      phase += dt * Math.max(speed, 0.04) * SPEED_SCALE;

      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, t * 0.6);   // particle layers (snow/ember/petals) drift slower too
      gl.uniform1f(U.phase, phase);
      gl.uniform4f(U.emotion, calm.anger, calm.sadness, calm.surprise, calm.joy);
      gl.uniform2f(U.gaze, calm.gx, calm.gy);
      gl.uniform1f(U.roll, calm.roll);
      gl.uniform1f(U.mouth, calm.mouth);
      gl.uniform1f(U.face, calm.face);
      gl.uniform1f(U.entropy, calm.ent);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
 
    dispose() {
      removeEventListener("resize", onResize);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
 