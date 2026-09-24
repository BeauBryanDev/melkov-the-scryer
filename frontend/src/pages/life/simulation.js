
const SIM_VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const SIM_FRAG = `
precision highp float;

uniform sampler2D u_state;
uniform vec2  u_grid;       // grid dimensions in cells
uniform vec4  u_seeds[32];  // xy = cell coords, w = active (single-cell births)

float aliveAt(vec2 cell) {
  // Toroidal wrap done here via fract(); the texture is CLAMP_TO_EDGE, which
  // is why any (non-power-of-two) grid size is allowed.
  vec2 uv = fract((cell + 0.5) / u_grid);
  return step(0.5, texture2D(u_state, uv).r);
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) / u_grid;
  vec4 prev = texture2D(u_state, uv);

  float alive = step(0.5, prev.r);
  float age   = prev.g;

  // ---- Conway B3/S23, pure ----
  float n = 0.0;
  n += aliveAt(cell + vec2(-1.0, -1.0));
  n += aliveAt(cell + vec2( 0.0, -1.0));
  n += aliveAt(cell + vec2( 1.0, -1.0));
  n += aliveAt(cell + vec2(-1.0,  0.0));
  n += aliveAt(cell + vec2( 1.0,  0.0));
  n += aliveAt(cell + vec2(-1.0,  1.0));
  n += aliveAt(cell + vec2( 0.0,  1.0));
  n += aliveAt(cell + vec2( 1.0,  1.0));

  float next = 0.0;
  if (alive > 0.5) {
    next = (n == 2.0 || n == 3.0) ? 1.0 : 0.0;   // survival: S23
  } else {
    next = (n == 3.0) ? 1.0 : 0.0;               // birth: B3
  }

  // ---- User births: life can only be ADDED, one cell each ----
  for (int i = 0; i < 32; i++) {
    vec4 s = u_seeds[i];
    if (s.w < 0.5) continue;
    if (cell.x == floor(s.x) && cell.y == floor(s.y)) {
      next = 1.0;
      if (alive < 0.5) age = 0.0;   // newborn
    }
  }

  // ---- Age bookkeeping (purely cosmetic: newborns flash bright) ----
  float ghost = prev.b;
  if (next > 0.5) {
    age = alive > 0.5 ? min(1.0, age + 1.0 / 90.0) : 0.0;
    ghost = 0.0;
  } else {
    ghost = alive > 0.5 ? 1.0 : ghost * 0.88;   // fading afterglow of the dead
    age = 0.0;
  }

  gl_FragColor = vec4(next, age, ghost, 1.0);
}
`;

