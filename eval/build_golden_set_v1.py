import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHUNKS = ROOT / "scryer_knowledge_chunks.json"
OUT_JSON = ROOT / "eval" / "golden_set.json"
OUT_REVIEW = ROOT / "eval" / "golden_set_review.md"

TOOL_BY_DOMAIN = {
    "mindfulness": "search_mindfulness_knowledge",
    "emotions": "search_emotion_knowledge",
    "life_strategy": "search_life_strategy_knowledge",
    "learning_strategies": "search_learning_knowledge",
}

PRINCE, LAWS, WAR = "The Prince", "The 48 Laws of Power", "The Art of War"
MIND, FEEL, ULTRA = "Mindfulness in Plain English", "Permission to Feel", "Ultralearning"

# (id, book, style, question, [(chapter_prefix, [chunk_index, ...])], [whole_chapter_prefix, ...], notes)
# style: "book" = uses the book's own vocabulary; "plain" = how a person actually talks to Asher.
# The Prince questions come in book/plain PAIRS with the same gold chunk, to isolate the register effect.
SPEC = [
    #  The Prince (5 pairs) 
    ("P01", PRINCE, "book", "Is it better for a leader to be loved or to be feared?",
     [("CHAPTER XVII:", [1])], [], "Greene quotes this passage in 48 Laws too - a 48 Laws hit is a fair answer but a Prince miss."),
    ("P02", PRINCE, "plain", "My team likes me, but nobody takes my deadlines seriously. Should I be nicer or stricter with them?",
     [("CHAPTER XVII:", [1])], [], "Pair of P01."),
    ("P03", PRINCE, "book", "Should a ruler keep his word when breaking it would be to his advantage?",
     [("CHAPTER XVIII:", [1])], [], "Fox and lion."),
    ("P04", PRINCE, "plain", "I made a promise to my business partner, but things changed and now keeping it hurts me. Do I have to keep it?",
     [("CHAPTER XVIII:", [1])], [], "Pair of P03."),
    ("P05", PRINCE, "book", "How much of our life is ruled by fortune, and how much by our own free will?",
     [("CHAPTER XXV:", [0, 4])], [], "Fortune as a flooding river."),
    ("P06", PRINCE, "plain", "I feel like luck decides everything in my life. Is there even any point in making plans?",
     [("CHAPTER XXV:", [0, 4])], [], "Pair of P05. Competes with Law 29 (plan to the end)."),
    ("P07", PRINCE, "book", "How can a prince protect himself from the flatterers in his court?",
     [("CHAPTER XXIII:", [0, 1])], [], ""),
    ("P08", PRINCE, "plain", "Everyone around me just tells me what I want to hear since I became the manager. How do I get honest advice?",
     [("CHAPTER XXIII:", [0, 1])], [], "Pair of P07."),
    ("P09", PRINCE, "book", "Should cruelties and injuries be inflicted all at once, while benefits are given little by little?",
     [("CHAPTER VIII:", [5, 6, 7])], [], ""),
    ("P10", PRINCE, "plain", "I have to make big unpopular cuts at work. Is it better to do them all at once or bit by bit?",
     [("CHAPTER VIII:", [5, 6, 7])], [], "Pair of P09."),

    #  The 48 Laws of Power 
    # Laws 1-27 body text is labelled chapter "Preface" in the corpus (chapter-detection bug),
    # and each "Law N:" chapter for N<=26 holds only the one-paragraph summary from the TOC pages.
    # "Law 27" holds the TOC summaries of Laws 28-48. Both summary and body chunks count as gold.
    ("L01", LAWS, "plain", "My boss gets cold with me whenever I shine in meetings. Should I hold back my talent?",
     [("Preface", [17]), ("Law 1:", [0])], [], "Law 1. Body is mislabelled 'Preface'."),
    ("L02", LAWS, "plain", "I talk way too much in negotiations and I think it weakens me. Should I say less?",
     [("Preface", [84, 85]), ("Law 4:", [0])], [], "Law 4."),
    ("L03", LAWS, "plain", "Should I hire my close friend or someone I used to compete against?",
     [("Preface", [30]), ("Law 2:", [0])], [], "Law 2."),
    ("L04", LAWS, "plain", "A rival tried to ruin me and failed. Should I forgive him or finish this for good?",
     [("Preface", [251, 252]), ("Law 15:", [0])], [], "Law 15. Adversarial: Asher's safety tone matters online."),
    ("L05", LAWS, "plain", "People at work have started taking me for granted. Would stepping back for a while help?",
     [("Law 16:", [0])], [], "Law 16. Only the summary chunk is located; body is somewhere in 'Preface'."),
    ("L06", LAWS, "plain", "I hesitate before every big decision. Is it better to act boldly even if I might be wrong?",
     [("Law 27:", [0])], ["Law 28:"], "Law 28. Any Law 28 chunk counts."),
    ("L07", LAWS, "plain", "How do I find someone's weak spot so I can get them to cooperate with me?",
     [("Law 27:", [1, 2])], ["Law 33:"], "Law 33. Manipulative - check Asher's tone online."),
    ("L08", LAWS, "plain", "Someone at work is spreading a rumor about me. How do I protect my reputation?",
     [("Law 5:", [0])], [], "Law 5."),
    ("L09", LAWS, "plain", "I just won a big promotion. How do I avoid ruining it by pushing too far?",
     [("Law 27:", [6])], ["Law 47:"], "Law 47."),
    ("L10", LAWS, "plain", "My colleagues seem jealous because everything I do goes well. What should I do?",
     [("Law 27:", [6])], ["Law 46:"], "Law 46."),

    #  The Art of War 
    ("A01", WAR, "plain", "How can I beat a competitor without getting into a direct fight with them?",
     [("Chapter III:", [0])], [], "Win without fighting."),
    ("A02", WAR, "plain", "Before a big negotiation, what do I need to know about myself and the other side?",
     [("Chapter III:", [2]), ("Chapter X:", [4])], [], "Know the enemy and know yourself."),
    ("A03", WAR, "plain", "Should I show my competitors my real plans or keep them guessing?",
     [("Chapter I:", [1, 2])], [], "Deception. Competes with Law 3 (conceal your intentions)."),
    ("A04", WAR, "plain", "My rival is much stronger than me overall. Where should I focus my effort against him?",
     [("Chapter VI:", [3, 4])], [], "Avoid the strong, strike the weak; like water."),
    ("A05", WAR, "plain", "My opponent has a really short temper. How can I use that?",
     [("Chapter I:", [2])], [], "Choleric temper, irritate him."),
    ("A06", WAR, "plain", "I'm backed into a corner with no way out. How should I fight?",
     [("Chapter XI:", [0, 1])], [], "Desperate ground."),

    #  Mindfulness in Plain English 
    ("M01", MIND, "plain", "I keep getting sleepy every time I meditate. What can I do?",
     [("Chapter 10:", [11, 12])], [], "Drowsiness."),
    ("M02", MIND, "plain", "My knees and back hurt when I sit to meditate. Should I stop?",
     [("Chapter 10:", [4, 5])], [], "Physical pain."),
    ("M03", MIND, "plain", "Meditation is so boring. How do I keep going?",
     [("Chapter 10:", [14, 15])], [], "Boredom."),
    ("M04", MIND, "book", "Is meditation just a way of going into a trance?",
     [("Chapter 2:", [3])], [], "Misconception 2."),
    ("M05", MIND, "plain", "My mind keeps wandering off when I try to focus on my breath.",
     [("Chapter 13:", [8])], [], ""),
    ("M06", MIND, "book", "What does mindfulness actually mean?",
     [("Chapter 13:", [2])], [], "Mirror-thought, nonjudgmental observation."),
    ("M07", MIND, "plain", "Why should I even bother meditating? I'm really busy.",
     [("Chapter 1:", [0])], [], ""),
    ("M08", MIND, "plain", "Does meditation really help with stress and worry in everyday life?",
     [("Chapter 1:", [15])], [], "Competes with Permission to Feel (different domain, so only routing can confuse them)."),

    #  Permission to Feel 
    ("E01", FEEL, "plain", "Most of the time I don't even know what I'm feeling.",
     [("Chapter 1:", [7]), ("Chapter 3:", [12])], [], ""),
    ("E02", FEEL, "plain", "I try to push my feelings down, but they keep exploding later.",
     [("Chapter 1:", [10])], [], "Suppression."),
    ("E03", FEEL, "plain", "Is there a simple way to check what mood I'm in?",
     [("Chapter 4:", [4, 5])], [], "Mood Meter."),
    ("E04", FEEL, "book", "What are the core skills of emotional intelligence?",
     [("Chapter 3:", [11, 12])], [], "RULER."),
    ("E05", FEEL, "plain", "I overreact when my partner criticizes me. How can I respond like my best self instead?",
     [("Chapter 8:", [11, 12])], [], "Meta-Moment."),
    ("E06", FEEL, "plain", "I call myself an idiot every time I mess up.",
     [("Chapter 8:", [20, 21])], [], "Positive self-talk."),
    ("E07", FEEL, "plain", "How do I deal with stress and burnout at my job?",
     [("Chapter 11:", [15])], [], ""),
    ("E08", FEEL, "plain", "How can I tell how my coworkers are feeling, and what the unwritten emotional rules at my workplace are?",
     [("Chapter 11:", [2])], [], ""),

    #  Ultralearning 
    ("U01", ULTRA, "plain", "Can I really teach myself something as hard as a university degree on my own?",
     [("Chapter I:", [1])], [], "MIT Challenge."),
    ("U02", ULTRA, "plain", "Before I start learning something new, how should I plan it?",
     [("Chapter IV:", [4])], [], "Metalearning map."),
    ("U03", ULTRA, "plain", "I keep researching study methods forever instead of actually studying.",
     [("Chapter IV:", [21])], [], "Research as procrastination."),
    ("U04", ULTRA, "plain", "Is re-reading my notes a good way to prepare for an exam?",
     [("Chapter VIII:", [2, 3])], [], "Testing effect."),
    ("U05", ULTRA, "plain", "How can I check whether I really understand a concept or just think I do?",
     [("Chapter XI:", [20, 21])], [], "Feynman technique."),
    ("U06", ULTRA, "plain", "I want to learn a new language. Should I start speaking right away?",
     [("Chapter VI:", [6])], [], "Directness."),
    ("U07", ULTRA, "plain", "I forget most of what I learn after a few weeks. How do I make it stick?",
     [("Chapter X:", [10, 20])], [], "Retention, leaky bucket, spacing."),
    ("U08", ULTRA, "plain", "How do I improve the weakest part of a skill I'm learning?",
     [("Chapter III:", [11])], ["Chapter VII:"], "Drill. Any Chapter VII chunk counts."),
]


