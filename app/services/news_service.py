import logging
import time

import httpx

from app.core.config import get_settings

logger = logging.getLogger("gnews")

_BASE_URL = "https://gnews.io/api/v4"
_CACHE_MAX = 100
_MAX_ARTICLES = 5  # free plan allows 10; five cards is plenty to speak about
_QUERY_MAX = 200   # GNews rejects longer queries
_DESC_CHARS = 200  # Asher reads a title + a short summary, never the story

CATEGORIES = ("general", "world", "nation", "business", "technology",
              "entertainment", "sports", "science", "health")

_client: httpx.AsyncClient | None = None
_cache: dict[str, tuple[float, list[dict]]] = {}

# GNews FREE plan: 100 requests/day, max 10 articles, 12-hour delay, truncated content,
# non-commercial (dev/testing) use. The key goes in a header so it never appears in URLs


def is_configured() -> bool:
    return bool(get_settings().gnews_api_key)


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=_BASE_URL, 
                                    timeout=10.0
                                    )
    return _client


def _summarize(article: dict) -> dict:
    """
    Trim a GNews article to headline, source, time, image, link and a short summary.
    The (truncated) full content field is deliberately dropped intentionally.
    """
    desc = (article.get("description") or "").strip()
    
    if len(desc) > _DESC_CHARS:
        desc = desc[:_DESC_CHARS].rsplit(" ", 1)[0] + "…"  # truncate at the last space
    source = article.get("source") or {}
    
    return {
        "title": article.get("title"),
        "description": desc or None,
        "source": source.get("name"),
        "published_at": article.get("publishedAt"),
        "image": article.get("image"),
        "url": article.get("url"),
    }


async def get_news(query: str | None = None,
                   category: str | None = None,
                   lang: str | None = None
                   ) -> list[dict]:
    """News articles. 
    With a query -> /search; otherwise -> /top-headlines for one categorydefault general. 
    Errors (bad key, daily quota, rate limit) raise and are never cached."""
    query = (query or "").strip()[:_QUERY_MAX]
    params: dict = {"max": _MAX_ARTICLES}
    
    if lang:
        params["lang"] = lang

    if query:
        path, params["q"] = "/search", query
        
    else:
        path = "/top-headlines"
        params["category"] = category if category in CATEGORIES else "general"
        params.setdefault("lang", "en")

    key = path + "|" + "|".join(f"{k}={v}" for k, v in sorted(params.items()))
    now = time.monotonic()
    hit = _cache.get(key)
    
    if hit and hit[0] > now:
        return hit[1]

    res = await get_client().get(path,
                                 params=params,
                                 headers={"X-Api-Key": get_settings().gnews_api_key}
                                 )
    
    if res.status_code in (401, 403, 429):
        
        logger.warning("GNews %s rejected: HTTP %s %s", 
                       path, res.status_code, res.text[:200]
                       )
        raise RuntimeError(f"GNews rejected {path}: HTTP {res.status_code}")
    
    res.raise_for_status()

    body = res.json()
    
    if body.get("errors"):
        logger.warning("GNews %s rejected: %s",
                       path, body["errors"])
        raise RuntimeError(f"GNews rejected {path}: {body['errors']}")

    articles = [_summarize(a) for a in body.get("articles", [])]
    
    logger.info("GNews %s %s -> %d article(s)", path,
                {k: v for k, v in params.items() if k != "max"}, 
                len(articles))

    _cache.pop(key, None)
    
    if len(_cache) >= _CACHE_MAX:
        _cache.pop(next(iter(_cache)))
        
    _cache[key] = (now + get_settings().gnews_cache_ttl, articles)
    
    return articles
