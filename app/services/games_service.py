
import asyncio
import logging
import time

import httpx

from app.core.config import get_settings

logger = logging.getLogger("igdb")

# Videogames: IGDB (owned by Twitch). Auth is the Twitch app client-credentials flow; the
# ~60-day token is minted on demand, cached in memory and refreshed shortly before expiry
# (and once more if IGDB answers 401). Queries are Apicalypse text sent as a POST body.

_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
_API_URL = "https://api.igdb.com/v4/games"
_COVER_BASE = "https://images.igdb.com/igdb/image/upload/t_cover_big/"
_LIMIT = 5
_SUMMARY_CHARS = 220
_CACHE_MAX = 100

LISTS = ("top_rated", "new_releases", "upcoming")

_FIELDS = ("name,summary,first_release_date,total_rating,total_rating_count,"
           "cover.image_id,genres.name,platforms.name,url")

_client: httpx.AsyncClient | None = None
_token: tuple[str, float] | None = None   # (access_token, monotonic expiry)
_token_lock = asyncio.Lock()
_cache: dict[str, tuple[float, list[dict]]] = {}


def is_configured() -> bool:
    s = get_settings()
    return bool(s.twitch_client_id and s.twitch_client_secret)


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10.0)
    return _client


async def _get_token(force: bool = False) -> str:
    
    global _token
    
    async with _token_lock:
        
        if not force and _token and _token[1] > time.monotonic():
            return _token[0]
        
        s = get_settings()
        
        res = await get_client().post(_TOKEN_URL, params={
            "client_id": s.twitch_client_id,
            "client_secret": s.twitch_client_secret,
            "grant_type": "client_credentials",
        })
        
        if res.status_code != 200:
            # never log the response URL/params: they carry the client secret
            logger.warning("Twitch token request failed: HTTP %s", res.status_code)
            raise RuntimeError(f"Twitch token request failed: HTTP {res.status_code}")
        
        body = res.json()
        
        _token = (body["access_token"], time.monotonic() + body.get("expires_in", 3600) - 300)
        logger.info("IGDB token minted (valid ~%d days)", body.get("expires_in", 0) // 86400)
        
        return _token[0]


def _summarize(game: dict) -> dict:
    """Trim an IGDB game to what Asher speaks about and the card shows."""
    summary = (game.get("summary") or "").strip()
    
    if len(summary) > _SUMMARY_CHARS:
        summary = summary[:_SUMMARY_CHARS].rsplit(" ", 1)[0] + "…"
        
    ts = game.get("first_release_date")
    image_id = (game.get("cover") or {}).get("image_id")
    rating = game.get("total_rating")
    
    return {
        "id": game.get("id"),
        "title": game.get("name"),
        "year": time.strftime("%Y", time.gmtime(ts)) if ts else None,
        "summary": summary or None,
        "rating": round(rating) if rating is not None else None,   # 0-100
        "genres": [g["name"] for g in game.get("genres", [])][:3] or None,
        "platforms": [p["name"] for p in game.get("platforms", [])][:4] or None,
        "cover_url": f"{_COVER_BASE}{image_id}.jpg" if image_id else None,
        "url": game.get("url"),
    }


def _build_query(query: str | None, 
                 list_name: str | None
                 ) -> str:
    
    now = int(time.time())
    
    if query:
        safe = query.replace("\\", " ").replace('"', " ").strip()[:100]
        return f'search "{safe}"; fields {_FIELDS}; where cover != null; limit {_LIMIT};'
    
    if list_name == "new_releases":
        return (f"fields {_FIELDS}; where first_release_date <= {now} & first_release_date >= {now - 120 * 86400} "
                f"& cover != null & hypes > 2; sort hypes desc; limit {_LIMIT};")
        
    if list_name == "upcoming":
        return (f"fields {_FIELDS}; where first_release_date > {now} & cover != null & hypes > 5; "
                f"sort first_release_date asc; limit {_LIMIT};")
        
    return (f"fields {_FIELDS}; where total_rating_count > 300 & total_rating != null & cover != null; "
            f"sort total_rating desc; limit {_LIMIT};")

# Get Games from IGDB .

async def get_games(query: str | None = None, 
                    list_name: str | None = None
                    ) -> list[dict]:
    """
    Videogames: a title/topic search, or one curated list (top_rated | new_releases | upcoming).
    Errors raise and are never cached; the tool layer turns them into an in-fiction fallback.
    """
    query = (query or "").strip() or None
    body = _build_query(query, list_name if list_name in LISTS else "top_rated")
    # The where-clauses embed timestamps; bucket the cache key by day so it stays stable.
    key = f"{query or list_name}|{int(time.time() // 86400)}"
    hit = _cache.get(key)
    
    if hit and hit[0] > time.monotonic():
        return hit[1]

    s = get_settings()
    
    for attempt in (1, 2):
        
        token = await _get_token(force=attempt == 2)
        res = await get_client().post(_API_URL, content=body, headers={
            "Client-ID": s.twitch_client_id,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        })
        if res.status_code == 401 and attempt == 1:
            continue  # token revoked/expired early: mint a fresh one, retry once
        break
    
    if res.status_code in (401, 403, 429):
        
        logger.warning("IGDB rejected: HTTP %s %s", res.status_code, res.text[:200])
        raise RuntimeError(f"IGDB rejected the request: HTTP {res.status_code}")
    
    res.raise_for_status()

    games = [_summarize(g) for g in res.json()]
    logger.info("IGDB %s -> %d game(s)", 
                query or list_name or "top_rated", 
                len(games)
                )

    _cache.pop(key, None)
    
    if len(_cache) >= _CACHE_MAX:
        _cache.pop(next(iter(_cache)))
        
    _cache[key] = (time.monotonic() + s.igdb_cache_ttl, games)
    
    # List of games returned by IGDB is not sorted by rating, so we sort it here.
    sorted_games = sorted(games, key=lambda g: g["rating"], reverse=True)
    
    return sorted_games
