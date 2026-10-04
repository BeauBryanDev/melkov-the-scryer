
import asyncio
import logging

import httpx
from openai import AsyncOpenAI

from app.agent.oracle import AGENT_SUFFIX, LANG_SUFFIXES, SYSTEM_PROMPT, build_context_line
from app.agent.oracle_services import run_tool, tool_definitions
from app.core.config import get_settings
from app.core.text import sanitize_for_speech
from app.schemas.oracle import (
    FixtureCard, GameCard,
    MovieCard, NewsCard, 
    OracleRequest, OracleResponse,
    StandingCard, TeamCard, 
    VisualCard, WeatherCard ,
    MusicCard, ArtistCard,
    KnowledgeSource,
    AlbumCard, BookCard, 
    PlaceCard, FibonacciCard
)

logger = logging.getLogger("oracle")

# token ids for gpt-4o tokenizer — regenerate if openai_model changees
_client: AsyncOpenAI | None = None
NO_MARKDOWN_BIAS = {str(token): -100 for token in (410, 6240, 9, 425, 18204, 1612, 63, 26178, 168394)}
MOOD_HINTS = {"anger": "ember", 
              "sadness": "frost", 
              "surprise": "bloom", 
              "joy": "gold", 
              "neutral": "silver"
              }

_CARD_TYPE_BY_TOOL = {
    "get_trending_movies": MovieCard, 
    "get_popular_movies": MovieCard, 
    "search_movie": MovieCard,
    "get_movie_details": MovieCard, 
    "get_live_football_fixtures": FixtureCard,
    "get_football_fixtures_by_date": FixtureCard,
    "search_football_team": TeamCard,
    "get_football_team_fixtures": FixtureCard,
    "get_football_standings": StandingCard,
    "get_weather": WeatherCard, 
    "get_news": NewsCard, 
    "get_videogames": GameCard,
    "get_trending_music": MusicCard, 
    "search_track": MusicCard, 
    "search_artist": ArtistCard,
    "search_album": AlbumCard,
    "search_books": BookCard,
    "get_book_details": BookCard,
    "get_fibonacci": FibonacciCard,
    "search_places": PlaceCard,
}

# Scryer agent runtime and response shaping by the Oracle and GPT-4.

def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=get_settings().openai_api_key, 
                              timeout=httpx.Timeout(20.0, connect=5.0), 
                              max_retries=2
                              )
    return _client


def _cards_from_payload(payload: dict) -> list[VisualCard]:
    
    card_cls = _CARD_TYPE_BY_TOOL.get(payload["tool"])
    
    if card_cls is None:
        return []
    
    cards = []
    for item in payload["items"]:
        try:
            cards.append(card_cls(**item))
            
        except Exception:
            logger.exception("failed to build visual card for %s", 
                             payload["tool"])
            
    return cards


async def consult_oracle(req: OracleRequest) -> OracleResponse:
    
    settings = get_settings()
    tools = tool_definitions()
    
    system_prompt = SYSTEM_PROMPT + (AGENT_SUFFIX if tools else "") + LANG_SUFFIXES.get(req.lang, "")
    messages = [{"role": "system", "content": system_prompt}]
    
    for turn in req.history[-settings.max_history_turns:]:
        
        messages.append({"role": turn.role, "content": turn.content})
        
    messages.append(
        {"role": "user", 
         "content": f"{build_context_line(req.telemetry)}\n{req.text}"
         }
        )

    client = get_client()
    tools_used: list[str] = []
    visual_cards: list[VisualCard] = []
    knowledge_sources: list[KnowledgeSource] = []
    reply = ""
    
    try:
        for round_no in range(settings.agent_max_tool_rounds + 1):
            
            offer_tools = bool(tools) and round_no < settings.agent_max_tool_rounds
            completion = await client.chat.completions.create(
                model=settings.openai_model, 
                messages=messages, 
                max_tokens=settings.openai_max_tokens,
                temperature=settings.openai_temperature, 
                presence_penalty=0.65, 
                frequency_penalty=0.5,
                logit_bias=NO_MARKDOWN_BIAS, 
                **({"tools": tools} if offer_tools else {}),
            )
            msg = completion.choices[0].message
            calls = [tool_call for tool_call in (msg.tool_calls or []) if tool_call.type == "function"][:2]
            if not calls:
                reply = (msg.content or "").strip()
                break
            
            messages.append({
                "role": "assistant", 
                "content": msg.content,
                "tool_calls": [
                    {"id": tc.id, 
                     "type": "function",
                     "function": {
                         "name": tc.function.name, 
                         "arguments": tc.function.arguments
                         }
                     } for tc in calls ],
            })
            
            results = await asyncio.gather(*(run_tool(tc.function.name, 
                                                      tc.function.arguments, 
                                                      client) for tc in calls)
                                           )
            
            for tc, (result_text, visual) in zip(calls, results):
                
                tools_used.append(tc.function.name)
                messages.append(
                    {"role": "tool", 
                     "tool_call_id": tc.id, 
                     "content": result_text}
                    )
                
                if visual is not None:
                    if visual.get("kind") == "knowledge_sources":
                        for source in visual.get("items", []):
                            try:
                                knowledge_sources.append(KnowledgeSource(**source))
                            except Exception:
                                logger.exception("failed to build knowledge source")
                    else:
                        visual_cards.extend(_cards_from_payload(visual))
                    
            logger.info("asher consulted: %s", ", ".join(tc.function.name for tc in calls))
            
    except Exception:
        logger.exception("oracle answer failed")
        reply = "The oracle is silent right now. inner error , speak back later."
        tools_used = []
        visual_cards = []
        knowledge_sources = []

    logger.info("oracle reply generated (%d chars, tools=%d)",
                len(reply), len(tools_used)
                )
    
    return OracleResponse(
        reply=reply,
        speech_text=sanitize_for_speech(reply),
        mood_hint=MOOD_HINTS.get(req.telemetry.dominant_state, "silver"),
        tools_used=tools_used,
        knowledge_sources=knowledge_sources or None,
        visual_payload=visual_cards or None,
    )


