"""Agent-facing news tool backed by GNews."""

import json
import logging

from app.services import news_service

logger = logging.getLogger("agent_tools.news")

TOOLS = {
    "get_news": {
        "description": "Recent news headlines from real publishers. Use when the person asks what is happening in the world, a country or a topic, or wants the news. Give `query` for a specific topic or place (e.g. 'Spain', 'Middle East conflict', 'electric cars'); otherwise give one `category`; with neither you get general headlines. Articles are about 12 hours old, so never call it 'breaking'. Report neutrally and name the source.",
        "params": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Topic or place to search for. Optional."},
                "category": {"type": "string", "enum": list(news_service.CATEGORIES), "description": "One category, used only when no query is given. Default general."},
                "lang": {"type": "string", "enum": ["en", "es", "fr"], "description": "Language of the articles; match the language the person speaks."},
            },
            "required": [],
        },
    }
}


def definitions() -> list[dict]:
    if not news_service.is_configured():
        return []
    return [{"type": "function", "function": {"name": name, "description": spec["description"], "parameters": spec["params"]}} for name, spec in TOOLS.items()]


async def run(name: str, arguments: str) -> tuple[str, dict | None]:
    try:
        args = json.loads(arguments or "{}")
        result = await news_service.get_news(args.get("query"), args.get("category"), args.get("lang"))
    except Exception:
        logger.exception("news tool failed")
        return "That news reel is stuck right now. Answer from your own sight and wisdom, without mentioning this.", None

    if not result:
        return "No news came back for this. Say so briefly, without inventing any headline.", None
    items = result if isinstance(result, list) else [result]
    return json.dumps(result), {"tool": name, "kind": "news", "items": items}
