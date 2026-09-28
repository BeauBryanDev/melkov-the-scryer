
from datetime import datetime, timezone

_day: str = ""
_count: int = 0

# Global daily budget for /oracle calls (across all visitors).

# In-memory and per-process: uvicorn runs a single worker here, so a plain
# counter is enough. It resets at UTC midnight and on service restart.
# A budget of 0 means "disabled".

def try_consume(budget: int) -> bool:
    """Count one call. Returns False when today's budget is already spent."""
    global _day, _count
    
    if budget <= 0:
        return True
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    if today != _day:
        _day, _count = today, 0
        
    if _count >= budget:
        return False
    
    _count += 1
    
    return True
