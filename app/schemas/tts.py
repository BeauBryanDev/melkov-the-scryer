
from typing import Literal

from pydantic import BaseModel, Field

# Contract for the /speak endpoint: text in, audio bytes out.

# The browser sends the oracle's reply text; the response body is raw audio
# (see settings.tts_format), so there is no response schema — only the request.
class SpeakRequest(BaseModel):
    # Piper synthesizes long text fine, but TTS models are not designed for
    # short texts. The oracle speaks briefly, so TTS is not a problem.
    text: str = Field(..., min_length=1, max_length=999)
    lang: Literal["en", "es", "fr"] = "en"   # which Piper voice to synthesize with
    # TODO : THE FR VOICE IS SO SLOW, IT NEED TO SPEED IT UP

