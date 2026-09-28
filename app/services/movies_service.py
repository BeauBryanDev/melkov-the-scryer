
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("tmdb")

_BASE_URL = "https://api.themoviedb.org/3"

_client: httpx.AsyncClient | None = None

# Leisure archive: The Movie DB (TMDB). Asher reaches this only through the
# agent tools in agent_tools.py, same pattern as knowledge_service.

def is_configured() -> bool:
    return bool(get_settings().tmdb_api_key)


def get_client() -> httpx.AsyncClient:
    
    global _client
    
    if _client is None:
        
        _client = httpx.AsyncClient(base_url=_BASE_URL, 
                                    timeout=10.0)
        
    return _client


def _params() -> dict:
    
    return {
            "api_key": get_settings().tmdb_api_key, 
            "language": "en-US"
            }


_POSTER_BASE = "https://image.tmdb.org/t/p/w342"


def _summarize(movie: dict) -> dict:
    """Trim a TMDB movie object to what Asher actually needs to speak about it."""
    poster_path = movie.get("poster_path")
    
    return {
        "id": movie.get("id"),
        "title": movie.get("title"),
        "year": (movie.get("release_date") or "")[:4],
        "overview": movie.get("overview"),
        "rating": movie.get("vote_average"),
        "poster_url": f"{_POSTER_BASE}{poster_path}" if poster_path else None,
        }


async def get_trending_movies() -> list[dict]:
    
    res = await get_client().get("/trending/movie/day", params=_params())
    res.raise_for_status()
    
    return [_summarize(m) for m in res.json().get("results", [])[:10]]


async def get_popular_movies() -> list[dict]:
    
    res = await get_client().get("/movie/popular", params=_params())
    res.raise_for_status()
    
    return [_summarize(m) for m in res.json().get("results", [])[:10]]


async def search_movie(title: str) -> list[dict]:
    
    params = {**_params(), "query": title}
    res = await get_client().get("/search/movie", params=params)
    res.raise_for_status()
    
    return [_summarize(m) for m in res.json().get("results", [])[:5]]


async def get_movie_details(movie_id: int) -> dict:
    
    res = await get_client().get(f"/movie/{movie_id}", params=_params())
    res.raise_for_status()
    movie = res.json()
    summary = _summarize(movie)
    summary["genres"] = [g["name"] for g in movie.get("genres", [])]
    summary["runtime"] = movie.get("runtime")
    
    return summary


_PROFILE_BASE = "https://image.tmdb.org/t/p/w185"


async def get_movie_full(movie_id: int) -> dict:
    """Everything the detail panel needs, in one TMDB call (append_to_response)."""

    params = {**_params(), 
              "append_to_response": "credits,videos,recommendations"
              }
    res = await get_client().get(f"/movie/{movie_id}", 
                                 params=params
                                 )
    res.raise_for_status()
    movie = res.json()

    detail = _summarize(movie)
    detail["kind"] = "movie"
    detail["genres"] = [g["name"] for g in movie.get("genres", [])]
    detail["runtime"] = movie.get("runtime")
    detail["tagline"] = movie.get("tagline")

    credits = movie.get("credits") or {}
    detail["directors"] = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
    detail["cast"] = [
        {
            "name": a.get("name"),
            "character": a.get("character"),
            "photo_url": f"{_PROFILE_BASE}{a['profile_path']}" if a.get("profile_path") else None,
        }
        for a in credits.get("cast", [])[:12]
    ]

    videos = (movie.get("videos") or {}).get("results", [])
    youtube = [v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Trailer"]
    trailer = next((v for v in youtube if v.get("official")), youtube[0] if youtube else None)
    detail["trailer_key"] = trailer["key"] if trailer else None

    detail["recommendations"] = [
        {**_summarize(m), "kind": "movie"}
        for m in (movie.get("recommendations") or {}).get("results", [])[:10]
    ]

    return detail
