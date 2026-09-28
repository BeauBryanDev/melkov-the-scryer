
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("football_api")

_BASE_URL = "https://v3.football.api-sports.io"

_client: httpx.AsyncClient | None = None

# Leisure archive: API-SPORTS Football (api-football.com v3). Asher reaches
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


def _summarize_standing(row: dict) -> dict:
    
    return {
        "rank": row.get("rank"),
        "team": row.get("team", {}).get("name"),
        "points": row.get("points"),
        "played": row.get("all", {}).get("played"),
        "win": row.get("all", {}).get("win"),
        "draw": row.get("all", {}).get("draw"),
        "lose": row.get("all", {}).get("lose"),
        "goals_diff": row.get("goalsDiff"),
    }


async def get_live_fixtures() -> list[dict]:
    
    res = await get_client().get("/fixtures", params={"live": "all"})
    res.raise_for_status()
    
    return [_summarize_fixture(f) for f in res.json().get("response", [])[:10]]


async def get_todays_fixtures(date: str) -> list[dict]:
    """`date` must be YYYY-MM-DD."""
    res = await get_client().get("/fixtures", params={"date": date})
    res.raise_for_status()
    
    return [_summarize_fixture(f) for f in res.json().get("response", [])[:10]]


async def search_team(name: str) -> list[dict]:
    res = await get_client().get("/teams", params={"search": name})
    res.raise_for_status()
    
    return [_summarize_team(t) for t in res.json().get("response", [])[:5]]


async def get_standings(league_id: int, season: int) -> list[dict]:
    res = await get_client().get("/standings", 
                                 params={
                                     "league": league_id, 
                                     "season": season
                                     }
                                 )
    res.raise_for_status()
    response = res.json().get("response", [])
    
    if not response:
        return []
    
    table = response[0].get("league", {}).get("standings", [[]])[0]
    
    return [_summarize_standing(row) for row in table]
