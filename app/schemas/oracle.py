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
    symmetry: float = Field(0.0, ge=0.0, le=1.0)
    golden_ratio: float = Field(0.0, ge=0.0, le=1.0)
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


class MovieCard(BaseModel):
    kind: Literal["movie"] = "movie"
    id: int | None = None
    title: str | None = None
    year: str | None = None
    overview: str | None = None
    rating: float | None = None
    poster_url: str | None = None
    genres: list[str] | None = None
    runtime: int | None = None


class FixtureCard(BaseModel):
    kind: Literal["fixture"] = "fixture"
    id: int | None = None
    date: str | None = None
    status: str | None = None
    league: str | None = None
    home: str | None = None
    away: str | None = None
    home_goals: int | None = None
    away_goals: int | None = None
    home_logo: str | None = None
    away_logo: str | None = None


class TeamCard(BaseModel):
    kind: Literal["team"] = "team"
    id: int | None = None
    name: str | None = None
    country: str | None = None
    founded: int | None = None
    venue: str | None = None
    logo: str | None = None


class StandingCard(BaseModel):
    kind: Literal["standing"] = "standing"
    rank: int | None = None
    team: str | None = None
    points: int | None = None
    played: int | None = None
    win: int | None = None
    draw: int | None = None
    lose: int | None = None
    goals_diff: int | None = None


VisualCard = MovieCard | FixtureCard | TeamCard | StandingCard


class OracleResponse(BaseModel):
    reply: str
    mood_hint: str  # one word the client may use to tint the eye (e.g. "ember", "frost")
    tools_used: list[str] = Field(default_factory=list)  # archives Asher consulted this turn (empty = none)
    # Structured leisure-tool results (movies/football) for the frontend to render as
    # floating "mirror vision" cards. None = nothing to show this turn.
    visual_payload: list[VisualCard] | None = None
