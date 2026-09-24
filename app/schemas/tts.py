"""Contract for the /speak endpoint: text in, audio bytes out.

The browser sends the oracle's reply text; the response body is raw audio
(see settings.tts_format), so there is no response schema — only the request.
"""

from typing import Literal

from pydantic import BaseModel, Field


class SpeakRequest(BaseModel):
    # Generous cap: the oracle's caring/safety replies (distress cases) are its
    # longest, and a 400-char limit rejected them with 422 — the voice went
    # silent exactly when the words mattered most. Piper synthesizes long text
    # fine; this just needs to comfortably exceed what max_tokens can emit.
    text: str = Field(..., min_length=1, max_length=999)
    lang: Literal["en", "es", "fr"] = "en"   # which Piper voice to synthesize with
