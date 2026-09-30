
import logging
 
import httpx
 
from app.core.config import get_settings
 
logger = logging.getLogger("google_books")
 
_BASE_URL = "https://www.googleapis.com/books/v1"
 
_client: httpx.AsyncClient | None = None
 
 
def is_configured() -> bool:
    return bool(get_settings().google_books_api_key)
 
 
def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=_BASE_URL, timeout=10.0)
    return _client
 
 
def _params() -> dict:
    return {"key": get_settings().google_books_api_key}
 
 
def _summarize(item: dict) -> dict:
    """Trim a Google Books volume to what Asher actually needs to speak about it.
 
    Note: not every field is always present. Google only returns list_price when
    the book has a Google Play Books listing with a price set for the request's
    region - many books, especially older or non-commercial ones, have none.
    """
    info = item.get("volumeInfo", {})
    sale = item.get("saleInfo", {})
    list_price = sale.get("listPrice")
 
    return {
        "id": item.get("id"),
        "title": info.get("title"),
        "authors": info.get("authors", []),
        "description": info.get("description"),
        "categories": info.get("categories", []),
        "published_date": info.get("publishedDate"),
        "publisher": info.get("publisher"),
        "page_count": info.get("pageCount"),
        "rating": info.get("averageRating"),
        "cover_url": (info.get("imageLinks") or {}).get("thumbnail"),
        "price": f"{list_price['amount']} {list_price['currencyCode']}" if list_price else None,
        "buy_link": sale.get("buyLink") or info.get("infoLink"),
        "preview_link": info.get("previewLink"),
    }
 
 
async def search_books(query: str) -> list[dict]:
    
    params = {**_params(), "q": query, "maxResults": 5}
    res = await get_client().get("/volumes", params=params)
    res.raise_for_status()
    
    return [_summarize(item) for item in res.json().get("items", [])]
 
 
async def get_book_details(book_id: str) -> dict:
    
    res = await get_client().get(f"/volumes/{book_id}", params=_params())
    res.raise_for_status()
    
    return _summarize(res.json())


