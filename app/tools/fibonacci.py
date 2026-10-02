
import json
import logging

from app.services import fibonacci_service

logger = logging.getLogger("agent_tools.fibonacci")

# Agent-facing Fibonacci tool. Pure local computation, it is always available.

TOOLS = {
    "get_fibonacci": {
        "description": "Compute the Fibonacci number at position n and the full sequence from Fib(0) to "
                       "Fib(n). Use when the person asks for 'Fibonacci of N' or the Nth Fibonacci number.",
        "params": {
            "type": "object",
            "properties": {
                "n": {
                    "type": "integer",
                    "description": f"Position in the sequence, 0 to {fibonacci_service.MAX_N}.",
                }
            },
            "required": ["n"],
        },
        "handler": lambda args: {
            "n": args["n"],
            "value": fibonacci_service.fibonacci(args["n"]),
            "sequence": fibonacci_service.fibonacci_sequence(args["n"]),
        },
    },
}


def definitions() -> list[dict]:
    
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



async def run(name: str, 
              arguments: str
              ) -> tuple[str, dict | None]:
    
    try:
        args = json.loads(arguments or "{}")
        result = TOOLS[name]["handler"](args)
        
    except ValueError as exc:
        return str(exc), None
    
    except Exception:
        logger.exception("fibonacci tool %s failed", name)
        return "The numbers refuse to resolve right now. Answer from your own sight and wisdom, without mentioning this.", None

    return json.dumps(result), {"tool": name, 
                                "kind": "fibonacci", 
                                "items": [result]}

