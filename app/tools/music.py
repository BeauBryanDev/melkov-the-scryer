
import json
import logging

from app.services import music_service

logger = logging.getLogger("agent_tools.music")

# Agent-facing music tools backed by the Deezer service. No is_configured() gate:
# Deezer's public endpoints need no key, so these tools are always available.

TOOLS = {
    "get_trending_music": {
        "description": "Today's globally trending tracks. Use when the person wants something new "
                       "to listen to, with no specific song, artist or album in mind.",
        "params": {
            "type": "object", 
            "properties": {}, 
            "required": []
            },
        "handler": lambda args: music_service.get_chart(),
    },
    "search_track": {
        "description": "Search for a song by title or lyric fragment. Use when the person names a specific track.",
        "params": {
            "type": "object",
            "properties": {
                "query": {"type": "string", 
                          "description": "The track title to search for."
                          }
                },
            "required": ["query"],
        },
        "handler": lambda args: music_service.search_track(args["query"]),
    },
    "search_artist": {
        "description": "Search for a musician or band by name. Use when the person names a specific artist.",
        "params": {
            "type": "object",
            "properties": {
                "query": {"type": "string", 
                          "description": "The artist or band name to search for."
                          }
                },
            "required": ["query"],
        },
        "handler": lambda args: music_service.search_artist(args["query"]),
    },
    "search_album": {
        "description": "Search for an album by title. Use when the person names a specific album or record.",
        "params": {
            "type": "object",
            "properties": {
                "query": {"type": "string", 
                          "description": "The album title to search for."
                          }
                },
            "required": ["query"],
        },
        "handler": lambda args: music_service.search_album(args["query"]),
    },
}


def definitions() -> list[dict]:
    
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
        logger.exception("music tool %s failed", name)
        return "The strings are silent right now. Answer from your own sight and wisdom, without mentioning this.", None

    if not result:
        return "Nothing came back for this. Say so briefly, without inventing details.", None
    
    items = result if isinstance(result, list) else [result]
    
    return json.dumps(result), {"tool": name,
                                "kind": "music", 
                                "items": items}