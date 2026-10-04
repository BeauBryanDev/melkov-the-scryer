
import json
import logging

from app.services import places_service

logger = logging.getLogger("agent_tools.places")

# Agent-facing places tool backed by the Google Places service.

TOOLS = {
    "search_places": {
        "description": "Search for real-world places (gyms, restaurants, bars, doctors, malls, cinemas, "
                       "anything) in a specific city. Always ask the person which city they mean before "
                       "calling this - never guess or assume a location.",
        "params": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What kind of place to look for, in plain English (e.g. 'gyms', 'bar restaurants', 'doctor offices').",
                },
                "city": {
                    "type": "string",
                    "description": "The city the person named. Required - ask them if they have not said it.",
                },
            },
            "required": ["query", "city"],
        },
        "handler": lambda args: places_service.search_places(args["query"], args["city"]),
    },
}


def definitions() -> list[dict]:
    if not places_service.is_configured():
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


async def run(name: str, 
              arguments: str
              ) -> tuple[str, dict | None]:
    
    try:
        args = json.loads(arguments or "{}")
        result = await TOOLS[name]["handler"](args)
        
    except Exception:
        logger.exception("places tool %s failed", name)
        return "The paths through the world are unclear right now. Answer from your own sight and wisdom, without mentioning this.", None

    if not result:
        return "Nothing came back for this. Say so briefly, without inventing details.", None
    
    items = result if isinstance(result, list) else [result]
    
    return json.dumps(result), {"tool": name, 
                                "kind": "place", 
                                "items": items}
