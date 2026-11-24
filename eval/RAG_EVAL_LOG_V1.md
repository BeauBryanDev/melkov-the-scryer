# RAG Eval Log - V1: Offline Retrieval Baseline

**Date:** 2026-11-23
**System:** AEGIS SCRYER - Asher, a voice-driven life-advisor agent (gpt-4o + function calling) with four knowledge-archive tools over a Qdrant vector store.
**Scope of V1:** offline retrieval only (no chat model in the loop). The online eval (gpt-4o routing + query rewriting) is deferred to V2.

---

## 1. The symptom

In live use, Asher almost never cites *The Prince* (Machiavelli). Questions about power, dominance and adversaries are answered from *The 48 Laws of Power* every time. The question for this round: **is the retriever burying *The Prince*, and if so, why?**

Rule for this round: measure the RAG as it is today, broken parts included, before changing anything. A fix only counts if it beats this baseline.

## 2. System under test

| Piece | Value |
|---|---|
| Vector store | Qdrant Cloud, collection `Scryer_Knowledge`, 2,094 points |
| Vectors | one dense vector per chunk, `text-embedding-3-small` (1536-dim), cosine |
| Retrieval | dense only - no BM25, no hybrid, no reranker, no diversification |
| Filter | hard payload filter on `domain` (one filter per tool) |
| Returned to Asher | top `rag_top_k = 3` with score at least `rag_min_score = 0.30`, each trimmed to ~420 chars |
| Query | written by gpt-4o, not the user (an implicit query-rewriting step) |

Corpus by book:

| Domain / tool | Book | Chunks | Share of domain |
|---|---|---|---|
| `life_strategy` | The 48 Laws of Power | 1,073 | **84%** |
| `life_strategy` | The Prince | 150 | 12% |
| `life_strategy` | The Art of War | 51 | 4% |
| `learning_strategies` | Ultralearning | 361 | 100% |
| `emotions` | Permission to Feel | 366 | 100% |
| `mindfulness` | Mindfulness in Plain English | 93 | 100% |

Three books share one domain filter, and one of them makes up 84% of the pool.

## 3. Golden set

50 questions (`eval/golden_set.json`, built by `eval/build_golden_set_v1.py`, human-readable in `eval/golden_set_review.md`).

| Book | Questions |
|---|---|
| The Prince | 10 |
| The 48 Laws of Power | 10 |
| The Art of War | 6 |
| Mindfulness in Plain English | 8 |
| Permission to Feel | 8 |
| Ultralearning | 8 |

Design choices:

- **Every question is grounded in a real chunk.** Gold labels are `book | chapter | chunk_index` (the same key used to derive Qdrant point ids). The builder resolves every label against the chunk file and refuses to build if any label points at a chunk that does not exist. It caught one labelling mistake on its first run (`CHAPTER XVII` also matched `XVIII`).
- **Several gold chunks are allowed per question.** Chunks overlap by whole sentences, so one passage often lives in two neighbouring chunks. Both count.
- ***The Prince* questions are five matched pairs.** Each pair targets the same gold chunk twice: once in the book's own register ("Should a ruler keep his word when breaking it would be to his advantage?") and once the way a person actually talks to Asher ("I made a promise to my business partner, but things changed and now keeping it hurts me"). This isolates the effect of phrasing from everything else.
- Most other questions are phrased in plain style, because that is how users speak.

## 4. Method

`eval/offline_retrieval_eval.py`:

1. Embed each golden question as written (same embedding model as production).
2. Query Qdrant with the same collection and `domain` filter as `knowledge_service.search_domain`, but fetch the top 20 without the score floor (the "deep view").
3. Re-apply production settings (top 3, score at least 0.30) to get the "prod view": exactly what Asher would receive.
4. Score at three levels of strictness:
   - **chunk** - a gold chunk is retrieved (strict)
   - **chapter** - any chunk from a gold chapter is retrieved (forgives a too-narrow label)
   - **book** - any chunk from the right book is retrieved
5. Report Recall@k (k = 1, 3, 5, 10, 20), MRR@20, and the three prod-view hit rates. Results are broken out per book and per *Prince* style, plus which books fill the 3 slots on `life_strategy` questions. Every run is saved to `eval/results/`.

Routing is assumed correct here (each question is searched in its expected domain). Whether gpt-4o picks the right tool and writes a good query is the job of the online eval.

## 5. Data audit (found while building the golden set)

Before any score was computed, reading the chunks surfaced four data problems:

