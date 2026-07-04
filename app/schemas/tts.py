"""Contract for the /speak endpoint: text in, audio bytes out.

The browser sends the oracle's reply text; the response body is raw audio
(see settings.tts_format), so there is no response schema — only the request.
"""

from typing import Literal

from pydantic import BaseModel, Field


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=400)
    lang: Literal["en", "es", "fr"] = "en"   # which Piper voice to synthesize with
