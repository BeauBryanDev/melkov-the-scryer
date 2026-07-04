
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # OpenAI
    openai_api_key: str
    openai_model: str = "gpt-4o-mini"
    openai_max_tokens: int = 160          # the oracle speaks briefly; TTS punishes verbosity
    openai_temperature: float = 0.8       # high: poetic variance is the point

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
    tts_length_scale: float = 1.5         # Piper time-stretch: >1 = slower/grander, <1 = faster
    tts_noise_scale: float = 0.667        # Piper audio variation (default); higher = more unstable/breathy
    tts_noise_w_scale: float = 0.8        # Piper phoneme-duration variation (default); higher = more slurred
    tts_rate_limit: str = "40/minute"     # per-IP, protects the TTS endpoint

    # Server
    cors_origins: str = "http://localhost:3000"
    rate_limit: str = "10/minute"         # per-IP, protects your OpenAI credits
    max_history_turns: int = 8            # client-sent history is truncated server-side

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
