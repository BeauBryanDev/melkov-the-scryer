"""Pydantic schemas: the contract between the browser and the oracle."""

from typing import Literal

from pydantic import BaseModel, Field


class Telemetry(BaseModel):
    """Snapshot of the Entropy Engine at the moment the user spoke.

    All values come from client-side FaceMesh analysis. The oracle
    never sees video or audio, only these numbers.
    """

    anger: float = Field(0.0, ge=0.0, le=1.0)
    sadness: float = Field(0.0, ge=0.0, le=1.0)
    surprise: float = Field(0.0, ge=0.0, le=1.0)
    joy: float = Field(0.0, ge=0.0, le=1.0)
    fear: float = Field(0.0, ge=0.0, le=1.0)          # neural emotion net
    entropy: float = Field(0.0, ge=0.0, le=1.0)
    dominant_state: str = "neutral"
    gaze_behavior: Literal["steady", "wandering", "avoiding"] = "steady"
    face_present: bool = True
    eye_contact: float = Field(0.5, ge=0.0, le=1.0)   # 0 = avoiding, 1 = locked on


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=2000)


class OracleRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    telemetry: Telemetry = Telemetry()
    history: list[HistoryTurn] = Field(default_factory=list, max_length=24)
    lang: Literal["en", "es", "fr"] = "en"   # language the oracle replies in


class OracleResponse(BaseModel):
    reply: str
    mood_hint: str  # one word the client may use to tint the eye (e.g. "ember", "frost")
