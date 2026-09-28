
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", 
                                      env_file_encoding="utf-8", 
                                      extra="ignore"
                                      )  # .env also holds keys the backend does not use

    # OpenAI
    openai_api_key: str
    openai_model: str = "gpt-4o-mini"
    openai_max_tokens: int = 120  # the oracle speaks briefly; TTS punishes verbosity
    openai_temperature: float = 0.8   # high: poetic variance is the point

    # Knowledge archives (Qdrant): the agent's tools search these. Unset QDRANT_URL
    # and the agent simply has no tools (plain oracle chat), so nothing breaks.
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    qdrant_collection: str = "Scryer_Knowledge"
    embedding_model: str = "text-embedding-3-small"   # must match how the chunks were embedded (1536 dims)
    rag_top_k: int = 3   # passages returned per tool call
    rag_min_score: float = 0.30  # cosine floor: below this the archive "holds nothing"
    rag_snippet_chars: int = 420 # passages are truncated: guidance, not reproduction
    agent_max_tool_rounds: int = 2 # max tool-use round trips before Asher must answer
    tmdb_api_key: str = ""  # for movies service
    football_api_key: str = ""  # for football service

    # Text-to-speech: local Piper (piper-tts), CPU-only, no per-request cost.
    # Piper medium voices run several× faster than real-time on CPU — much
    # faster than Kokoro was. The browser just plays the WAV bytes we return.
    # A voice is two files: the .onnx model and its .onnx.json config, both in
    # models/. Get more at https://huggingface.co/rhasspy/piper-voices .
    # English voice (default): en_US-ryan-medium.
    tts_model_path: str = "models/en_US-ryan-medium.onnx"
    tts_config_path: str = "models/en_US-ryan-medium.onnx.json"
    
    # Spanish (Spain) voice: es_ES-davefx-medium.
    tts_model_path_es: str = "models/es_ES-davefx-medium.onnx"
    tts_config_path_es: str = "models/es_ES-davefx-medium.onnx.json"
    # Voice Registry at https://github.com/rhasspy/piper-tts/blob/main/piper_voices.py
    tts_voices: dict[str, str] = {
        "en": "models/en_US-ryan-medium.onnx",
        "es": "models/es_ES-davefx-medium.onnx",
        "fr": "models/fr_FR-tom-medium.onnx",
    }
    tts_length_scale: float = 1.5   # Piper time-stretch: >1 = slower/grander, <1 = faster
    tts_noise_scale: float = 0.67  # Piper audio variation (default); higher = more unstable/breathy
    tts_noise_w_scale: float = 0.8   # Piper phoneme-duration variation (default); higher = more slurred
    tts_rate_limit: str = "20/minute"  # per-IP, protects the TTS endpoint

    # Server
    cors_origins: str = "http://localhost:3000" # local development
    rate_limit: str = "10/minute"  # per-IP, protects your OpenAI credits
    rate_limit_daily: str = "200/day"  # per-IP daily cap on /oracle ("" disables)
    tts_rate_limit_daily: str = "800/day"  # per-IP daily cap on /speak ("" disables)
    # Global kill-switch for OpenAI spend: max /oracle calls per UTC day across
    # ALL visitors. 0 = disabled (the default, so nothing changes until you set it).
    daily_oracle_budget: int = 0
    max_history_turns: int = 8   # client-sent history is truncated server-side

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
