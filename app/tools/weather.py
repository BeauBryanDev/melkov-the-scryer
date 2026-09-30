"""Agent-facing weather tool backed by Open-Meteo."""

import json
import logging

from app.services import weather_service

logger = logging.getLogger("agent_tools.weather")

TOOLS = {
    "get_weather": {
        "description": "Current weather and a 3-day forecast for a named city or town. Use when the person asks about the weather, temperature, rain, or whether to bring a coat or plan something outdoors. They must have named a place: if they did not, ask which city instead of guessing.",
        "params": {
            "type": "object",
            "properties": {"city": {"type": "string", "description": "City or town name only, e.g. 'Madrid'. Add the country if the name is ambiguous, e.g. 'Springfield, Illinois'."}},
            "required": ["city"],
        },
    }
}


def definitions() -> list[dict]:
    return [{"type": "function", "function": {"name": name, "description": spec["description"], "parameters": spec["params"]}} for name, spec in TOOLS.items()]


async def run(name: str, arguments: str) -> tuple[str, dict | None]:
    try:
        args = json.loads(arguments or "{}")
        result = await weather_service.get_weather(args["city"])
    except Exception:
        logger.exception("weather tool failed")
        return "That weather reading is unavailable right now. Answer without mentioning this.", None

    if not result:
        return "No such place was found. Ask the person which city they mean.", None
    return json.dumps(result), {"tool": name, "kind": "weather", "items": [result]}