| # | Finding | Impact |
|---|---|---|
| D1 | **Broken chapter labels in *48 Laws*.** The body of Laws 1-27 (526 chunks) is labelled `Preface`. Chapters `Law 1:` to `Law 26:` hold one chunk each: the one-paragraph summary from the book's table-of-contents pages, which should have been excluded during ingestion. `Law 27:` holds the TOC summaries of Laws 28-48. | Chapter metadata for *48 Laws* is meaningless for Laws 1-27. The leftover TOC summaries are short, dense restatements of each law, which makes them likely to score high on power-related queries. |
| D2 | **`start_page` is the chapter's first page, not the chunk's.** Every chunk in a chapter carries the same page. | The source card in the UI shows the wrong page. No effect on retrieval. |
| D3 | ***48 Laws* quotes *The Prince* directly.** Greene uses Machiavelli as epigraphs. | Some "48 Laws beat The Prince" results are Greene quoting Machiavelli. Flagged in the golden set notes. |
| D4 | **Index/source drift.** 5 points of *The Prince* chapter XVII are stored in Qdrant under the old label `...Loved Than Feared OMING` (a drop-cap parsing bug, `C` + `OMING`). The notebook fix regenerated the chunk JSON, but those 5 points were never re-upserted. All other 2,089 points match the JSON exactly. | Found during Run 2 (see below). A correct retrieval was being scored as a miss. |

Checks that came back clean: all 2,094 point ids are unique, and there are no near-duplicate neighbouring chunks (overlap only shares sentences at the boundaries).

## 6. Runs

Three runs, each one fixing a flaw in the **measurement**, not in the RAG. The RAG itself was not touched.

| Run | File | What changed |
|---|---|---|
| 1 | `offline_baseline_20261123_175749.json` | First run, chunk-level scoring only. |
| 2 | `offline_baseline-chapter_20261123_180917.json` | Added chapter-level scoring. *48 Laws* `Preface` and `Law 27:` are excluded from chapter matching (D1), otherwise almost any hit would count. This run exposed D4: P01's top hit was in the right chapter but still scored as a miss. |
| 3 | `offline_baseline-aliased_20261123_182342.json` | Added an eval-side alias that maps the drifted Qdrant label back to the real chapter name (D4), keeping the raw indexed label in the results. **This is the official baseline.** |

The score floor was deliberately kept at 0.30 in all runs.

## 7. Results (official baseline, Run 3)

### Prod view - what Asher actually receives (top 3, score at least 0.30)

| | Gold chunk | Gold chapter | Right book |
|---|---|---|---|
| **Overall (50)** | **0.60** | **0.76** | **0.86** |
| The Prince (10) | 0.80 | 0.80 | 0.80 |
| The 48 Laws of Power (10) | 0.80 | 0.80 | 1.00 |
| **The Art of War (6)** | **0.00** | **0.17** | **0.33** |
| Mindfulness in Plain English (8) | 0.62 | 0.88 | 1.00 |
| Permission to Feel (8) | 0.50 | 0.75 | 0.88 |
| Ultralearning (8) | 0.62 | 1.00 | 1.00 |

### Ranking quality (deep view, top 20, no floor)

| | R@1 | R@3 | R@5 | R@10 | R@20 | MRR | Chapter R@1 | Chapter R@3 |
|---|---|---|---|---|---|---|---|---|
| **Overall** | 0.42 | 0.62 | 0.70 | 0.76 | 0.82 | 0.53 | 0.58 | 0.78 |
| The Prince | 0.60 | 0.80 | 0.80 | 0.80 | 0.90 | 0.67 | 0.60 | 0.80 |
| The 48 Laws of Power | 0.50 | 0.80 | 0.90 | 0.90 | 0.90 | 0.67 | 0.50 | 0.80 |
| The Art of War | 0.00 | 0.00 | 0.00 | 0.17 | 0.33 | 0.03 | 0.00 | 0.17 |
| Mindfulness | 0.50 | 0.62 | 0.75 | 0.88 | 1.00 | 0.59 | 0.62 | 0.88 |
| Permission to Feel | 0.50 | 0.62 | 0.75 | 0.88 | 0.88 | 0.61 | 0.88 | 0.88 |
| Ultralearning | 0.25 | 0.62 | 0.75 | 0.75 | 0.75 | 0.42 | 0.75 | 1.00 |

### *The Prince* - same gold passages, two phrasings

| Style | Gold chunk reaches Asher | R@1 | MRR |
|---|---|---|---|
| Book register (P01, P03, P05, P07, P09) | **5 / 5** | 1.00 | 1.00 |
| Plain modern phrasing (P02, P04, P06, P08, P10) | **3 / 5** | 0.20 | 0.35 |

