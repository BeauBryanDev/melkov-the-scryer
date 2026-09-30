
import json
import logging

from app.services import movies_service

logger = logging.getLogger("agent_tools.movies")

TOOL_NAMES = {"get_trending_movies", "get_popular_movies", "search_movie", "get_movie_details"}

# Agent-facing movie tools backed by the TMDB service.

TOOLS = {
    "get_trending_movies": {
        "description": "Movies trending today. Use when the person wants something new or popular to watch, with no specific title in mind.",
        "params": {
            "type": "object", 
            "properties": {}, 
            "required": []
            },
        "handler": lambda args: movies_service.get_trending_movies(),
    },
    "get_popular_movies": {
        "description": "The most popular movies right now. Use when the person wants a safe, well-liked pick.",
        "params": {
            "type": "object", 
            "properties": {}, 
            "required": []
            },
        "handler": lambda args: movies_service.get_popular_movies(),
    },
    "search_movie": {
        "description": "Search for a movie by title. Use when the person names a specific film.",
        "params": {
            "type": "object",
            "properties": {"title": {
                            "type": "string", 
                            "description": "The movie title to search for."
                                }
                           },
            "required": ["title"],
        },
        "handler": lambda args: movies_service.search_movie(args["title"]),
    },
    "get_movie_details": {
        "description": "Full details for one movie (genres, runtime, overview). Use after search_movie or get_trending_movies has given you a movie_id and the person wants more about it.",
        "params": {
            "type": "object",
            "properties": {
                "movie_id": {
                    "type": "integer",
                    "description": "TMDB id of the movie."
                    }
                },
            "required": ["movie_id"],
        },
        "handler": lambda args: movies_service.get_movie_details(args["movie_id"]),
    },
}


def definitions() -> list[dict]:
    if not movies_service.is_configured():
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
        logger.exception("movie tool %s failed", name)
        return "That reel is stuck right now. Answer from your own sight and wisdom, without mentioning this.", None

    if not result:
        return "Nothing came back for this. Say so briefly, without inventing details.", None
    
    items = result if isinstance(result, list) else [result]
    
    return json.dumps(result), {"tool": name, 
                                "kind": "movie", 
                                "items": items}
