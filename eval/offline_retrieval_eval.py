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
from qdrant_client.models import FieldCondition, Filter, MatchValue  # noqa: E402

from app.core.config import get_settings  # noqa: E402

GOLDEN = ROOT / "eval" / "golden_set.json"
RESULTS_DIR = ROOT / "eval" / "results"
DEEP_K = 20
KS = (1, 3, 5, 10, 20)


def is_gold(hit: dict, q: dict) -> bool:
    if hit["chapter"] in q["relevant_chapters"] and hit["book"] == q["book"]:
        return True
    return any(
        hit["book"] == g["book"] and hit["chapter"] == g["chapter"] and hit["chunk_index"] == g["chunk_index"]
        for g in q["relevant_chunks"]
    )


def search(client: QdrantClient, collection: str, vector: list[float], domain: str) -> list[dict]:
    res = client.query_points(
        collection_name=collection,
        query=vector,
        query_filter=Filter(must=[FieldCondition(key="domain", match=MatchValue(value=domain))]),
        limit=DEEP_K,
        with_payload=["book", "chapter", "chunk_index"],
    )
    return [
        {
            "book": p.payload.get("book"),
            "chapter": p.payload.get("chapter"),
            "chunk_index": p.payload.get("chunk_index"),
            "score": round(p.score, 4),
        }
        for p in res.points
    ]


def evaluate(golden: list[dict], hits_by_id: dict[str, list[dict]], top_k: int, min_score: float) -> list[dict]:
    rows = []
    for q in golden:
        hits = hits_by_id[q["id"]]
        for h in hits:
            h["gold"] = is_gold(h, q)
        rank = next((i + 1 for i, h in enumerate(hits) if h["gold"]), None)
        prod = [h for h in hits[:top_k] if h["score"] >= min_score]
        rows.append({
            "id": q["id"],
            "book": q["book"],
            "style": q["style"],
            "question": q["question"],
            "gold_rank": rank,                                  # None = not in top DEEP_K
            "gold_score": hits[rank - 1]["score"] if rank else None,
            "top1_score": hits[0]["score"] if hits else None,
            "prod_hit": any(h["gold"] for h in prod),          # gold chunk reached Asher
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
    out["prod_hit"] = sum(r["prod_hit"] for r in rows) / n
    out["prod_book_hit"] = sum(r["prod_book_hit"] for r in rows) / n
    return out


def fmt_row(name: str, s: dict) -> str:
    return (f"{name:30s} {s['n']:>3d}  {s['recall@1']:.2f}  {s['recall@3']:.2f}  {s['recall@5']:.2f}  "
            f"{s['recall@10']:.2f}  {s['recall@20']:.2f}  {s['mrr@20']:.2f}   {s['prod_hit']:.2f}     {s['prod_book_hit']:.2f}")


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

    head = f"{'':30s} {'n':>3s}  R@1   R@3   R@5   R@10  R@20  MRR    prod_hit prod_book"
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

    print("\nPer question (rank of first gold chunk in top-20; '-' = not found):")
    for r in rows:
        mark = "OK " if r["prod_hit"] else ("bk " if r["prod_book_hit"] else "-- ")
        rank = r["gold_rank"] or "-"
        top = r["hits"][0]
        print(f"  {mark}{r['id']} rank={str(rank):>2s} gold={r['gold_score'] or 0:.3f} top1={r['top1_score']:.3f} "
              f"[{top['book'][:14]} | {top['chapter'][:28]}]  {r['question'][:60]}")

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"offline_{args.label}_{datetime.now():%Y%m%d_%H%M%S}.json"
    out.write_text(json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False) + "\n")
    print(f"\nlegend: OK = gold chunk reached Asher, bk = right book but not the gold chunk, -- = miss")
    print(f"saved -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
