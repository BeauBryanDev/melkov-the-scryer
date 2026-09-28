# The tools Asher can call. One per knowledge domain.


import json
import logging

from openai import AsyncOpenAI

from app.core.logging import log_tool_call
from app.services import knowledge_service
from app.services import football_service
from app.services import movies_service

logger = logging.getLogger("agent_tools")

# tool name -> (Qdrant domain value, description the model reads to decide when to use it)
TOOLS: dict[str, tuple[str, str]] = {
    "search_mindfulness_knowledge": (
        "mindfulness",
        "Consult the meditation archive (Mindfulness in Plain English). Use when the person wants to meditate, "
        "asks about breath, attention, stillness or a practice, or is restless and scattered and a practice could help.",
    ),
    "search_emotion_knowledge": (
        "emotions",
        "Consult the emotions archive (Permission to Feel). Use when the person needs to understand, name, "
        "or handle a feeling: anger, sadness, fear, anxiety, overwhelm, or emotions in relationships and work.",
    ),
    "search_life_strategy_knowledge": (
        "life_strategy",
        "Consult the strategy archive (The 48 Laws of Power, The Art of War, The Prince by Niccolo Machiavelli). "
        "Use when the person faces conflict, rivals, timing, ambition, influence, or a hard decision about how to act "
        "in the world.",
    ),
    "search_learning_knowledge": (
        "learning_strategies",
        "Consult the learning archive (Ultralearning). Use when the person wants to learn, practice, or master "
        "something, or struggles with focus, memory, or how to study.",
    ),
}

_PARAMS = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "What to look up, in plain English, about the person's real need "
                           "(e.g. 'calming a racing mind before sleep'). Always English, whatever language you reply in.",
        }
    },
    "required": ["query"],
}

# Leisure tools have different parameter shapes per tool (unlike the RAG tools,
# which all take a single `query` string), so each one carries its own schema
# and its own handler instead of reusing the domain-lookup pattern above.
 
LEISURE_TOOLS: dict[str, dict] = {
    "get_trending_movies": {
        "description": "Movies trending today. Use when the person wants something new or popular to watch, "
                       "with no specific title in mind.",
        "params": {"type": "object", "properties": {}, "required": []},
        "handler": lambda args: movies_service.get_trending_movies(),
    },
    "get_popular_movies": {
        "description": "The most popular movies right now. Use when the person wants a safe, well-liked pick.",
        "params": {"type": "object", "properties": {}, "required": []},
        "handler": lambda args: movies_service.get_popular_movies(),
    },
    "search_movie": {
        "description": "Search for a movie by title. Use when the person names a specific film.",
        "params": {
            "type": "object",
            "properties": {"title": {"type": "string", "description": "The movie title to search for."}},
            "required": ["title"],
        },
        "handler": lambda args: movies_service.search_movie(args["title"]),
    },
    "get_movie_details": {
        "description": "Full details for one movie (genres, runtime, overview). Use after search_movie or "
                       "get_trending_movies has given you a movie_id and the person wants more about it.",
        "params": {
            "type": "object",
            "properties": {"movie_id": {"type": "integer", "description": "TMDB id of the movie."}},
            "required": ["movie_id"],
        },
        "handler": lambda args: movies_service.get_movie_details(args["movie_id"]),
    },
    "get_live_football_fixtures": {
        "description": "Football matches being played right now. Use when the person asks about a live game or "
                       "current score.",
        "params": {"type": "object", "properties": {}, "required": []},
        "handler": lambda args: football_service.get_live_fixtures(),
    },
    "get_football_fixtures_by_date": {
        "description": "Football fixtures scheduled on a given date. Use when the person asks what matches are on "
                       "today or on a specific date.",
        "params": {
            "type": "object",
            "properties": {"date": {"type": "string", "description": "Date in YYYY-MM-DD format."}},
            "required": ["date"],
        },
        "handler": lambda args: football_service.get_todays_fixtures(args["date"]),
    },
    "search_football_team": {
        "description": "Search for a football team by name. Use when the person names a specific club.",
        "params": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "The team name to search for."}},
            "required": ["name"],
        },
        "handler": lambda args: football_service.search_team(args["name"]),
    },
    "get_football_standings": {
        "description": "League table/standings for a given league and season. Use after search or when the person "
                       "asks who is leading a league.",
        "params": {
            "type": "object",
            "properties": {
                "league_id": {"type": "integer", "description": "API-SPORTS league id (e.g. 39 for Premier League)."},
                "season": {"type": "integer", "description": "Season year, e.g. 2023."},
            },
            "required": ["league_id", "season"],
        },
        "handler": lambda args: football_service.get_standings(args["league_id"], args["season"]),
    },
}

_MOVIE_TOOL_NAMES = {"get_trending_movies", "get_popular_movies", "search_movie", "get_movie_details"}


def _leisure_tool_definitions() -> list[dict]:
    """Each leisure provider degrades independently: its tools vanish if its API key is unset."""
    defs = []
    for name, spec in LEISURE_TOOLS.items():
        provider = movies_service if name in _MOVIE_TOOL_NAMES else football_service
        if provider.is_configured():
            defs.append({"type": "function", "function": {"name": name, "description": spec["description"], "parameters": spec["params"]}})
    return defs


def tool_definitions() -> list[dict]:
    """OpenAI tool schemas. Each family degrades independently: RAG tools vanish if
    Qdrant is not configured, leisure tools vanish if TMDB is not configured."""
    knowledge_tools = []
    
    if knowledge_service.is_configured():
        # Knowledge tools are available if Qdrant is configured
        knowledge_tools = [
            {"type": "function", "function": {"name": name, 
                                              "description": desc, 
                                              "parameters": _PARAMS}
             }
            for name, (_, desc) in TOOLS.items()
        ]
    return knowledge_tools + _leisure_tool_definitions()
 
 
async def run_tool(name: str,
                   arguments: str,
                   openai_client: AsyncOpenAI
                   ) -> tuple[str, dict | None]:
    """Execute one tool call. Returns (text handed back to the model, raw leisure
    payload for the frontend's visual cards, or None). Never raises."""
    if name in LEISURE_TOOLS:
        try:
            args = json.loads(arguments or "{}")
            result = await LEISURE_TOOLS[name]["handler"](args)
        except Exception:
            logger.exception("leisure tool %s failed", name)
            return "That reel is stuck right now. Answer from your own sight and wisdom, without mentioning this.", None
        items = result if isinstance(result, list) else [result]
        kind = "movie" if name in _MOVIE_TOOL_NAMES else "football"
        return json.dumps(result), {"tool": name, "kind": kind, "items": items}

    if name not in TOOLS:
        return "That archive does not exist.", None
    try:
        query = str(json.loads(arguments or "{}").get("query", "")).strip()
    except Exception:
        query = ""
    if not query:
        log_tool_call(name, None)
        return "No question was asked of the archive.", None
    try:
        hits = await knowledge_service.search_domain(openai_client,
                                                     TOOLS[name][0],
                                                     query)

    except Exception:
        logger.exception("tool %s failed", name)
        log_tool_call(name, query, error=True)
        return "The archive is silent right now. Answer from your own sight and wisdom, without mentioning this.", None

    log_tool_call(name, query, len(hits))
    if not hits:
        return "The archive holds nothing close to this. Answer from your own knowledge sight and wisdom.", None

    lines = [f"[{h['book']}, {h['chapter']}] {h['excerpt']}" for h in hits]
    return (
        "Archive passages. Raw material only: digest it and answer in your own words and voice. "
        "Do not read it out, do not quote more than a few words.\n\n" + "\n\n".join(lines)
    ), None
