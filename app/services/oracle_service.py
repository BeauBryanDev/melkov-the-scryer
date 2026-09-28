
import asyncio
import logging

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.prompts.oracle_prompt import (
    AGENT_SUFFIX, 
    SYSTEM_PROMPT, 
    LANG_SUFFIXES, 
    build_context_line
)
from app.schemas.oracle import (
    FixtureCard,
    MovieCard,
    OracleRequest,
    OracleResponse,
    StandingCard,
    TeamCard,
    VisualCard,
)
from app.services.agent_tools import run_tool, tool_definitions


logger = logging.getLogger("oracle")

_client: AsyncOpenAI | None = None


# Oracle service: Asher as a tool-using agent.

# gpt-4o-mini (o200k_base) token ids for '**', ' **', '*', ' *', '***', '**\n' and backtick runs,
# so the model cannot emit markdown emphasis that Piper would read aloud.
NO_MARKDOWN_BIAS = {str(t): -100 for t in (410, 6240, 9, 425, 18204, 1612, 63, 26178, 168394)}


def get_client() -> AsyncOpenAI:
    
    global _client
    
    if _client is None:
        
        _client = AsyncOpenAI(
            api_key=get_settings().openai_api_key,
            # Fail fast on dead connections, retry transient network errors.
            timeout=httpx.Timeout(20.0, connect=5.0),
            max_retries=2,
        )
        
    return _client

# Maps the dominant emotional channel to a one-word tint the client
# can apply to the eye while the reply is spoken.
MOOD_HINTS = {
    "anger": "ember",
    "sadness": "frost",
    "surprise": "bloom",
    "joy": "gold",
    "neutral": "silver",
}

# tool name -> the VisualCard subtype its raw items should be parsed into.
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
}


def _cards_from_payload(payload: dict) -> list[VisualCard]:
    """Parse a leisure tool's raw {"tool", "kind", "items"} payload into typed cards."""
    card_cls = _CARD_TYPE_BY_TOOL.get(payload["tool"])
    
    if card_cls is None:
        return []
    
    cards = []
    
    for item in payload["items"]:
        try:
            cards.append(card_cls(**item))
            
        except Exception:
            logger.exception("failed to build visual card for %s", payload["tool"])
            
    return cards


async def consult_oracle(req: OracleRequest) -> OracleResponse:
    settings = get_settings()

    # Append the language directive so Asher replies in the chosen tongue —
    # keeps the spoken voice (Piper) and the words in the same language.
    tools = tool_definitions()
    system_prompt = SYSTEM_PROMPT + (AGENT_SUFFIX if tools else "") + LANG_SUFFIXES.get(req.lang, "")
    messages = [{"role": "system", "content": system_prompt}]

    # Client-provided history, truncated defensively
    for turn in req.history[-settings.max_history_turns:]:
        messages.append({"role": turn.role, "content": turn.content})

    # Telemetry rides inside the user turn so the model always pairs
    # what was said with what was seen at that exact moment.
    messages.append(
        {
            "role": "user",
            "content": f"{build_context_line(req.telemetry)}\n{req.text}",
        }
    )

    client = get_client()
    tools_used: list[str] = []
    visual_cards: list[VisualCard] = []
    reply = ""

    # Agent loop: THINKING -> (USING_TOOL -> THINKING)* -> SPEAKING. 
    # On the last round tools are withheld, so Asher must answer with what he has.
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
            
            calls = [tc for tc in (msg.tool_calls or []) if tc.type == "function"][:2]
            
            if not calls:
                
                reply = (msg.content or "").strip()
                break

            messages.append(
                {
                    "role": "assistant",
                    "content": msg.content,
                    "tool_calls": [
                        {"id": tc.id, 
                            "type": "function", 
                            "function": {
                                "name": tc.function.name, 
                                "arguments": tc.function.arguments
                                }
                            }
                        for tc in calls
                    ],
                }
            )
            results = await asyncio.gather(*(run_tool(tc.function.name,
                                                        tc.function.arguments,
                                                        client) for tc in calls
                                             )
                                            )

            for tc, (result_text, visual) in zip(calls, results):
                    # TODO : visuals are not yet supported, ugly UI for now
                tools_used.append(tc.function.name)
                messages.append({"role": "tool",
                                    "tool_call_id": tc.id,
                                    "content": result_text}
                                )
                if visual is not None:
                    visual_cards.extend(_cards_from_payload(visual))
                    
            logger.info("asher consulted: %s", 
                        ", ".join(tc.function.name for tc in calls)
                        )
            
    except Exception:
        
        logger.exception("oracle answer failed")
        
        reply = "The oracle is silent right now. inner error , speak back later."
        tools_used = []
        visual_cards = []


    logger.info("oracle reply generated (%d chars, tools=%d)",
                len(reply), len(tools_used))

    mood = MOOD_HINTS.get(req.telemetry.dominant_state, "silver")
    
    return OracleResponse(reply=reply,
                          mood_hint=mood,
                          tools_used=tools_used,
                          visual_payload=visual_cards or None,
                          )
