"""Agent-facing videogame tool backed by IGDB."""

import json
import logging

from app.services import games_service

logger = logging.getLogger("agent_tools.games")

TOOLS = {
    "get_videogames": {
        "description": "Videogame lookups (IGDB). Use when the person asks about a game, what to play, or new and upcoming releases. Give `query` when they name a game, series or topic (e.g. 'Zelda', 'cozy farming games'); otherwise pick one `list`: top_rated (all-time best), new_releases (last few months), or upcoming. With neither you get top_rated.",
        "params": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Game title, series or topic to search. Optional."},
                "list": {"type": "string", "enum": list(games_service.LISTS), "description": "Curated list, used only when no query is given. Default top_rated."},
            },
            "required": [],
        },
    }
}


def definitions() -> list[dict]:
    if not games_service.is_configured():
        return []
    return [{"type": "function", "function": {"name": name, "description": spec["description"], "parameters": spec["params"]}} for name, spec in TOOLS.items()]


async def run(name: str, arguments: str) -> tuple[str, dict | None]:
    try:
        args = json.loads(arguments or "{}")
        result = await games_service.get_games(args.get("query"), args.get("list"))
    except Exception:
        logger.exception("games tool failed")
        return "That game archive is unavailable right now. Answer from your own sight and wisdom, without mentioning this.", None

    if not result:
        return "No games came back for this. Say so briefly, without inventing any title.", None
    items = result if isinstance(result, list) else [result]
    return json.dumps(result), {"tool": name, "kind": "game", "items": items}
