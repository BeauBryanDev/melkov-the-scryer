
import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx

from app.core.config import get_settings

logger = logging.getLogger("football_api")

_BASE_URL = "https://v3.football.api-sports.io"

_client: httpx.AsyncClient | None = None

# Leisure archive: Call API-SPORTS Football (api-football.com v3). Asher reaches
# this only through the agent tools in agent_tools.py, same pattern as
# movies_service (TMDB).

def is_configured() -> bool:
    return bool(get_settings().football_api_key)


def get_client() -> httpx.AsyncClient:
    
    global _client
    
    if _client is None:
        
        _client = httpx.AsyncClient(
            base_url=_BASE_URL,
            timeout=10.0,
            headers={"x-apisports-key": get_settings().football_api_key},
        )
        
    return _client


#  In-memory response cache - free plan: ~100 upstream requests/day

_CACHE_MAX = 500
_cache: dict[tuple, tuple[float, list]] = {}
_FINISHED = {"FT", "AET", "PEN"}


async def _get(path: str, 
               params: dict, 
               ttl: int, 
               ttl_fn=None
               ) -> list:
    """
    GET an API-SPORTS endpoint through the cache; returns the `response` list.

    ttl_fn(data) -> seconds may override the TTL once the data is known 
    Errors reported in the body (plan limits, per-minute rate limit, bad params)
    """
    key : tuple(str, tuple) = (path, tuple(sorted(params.items())))  # type: ignore
    now = time.monotonic()
    hit = _cache.get(key)

    if hit and hit[0] > now:
        return hit[1]

    res = await get_client().get(path, params=params)
    res.raise_for_status()
    body = res.json()

    logger.info("API-SPORTS %s %s (requests left today: %s)", 
                path, params,
                res.headers.get("x-ratelimit-requests-remaining", "?")
                )

    if body.get("errors"):
        
        logger.warning("API-SPORTS %s rejected: %s", path, body["errors"])
        raise RuntimeError(f"API-SPORTS rejected {path}: {body['errors']}")

    data = body.get("response", [])
    
    if ttl_fn:
        ttl = ttl_fn(data)

    _cache.pop(key, None)
    
    if len(_cache) >= _CACHE_MAX:
        
        _cache.pop(next(iter(_cache)))   # evict the oldest insertion
        
    _cache[key] = (now + ttl, data)

    return data


def _summarize_fixture(fixture: dict) -> dict:
    """Trim an API-SPORTS fixture object to what Asher actually needs to speak about it."""
    return {
        "id": fixture.get("fixture", {}).get("id"),
        "date": fixture.get("fixture", {}).get("date"),
        "status": fixture.get("fixture", {}).get("status", {}).get("long"),
        "league": fixture.get("league", {}).get("name"),
        "home": fixture.get("teams", {}).get("home", {}).get("name"),
        "away": fixture.get("teams", {}).get("away", {}).get("name"),
        "home_goals": fixture.get("goals", {}).get("home"),
        "away_goals": fixture.get("goals", {}).get("away"),
        "home_logo": fixture.get("teams", {}).get("home", {}).get("logo"),
        "away_logo": fixture.get("teams", {}).get("away", {}).get("logo"),
        "home_id": fixture.get("teams", {}).get("home", {}).get("id"),
        "away_id": fixture.get("teams", {}).get("away", {}).get("id"),
        "league_id": fixture.get("league", {}).get("id"),
        "season": fixture.get("league", {}).get("season"),
    }


def _summarize_team(item: dict) -> dict:
    
    team = item.get("team", {})
    venue = item.get("venue", {})
    
    return {
        "id": team.get("id"),
        "name": team.get("name"),
        "country": team.get("country"),
        "founded": team.get("founded"),
        "venue": venue.get("name"),
        "logo": team.get("logo"),
    }


def _summarize_standing(row: dict, 
                        league_id: int | None = None, 
                        season: int | None = None
                        ) -> dict:
    
    return {
        "rank": row.get("rank"),
        "team": row.get("team", {}).get("name"),
        "team_id": row.get("team", {}).get("id"),
        "team_logo": row.get("team", {}).get("logo"),
        "league_id": league_id,
        "season": season,
        "points": row.get("points"),
        "played": row.get("all", {}).get("played"),
        "win": row.get("all", {}).get("win"),
        "draw": row.get("all", {}).get("draw"),
        "lose": row.get("all", {}).get("lose"),
        "goals_diff": row.get("goalsDiff"),
    }


async def get_live_fixtures() -> list[dict]:
    
    data = await _get("/fixtures", {"live": "all"}, 
                      get_settings().football_live_ttl)
    
    return [_summarize_fixture(f) for f in data[:10]]


async def get_todays_fixtures(date: str) -> list[dict]:
    """`date` must be YYYY-MM-DD."""
    data = await _get("/fixtures", {"date": date}, 
                      get_settings().football_cache_ttl)
    
    return [_summarize_fixture(f) for f in data[:10]]


async def search_team(name: str) -> list[dict]:
    
    data = await _get("/teams", {"search": name}, 
                      get_settings().football_static_ttl)
    
    return [_summarize_team(t) for t in data[:5]]


