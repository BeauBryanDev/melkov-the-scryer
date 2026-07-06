
const CONFIG = {
  BACKEND_URL: "http://localhost:8001/api/v1/oracle",
  TTS_URL: "http://localhost:8001/api/v1/speak",   // server-side TTS (Piper)

  STT_ENGINE: "webspeech",      // "webspeech" | "whisper"
  WHISPER_MODEL: "onnx-community/whisper-base",
  DEFAULT_LANG: "en",           // "en" | "es" — starting language (see LANGS)

  MAX_HISTORY_TURNS: 8,
  PUSH_TO_TALK_KEY: "Space",
  

  // Client-side reverb — makes the oracle's voice sound cavernous / mystic.
  REVERB_SECONDS: 1.6,   // impulse tail length: bigger = larger "room"
  REVERB_DECAY: 3.2,     // exponential falloff of the tail (higher = shorter, tighter tail)
  REVERB_WET: 0.16,      // 0..1 wet mix (0 = dry, 1 = all reverb)
};
 
/* State */
 
const history = [];
let sttEngine = null;
let busy = false;
let audioCtx = null;
 
let ttsReady = false;

const micViz = { anim: 0, analyser: null, stream: null, ownsStream: false };

async function startMicViz(stream = null) {
  stopMicViz();
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  if (stream) {
    micViz.stream = stream;
    micViz.ownsStream = false;
  } else {
    micViz.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micViz.ownsStream = true;
  }

  const src = audioCtx.createMediaStreamSource(micViz.stream);
  micViz.analyser = audioCtx.createAnalyser();
  micViz.analyser.fftSize = 1024;
  micViz.analyser.smoothingTimeConstant = 0.78;
  src.connect(micViz.analyser);

  const timeBuf = new Uint8Array(micViz.analyser.fftSize);
  const freqBuf = new Uint8Array(micViz.analyser.frequencyBinCount);
  audioViz?.setSource?.("mic");

  const tick = () => {
    if (!micViz.analyser) return;
    micViz.analyser.getByteTimeDomainData(timeBuf);
    micViz.analyser.getByteFrequencyData(freqBuf);
    audioViz?.push?.({ time: timeBuf, freq: freqBuf, source: "mic" });
    micViz.anim = requestAnimationFrame(tick);
  };
  tick();
}

function stopMicViz() {
  cancelAnimationFrame(micViz.anim);
  micViz.anim = 0;
  micViz.analyser = null;
  if (micViz.ownsStream) micViz.stream?.getTracks?.().forEach(t => t.stop());
  micViz.stream = null;
  micViz.ownsStream = false;
  audioViz?.setSource?.(null);
}

const ui = { button: null, status: null, langBtn: null };

/** Eye-page audio chart; fed mic + TTS analyser frames while mounted. */
let audioViz = null;

export function attachAudioVisualizer(el) {
  audioViz = el;
}

const LANGS = {
  en: { webspeech: "en-US", whisper: "english", label: "EN" },
  es: { webspeech: "es-ES", whisper: "spanish", label: "ES" },   // Spain
  fr: { webspeech: "fr-FR", whisper: "french",  label: "FR" },
};

// Supported languages. `webspeech` = BCP-47 tag for the Web Speech API;
// `whisper` = language name transformers.js expects; `label` = toggle text.
// consult() and speakStreaming() send `lang: currentLang` so the backend
// picks the matching Piper voice and makes Melkov reply in that tongue.
// const LANGS = {
//   en: { webspeech: "en-US", whisper: "english", label: "EN" },
//   es: { webspeech: "es-ES", whisper: "spanish", label: "ES" },   // Spain
//   fr: { webspeech: "fr-FR", whisper: "french",  label: "FR" },
// };
let currentLang = CONFIG.DEFAULT_LANG;

function setLanguage(lang) {
  if (!LANGS[lang]) return;
  currentLang = lang;
  // Web Speech recognizer needs its language set live; Whisper reads
  // currentLang at transcribe time (see WhisperSTT.stop).
  if (sttEngine?.rec) sttEngine.rec.lang = LANGS[lang].webspeech;
  if (ui.langBtn) ui.langBtn.textContent = "[ " + LANGS[lang].label + " ]";
  setStatus("LANGUAGE: " + LANGS[lang].label);
}
 
/* Boot  */
 
