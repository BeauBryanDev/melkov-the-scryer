
import logging
 
import httpx
 
 
logger = logging.getLogger("deezer")
 
_BASE_URL = "https://api.deezer.com"
 
_client: httpx.AsyncClient | None = None

# Music: Deezer. 
# Asher reaches this only through the agent tools in agent_tools.py, 
# same pattern as knowledge_service.

def get_client() -> httpx.AsyncClient:
    
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=_BASE_URL, timeout=10.0)
    return _client



def _summarize_track(track: dict) -> dict:
    """Trim a Deezer track object to what Asher actually needs to speak about it."""
    return {
        "id": track.get("id"),
        "title": track.get("title"),
        "artist": (track.get("artist") or {}).get("name"),
        "album": (track.get("album") or {}).get("title"),
        "cover_url": (track.get("album") or {}).get("cover_medium"),
        "duration": track.get("duration"),
        "preview_url": track.get("preview"),
        "link": track.get("link"),
    }
 
 
def _summarize_artist(artist: dict) -> dict:
    return {
        "id": artist.get("id"),
        "name": artist.get("name"),
        "picture_url": artist.get("picture_medium"),
        "link": artist.get("link"),
    }
 
 
def _summarize_album(album: dict) -> dict:
    return {
        "id": album.get("id"),
        "title": album.get("title"),
        "artist": (album.get("artist") or {}).get("name"),
        "cover_url": album.get("cover_medium"),
        "release_date": album.get("release_date"),
        "link": album.get("link"),
    }
    
 

async def get_tracks(query: str) -> list[dict]:
    """Deezer tracks: a title/topic search."""
    res = await get_client().get("/search/track", params={"q": query})
    res.raise_for_status()
    
    return [_summarize_track(t) for t in res.json().get("data", [])]



async def search_track(query: str) -> list[dict]:
    res = await get_client().get("/search/track", params={"q": query})
    res.raise_for_status()
    
    return [_summarize_track(t) for t in res.json().get("data", [])[:5]]
 
 
async def search_artist(query: str) -> list[dict]:
    res = await get_client().get("/search/artist", params={"q": query})
    res.raise_for_status()
    
    return [_summarize_artist(a) for a in res.json().get("data", [])[:5]]
 
 
async def search_album(query: str) -> list[dict]:
    res = await get_client().get("/search/album", params={"q": query})
    res.raise_for_status()
    
    return [_summarize_album(a) for a in res.json().get("data", [])[:5]]
 
 
async def get_chart() -> list[dict]:
    """Deezer's global trending tracks."""
    res = await get_client().get("/chart/0/tracks")
    res.raise_for_status()
    
    return [_summarize_track(t) for t in res.json().get("data", [])[:10]]
 