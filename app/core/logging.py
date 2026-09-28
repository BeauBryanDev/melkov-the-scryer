
import logging
import sys

# Centralized logging setup + a dedicated hook for tool calls.

_CONFIGURED = False

LOG_FORMAT = "%(asctime)s %(levelname)-7s %(name)-14s %(message)s"
DATE_FORMAT = "%H:%M:%S"

# journalctl -u aegis-scryer -f | grep 'asher.tools'

def configure_logging(level: int = logging.INFO) -> None:
    global _CONFIGURED
    
    if _CONFIGURED:
        return
    
    logging.basicConfig(level=level, 
                        format=LOG_FORMAT, 
                        datefmt=DATE_FORMAT, 
                        stream=sys.stdout
                        )
    
    _CONFIGURED = True


tool_logger = logging.getLogger("asher.tools")


def log_tool_call(name: str, 
                  query: str | None,
                  hit_count: int | None = None, 
                  *, 
                  error: bool = False
                  ) -> None:
    """One line per tool call: which archive, 
    what was asked, how many passages came back.

    - error=True: the search itself raised (Qdrant/OpenAI down, etc).
    - hit_count=None, error=False: the call never reached a search (e.g. no query given).
    - hit_count=0: the archive was searched but had nothing above the score floor.
    """
    if error:
        tool_logger.warning("TOOL %-32s query=%r -> ERROR (archive silent)", 
                            name, query)
        
    elif hit_count is None:
        tool_logger.info("TOOL %-32s query=%r -> skipped (no query)", 
                         name, query)
        
    else:
        tool_logger.info("TOOL %-32s query=%r -> %d hit(s)", 
                         name, query, hit_count)
