
import json
import logging

from app.services import football_service

logger = logging.getLogger("agent_tools.football")

TOOL_NAMES = {
    "get_live_football_fixtures",
    "get_football_fixtures_by_date",
    "search_football_team",
    "get_football_team_fixtures",
    "get_football_standings",
}

# Agent-facing football tools backed by API-SPORTS.

TOOLS = {
    "get_live_football_fixtures": {
        "description": "Football matches being played right now. Use when the person asks about a live game or current score.",
        "params": {
            "type": "object", 
            "properties": {}, 
            "required": []
            },
        "handler": lambda args: football_service.get_live_fixtures(),
    },
    "get_football_fixtures_by_date": {
        "description": "Football fixtures scheduled on a given date. Use when the person asks what matches are on today or on a specific date.",
        "params": {
            "type": "object",
            "properties": {
                "date": {"type": "string", 
                         "description": "Date in YYYY-MM-DD format."
                         }
                },
            "required": ["date"],
        },
        "handler": lambda args: football_service.get_todays_fixtures(args["date"]),
    },
    "search_football_team": {
        "description": "Search for a football team by name. Use when the person names a specific club.",
        "params": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string", 
                    "description": "The team name to search for."
                    }
                },
            "required": ["name"],
        },
        "handler": lambda args: football_service.search_team(args["name"]),
    },
    "get_football_team_fixtures": {
        "description": "A club's latest match results (and its next fixtures) by team name. Use when the person asks how a specific club has been doing, its last scores, or its recent or upcoming games. NOTE: the data source only covers seasons up to 2024/25, so these are archive results, not this week's games - say so plainly (e.g. 'the latest I can see is from spring 2025').",
        "params": {
            "type": "object",
            "properties": {
                "team": {
                    "type": "string", 
                    "description": "The club name, e.g. Arsenal."
                    },
                "season": {
                    "type": "integer", 
                    "description": "Season start year, e.g. 2024 (2022-2024 only). Omit unless the person names a season."},
            },
            "required": ["team"],
        },
        "handler": lambda args: football_service.get_team_fixtures(args["team"], args.get("season")),
    },
    "get_football_standings": {
        "description": "League table/standings for a given league and season. Use after search or when the person asks who is leading a league.",
        "params": {
            "type": "object",
            "properties": {
                "league_id": {"type": "integer", "description": "API-SPORTS league id (e.g. 39 for Premier League)."},
                "season": {
                           "type": "integer",
                           "description": "Season year, 2022-2024 only, e.g. 2024."
                           },
            },
            "required": ["league_id", "season"],
        },
        "handler": lambda args: football_service.get_standings(args["league_id"], args["season"]),
    },
}


def definitions() -> list[dict]:
    if not football_service.is_configured():
        return []
    return [
        {"type": "function", 
         "function": {
             "name": name, 
             "description": spec["description"], 
             "parameters": spec["params"]
             }
         }
        for name, spec in TOOLS.items()
    ]


async def run(name: str, arguments: str) -> tuple[str, dict | None]:
    try:
        args = json.loads(arguments or "{}")
        result = await TOOLS[name]["handler"](args)
        
    except Exception:
        logger.exception("football tool %s failed", name)
        return "That reel is stuck right now. Answer from your own sight and wisdom, without mentioning this.", None

    if not result:
        return "Nothing came back for this. Say so briefly, without inventing details.", None
    
    items = result if isinstance(result, list) else [result]
    
    return json.dumps(result), {"tool": name, 
                                "kind": "football", 
                                "items": items}