export async function bootVoice() {
  buildUI();
  setStatus("SUMMONING VOICE...");
 
  // TTS now runs server-side (OpenAI via /api/v1/speak); nothing to load in
  // the browser, so the voice is ready as soon as the backend is reachable.
  ttsReady = true;

  sttEngine = CONFIG.STT_ENGINE === "whisper" ? new WhisperSTT() : new WebSpeechSTT();
  await sttEngine.init();
  setLanguage(currentLang);   // apply the starting language to STT + toggle

  bindPushToTalk();
}
 
/* - Telemetry sanitization
   The backend validates strictly (0..1 floats, literal enums).
   A single NaN or out-of-range value = 422. Clamp everything
   here so a glitchy frame can never poison a consultation. */
 
const GAZE_VALUES = new Set(["steady", "wandering", "avoiding"]);
 
function num01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
 
function sanitizeTelemetry(t) {
  t = t || {};
  return {
    anger: num01(t.anger),
    sadness: num01(t.sadness),
    surprise: num01(t.surprise),
    joy: num01(t.joy),
    fear: num01(t.fear),
    entropy: num01(t.entropy),
    symmetry: num01(t.symmetry),
    golden_ratio: num01(t.golden_ratio),
    dominant_state: typeof t.dominant_state === "string" ? t.dominant_state : "neutral",
    gaze_behavior: GAZE_VALUES.has(t.gaze_behavior) ? t.gaze_behavior : "steady",
    eye_contact: num01(t.eye_contact),
    face_present: Boolean(t.face_present),
  };
}
 
/*   Conversation loop   */
 
async function consult(userText) {
  const text = (userText || "").trim();
  if (!text || busy ) return;
  busy = true;
  setStatus("THE MIRROR IS THINKING...");
 
  const telemetry = sanitizeTelemetry(window.Scryer?.getTelemetry?.());
  const t0 = performance.now();
  try {
    const res = await fetch(CONFIG.BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        telemetry,
        history: history.slice(-CONFIG.MAX_HISTORY_TURNS),
        lang: currentLang,
      }),
      
    });
    
    console.log("[SCRYER] oracle latency:", ((performance.now() - t0) / 1000).toFixed(1), "s");

    if (res.status === 422) {
      // Surface exactly which field the backend rejected
      console.error("oracle 422 detail:", await res.json());
      throw new Error("payload rejected by oracle schema");
    }
    if (!res.ok) {
      if (res.status === 502 && !consult._retried) {
        consult._retried = true;
        console.warn("[SCRYER] oracle 502, retrying once...");
        busy = false;
        return consult(userText);
      }
      consult._retried = false;
      throw new Error("oracle returned " + res.status);
    }
    consult._retried = false;
    const data = await res.json();
 
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: data.reply });
 
    window.Scryer?.setMood?.(data.mood_hint);
    showSubtitle(data.reply);                       // the reply always appears
    if (ttsReady) {
      setStatus("THE MIRROR SPEAKS");
      await speakStreaming(data.reply);
    } else {
      setStatus("THE VOICE STILL WAKES... (text only)");
    }
  } catch (err) {
    console.error("consultation failed:", err);
    setStatus("THE MIRROR CLOUDS OVER");
    if (ttsReady) await speakStreaming("The mirror clouds over, and says nothing.").catch(() => {});
  } finally {
    busy = false;
    setStatus("HOLD [SPACE] OR THE SIGIL TO SPEAK");
  }
}
 
/*  - TTS
   The reply text is sent to the backend (/api/v1/speak), which returns
   encoded audio (OpenAI TTS). We decode it via Web Audio and play it
   through an analyser so the eye still pulses to the voice. */

// Must stay <= SpeakRequest.max_length in app/schemas/tts.py, or /speak 422s
// and the voice goes silent. Guard here so an over-long reply still speaks
// (trimmed to the last sentence that fits) instead of failing outright.
const TTS_MAX_CHARS = 999;   // must match SpeakRequest.max_length in app/schemas/tts.py

function fitForSpeech(text) {
  if (text.length <= TTS_MAX_CHARS) return text;
  const head = text.slice(0, TTS_MAX_CHARS);
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  return lastStop > TTS_MAX_CHARS * 0.5 ? head.slice(0, lastStop + 1) : head;
}

