import logging
import time

import httpx

logger = logging.getLogger("weather")

# Open-Meteo: free API Calls, no API key. 
# We only ever send a city NAME the person typed or
# said - never GPS or IP geolocation.+
_GEO_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_CACHE_TTL = 600  # seconds; weather does not change in 10 minutes

_client: httpx.AsyncClient | None = None
_cache: dict[str, tuple[float, dict]] = {}

# WMO weather interpretation codes -> plain words Asher can say aloud.
_WMO = {
    0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "freezing fog",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "heavy freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "heavy freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light showers", 81: "showers", 82: "violent showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm with hail",
}


def is_configured() -> bool:
    return True


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=8.0)
    return _client


def _condition(code) -> str | None:
    return _WMO.get(code)


async def get_weather(city: str) -> dict | None:
    """Current conditions + 3-day forecast for a named place, or None if it can't be found."""
    city = (city or "").strip() 
    if not city: # Providable by the user
        return None

    key = city.lower()
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL:
        return hit[1]

    geo = await get_client().get(_GEO_URL, params={"name": city, 
                                                   "count": 1,
                                                   "language": "en", 
                                                   "format": "json"}
                                 )
    geo.raise_for_status()
    results = geo.json().get("results") or []
    
    if not results:
        return None
    
    place = results[0]

    res = await get_client().get(_FORECAST_URL, params={
        "latitude": place["latitude"],
        "longitude": place["longitude"],
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                   "precipitation,wind_speed_10m,weather_code,is_day",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "timezone": "auto",
        "forecast_days": 3,
    })
    res.raise_for_status()
    data = res.json()
    cur, daily = data.get("current", {}), data.get("daily", {})

    days = []
    for i, date in enumerate(daily.get("time", [])):
        days.append({
            "date": date,
            "condition": _condition((daily.get("weather_code") or [None] * 3)[i]),
            "temp_max": daily["temperature_2m_max"][i],
            "temp_min": daily["temperature_2m_min"][i],
            "rain_chance": (daily.get("precipitation_probability_max") or [None] * 3)[i],
        })

    card = {
        "place": place.get("name", city),
        "region": place.get("admin1"),
        "country": place.get("country"),
        "temperature": cur.get("temperature_2m"),
        "feels_like": cur.get("apparent_temperature"),
        "humidity": cur.get("relative_humidity_2m"),
        "wind_kmh": cur.get("wind_speed_10m"),
        "precipitation": cur.get("precipitation"),
        "condition": _condition(cur.get("weather_code")),
        "is_day": bool(cur.get("is_day", 1)),
        "days": days,
    }
    _cache[key] = (time.monotonic(), card)
    
    return card
