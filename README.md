# Aegis Scryer: Asher, the Scryer

<p align="center">
  <img src="./Scryer_Eye_Orb.webp" width="300">
</p>

**Live demo:** https://scryer.tensorgeek.com/#/home

Asher is a young, warm, perceptive creature of the Aegis project who lives inside a
burning fractal eye. You stand in front of the mirror, talk to him by voice,
and he answers out loud in English, Spanish, or French. He is a **life
advisor** and a small **tool-using agent**:

- He **sees** you. Your webcam is analysed entirely in the browser (emotion,
  gaze, eye contact), and a handful of numbers about how you look while you
  speak reaches him with every message, so he can tell when your words and
  your face disagree.
- He **advises** you. On mindfulness, emotions, learning, and life strategy he
  consults archives of real books and answers in his own words: one idea, one
  small step, one question back.
- He **looks things up**. Ask him for a movie, a football result, the weather
  in your town, the news, or a videogame, and the answer also appears as
  floating cards in front of the eye.
- He **stays neutral**. He does not take sides on wars, governments, or
  politics, and if you are in genuine distress he drops the persona and points
  you gently toward real people.

All perception is client-side. No video or audio ever leaves the browser. The
backend receives only the transcribed text of what you say, a small vector of
telemetry numbers, and recent conversation turns.

> Asher used to be called Melkov. If you find that name anywhere in the repo,
> it is stale.

## The chambers

The app is a hash-routed single-page app; each chamber reads the same shared
perception state (face, emotion, gaze, hands).

| Route | Chamber | What it is |
|-------|---------|------------|
| `#/home` | Home | Hero orb and a grid of the chambers |
| `#/eye` | The Eye | The main event: fractal eye, voice conversation, Asher's cards |
| `#/kaleidoscope` | Kaleidoscope | Calm emotion-driven Julia-set kaleidoscope |
| `#/mirror` | Mirror | Your 468 FaceMesh keypoints as a breathing constellation with a symmetry axis |
| `#/chaseme` | Chase Me | A gaze game: hold the orb with your eyes |
| `#/life` | Game of Life | Conway's Game of Life on the GPU; paint cells with the mouse |

A single "AWAKEN THE MIRROR" gate asks for camera access the first time you
leave the home page. The microphone is only requested on the first
push-to-talk.

## Asher's tools

Asher is a function-calling agent (OpenAI tool calls, at most two rounds per
turn). The tools are separate from his personality: each tool's own
description tells the model when to use it. A tool disappears if its key is
not configured, so the app degrades to a plain oracle instead of breaking.

### Knowledge archives (RAG over books)

Four tools search a Qdrant Cloud collection (`Scryer_Knowledge`, 1536-dim
`text-embedding-3-small` vectors) built from six books and about 2,100 chunks.
Retrieved passages are raw material: Asher paraphrases them and never reads
them out or cites pages.

| Tool | Domain |
|------|--------|
| `search_mindfulness_knowledge` | Meditation, breath, attention |
| `search_emotion_knowledge` | Naming and handling feelings |
| `search_life_strategy_knowledge` | Conflict, ambition, timing, hard decisions |
| `search_learning_knowledge` | Learning, practice, focus, memory |

Disable them by leaving `QDRANT_URL` unset. The ingestion pipeline lives in
`build_rag.ipynb`.

### Leisure and world tools

| Tool | Source | Notes |
|------|--------|-------|
| `get_trending_movies`, `get_popular_movies`, `search_movie`, `get_movie_details` | TMDB | Clickable posters open a detail panel (cast, trailer, recommendations) |
| `get_live_football_fixtures`, `get_football_fixtures_by_date`, `search_football_team`, `get_football_team_fixtures`, `get_football_standings` | API-SPORTS | Free plan: about 100 requests a day and seasons 2022-2024 only, so results are archive data, and Asher says so. Aggressively cached |
| `get_weather` | Open-Meteo | No key. **City name only**: never GPS, never IP geolocation. If you do not name a place, Asher asks |
| `get_news` | GNews | One tool: a query runs a search, otherwise one category of top headlines. Free plan: about 12 hours delayed, 100 requests a day, development use only. Asher reports the headline and a short summary, names the source, and never takes sides |
| `get_videogames` | IGDB (via a Twitch app token) | A search, or a curated list: top rated, new releases, upcoming |

When a leisure tool succeeds, the frontend projects the result as a
horizontally scrolling rail of cards (a `<scryer-vision-cards>` web component)
and fades the eye out until your next turn. Movies, teams, and fixtures open
detail panels; news and game cards open the source page in a new tab. The API
keys stay on the server: the browser never calls TMDB, API-SPORTS, GNews, or
IGDB itself.

### Guardrails