async function speakStreaming(text) {
  const clean = fitForSpeech((text || "").trim());
  if (!clean) return;

  const t0 = performance.now();
  const res = await fetch(CONFIG.TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean, lang: currentLang }),
  });
  if (!res.ok) throw new Error("tts returned " + res.status);

  const encoded = await res.arrayBuffer();
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  const buffer = await audioCtx.decodeAudioData(encoded);
  console.log("[SCRYER] tts latency:", ((performance.now() - t0) / 1000).toFixed(1), "s");

  await playBuffer(buffer);
  window.Scryer?.setSpeaking?.(0);
}

// Build (once) a ConvolverNode whose impulse is decaying noise — a cheap,
// dependency-free reverb tail. Cached on the AudioContext.
function getReverb() {
  if (audioCtx._reverb) return audioCtx._reverb;
  const rate = audioCtx.sampleRate;
  const len = Math.max(1, Math.floor(rate * CONFIG.REVERB_SECONDS));
  const impulse = audioCtx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // white noise fading out exponentially
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, CONFIG.REVERB_DECAY);
    }
  }
  const convolver = audioCtx.createConvolver();
  convolver.buffer = impulse;
  audioCtx._reverb = convolver;
  return convolver;
}

function playBuffer(buffer) {
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.78;
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const timeBins = new Uint8Array(analyser.fftSize);

  // Graph: source -> analyser (measurement tap, tracks the dry voice)
  //        source -> dry gain -> destination
  //        source -> reverb -> wet gain -> destination
  const wet = Math.max(0, Math.min(1, CONFIG.REVERB_WET));
  const dryGain = audioCtx.createGain();
  const wetGain = audioCtx.createGain();
  dryGain.gain.value = 1 - wet;
  wetGain.gain.value = wet;

  source.connect(analyser);          // analyser is a terminal tap; don't route to destination
  source.connect(dryGain);
  dryGain.connect(audioCtx.destination);
  source.connect(getReverb());
  getReverb().connect(wetGain);
  wetGain.connect(audioCtx.destination);

  return new Promise(async resolve => {
    if (audioCtx.state === "suspended") await audioCtx.resume();
    let alive = true;
 
    function pulse() {
      if (!alive) return;
      analyser.getByteFrequencyData(bins);
      analyser.getByteTimeDomainData(timeBins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) sum += bins[i];
      window.Scryer?.setSpeaking?.(Math.min(1, (sum / bins.length / 128) * 1.6));
      audioViz?.setSource?.("tts");
      audioViz?.push?.({ time: timeBins, freq: bins, source: "tts" });
      requestAnimationFrame(pulse);
    }

    source.onended = () => {
      alive = false;
      audioViz?.setSource?.(null);
      resolve();
    };
    source.start();
    pulse();
  });
}
 
// Speech-to-text engines
 
class WebSpeechSTT {
  async init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatus("NO SPEECH API: SET STT_ENGINE TO whisper");
      throw new Error("Web Speech API unavailable in this browser");
    }
    this.rec = new SR();
    this.rec.lang = LANGS[currentLang].webspeech;   // updated live by setLanguage()
    this.rec.continuous = true;
    this.rec.interimResults = false;
    this.transcript = "";
    this.rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) this.transcript += e.results[i][0].transcript + " ";
      }
    };
  }
  start() {
    this.transcript = "";
    try { this.rec.start(); } catch (_) { /* already started */ }
  }
  stop() {
    return new Promise(resolve => {
      this.rec.onend = () => resolve(this.transcript.trim());
      this.rec.stop();
    });
  }
}
 
/*  STT engine 2: Whisper via transformers.js   */
 
class WhisperSTT {
  async init() {
    setStatus("SUMMONING EARS (WHISPER)...");
    const { pipeline } = await import(
      "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.1/+esm"
    );
    this.asr = await pipeline("automatic-speech-recognition", CONFIG.WHISPER_MODEL, {
      dtype: "q8",
      device: navigator.gpu ? "webgpu" : "wasm",
    });
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = e => this.chunks.push(e.data);
    this.recorder.start();
  }
  async stop() {
    const blob = await new Promise(resolve => {
      this.recorder.onstop = () => resolve(new Blob(this.chunks));
      this.recorder.stop();
      this.stream.getTracks().forEach(t => t.stop());
    });
    setStatus("TRANSCRIBING...");
    const audio = await blobToMono16k(blob);
    const out = await this.asr(audio, { language: LANGS[currentLang].whisper, task: "transcribe" });
    return (out.text || "").trim();
  }
}
 
