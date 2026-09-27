
import asyncio
import io
import logging
import wave

from fastapi.concurrency import run_in_threadpool

from app.core.config import get_settings

# Text-to-speech service: local Piper (piper-tts) -> WAV bytes.

# Runs entirely on CPU on this machine — no GPU, no per-request cost, no
# browser model download. Piper medium voices synthesize several× faster than
# real-time on CPU, so this replaced Kokoro (which was ~4s/reply here).

# Multilingual: one Piper voice per language, cached in a registry keyed by
# language code ("en", "es"). Synthesis is CPU-bound and blocking, so it runs
# in a threadpool to keep the async event loop responsive. A semaphore
# serializes synthesis: Piper is not thread-safe across concurrent calls on
# one voice, and one-at-a-time also keeps CPU contention low.
logger = logging.getLogger("tts")

# Language code -> loaded PiperVoice. Voices load lazily on first use.
_voices = {}
_synth_lock = asyncio.Semaphore(1)


def _get_voice(lang: str):
    
    if lang not in _voices:
        
        from piper import PiperVoice
        
        path = get_settings().tts_voices.get(lang)
        
        if path is None:
            
            raise ValueError(f"no voice registered for lang={lang}")
        
        _voices[lang] = PiperVoice.load(path)
        
        logger.info("piper voice loaded for lang=%s (%s)", 
                    lang, path)
        
    return _voices[lang]


def _syn_config():
    from piper import SynthesisConfig

    # length_scale stretches time: >1 slower/grander, <1 faster.
    # noise_scale / noise_w_scale add expressive variation for a mystic feel.
    s = get_settings()
    return SynthesisConfig(
        length_scale=s.tts_length_scale,
        noise_scale=s.tts_noise_scale,
        noise_w_scale=s.tts_noise_w_scale,
    )


def _synthesize_sync(text: str, lang: str) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        # synthesize_wav writes frames AND sets the WAV header (channels /
        # width / rate) from the voice's own sample rate. synthesize() (no
        # _wav) only returns AudioChunks and writes nothing — don't use it.
        _get_voice(lang).synthesize_wav(text, wav, syn_config=_syn_config())
        
    return buf.getvalue()


async def synthesize_speech(text: str, lang: str = "en") -> bytes:

    text = " ".join(text.split())  # normalize whitespace

    if not text:
        raise ValueError("empty text, nothing to synthesize")
    
    async with _synth_lock:
        
        audio = await run_in_threadpool(_synthesize_sync, 
                                        text, lang)
        
    logger.info("tts synthesized (lang=%s, %d chars -> %d bytes)", 
                lang, len(text), len(audio)
                )
    
    return audio


async def warm_up_background() -> None:
    """Load + warm every voice in the background so the first real request in
    each language is fast, without blocking server startup."""
    warmups = {"en": "The eye opens.", "es": "El ojo se abre.", "fr": "L'œil s'ouvre."}
    # Only warm languages that actually have a registered voice file.
    registered = get_settings().tts_voices
    
    for lang, phrase in warmups.items():
        
        if lang not in registered:
            continue
        
        try:
            async with _synth_lock:
                
                await run_in_threadpool(_synthesize_sync, 
                                        phrase, lang)
            logger.info("piper warm-up complete (lang=%s)", lang)
            
        except Exception:
            logger.exception("piper warm-up failed (lang=%s; will retry on first request)", lang)
