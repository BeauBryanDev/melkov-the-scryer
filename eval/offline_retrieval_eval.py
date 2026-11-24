import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from openai import OpenAI  # noqa: E402
from qdrant_client import QdrantClient  # noqa: E402
from qdrant_client.http.exceptions import ResponseHandlingException  # noqa: E402
from qdrant_client.models import FieldCondition, Filter, MatchValue  # noqa: E402

from app.core.config import get_settings  # noqa: E402

GOLDEN = ROOT / "eval" / "golden_set.json"
RESULTS_DIR = ROOT / "eval" / "results"
DEEP_K = 20
KS = (1, 3, 5, 10, 20)

# Chapter labels that are not real chapters (48 Laws chapter-detection bug): "Preface" holds the
# body of Laws 1-27 (526 chunks), "Law 27:" holds the TOC summaries of Laws 28-48. Matching on
# these would count almost any hit, so they only match at chunk level.
LAWS = "The 48 Laws of Power"
UNRELIABLE_CHAPTERS = {(LAWS, "Preface")}
UNRELIABLE_CHAPTER_PREFIXES = {(LAWS, "Law 27:")}

# Chapter names in Qdrant that drifted from scryer_knowledge_chunks.json. The notebook's drop-cap
# fix (C + OMING) regenerated the JSON, but those 5 points were never re-upserted. Indexed name ->
# golden-set name. Remove once the collection is re-indexed.
CHAPTER_ALIASES = {
    ("The Prince",
     "CHAPTER XVII: Concerning Cruelty And Clemency, And Whether It Is Better To Be Loved Than Feared OMING"):
    "CHAPTER XVII: Concerning Cruelty And Clemency, And Whether It Is Better To Be Loved Than Feared",
}


def chapter_is_reliable(book: str, chapter: str) -> bool:
    if (book, chapter) in UNRELIABLE_CHAPTERS:
        return False
    return not any(book == b and chapter.startswith(p) for b, p in UNRELIABLE_CHAPTER_PREFIXES)


def is_gold(hit: dict, q: dict) -> bool:
    if hit["chapter"] in q["relevant_chapters"] and hit["book"] == q["book"]:
        return True
    return any(
        hit["book"] == g["book"] and hit["chapter"] == g["chapter"] and hit["chunk_index"] == g["chunk_index"]
        for g in q["relevant_chunks"]
    )


def gold_chapters(q: dict) -> set[str]:
    chapters = set(q["relevant_chapters"]) | {g["chapter"] for g in q["relevant_chunks"]}
    return {c for c in chapters if chapter_is_reliable(q["book"], c)}


def is_gold_chapter(hit: dict, q: dict) -> bool:
    return is_gold(hit, q) or (hit["book"] == q["book"] and hit["chapter"] in gold_chapters(q))


def search(client: QdrantClient, 
           collection: str,
           vector: list[float], 
           domain: str
           ) -> list[dict]:
    
    for attempt in range(3):  # free Qdrant Cloud tier sometimes times out on a cold request
        try:
            res = client.query_points(
                collection_name=collection,
                query=vector,
                query_filter=Filter(must=[FieldCondition(key="domain", match=MatchValue(value=domain))]),
                limit=DEEP_K,
                with_payload=["book", "chapter", "chunk_index"],
            )
            break
        except ResponseHandlingException:
            if attempt == 2:
                raise
    hits = []
    for p in res.points:
        book, indexed = p.payload.get("book"), p.payload.get("chapter")
        hit = {
            "book": book,
            "chapter": CHAPTER_ALIASES.get((book, indexed), indexed),
            "chunk_index": p.payload.get("chunk_index"),
            "score": round(p.score, 4),
        }
        if hit["chapter"] != indexed:
            hit["chapter_indexed"] = indexed  # keep the raw drifted label visible in the results
        hits.append(hit)
    return hits


def evaluate(golden: list[dict], 
             hits_by_id: dict[str, list[dict]], 
             top_k: int,
             min_score: float
             ) -> list[dict]:
    
    rows = []
    for q in golden:
        hits = hits_by_id[q["id"]]
        for h in hits:
            h["gold"] = is_gold(h, q)
            h["gold_chapter"] = is_gold_chapter(h, q)
            
        rank = next((i + 1 for i, h in enumerate(hits) if h["gold"]), None)
        chap_rank = next((i + 1 for i, h in enumerate(hits) if h["gold_chapter"]), None)
        prod = [h for h in hits[:top_k] if h["score"] >= min_score]
        
        rows.append({
            "id": q["id"],
            "book": q["book"],
            "style": q["style"],
            "question": q["question"],
            "gold_rank": rank,   # None = not in top DEEP_K
            "gold_score": hits[rank - 1]["score"] if rank else None,
            "chapter_rank": chap_rank,                          # first hit from a gold chapter
            "top1_score": hits[0]["score"] if hits else None,
            "prod_hit": any(h["gold"] for h in prod),          # gold chunk reached Asher
            "prod_chapter_hit": any(h["gold_chapter"] for h in prod),  # gold chapter reached Asher
            "prod_book_hit": any(h["book"] == q["book"] for h in prod),  # right book, any chunk
            "prod_books": [h["book"] for h in prod],
            "hits": hits,
        })
    return rows


