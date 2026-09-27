"""Centralized logging setup + a dedicated hook for tool calls.

`configure_logging()` replaces the bare `logging.basicConfig(...)` that used to
live in `main.py`, so every logger in the app (main, oracle, agent_tools,
knowledge, tts) shares one format. Idempotent: safe to call more than once.

`log_tool_call()` is the single place that prints when Asher reaches for an
archive. It always goes through the `asher.tools` logger, so watching just the
tool traffic on a running server is one grep away:

    journalctl -u aegis-scryer -f | grep 'asher.tools'
"""

import logging
import sys

_CONFIGURED = False

LOG_FORMAT = "%(asctime)s %(levelname)-7s %(name)-14s %(message)s"
DATE_FORMAT = "%H:%M:%S"


def configure_logging(level: int = logging.INFO) -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    logging.basicConfig(level=level, format=LOG_FORMAT, datefmt=DATE_FORMAT, stream=sys.stdout)
    _CONFIGURED = True


tool_logger = logging.getLogger("asher.tools")


def log_tool_call(name: str, query: str | None, hit_count: int | None = None, *, error: bool = False) -> None:
    """One line per tool call: which archive, what was asked, how many passages came back.

    - error=True: the search itself raised (Qdrant/OpenAI down, etc).
    - hit_count=None, error=False: the call never reached a search (e.g. no query given).
    - hit_count=0: the archive was searched but had nothing above the score floor.
    """
    if error:
        tool_logger.warning("TOOL %-32s query=%r -> ERROR (archive silent)", name, query)
    elif hit_count is None:
        tool_logger.info("TOOL %-32s query=%r -> skipped (no query)", name, query)
    else:
        tool_logger.info("TOOL %-32s query=%r -> %d hit(s)", name, query, hit_count)
