
import json
import logging

from app.services import books_service

logger = logging.getLogger("agent_tools.books")

# Agent-facing book tools backed by the Google Books service.

TOOLS = {
    "search_books": {
        "description": "Search for books by title, author, or topic. Use when the person wants to find "
                       "a book to read, asks about an author's work, or wants recommendations on a subject.",
        "params": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Title, author name, or topic to search for.",
                }
            },
            "required": ["query"],
        },
        "handler": lambda args: books_service.search_books(args["query"]),
    },
    "get_book_details": {
        "description": "Full details for one book (description, categories, rating, price if available). "
                       "Use after search_books has given you a book_id and the person wants more about it.",
        "params": {
            "type": "object",
            "properties": {
                "book_id": {"type": "string", 
                            "description": "Google Books volume id."
                            }
                },
            "required": ["book_id"],
        },
        "handler": lambda args: books_service.get_book_details(args["book_id"]),
    },
}


def definitions() -> list[dict]:
    
    if not books_service.is_configured():
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
        logger.exception("book tool %s failed", name)
        return "That volume is lost in the stacks right now. Answer from your own sight and wisdom, without mentioning this.", None

    if not result:
        return "Nothing came back for this. Say so briefly, without inventing details.", None
    
    items = result if isinstance(result, list) else [result]
    
    return json.dumps(result), {"tool": name, 
                                "kind": "book", 
                                "items": items}

