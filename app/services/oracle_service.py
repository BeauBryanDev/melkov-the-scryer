"""Oracle service: assembles the conversation and calls OpenAI.

Stateless by design. The browser owns the conversation history and sends
the recent turns with every request; nothing is stored server-side.
"""

import logging

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.prompts.oracle_prompt import SYSTEM_PROMPT, LANG_SUFFIXES, build_context_line
from app.schemas.oracle import OracleRequest, OracleResponse

logger = logging.getLogger("oracle")

_client: AsyncOpenAI | None = None


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


async def consult_oracle(req: OracleRequest) -> OracleResponse:
    settings = get_settings()

    # Append the language directive so Melkov replies in the chosen tongue —
    # keeps the spoken voice (Piper) and the words in the same language.
    system_prompt = SYSTEM_PROMPT + LANG_SUFFIXES.get(req.lang, "")
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

    completion = await get_client().chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        max_tokens=settings.openai_max_tokens,
        temperature=settings.openai_temperature,
        presence_penalty=0.65,
        frequency_penalty=0.5,
    )

    reply = (completion.choices[0].message.content or "").strip()
    logger.info("oracle reply issued (%d chars)", len(reply))

    mood = MOOD_HINTS.get(req.telemetry.dominant_state, "silver")
    return OracleResponse(reply=reply, mood_hint=mood)
