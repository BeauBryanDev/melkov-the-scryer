import re

# remove markdown formatting from text so the Creature never reads 'asterisk' aloud

_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_FENCE = re.compile(r"`+")
_EMPH = re.compile(r"[*]+")
_UNDERSCORE_EMPH = re.compile(r"(?<!\w)_+|_+(?!\w)")
_LINE_PREFIX = re.compile(r"(?m)^\s*(?:#{1,6}\s+|>\s+|[-+]\s+|\d+[.)]\s+)")


def to_plain_speech(text: str) -> str:
    """Strip markdown so Piper never reads 'asterisk' aloud. 
    Applied only at the TTS boundary."""
    text = _LINK.sub(r"\1", text)
    text = _LINE_PREFIX.sub("", text)
    text = _FENCE.sub("", text)
    text = _EMPH.sub("", text)
    text = _UNDERSCORE_EMPH.sub("", text)
    return text