- **Distress wins.** If the person expresses genuine distress or crisis,
  Asher opens no tool, drops the style, and points toward real human support.
  This guardrail is deliberate; preserve it when editing the persona.
- **Neutrality.** On news and politics he does not blame or favour any nation
  or government; asked who is right, he says it is not his to judge.
- **No markdown in his voice.** The LLM is biased away from emitting
  markdown tokens, and the text is stripped again right before Piper, so he
  never says "asterisk".

## Architecture

```
                         BROWSER (all perception is local)
+---------------------------------------------------------------------+
| Webcam --> MediaPipe FaceMesh + Hands                               |
|        --> EmotiEffLib EfficientNet-B0 (ONNX, ~2.5 Hz)              |
|                          |                                          |
|                          v   telemetry fusion + Entropy Engine       |
| Mic --> Web Speech API (STT) --> text                               |
|                          |                                          |
| WebGL eye / chambers <-- shared state      <scryer-vision-cards>    |
+--------------------------|-----------------------^------------------+
     { text, telemetry, history, lang }            | reply, mood_hint,
                           v                       | visual_payload
                 FASTAPI BACKEND "Oracle" (stateless)
+---------------------------------------------------------------------+
| POST /api/v1/oracle  --> OpenAI chat model + tool loop              |
|                            |-- Qdrant   (book archives)             |
|                            |-- TMDB / API-SPORTS / Open-Meteo       |
|                            |-- GNews / IGDB                         |
| POST /api/v1/speak   --> Piper TTS (local CPU, no per-request cost) |
| GET  /api/v1/movies/{id}, /football/team/{id}, /football/fixture/{id}
|                          (detail panels; keys stay server-side)      |
+---------------------------------------------------------------------+
```

The backend is stateless: the browser owns the conversation and resends the
recent turns each request. Each request is rate-limited per IP (slowapi), with
daily per-IP caps and an optional global daily budget.

### Perception and telemetry

Emotion comes from two fused signals: fast geometric heuristics on FaceMesh
landmarks (brow compression, mouth corners, eye openness, calibrated to a
per-session neutral baseline), and a neural anchor from EmotiEffLib. The
Entropy Engine combines motion variance with the Shannon entropy of the
neural distribution into one 0..1 chaos index. An eye-contact tracker measures
how much of the last ~8 seconds your gaze rested on the mirror. A snapshot is
captured when you finish speaking and rides inside the user turn:

```json
{
  "text": "hello mirror",
  "telemetry": {
    "anger": 0.02, "sadness": 0.61, "surprise": 0.05, "joy": 0.08,
    "fear": 0.03, "entropy": 0.34,
    "dominant_state": "sadness",
    "gaze_behavior": "avoiding",
    "eye_contact": 0.12,
    "face_present": true
  },
  "history": [],
  "lang": "en"
}
```

### Voice

Speech-to-text runs in the browser (Web Speech API by default; an in-browser
Whisper is available). The language button cycles EN, ES (Spain), and FR; the
choice selects both the Piper voice and the language Asher replies in.
Text-to-speech runs on the backend with Piper, CPU-only and free. The WAV is
played through Web Audio with a light client-side reverb, and its amplitude
drives the eye so it pulses with his voice. Subtitles appear as soon as the
model replies.

Do not move TTS back into the browser: the earlier in-browser Kokoro design
forced a 90-300 MB model download per visitor and was unreliable.

## Models and data

Model binaries and the book PDFs are not committed.

| File | Purpose | Source |
|------|---------|--------|
| `models/en_US-ryan-medium.onnx` + `.json` | English voice | huggingface.co/rhasspy/piper-voices |
| `models/es_ES-davefx-medium.onnx` + `.json` | Spanish (Spain) voice | huggingface.co/rhasspy/piper-voices |
| `models/fr_FR-tom-medium.onnx` + `.json` | French voice | huggingface.co/rhasspy/piper-voices |
| `frontend/public/models/emotieff_b0.onnx` | 8-class facial emotion, runs in the browser | EmotiEffLib (EfficientNet-B0 export) |

In production the emotion model is served from S3 and pointed to with
`VITE_MODEL_URL`; see [DEPLOY.md](./DEPLOY.md).

## Getting started

Requirements: Python 3.11+, Node.js 18+, a webcam and microphone, and a
Chromium-based browser (the Web Speech API is Chrome/Edge only). The camera
needs `localhost` or HTTPS, so always use the dev server.

```bash
git clone git@github.com:BeauBryanDev/melkov-the-scryer.git
cd melkov-the-scryer

# 1. Backend
python3 -m venv scryer
scryer/bin/pip install -r requirements.txt

# 2. Secrets: create .env in the project root (see the table below)

# 3. Models: place the Piper voice pairs in models/ and the emotion model
#    in frontend/public/models/

# 4. Run the oracle
scryer/bin/uvicorn app.main:app --reload --port 8001

# 5. Frontend (separate terminal)
cd frontend
npm install
npm run dev        # http://localhost:3000 (strict port)
```

