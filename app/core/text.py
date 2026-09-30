import html
import re

# Speech is a separate representation from the visual reply. These patterns
# remove presentation and transport syntax before text reaches Piper.
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_URL = re.compile(r"https?://[^\s<>()\[\]{}\"']+")
_FENCED_BLOCK = re.compile(r"```[\s\S]*?```")
_INLINE_CODE = re.compile(r"`([^`]*)`")
_HTML_TAG = re.compile(r"<[^>]*>")
_LINE_PREFIX = re.compile(r"(?m)^\s*(?:#{1,6}\s+|>\s+|[-+*]\s+|\d+[.)]\s+)")
_EMPH = re.compile(r"[*~]+")
_UNDERSCORE_EMPH = re.compile(r"(?<!\w)_+|_+(?!\w)")
_JSON_FIELD = re.compile(
    r"(?m)^\s*[\"']?(?:url|image|alt|metadata|visual_payload|speech_text)[\"']?\s*:\s*.*$"
)


def sanitize_for_speech(text: str) -> str:
    """Return natural-language text safe for speech synthesis.

    Visual Markdown, URLs, HTML, code blocks, and common JSON metadata are
    presentation data, not words Asher should pronounce. Image syntax is
    removed entirely; ordinary Markdown links retain their visible label.
    """
    if not text:
        return ""

    text = html.unescape(str(text))
    text = _FENCED_BLOCK.sub(" ", text)
    text = _IMAGE.sub(" ", text)
    text = _LINK.sub(r"\1", text)
    text = _URL.sub(" ", text)
    text = _HTML_TAG.sub(" ", text)
    text = _JSON_FIELD.sub(" ", text)
    text = _LINE_PREFIX.sub("", text)
    text = _INLINE_CODE.sub(r"\1", text)
    text = _EMPH.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def to_plain_speech(text: str) -> str:
    """Backward-compatible name for the speech sanitizer."""
    return sanitize_for_speech(text)