The two plain-style misses both lost to *48 Laws*:
- **P02** "My team likes me, but nobody takes my deadlines seriously. Should I be nicer or stricter?" - gold (chapter XVII, loved vs feared) not in the top 20; top hit is *48 Laws* `Preface`.
- **P04** "I made a promise to my business partner... do I have to keep it?" - gold (chapter XVIII, keeping faith) at rank 13 with score 0.301; top hit is *48 Laws* `Preface`.

### Who fills Asher's 3 slots on `life_strategy` questions

| Questions about | Slots taken |
|---|---|
| The Prince (10 questions, 30 slots) | The Prince 15, 48 Laws 15 |
| The 48 Laws of Power (30 slots) | 48 Laws 30 |
| **The Art of War (18 slots)** | **48 Laws 16, Art of War 2** |

### Notable individual cases

- **E06** "I call myself an idiot every time I mess up." The gold chunk is ranked **1st**, but its score is **0.299**, just under the 0.30 floor, so Asher receives nothing. The floor was kept on purpose; I hope is that better chunking lifts passages like this above it.
- **A01** "How can I beat a competitor without getting into a direct fight?" The textbook answer (*Art of War* III, "supreme excellence consists in breaking the enemy's resistance without fighting") is not in the top 20. The top hit is *48 Laws* Law 14.
- **A03** "Should I show my competitors my real plans or keep them guessing?" *Art of War* I ("all warfare is based on deception") at rank 20; *48 Laws* Law 3 (conceal your intentions) wins. Arguably a fair answer, but the gold book loses.

## 8. Conclusions

1. **The retriever can find *The Prince*. Phrasing decides whether it does.** In the book's own register all five *Prince* passages come back at rank 1. Asked in everyday words, two of the same five passages lose to *48 Laws*, whose modern self-help prose sits closer to modern questions in embedding space.

2. **The live symptom most likely comes from the query step, not only the index.** In production the user never queries Qdrant directly: gpt-4o writes a modern-English query first. That turns every question into the plain-style case, where *48 Laws* wins. This is the leading hypothesis for "Asher never cites *The Prince*", and it is exactly what the online eval needs to test by logging gpt-4o's tool choice and query string.

3. ***The Art of War* is the real lost chunks, and the original complaint missed it.** 0 of 6 gold chunks reach Asher, and *48 Laws* takes 16 of 18 slots. With 51 chunks against 1,073 in the same filtered pool and no per-book balancing, *Art of War* rarely gets a slot.

4. **The non-strategy archives mostly work.** Ultralearning reaches the right chapter on 8 of 8 questions and Mindfulness on 7 of 8. Their weaker chunk-level numbers are mostly the golden set being stricter than necessary, not retrieval failures.

5. **The data pipeline needs a rebuild regardless of retrieval tuning.** Broken *48 Laws* chapter labels (D1), TOC summaries that should have been excluded (D1), chapter-level page numbers (D2) and index/source drift (D4) all come from ingestion. Re-chunking, re-embedding and re-indexing is required.

6. **The measurement needed fixing three times before it could be trusted.** The chunk-only score hid good retrievals behind narrow labels, and an index/source drift scored a correct rank-1 hit as a miss. Both were found because the per-question output was read line by line, not just the summary table.

## 9. Threats to validity

- **Small samples.** 5 questions per *Prince* style and 6 for *Art of War*: one question moves a rate by 17-20 points. Treat the per-book numbers as directions, not precise estimates.
- **Golden set written by one author, from the chunks.** Questions drafted while reading the gold passage tend to share its vocabulary, which flatters dense retrieval. The plain-style pairs partly correct for this.
- **One relevant passage per question.** Many questions have several valid answers elsewhere in the corpus (D3). A "miss" can still be a reasonable answer to the user.
- **Routing assumed perfect.** Each question was searched in its expected domain. Real failures where gpt-4o picks the wrong tool, or none, are not measured here.
- **English only.** Asher also speaks Spanish and French. Tool queries are written in English by design, so this matters for the online eval, not this one.

## 10. Next steps

- **V2 - Online eval:** run the 50 questions through the real tool loop and record the tool called (or none), gpt-4o's query string, and what came back. Tests conclusion 2 directly. Add a few no-tool questions (small talk) and some Spanish/French ones.
- **Re-ingest:** fix *48 Laws* chapter detection, exclude the TOC summary pages, store the real page per chunk, re-embed and re-index. Then remove `CHAPTER_ALIASES` from the eval.
- **Retrieval options to test against this baseline**, one at a time:
  - book diversity in the top 3 (fetch more candidates, cap the slots any single book can take)
  - hybrid search (dense + BM25 sparse vectors in Qdrant; needs a collection rebuild with named vectors)
  - a reranker over the top 20-30 candidates (adds latency to a spoken reply).

- Re-Chunk the  six books again  within a better chunking strategy + preserve the actual chapter titles.