Open http://localhost:3000, click through to The Eye, grant camera access,
then hold the on-screen button (or SPACE) and speak. Piper warms all three
voices in the background on first start; the first reply per language may lag
until you see `piper warm-up complete (lang=...)` in the log.

Smoke-test the backend without the frontend:

```bash
curl -X POST http://localhost:8001/api/v1/oracle \
  -H "Content-Type: application/json" \
  -d '{"text": "hello mirror", "telemetry": {"sadness": 0.7, "dominant_state": "sadness"}, "lang": "en"}'
```

### Configuration (`.env`)

Only `OPENAI_API_KEY` is required. Everything else switches a feature on.

| Variable | Enables |
|----------|---------|
| `OPENAI_API_KEY` | The oracle itself (required). `OPENAI_MODEL` overrides the default chat model |
| `QDRANT_URL`, `QDRANT_API_KEY` | The four knowledge-archive tools |
| `TMDB_API_KEY` | Movie tools and panel |
| `FOOTBALL_API_KEY` | Football tools and panels (API-SPORTS) |
| `GNEWS_API_KEY` | News tool |
| `CLIENT_ID`, `CLIENT_SECRET` (or `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`) | Videogames tool (IGDB) |
| `CORS_ORIGINS` | Allowed frontend origins (defaults to `http://localhost:3000`) |
| `RATE_LIMIT`, `TTS_RATE_LIMIT`, `RATE_LIMIT_DAILY`, `DAILY_ORACLE_BUDGET` | Abuse and cost protection |

Weather needs no key. Unknown `.env` keys are ignored. Frontend variables
(`VITE_BACKEND_URL`, `VITE_MODEL_URL`) are baked in at build time.

There is no test runner configured. `npm run lint` runs ESLint over the
frontend.

## Project layout

```
app/                      FastAPI backend
  main.py                 routes, rate limits, warm-up
  prompts/oracle_prompt.py  Asher's personality, guardrails, tool policy
  services/               oracle_service (agent loop), agent_tools, tts_service,
                          knowledge / movies / football / weather / news / games services
  schemas/                browser <-> backend contract (incl. the visual cards)
  core/                   config, logging, budget, markdown stripping
frontend/src/
  main.js, router.js      boot + hash router
  core/                   permanent services: camera, face/hand tracking, emotion
                          fusion, state, the voice loop
  pages/                  one folder per chamber (eye, kaleidoscope, mirror, ...)
models/                   Piper voices
knowledge/, get_chunks.ipynb   the book PDFs and the ingestion pipeline
```

## Privacy

Camera and microphone streams are consumed only by models running in the
browser. The backend receives the text you chose to say, about a dozen
telemetry numbers, recent turns, and a language code, and stores nothing.
The OpenAI API receives that text and telemetry (and any tool results) under
OpenAI's data policy. Tool lookups send only what Asher needs to ask: a search
phrase, a team name, a movie title, or **the city name you typed or said**.
Location is never inferred.

## Deployment

The frontend is a static Vite build on Vercel; the backend runs on an AWS EC2
VPS behind nginx and HTTPS (systemd, uvicorn with `--proxy-headers`); the
emotion model is served from S3. The full runbook is in
[DEPLOY.md](./DEPLOY.md).

## Status and known limitations

- The core experience, all six chambers, the knowledge archives, and the five
  leisure and world tool families are working locally.
- **Tool triggering is not fully reliable.** Asher sometimes answers a
  life-advice question from his own head instead of opening an archive. The
  prompt was tightened, but forcing tool use structurally is still an open
  decision.
- The free API tiers set the limits: football data ends at the 2024/25 season,
  news is about 12 hours old, and GNews's free plan is for development use.
- The book archive contains material that was not obtained from the
  publishers. Asher only ever speaks short paraphrases, and raw passages never
  reach the client, but treat this as a risk if the project grows.
- Planned next: a YouTube tool for mindfulness and personal-growth channels
  (a curated channel allowlist to fit the daily quota), and slimming the tool
  payloads sent to the model to cut token cost.

## License

The source code in this repository is released under the [MIT License](./LICENSE).

That license covers this project's own code only. It does not cover third-party
material you download or use alongside it, each of which keeps its own terms:
the Piper voice models, the EmotiEffLib emotion model, the books used for the
knowledge archives, MediaPipe and onnxruntime, and the data and images served
by TMDB, API-SPORTS, GNews, IGDB, and Open-Meteo (whose terms, including the
free-tier limits noted above, apply to your use of them).