def resolve_chapter(chapters: set[str], prefix: str) -> str:
    hits = [c for c in chapters if c.startswith(prefix)]
    if len(hits) != 1:
        raise SystemExit(f"chapter prefix {prefix!r} matched {hits}")
    return hits[0]


def main() -> None:
    chunks = json.loads(CHUNKS.read_text())
    by_key = {(c["book"], c["chapter"], c["chunk_index"]): c for c in chunks}
    chapters_by_book: dict[str, set[str]] = {}
    for c in chunks:
        chapters_by_book.setdefault(c["book"], set()).add(c["chapter"])

    golden, review = [], ["# Golden set review\n", "Gold passage = first 300 chars of the first gold chunk.\n"]
    for qid, book, style, question, chunk_refs, chapter_refs, notes in SPEC:
        domain = next(c["domain"] for c in chunks if c["book"] == book)
        chapters = chapters_by_book[book]
        relevant = []
        for prefix, idxs in chunk_refs:
            chapter = resolve_chapter(chapters, prefix)
            for i in idxs:
                if (book, chapter, i) not in by_key:
                    raise SystemExit(f"{qid}: missing chunk {book} | {chapter} | {i}")
                relevant.append({"book": book, "chapter": chapter, "chunk_index": i})
        golden.append({
            "id": qid,
            "question": question,
            "style": style,
            "domain": domain,
            "expected_tool": TOOL_BY_DOMAIN[domain],
            "book": book,
            "relevant_chunks": relevant,
            "relevant_chapters": [resolve_chapter(chapters, p) for p in chapter_refs],
            "notes": notes,
        })
        first = relevant[0]
        text = " ".join(by_key[(first["book"], first["chapter"], first["chunk_index"])]["text"].split())
        review.append(
            f"\n## {qid} · {book} · {style}\n\n**Q:** {question}\n\n"
            f"**Gold:** {first['chapter']} · chunk {first['chunk_index']}"
            f"{' (+%d more)' % (len(relevant) - 1) if len(relevant) > 1 else ''}"
            f"{' · any chunk of ' + ', '.join(chapter_refs) if chapter_refs else ''}\n\n"
            f"> {text[:300]}...\n" + (f"\n_Note: {notes}_\n" if notes else "")
        )

    OUT_JSON.write_text(json.dumps(golden, indent=2, ensure_ascii=False) + "\n")
    OUT_REVIEW.write_text("".join(review))
    counts: dict[str, int] = {}
    for g in golden:
        counts[g["book"]] = counts.get(g["book"], 0) + 1
    print(f"{len(golden)} questions -> {OUT_JSON.relative_to(ROOT)}")
    for b, n in counts.items():
        print(f"  {n:2d}  {b}")


if __name__ == "__main__":
    main()
