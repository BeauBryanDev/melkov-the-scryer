
import logging
 
import httpx
 
from app.core.config import get_settings
 
logger = logging.getLogger("google_places")
 
_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
 
_client: httpx.AsyncClient | None = None
 
# Leisure/utility archive: Google Places. Uses Text Search instead of Nearby
# Search (the DentexAI pattern this was adapted from) so Asher can pass natural
# free text ("gyms", "bar restaurants") without mapping to Google's rigid place.

def is_configured() -> bool:
    return bool(get_settings().google_maps_api_key)
 
 
def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10.0)
    return _client
 
 
def _summarize(place: dict) -> dict:
    """Trim a Places Text Search result to what Asher and the card need."""
    place_id = place.get("place_id")
 
    return {
        "name": place.get("name"),
        "address": place.get("formatted_address"),
        "rating": place.get("rating"),
        "user_ratings_total": place.get("user_ratings_total"),
        "open_now": (place.get("opening_hours") or {}).get("open_now", False),
        "maps_url": f"https://www.google.com/maps/place/?q=place_id:{place_id}" if place_id else None,
    }
 
 
async def search_places(query: str, 
                        city: str, 
                        max_results: int = 5
                        ) -> list[dict]:

    """
    Free-text place search scoped to a city. City must come from the
    conversation (Asher asks for it) - never from IP or device GPS.
    """
    params = {
        "query": f"{query} in {city}",
        "key": get_settings().google_maps_api_key,
    }
    res = await get_client().get(_TEXT_SEARCH_URL, params=params)
    res.raise_for_status()
    data = res.json()
 
    status = data.get("status")
    
    if status not in {"OK", "ZERO_RESULTS"}:
        message = data.get("error_message") or status or "unknown error"
        logger.error("places search failed: %s", message)
        raise RuntimeError(f"Places search failed: {message}")
 
    results = data.get("results") or []
    if not results:
        return []
    
    return [_summarize(p) for p in results[:max_results]]
 
 
 