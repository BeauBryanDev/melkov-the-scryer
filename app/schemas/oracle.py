
from typing import Literal

from pydantic import BaseModel, Field

# Pydantic schemas: the contract between the browser and the oracle.
class Telemetry(BaseModel):
    """
    Snapshot of the Entropy Engine at the moment the user spoke.

    All values come from client-side FaceMesh analysis. The oracle
    never sees video or audio, only these numbers.
    """
    # this come from live camera by mediapipe js 
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


class BookCard(BaseModel):
    kind: Literal["book"] = "book"
    id: str | None = None
    title: str | None = None
    authors: list[str] | None = None
    description: str | None = None
    categories: list[str] | None = None
    published_date: str | None = None
    publisher: str | None = None
    page_count: int | None = None
    rating: float | None = None
    cover_url: str | None = None
    price: str | None = None
    buy_link: str | None = None
    preview_link: str | None = None

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
    home_id: int | None = None
    away_id: int | None = None
    league_id: int | None = None
    season: int | None = None


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
    team_id: int | None = None
    team_logo: str | None = None
    league_id: int | None = None
    season: int | None = None
    points: int | None = None
    played: int | None = None
    win: int | None = None
    draw: int | None = None
    lose: int | None = None
    goals_diff: int | None = None


class WeatherDay(BaseModel):
    date: str | None = None
    condition: str | None = None
    temp_max: float | None = None
    temp_min: float | None = None
    rain_chance: int | None = None


class WeatherCard(BaseModel):
    kind: Literal["weather"] = "weather"
    place: str | None = None
    region: str | None = None      # disambiguates names like Springfield
    country: str | None = None
    temperature: float | None = None
    feels_like: float | None = None
    humidity: int | None = None
    wind_kmh: float | None = None
    precipitation: float | None = None
    condition: str | None = None
    is_day: bool = True
    days: list[WeatherDay] = Field(default_factory=list)


class NewsCard(BaseModel):
    kind: Literal["news"] = "news"
    title: str | None = None
    description: str | None = None   # short summary only; full article text is never sent
    source: str | None = None
    published_at: str | None = None
    image: str | None = None
    url: str | None = None


class GameCard(BaseModel):
    kind: Literal["game"] = "game"
    id: int | None = None
    title: str | None = None
    year: str | None = None
    summary: str | None = None
    rating: int | None = None          # IGDB aggregate score, 0-100
    genres: list[str] | None = None
    platforms: list[str] | None = None
    cover_url: str | None = None
    url: str | None = None             # the game's IGDB page


class MusicCard(BaseModel):
    kind: Literal["music"] = "music"
    id: int | None = None
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    cover_url: str | None = None
    duration: int | None = None
    preview_url: str | None = None  # the track's Deezer page
    link: str | None = None         # the track's Deezer page



class ArtistCard(BaseModel):
    kind: Literal["artist"] = "artist"
    id: int | None = None
    name: str | None = None
    picture_url: str | None = None
    link: str | None = None          # the artist's Deezer page


class AlbumCard(BaseModel):
    kind: Literal["album"] = "album"
    id: int | None = None
    title: str | None = None
    artist: str | None = None
    cover_url: str | None = None
    release_date: str | None = None
    link: str | None = None          # the album's Deezer page
    

class PlaceCard(BaseModel):
    kind: Literal["place"] = "place"
    name: str | None = None
    address: str | None = None
    rating: float | None = None
    user_ratings_total: int | float | None = None
    open_now: bool = False
    maps_url: str | None = None


VisualCard = (
    MovieCard
    | FixtureCard
    | TeamCard
    | StandingCard
    | WeatherCard
    | NewsCard
    | GameCard
    | MusicCard
    | ArtistCard
    | AlbumCard
    | BookCard
    | PlaceCard
)


class OracleResponse(BaseModel):
    reply: str
    # Speech-safe representation of reply. Kept separate from the visual text
    # so Markdown, URLs, and card metadata never reach Piper.
    speech_text: str | None = None
    mood_hint: str  # one word the client may use to tint the eye  
    tools_used: list[str] = Field(default_factory=list)  # archives Asher consulted this turn (empty = none)
    # Structured leisure-tool results (movies/football) for the frontend to render as
    # floating "mirror vision" cards. None = nothing to show this turn.
    visual_payload: list[VisualCard] | None = None
