
import logging

from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchValue

from app.core.config import get_settings

logger = logging.getLogger("knowledge")

_qdrant: AsyncQdrantClient | None = None

# Knowledge archives: semantic search over the book chunks stored in Qdrant.
# Asher never sees this directly. It is reached only through the agent tools in agent tools

def is_configured() -> bool:
    return bool(get_settings().qdrant_url)


def get_qdrant() -> AsyncQdrantClient:
    global _qdrant
    
    if _qdrant is None:
        
        s = get_settings()
        
        _qdrant = AsyncQdrantClient(url=s.qdrant_url, 
                                    api_key=s.qdrant_api_key or None, 
                                    timeout=10)
        
    return _qdrant


def _excerpt(text: str, limit: int) -> str:
    """Trim to limit chars, preferring a sentence boundary, else a word boundary."""
    text = " ".join(text.split())
    
    if len(text) <= limit:
        return text
    
    cut = text[:limit]
    end = max(cut.rfind(". "), 
              cut.rfind("? "), 
              cut.rfind("! "))
    
    if end > limit * 0.5:
        return cut[: end + 1]
    
    return cut[: cut.rfind(" ")] + "…"


async def search_domain(openai_client: AsyncOpenAI, 
                        domain: str, 
                        query: str
                        ) -> list[dict]:
    """Top passages for query within one knowledge domain payload value."""
    s = get_settings()
    
    emb = await openai_client.embeddings.create(model=s.embedding_model, 
                                                input=query[:500])
    res = await get_qdrant().query_points(
        collection_name=s.qdrant_collection,
        query=emb.data[0].embedding,
        query_filter=Filter(must=[FieldCondition(key="domain", 
                                                 match=MatchValue(value=domain)
                                                 )
                                  ]),
        limit=s.rag_top_k, # passages returned per tool call
        score_threshold=s.rag_min_score, # cosine floor: below this the archive "holds nothing"
        with_payload=True,
    )
    return [
        {
            # Keep the provenance fields from build_rag_collection.ipynb
            # attached to every hit. The agent currently uses only the
            # excerpt, but the response layer will use these fields later to
            # show the source in the Eye without re-querying Qdrant.
            "book": p.payload.get("book", "Unknown book"),
            "chapter": p.payload.get("chapter", "Unknown chapter"),
            "chunk_index": p.payload.get("chunk_index"),
            "start_page": p.payload.get("start_page"),
            "author": p.payload.get("author"),
            "excerpt": _excerpt(p.payload.get("text", ""),
                                s.rag_snippet_chars),
        }
        for p in res.points
    ]
