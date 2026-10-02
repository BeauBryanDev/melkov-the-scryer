
import logging

from openai import AsyncOpenAI

from app.tools import ( football, 
                       games, 
                       knowledge, 
                       movies, 
                       music, 
                       news, 
                       books, 
                       fibonacci,
                       weather,
                       places
                        )

logger = logging.getLogger("oracle_services")

_DOMAINS = (knowledge, movies, music, news, weather, games, books, fibonacci, football, places)

"""Assembly point and dispatcher for Scryer's agent-facing tools."""

def tool_definitions() -> list[dict]:
    """Return configured OpenAI function definitions in stable domain order."""
    definitions: list[dict] = []
    for domain in _DOMAINS:
        definitions.extend(domain.definitions())
        
    return definitions


async def run_tool(
    name: str,
    arguments: str,
    openai_client: AsyncOpenAI,
) -> tuple[str, dict | None]:
    """Dispatch a model tool call without exposing service implementations."""
    for domain in _DOMAINS:
        if name in domain.TOOLS:
            if domain is knowledge:
                return await domain.run(name, 
                                        arguments, 
                                        openai_client
                                        )
                
            return await domain.run(name, arguments)
        
    logger.warning("unknown tool requested: %s", name)
    
    return "That capability does not exist.", None