def summarize(rows: list[dict]) -> dict:
    n = len(rows)
    out = {"n": n}
    for k in KS:
        out[f"recall@{k}"] = sum(1 for r in rows if r["gold_rank"] and r["gold_rank"] <= k) / n
    out["mrr@20"] = sum(1 / r["gold_rank"] for r in rows if r["gold_rank"]) / n
    for k in (1, 3):
        out[f"chapter_recall@{k}"] = sum(1 for r in rows if r["chapter_rank"] and r["chapter_rank"] <= k) / n
    out["chapter_mrr@20"] = sum(1 / r["chapter_rank"] for r in rows if r["chapter_rank"]) / n
    out["prod_hit"] = sum(r["prod_hit"] for r in rows) / n
    out["prod_chapter_hit"] = sum(r["prod_chapter_hit"] for r in rows) / n
    out["prod_book_hit"] = sum(r["prod_book_hit"] for r in rows) / n
    return out


def fmt_row(name: str, s: dict) -> str:
    return (f"{name:30s} {s['n']:>3d}  {s['recall@1']:.2f}  {s['recall@3']:.2f}  {s['recall@5']:.2f}  "
            f"{s['recall@10']:.2f}  {s['recall@20']:.2f}  {s['mrr@20']:.2f} | "
            f"{s['chapter_recall@1']:.2f}  {s['chapter_recall@3']:.2f}  {s['chapter_mrr@20']:.2f} | "
            f"{s['prod_hit']:.2f}  {s['prod_chapter_hit']:.2f}  {s['prod_book_hit']:.2f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="baseline", help="name for this run, e.g. baseline, rechunk-v2")
    args = ap.parse_args()

    s = get_settings()
    golden = json.loads(GOLDEN.read_text())
    oa = OpenAI(api_key=s.openai_api_key)
    qd = QdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key or None, timeout=30)

    emb = oa.embeddings.create(model=s.embedding_model, input=[q["question"][:500] for q in golden])
    vectors = [d.embedding for d in emb.data]
    hits_by_id = {q["id"]: search(qd, s.qdrant_collection, v, q["domain"]) for q, v in zip(golden, vectors)}

    rows = evaluate(golden, hits_by_id, s.rag_top_k, s.rag_min_score)

    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[r["book"]].append(r)
    prince = [r for r in rows if r["book"] == "The Prince"]
    summary = {
        "label": args.label,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "config": {
            "collection": s.qdrant_collection,
            "points": qd.count(s.qdrant_collection).count,
            "embedding_model": s.embedding_model,
            "top_k": s.rag_top_k,
            "min_score": s.rag_min_score,
            "deep_k": DEEP_K,
        },
        "overall": summarize(rows),
        "by_book": {b: summarize(rs) for b, rs in groups.items()},
        "prince_by_style": {st: summarize([r for r in prince if r["style"] == st]) for st in ("book", "plain")},
    }

    head = (f"{'':30s} {'n':>3s}  R@1   R@3   R@5   R@10  R@20  MRR  | cR@1  cR@3  cMRR | "
            f"prod  pChap pBook\n{'':30s} {'':3s}  {'---- chunk level ----':^39s}  | {'chapter level':^16s} | "
            f"{'reached Asher':^16s}")
    print(f"\n== offline retrieval eval: {args.label}  ({summary['config']['points']} points, "
          f"top_k={s.rag_top_k}, min_score={s.rag_min_score}) ==\n")
    print(head)
    print(fmt_row("OVERALL", summary["overall"]))
    for b, st in summary["by_book"].items():
        print(fmt_row(b, st))
    print()
    for st, v in summary["prince_by_style"].items():
        print(fmt_row(f"The Prince / {st}", v))

    # Which books fill Asher's 3 slots on life_strategy questions?
    print("\nBooks filling the prod top-3 on life_strategy questions (slots):")
    for book in ("The Prince", "The 48 Laws of Power", "The Art of War"):
        rs = groups.get(book, [])
        c = Counter(b for r in rs for b in r["prod_books"])
        print(f"  asked about {book:22s} -> " + ", ".join(f"{k}: {v}" for k, v in c.most_common()))

    print("\nPer question (rank of first gold chunk / first gold-chapter chunk in top-20; '-' = not found):")
    for r in rows:
        if r["prod_hit"]:
            mark = "OK "
        elif r["prod_chapter_hit"]:
            mark = "ch "
        elif r["prod_book_hit"]:
            mark = "bk "
        else:
            mark = "-- "
        rank = r["gold_rank"] or "-"
        crank = r["chapter_rank"] or "-"
        top = r["hits"][0]
        print(f"  {mark}{r['id']} rank={str(rank):>2s} ch={str(crank):>2s} gold={r['gold_score'] or 0:.3f} "
              f"top1={r['top1_score']:.3f} [{top['book'][:14]} | {top['chapter'][:28]}]  {r['question'][:55]}")

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"offline_{args.label}_{datetime.now():%Y%m%d_%H%M%S}.json"
    out.write_text(json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False) + "\n")
    print("\nlegend: OK = gold chunk reached Asher, ch = right chapter but not the gold chunk, "
          "bk = right book only, -- = miss")
    print("note: 48 Laws 'Preface' and 'Law 27:' are mislabelled chapters and only match at chunk level")
    print(f"saved -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