async def get_team_fixtures(name: str, 
                            season: int | None = None
                            ) -> list[dict]:
    """A club's latest results plus its next fixtures, looked up by name (2 cached calls).

    The free plan rejects last=/next=, so we fetch the season and slice it here.
    """
    season = season or get_settings().football_default_season
    
    if not season:
        raise ValueError("a season is required on the free plan")
    
    teams = await search_team(name)
    
    if not teams:
        return []
    
    wanted = name.strip().lower()
    team = next((t for t in teams if (t["name"] or "").lower() == wanted), teams[0])
    
    data = await _get("/fixtures", 
                      {"team": team["id"], 
                       "season": season}, 
                      get_settings().football_cache_ttl
                      )
    now = datetime.now(timezone.utc).isoformat()
    
    ordered = sorted((_summarize_fixture(f) for f in data), 
                     key=lambda f: f["date"] or ""
                     )
    recent = [f for f in ordered if (f["date"] or "") < now][-5:][::-1] # get the last 5 fixtures
    upcoming = [f for f in ordered if (f["date"] or "") >= now][:2] # get the next 2 fixtures
    
    return recent + upcoming


async def _standings_table(league_id: int, 
                           season: int
                           ) -> list[dict]:
    
    data = await _get("/standings",
                      {"league": league_id, 
                       "season": season },
                      get_settings().football_cache_ttl)
    
    if not data:
        return []
    
    table = data[0].get("league", {}).get("standings", [[]])[0]
    
    return [_summarize_standing(row, league_id, season) for row in table ]


async def get_standings(league_id: int, season: int) -> list[dict]:
    
    return await _standings_table(league_id, season)


async def get_team_panel(team_id: int, 
                         league_id: int | None = None, 
                         season: int | None = None
                         ) -> dict:
    """One clickable team panel: info + (if league/season known) table and fixtures.

    Up to 3 upstream calls, made concurrently and all cached; the sections that
    need a season/league are simply omitted when they are unknown or rejected.
    """
    settings = get_settings()
    season = season or settings.football_default_season or None

    info_task = _get("/teams", {"id": team_id}, 
                     settings.football_static_ttl
                     )
    
    table_task = _standings_table(league_id, season) if league_id and season else asyncio.sleep(0, [])
    fixtures_task = ( _get("/fixtures", 
                           {
                               "team": team_id, 
                               "season": season
                            }, 
                           settings.football_cache_ttl
                           )
                     if season else asyncio.sleep(0, [])
                     )

    info, table, fixtures = await asyncio.gather(info_task, 
                                                 table_task, 
                                                 fixtures_task, 
                                                 return_exceptions=True
                                                 )

    if isinstance(info, Exception):
        raise info
    
    if not info:
        raise LookupError(f"team {team_id} not found")
    
    panel = _summarize_team(info[0])
    panel["kind"] = "team"
    panel["league_id"] = league_id
    panel["season"] = season
    panel["standings"] = table if isinstance(table, list) else []

    fixtures = fixtures if isinstance(fixtures, list) else []
    now = datetime.now(timezone.utc).isoformat()
    ordered = sorted((_summarize_fixture(f) for f in fixtures), key=lambda f: f["date"] or "")
    panel["recent"] = [f for f in ordered if (f["date"] or "") < now][-5:][::-1]
    panel["upcoming"] = [f for f in ordered if (f["date"] or "") >= now][:5]

    return panel


_STAT_KEYS = ("Ball Possession", 
              "Total Shots", 
              "Shots on Goal", 
              "Corner Kicks", 
              "Fouls", 
              "Yellow Cards", 
              "Red Cards"
              )


async def get_fixture_detail(fixture_id: int) -> dict:
    """One clickable match panel. 
    /fixtures?id= already carries events, 
    lineups and statistics."""
    settings = get_settings()

    def ttl_for(data):
        short = (data[0].get("fixture", {}).get("status", {}).get("short") if data else None)
        return settings.football_static_ttl if short in _FINISHED else settings.football_live_ttl

    data = await _get("/fixtures", 
                      {"id": fixture_id}, 
                      settings.football_live_ttl, 
                      ttl_fn=ttl_for
                      )
    
    if not data:
        raise LookupError(f"fixture {fixture_id} not found")
    
    f = data[0]
    detail = _summarize_fixture(f)
    detail["kind"] = "fixture"
    detail["venue"] = f.get("fixture", {}).get("venue", {}).get("name")
    detail["referee"] = f.get("fixture", {}).get("referee")
    detail["halftime"] = f.get("score", {}).get("halftime")
    detail["elapsed"] = f.get("fixture", {}).get("status", {}).get("elapsed")

    detail["events"] = [
        {
            "minute": (e.get("time", {}).get("elapsed") or 0) + (e.get("time", {}).get("extra") or 0),
            "team": e.get("team", {}).get("name"),
            "team_id": e.get("team", {}).get("id"),
            "player": e.get("player", {}).get("name"),
            "type": e.get("type"),
            "detail": e.get("detail"),
        }
        for e in f.get("events", [])
    ]
    detail["lineups"] = [
        {
            "team": l.get("team", {}).get("name"),
            "team_id": l.get("team", {}).get("id"),
            "formation": l.get("formation"),
            "coach": (l.get("coach") or {}).get("name"),
            "start_xi": [
                {"name": p["player"].get("name"), 
                 "number": p["player"].get("number"), 
                 "pos": p["player"].get("pos")
                 }
                for p in l.get("startXI", [])
            ],
        }
        for l in f.get("lineups", [])
    ]
    detail["statistics"] = [
        {
            "team_id": st.get("team", {}).get("id"),
            "stats": {x["type"]: x["value"] for x in st.get("statistics", []) if x.get("type") in _STAT_KEYS},
        }
        for st in f.get("statistics", [])
    ]

    return detail