async function blobToMono16k(blob) {
  const raw = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await decodeCtx.decodeAudioData(raw);
  decodeCtx.close();
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
 
/* Push-to-talk  */
 
function bindPushToTalk() {
  let holding = false;
 
  const press = async () => {
    if (holding || busy || !sttEngine) return;
    holding = true;
    ui.button.classList.add("listening");
    setStatus("LISTENING...");
    await sttEngine.start();
    try {
      await startMicViz(sttEngine.stream || null);
    } catch (err) {
      console.warn("[SCRYER] mic viz unavailable:", err);
    }
  };

  const release = async () => {
    if (!holding) return;
    holding = false;
    ui.button.classList.remove("listening");
    stopMicViz();
    const text = await sttEngine.stop();
    console.log("[SCRYER] transcript:", JSON.stringify(text));
    
    if (text) consult(text);
    else setStatus("HOLD [SPACE] OR THE SIGIL TO SPEAK");
  };
 
  addEventListener("keydown", e => {
    if (e.code === CONFIG.PUSH_TO_TALK_KEY && !e.repeat) { e.preventDefault(); press(); }
  });
  addEventListener("keyup", e => {
    if (e.code === CONFIG.PUSH_TO_TALK_KEY) { e.preventDefault(); release(); }
  });
  ui.button.addEventListener("pointerdown", press);
  ui.button.addEventListener("pointerup", release);
  ui.button.addEventListener("pointerleave", release);
}
 
/* UI  */
 
function buildUI() {
  const wrap = document.createElement("div");
  wrap.id = "voice-panel";
  wrap.innerHTML = `
    <button id="voice-lang" title="Toggle language / cambiar idioma">[ EN ]</button>
    <button id="voice-sigil" title="Hold to speak">[ SPEAK ]</button>
    <div id="voice-subtitle"></div>
    <div id="voice-status"></div>

  `;
  document.body.appendChild(wrap);
 
  const style = document.createElement("style");
  style.textContent = `
    #voice-panel {
      position: fixed; right: 28px; bottom: 28px; text-align: right;
      font-family: "Courier New", monospace; letter-spacing: 2px; z-index: 5;
    }
    #voice-sigil {
      font-family: inherit; font-size: 13px; letter-spacing: 3px; cursor: pointer;
      color: #c3cad4; background: rgba(5,7,10,0.55);
      border: 1px solid rgba(195,202,212,0.4); padding: 12px 22px;
      backdrop-filter: blur(6px); user-select: none; touch-action: none;
    }
    #voice-lang {
      font-family: inherit; font-size: 11px; letter-spacing: 3px; cursor: pointer;
      color: #6b7280; background: rgba(5,7,10,0.55);
      border: 1px solid rgba(195,202,212,0.25); padding: 6px 12px;
      backdrop-filter: blur(6px); user-select: none; margin-right: 8px;
    }
    #voice-sigil.listening {
      color: #05070a; background: #c3cad4;
      box-shadow: 0 0 24px rgba(195,202,212,0.5);
    }
    #voice-status {
      margin-top: 8px; font-size: 10px; color: #6b7280; min-height: 14px;
    }
      #voice-subtitle { position: fixed; left: 50%; bottom: 90px;
      transform: translateX(-50%); max-width: 60ch; text-align: center;
      font-size: 13px; color: #c3cad4; text-shadow: 0 0 8px rgba(0,0,0,0.9);
      letter-spacing: 1px; 
      }
  `;
  document.head.appendChild(style);
 
  ui.button = wrap.querySelector("#voice-sigil");
  ui.status = wrap.querySelector("#voice-status");
  ui.langBtn = wrap.querySelector("#voice-lang");
  ui.langBtn.addEventListener("click", () => {
    if (busy) return;                       // don't switch mid-consultation
    // Cycle through every registered language: EN -> ES -> FR -> EN ...
    const codes = Object.keys(LANGS);
    const next = codes[(codes.indexOf(currentLang) + 1) % codes.length];
    setLanguage(next);
  });
}
 
function setStatus(msg) {
  if (ui.status) ui.status.textContent = msg;
}

function showSubtitle(text) {
  const el = document.getElementById("voice-subtitle");
  if (!el) return;
  el.textContent = text;
  clearTimeout(showSubtitle._t);
  showSubtitle._t = setTimeout(() => { el.textContent = ""; }, 14000);
}

// No self-run: bootVoice() is now a permanent core service, started once
// from main.js. Its UI (built on document.body) persists across page routes.
 