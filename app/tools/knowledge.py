"""Agent-facing tools for the optional knowledge archives."""

import json
import logging

from openai import AsyncOpenAI

from app.core.logging import log_tool_call
from app.services import knowledge_service

logger = logging.getLogger("agent_tools.knowledge")

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
        "Use when the person faces conflict, rivals, timing, ambition, leadership, or a hard decision about how to act  at work, school or in life in general and they want grow up in life.",
    ),
    "search_learning_knowledge": (
        "learning_strategies",
        "Consult the learning archive (Ultralearning). Use when the person wants to learn, practice, or master "
        "something a new subject or skill, or struggles with focus, memory, or how to study.",
    ),
}

PARAMETERS = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "What to look up, in plain English, about the person's real need "
            "(e.g. 'calming a racing mind before sleep'). Always write the query in English, "
            "even when the person speaks another language.",
        }
    },
    "required": ["query"],
}


def definitions() -> list[dict]:
    if not knowledge_service.is_configured():
        return []
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": PARAMETERS,
            },
        }
        for name, (_, description) in TOOLS.items()
    ]


async def run(name: str, arguments: str, openai_client: AsyncOpenAI) -> tuple[str, dict | None]:
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
        hits = await knowledge_service.search_domain(openai_client, TOOLS[name][0], query)
    except Exception:
        logger.exception("tool %s failed", name)
        log_tool_call(name, query, error=True)
        return "The archive is silent right now. Answer from your own sight and wisdom, without mentioning this.", None

    log_tool_call(name, query, len(hits))
    if not hits:
        return "The archive holds nothing close to this. Answer from your own knowledge sight and wisdom.", None

    lines = [f"[{hit['book']}, {hit['chapter']}] {hit['excerpt']}" for hit in hits]
    return (
        "Archive passages. Raw material only: digest it and answer in your own words and voice. "
        "Do not read it out, do not quote more than a few words.\n\n" + "\n\n".join(lines)
    ), None
