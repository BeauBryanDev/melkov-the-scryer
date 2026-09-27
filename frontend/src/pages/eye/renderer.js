/* ============================================================
   WEBGL RENDERER  (factory form)
   createRenderer(canvas) builds a GL context, both shader
   programs, the ping-pong framebuffers and the two-pass render,
   and returns { frame(t), dispose() }.

   The page owns this: it is created in the Eye page's mount() and
   MUST be dispose()'d in unmount() so the GL context, textures and
   framebuffers are released instead of leaking one per visit.
   Reads the shared state each frame; writes nothing back.
   ============================================================ */

import { VERT, SCENE_FRAG, POST_FRAG } from "./shaders.js";
import { state } from "@/core/state.js";
import { CONFIG } from "@/core/config.js";

/* ---------- Visual smoothing (Eye page only) ----------
   state.*Sm are tuned for telemetry (Asher must read them fast). The screen
   gets a second, slower, time-based low-pass so face-mesh jitter and the 2.5 Hz
   neural updates never reach the fractal as sudden jumps. TAU = seconds to settle
   (independent of frame rate). The fractal clock is INTEGRATED (phase += dt * speed)
   instead of u_time * speed, which made the fractal lurch whenever speed changed. */
const TAU = { emotion: 1.4, entropy: 2.5, fear: 0.9, gaze: 0.35, roll: 0.5, mouth: 0.4, face: 0.8 };
const SPEED_SCALE = 0.38;   // global slow-down of the fractal animation (1 = old speed) - lowered again 2026-09, still too dizzying at 0.55

const lowpass = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL unavailable");

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function makeProgram(fragSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const progScene = makeProgram(SCENE_FRAG);
  const progPost  = makeProgram(POST_FRAG);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  function bindQuad(prog) {
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function uniforms(prog, names) {
    const out = {};
    for (const n of names) out[n] = gl.getUniformLocation(prog, "u_" + n);
    return out;
  }
  const US = uniforms(progScene, ["prev", "res", "time", "phase", "step", "emotion", "gaze", "roll", "mouth", "face", "entropy", "blink", "fear", "grab", "push", "spread"]);
  US.tips = gl.getUniformLocation(progScene, "u_tips[0]");
  const UP = uniforms(progPost, ["tex", "res", "time", "entropy"]);

  /* ---------- Ping-pong framebuffers ---------- */
  let texA, texB, fboA, fboB;

  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  function destroyTargets() {
    if (texA) gl.deleteTexture(texA);
    if (texB) gl.deleteTexture(texB);
    if (fboA) gl.deleteFramebuffer(fboA);
    if (fboB) gl.deleteFramebuffer(fboB);
    texA = texB = fboA = fboB = null;
  }

  const RENDER_SCALE = CONFIG.RENDER.SCALE;
  const MAX_DPR = CONFIG.RENDER.MAX_DPR;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width  = Math.floor(innerWidth  * dpr * RENDER_SCALE);
    canvas.height = Math.floor(innerHeight * dpr * RENDER_SCALE);
    destroyTargets();                 // release the old pair before allocating the new
    const a = makeTarget(canvas.width, canvas.height);
    const b = makeTarget(canvas.width, canvas.height);
    texA = a.tex; fboA = a.fbo;
    texB = b.tex; fboB = b.fbo;
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---------- Smoothed values the shader actually sees ---------- */
  let lastT = null;
  let phase = 0;
  let vis = null;

  function stepVisual(t) {
    const dt = lastT === null ? 0 : Math.min(Math.max(t - lastT, 0), 0.1);   // clamp: tab switches must not jump
    lastT = t;
    const s = state.smooth;
    if (!vis) {   // first frame: start AT the live values instead of easing up from zero
      vis = {
        emo: [s.anger, s.sadness, s.surprise, s.joy],
        gx: state.gazeSm.x, gy: state.gazeSm.y,
        roll: state.rollSm, mouth: state.mouthSm, face: state.faceSm,
        entropy: state.entropySm, fear: state.fearSm,
      };
    }
    const target = [s.anger, s.sadness, s.surprise, s.joy];
    for (let i = 0; i < 4; i++) vis.emo[i] = lowpass(vis.emo[i], target[i], dt, TAU.emotion);
    vis.gx      = lowpass(vis.gx, state.gazeSm.x, dt, TAU.gaze);
    vis.gy      = lowpass(vis.gy, state.gazeSm.y, dt, TAU.gaze);
    vis.roll    = lowpass(vis.roll, state.rollSm, dt, TAU.roll);
    vis.mouth   = lowpass(vis.mouth, state.mouthSm, dt, TAU.mouth);
    vis.face    = lowpass(vis.face, state.faceSm, dt, TAU.face);
    vis.entropy = lowpass(vis.entropy, state.entropySm, dt, TAU.entropy);
    vis.fear    = lowpass(vis.fear, state.fearSm, dt, TAU.fear);

    // Fractal clock: speed still follows the mood, but it only ever changes the RATE of a running clock.
    const [anger, sadness, surprise, joy] = vis.emo;
    const speed = 0.16 + anger * 0.5 + joy * 0.2 + surprise * 0.15 + vis.entropy * 0.2 - sadness * 0.1;
    phase += dt * Math.max(speed, 0.05) * SPEED_SCALE;
    return dt;
  }

  /* ---------- Two-pass render: scene+feedback into FBO, post to screen, swap ---------- */
  function frame(t) {
    const dt = stepVisual(t);
    // PASS A: render scene + feedback into fboB, reading texA
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progScene);
    bindQuad(progScene);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(US.prev, 0);
    gl.uniform2f(US.res, canvas.width, canvas.height);
    gl.uniform1f(US.time, t);
    gl.uniform1f(US.phase, phase);
    gl.uniform1f(US.step, Math.min(Math.max(dt * 60, 0.25), 3));   // 1.0 at 60 fps: feedback stays frame-rate independent
    gl.uniform4f(US.emotion, vis.emo[0], vis.emo[1], vis.emo[2], vis.emo[3]);
    gl.uniform2f(US.gaze, vis.gx, vis.gy);
    gl.uniform1f(US.roll, vis.roll);
    gl.uniform1f(US.mouth, vis.mouth);
    gl.uniform1f(US.face, vis.face);
    gl.uniform1f(US.entropy, vis.entropy);
    gl.uniform1f(US.blink, state.blinkSm);     // blinks stay fast
    gl.uniform1f(US.fear, vis.fear);
    gl.uniform4fv(US.tips, state.tips);
    gl.uniform2f(US.grab, state.grab.x, state.grab.y);
    gl.uniform1f(US.push, state.pushSm);
    gl.uniform1f(US.spread, state.spreadSm);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // PASS B: post-process fboB's texture to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progPost);
    bindQuad(progPost);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.uniform1i(UP.tex, 0);
    gl.uniform2f(UP.res, canvas.width, canvas.height);
    gl.uniform1f(UP.time, t);
    gl.uniform1f(UP.entropy, vis.entropy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // swap ping-pong
    [texA, texB] = [texB, texA];
    [fboA, fboB] = [fboB, fboA];
  }

  /* ---------- Release every GL resource + the context itself ---------- */
  function dispose() {
    window.removeEventListener("resize", resize);
    destroyTargets();
    gl.deleteProgram(progScene);
    gl.deleteProgram(progPost);
    gl.deleteBuffer(buf);
    // Force the driver to reclaim the context now rather than on GC.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { frame, dispose };
}
