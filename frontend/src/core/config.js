/* ============================================================
   AEGIS SCRYER - CONFIG
   The single source of truth. No other file declares URLs,
   thresholds, or magic numbers. If a constant is used by more
   than one module, it lives here.
   ============================================================ */

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

export const CONFIG = {
  BACKEND,
  ORACLE_URL: `${BACKEND}/api/v1/oracle`,
  SPEAK_URL: `${BACKEND}/api/v1/speak`,

  LANGS: {
    en: { stt: "en-US", label: "EN" },
    es: { stt: "es-CO", label: "ES" },
    fr: { stt: "fr-FR", label: "FR" },
  },
  DEFAULT_LANG: "en",

  VOICE: {
    MAX_HISTORY_TURNS: 8,
    PUSH_TO_TALK_KEY: "Space",
    SUBTITLE_MS: 14000,
  },

  CAMERA: {
    WIDTH: 480,          // low-res feed: the models only need landmarks
    HEIGHT: 360,
  },

  FACE: {
    CALIB_FRAMES: 50,    // neutral-face baseline window
    EMA_EMOTION: 0.06,
    EMA_MOTION: 0.15,
  },

  EMOTION_NET: {
    MODEL_URL: "/models/emotieff_b0.onnx",
    SIZE: 112,
    INTERVAL_MS: 400,    // ~2.5 Hz neural anchor
    CROP_MARGIN: 0.25,
    FUSION_CNN_WEIGHT: 0.55,
    MEAN: [0.485, 0.456, 0.406],
    STD: [0.229, 0.224, 0.225],
  },

  EYE_CONTACT: {
    THRESHOLD: 0.32,
    WINDOW: 20,          // samples at 2.5 Hz = ~8 s
  },

  ENTROPY: {
    WINDOW: 45,
    MOTION_WEIGHT: 0.6,
    EMOTIONAL_WEIGHT: 0.4,
  },

  RENDER: {
    SCALE: 0.55,         // fractal pages render below native resolution
    MAX_DPR: 2,
  },

  /* UI palette mirror of theme.css: pages that draw with canvas 2D or
     WebGL read colors from here so JS and CSS never diverge.
     The Kaleidoscope page is the ONLY one allowed to ignore this. */
  PALETTE: {
    VOID: "#030507",
    CYAN: "#35e0f2",
    CYAN_SOFT: "#8ceef9",
    CYAN_DIM: "#1a6b75",
  },

  GRAPH_QUEST: {
    NODES_MIN: 9,
    NODES_MAX: 13,
    LAYERS: 4,
    TIME_LIMIT_S: 90,
  },

  GAME_OF_LIFE: {
    GRID: 256,
    TICKS_PER_S: 11,
    DECAY_BASE: 0.008,       // fraction of live cells killed per tick
    DECAY_ENTROPY_GAIN: 1.6, // facial entropy multiplies decay pressure
    SEED_BUDGET: 120,
    TIME_LIMIT_S: 90,
    POPULATION_FLOOR: 0.02,  // lose if alive fraction drops below this
  },
};