const DISPLAY_FRAG = `
precision highp float;

uniform sampler2D u_state;
uniform vec2  u_grid;
uniform vec2  u_res;
uniform float u_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Map screen to grid, square cells, centered (letterboxed on void)
  float cellPx = min(u_res.x, u_res.y) / u_grid.y;
  vec2 origin = 0.5 * (u_res - u_grid * cellPx);
  vec2 g = (gl_FragCoord.xy - origin) / cellPx;

  if (g.x < 0.0 || g.y < 0.0 || g.x >= u_grid.x || g.y >= u_grid.y) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 cell = floor(g);
  vec2 local = fract(g) - 0.5;
  vec4 st = texture2D(u_state, (cell + 0.5) / u_grid);

  float alive = step(0.5, st.r);
  float age = st.g;
  float ghost = st.b;

  vec3 col = vec3(0.0);

  if (alive > 0.5) {
    // Each cell breathes with its own phase: a colony, not a stadium wave
    float phase = hash(cell) * 6.28318;
    float pulse = 0.72 + 0.28 * sin(u_time * 2.2 + phase);
    float r = 0.40 * pulse + age * 0.05;

    float body = smoothstep(r, r - 0.16, length(local));
    float halo = smoothstep(0.78, 0.0, length(local)) * 0.22;

    // Newborns flash white-hot, elders settle into deep cyan
    vec3 cyan = vec3(0.21, 0.88, 0.95);
    vec3 newborn = vec3(0.85, 1.0, 1.0);
    vec3 base = mix(newborn, cyan, smoothstep(0.0, 0.12, age));

    col = base * (body * pulse + halo);
  } else if (ghost > 0.01) {
    // The dead leave fading light
    float g2 = smoothstep(0.45, 0.0, length(local));
    col = vec3(0.06, 0.30, 0.36) * ghost * g2;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSimulation(canvas, gridSize) {
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
  function program(frag) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, SIM_VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p));
    }
    return p;
  }

  const progSim = program(SIM_FRAG);
  const progDisplay = program(DISPLAY_FRAG);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
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
  const US = uniforms(progSim, ["state", "grid"]);
  US.seeds = gl.getUniformLocation(progSim, "u_seeds[0]");
  const UD = uniforms(progDisplay, ["state", "grid", "res", "time"]);

  // ---- Ping-pong state textures at grid resolution ----
  // NEAREST + CLAMP_TO_EDGE: NPOT-safe (power-of-two is no longer required).
  function makeTarget(initial) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridSize, gridSize, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, initial);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  function makeState(density) {
    const buf = new Uint8Array(gridSize * gridSize * 4);
    for (let i = 0; i < gridSize * gridSize; i++) {
      const on = density > 0 && Math.random() < density;
      buf[i * 4] = on ? 255 : 0;      // alive
      buf[i * 4 + 1] = 0;              // age
      buf[i * 4 + 2] = 0;              // ghost
      buf[i * 4 + 3] = 255;
    }
    return buf;
  }

  let a = makeTarget(makeState(0));   // start empty: the board is yours to seed
  let b = makeTarget(null);

  const seedBuf = new Float32Array(32 * 4);
  const readBuf = new Uint8Array(gridSize * gridSize * 4);

  function upload(target, data) {
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridSize, gridSize, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  const onResize = () => resize();
  const ro = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(onResize)
    : null;
  if (ro) ro.observe(canvas);
  addEventListener("resize", onResize);
  resize();
  requestAnimationFrame(resize);

  return {
    gridSize,

    /* One Conway generation. seeds: [{x, y}] single cells to bring to life. */
    step(seeds) {
      seedBuf.fill(0);
      for (let i = 0; i < Math.min(seeds.length, 32); i++) {
        const s = seeds[i];
        seedBuf[i * 4] = s.x;
        seedBuf[i * 4 + 1] = s.y;
        seedBuf[i * 4 + 3] = 1;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.viewport(0, 0, gridSize, gridSize);
      gl.useProgram(progSim);
      bindQuad(progSim);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(US.state, 0);
      gl.uniform2f(US.grid, gridSize, gridSize);
      gl.uniform4fv(US.seeds, seedBuf);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      [a, b] = [b, a];
    },

    /* Bring cells to life immediately, without advancing a generation.
       Used for live mouse-painting so drawing feels instant even when paused. */
    paint(cells) {
      if (!cells.length) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.readPixels(0, 0, gridSize, gridSize, gl.RGBA, gl.UNSIGNED_BYTE, readBuf);
      for (const c of cells) {
        const x = ((c.x % gridSize) + gridSize) % gridSize;
        const y = ((c.y % gridSize) + gridSize) % gridSize;
        const i = (y * gridSize + x) * 4;
        readBuf[i] = 255;
        readBuf[i + 1] = 0;
      }
      upload(a, readBuf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    clear() { upload(a, makeState(0)); },
    randomize(density = 0.16) { upload(a, makeState(density)); },

    /* Draw the current universe to the visible canvas. */
    render(time) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(progDisplay);
      bindQuad(progDisplay);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(UD.state, 0);
      gl.uniform2f(UD.grid, gridSize, gridSize);
      gl.uniform2f(UD.res, canvas.width, canvas.height);
      gl.uniform1f(UD.time, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    /* Count live cells (GPU readback, call sparingly ~2 Hz). */
    countPopulation() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.finish();
      gl.readPixels(0, 0, gridSize, gridSize, gl.RGBA, gl.UNSIGNED_BYTE, readBuf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let alive = 0;
      for (let i = 0; i < readBuf.length; i += 4) {
        if (readBuf[i] > 127) alive++;
      }
      return alive;
    },

    /* Screen pixel -> grid cell, accounting for the letterbox. */
    screenToCell(px, py) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const x = px * dpr;
      const y = canvas.height - py * dpr;   // gl origin bottom-left
      const cellPx = Math.min(canvas.width, canvas.height) / gridSize;
      const ox = 0.5 * (canvas.width - gridSize * cellPx);
      const oy = 0.5 * (canvas.height - gridSize * cellPx);
      const cx = (x - ox) / cellPx;
      const cy = (y - oy) / cellPx;
      if (cx < 0 || cy < 0 || cx >= gridSize || cy >= gridSize) return null;
      return { x: Math.floor(cx), y: Math.floor(cy) };
    },

    dispose() {
      ro?.disconnect();
      removeEventListener("resize", onResize);
      gl.deleteFramebuffer(a.fbo); gl.deleteFramebuffer(b.fbo);
      gl.deleteTexture(a.tex); gl.deleteTexture(b.tex);
      gl.deleteProgram(progSim); gl.deleteProgram(progDisplay);
      gl.deleteBuffer(quad);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
