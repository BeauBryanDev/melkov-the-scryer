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
  const US = uniforms(progScene, ["prev", "res", "time", "emotion", "gaze", "roll", "mouth", "face", "entropy", "blink", "fear", "grab", "push", "spread"]);
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

  /* ---------- Two-pass render: scene+feedback into FBO, post to screen, swap ---------- */
  function frame(t) {
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
    gl.uniform4f(US.emotion, state.smooth.anger, state.smooth.sadness, state.smooth.surprise, state.smooth.joy);
    gl.uniform2f(US.gaze, state.gazeSm.x, state.gazeSm.y);
    gl.uniform1f(US.roll, state.rollSm);
    gl.uniform1f(US.mouth, state.mouthSm);
    gl.uniform1f(US.face, state.faceSm);
    gl.uniform1f(US.entropy, state.entropySm);
    gl.uniform1f(US.blink, state.blinkSm);
    gl.uniform1f(US.fear, state.fearSm);
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
    gl.uniform1f(UP.entropy, state.entropySm);
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
