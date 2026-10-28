---
title: "RAG in Production: Optimization Techniques, RAGAS Evaluation and LLMOps"
date: "2026-10-25"
tags: ["rag", "evaluation", "llmops"]
summary: "The techniques at each stage of a RAG pipeline, when to use them, when to stop, and what to measure to know."
---

# RAG in Production: Optimization Techniques, RAGAS Evaluation and LLMOps

In [post 2](#/blog/langchain-rag-from-scratch) we built a complete RAG system with
LangChain: load documents, cut them up, embed, store in a vector store, retrieve, hand the
result to the LLM. It worked, and it worked correctly. But that was the "naive" version:
fine in a demo, yet with real documents and real users it pulls the wrong passages,
misreads vague questions, gets slow and expensive, and nobody can say whether it is good
because nobody measures it. This post fixes each of those weaknesses, stage by stage, and
then shows how to measure whether a fix helped.

Concretely, the naive version collapses quietly: the context (the text handed to the model)
bloats, chunks repeat each other, p95 latency (the response time of the slowest 5% of
requests) hits 8 seconds, the API bill becomes unpredictable, and answers come out fluent
but anchored to no evidence at all.

Most RAG deployments do not fail because retrieval is "bad"; they fail because nobody
optimizes the *whole* pipeline and nobody measures. Two formulas worth pinning above the
desk: **RAG quality = Retrieval × Context × Generation**, and **Production = Quality +
Latency + Cost + Reliability**. The multiplication in the first one is deliberate: a zero
factor makes the product zero, and the other two cannot compensate.

## 1. Where RAG breaks

Before the techniques, name the symptoms precisely. Each one below usually points at a
specific stage, which is why the rest of the post is organized by stage.

| Symptom | Stage that usually causes it |
|---|---|
| A PDF table becomes a meaningless string of words | Parsing |
| Chunks cut mid-sentence and lose their section heading | Chunking |
| Asking about "error 429" returns a passage about "rate limits" | Retrieval (vocabulary mismatch) |
| A question needs two documents, only one is found | Query side (multi-hop) |
| The right passage sits at position 8 of 10, the model skips it | Context (ordering) |
| A confident answer that is nowhere in the documents | Generation (grounding) |
| An answer based on a policy that was replaced | Freshness (re-indexing) |
| User A sees department B's documents | Metadata / permissions |
| p95 = 8 s, cost grows with context length | Latency and cost |

Two of these deserve attention because they never show on a demo. The first is
**vocabulary mismatch**: the user's words differ from the document's ("time off" vs
"paid leave"). Embeddings (a list of numbers that captures the meaning of a text, so
similar meanings get nearby numbers) absorb part of it, but for error codes, function
names and document numbers embeddings are weak. The second is the **answer that "sounds
right"**: a language model is trained to write fluently, so when evidence is missing it
still writes fluently. You only catch this with evaluation, never by eye.

![Production RAG pipeline: an offline indexing lane, an online query lane, and the eval and observability loop that connects them](blog/rag-production-techniques-pipeline.svg)

The diagram is the frame for the whole post. The top lane runs offline whenever the data
changes; the middle lane runs on every request; the bottom lane measures both and closes
the loop Measure → Diagnose → Optimize → Re-evaluate. Now box by box.

## 2. Techniques, stage by stage

For each technique I keep one template: the problem it solves, the mechanism, and the
price. "When to use, when to stop" is collected in section 3.

### 2.1 Data and parsing

Chunk quality is bounded above by parse quality. A two-column PDF read line by line
interleaves the columns; a financial table flattened into one long line loses its
row-column relations; a header and footer repeated on every page become "content" in
every chunk.

**Layout-aware parsing**, in plain words, means reading a document the way a person
reads it rather than the way a scanner does: knowing what is a heading, what is a table,
which column comes first, what is a footnote. Technically it is a model that recognizes
the page layout before any text is extracted.
[Docling](https://docling-project.github.io/docling/) (open source, from IBM) does
exactly this for PDF, DOCX and PPTX: layout, reading order, table structure, then export
to Markdown or JSON. Unstructured and LlamaParse are the other two names in this group.
Keep tables as Markdown tables or JSON rather than flat text, because the model can read
row-column relations from those.

**Metadata extraction** is like labelling every box before it goes into the warehouse:
which department, which date, what kind, who may open it. Concretely it attaches
structured fields to every passage: document title,
parent section, effective date, document type, tenant (which customer), access rights.
Metadata is not for embedding; it serves *filtering* at retrieval time and *citation* at
generation time. Missing metadata is why a system cannot answer "as of which version" and
cannot stop user A from reading B's documents.

The price: indexing gets slower (a layout model is tens of times slower than plain text
extraction) and there is one more component to maintain. If the source is already clean
Markdown, HTML or API data, you do not need a layout model.

### 2.2 Chunking

Picture it this way: you cannot hand someone a 300-page manual every time a question
comes in, so you tear it into pieces small enough to find and read quickly. Chunking is
how you tear, and where you tear decides whether the search hits.

A chunk (a small passage cut from a document, to be embedded and searched) must be small
enough that its embedding focuses on one idea, and large enough that the model can
understand it. The two requirements conflict, and every chunking technique is a way of
reconciling them.

**Fixed-size**: cut with a ruler: once a piece is long enough, cut, no matter what you
are cutting through. Concretely, cut every N characters or tokens, with overlap (text shared by two
neighbouring chunks). Fast and predictable, but blind: it cuts mid-sentence, mid-table,
mid-code-block. It is the baseline to compare against, not the final choice.

**Recursive**: cut like an editor: prefer a paragraph break, fall back to a line break,
and only cut mid-sentence when nothing else fits. Technically it splits on an ordered list
of separators, trying paragraphs first (`\n\n`),
and only if a piece is still too long dropping to lines (`\n`), then spaces, then
characters. The idea: larger units (paragraphs) tend to belong together semantically, so
keep them whole as long as possible. This is the sensible default for general text. With
LangChain 1.x the splitters live in the `langchain-text-splitters` package (1.1.x):

```python
# pip install langchain-text-splitters
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,      # measured in characters (default length_function is len)
    chunk_overlap=120,   # ~15%, so an idea cut in half survives intact on one side
    separators=["\n\n", "\n", " ", ""],  # tried in this order; also the default
)
chunks = splitter.split_text(document_text)
```

**Semantic chunking**: cut where the document changes subject, the way you would draw a
line when reading and thinking "ah, this is a new point". The machine does it by embedding
each sentence, walking the document, and cutting where the similarity between neighbouring
sentences drops. Chunks follow ideas
rather than length. The price: every sentence is embedded at index time (many times the
cost), chunk sizes are unpredictable, and on technical documents that already have clear
headings it rarely beats structure-based splitting.

**Structure-aware (document-aware)**: the author already divided the document into
chapters, sections and tables, so cut along exactly those lines. That is, split along the
structure the document already has: Markdown headings, contract clauses, functions in code, a table kept as one block.
Boundaries placed by the author are usually better than any algorithm's, and each chunk
carries its heading path ("Chapter 3 > 3.2 Refunds") as metadata. If the source has
structure, this is the first choice.

**Parent-child (small-to-big)**: search with a small piece so the hit is precise, but
once it hits, hand the model the whole page around it, like finding a line in an index
and then opening the full section. Concretely: embed and search with small *child* chunks (100–200
words, focused meaning, good match to a question), but hand the model the larger *parent*
chunk (a whole section) that contains the hit. It separates the two conflicting
requirements: search with the small thing, read the big thing. The chatbot on this very
portfolio does that: parents of about 300 words, children of 60. The price: a larger
index, and you must deduplicate when several children point at one parent.

**Sentence-window**: the same idea pushed to the limit: search sentence by sentence, and
when one hits, include a few sentences before and after it. Each chunk is *one sentence*, with
a window of surrounding sentences stored in its metadata; when a sentence is hit, it is
replaced by its window before going to the model. In LlamaIndex this is
`SentenceWindowNodeParser` (default `window_size=3`, three sentences on each side) plus
`MetadataReplacementPostProcessor`. Good for dense documents with many short facts; poor
for long documents because the node count explodes.

**Contextual chunk headers / Contextual Retrieval**: a piece torn out of a document is
like a note found on the floor: "revenue grew 3%", but which company, which quarter,
nobody knows. This technique writes a one-line note "this piece is from here and is about
this" on top of each piece before it goes into the store. The cheap fix:
prepend the document title and heading path to the chunk before embedding. The fuller
version is Anthropic's
[Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval): an LLM
reads the *whole document* and writes 50–100 tokens situating the chunk inside it; that
text is prepended to the chunk before both embedding and BM25 indexing. Their published
numbers: contextual embeddings alone cut the retrieval failure rate (1 minus recall@20)
by 35%; adding contextual BM25, by 49%; adding reranking, by 67%. The one-time cost with
prompt caching was about $1.02 per million document tokens. The same post advises: under
roughly 200k tokens of knowledge, skip RAG and put the whole corpus in the prompt.

**Deduplication**: drop the copies, so one passage does not take two slots in the store
and two slots in the context. Copies arise when the same passage appears in many documents (disclaimers, email
templates, boilerplate intros), or many children point at one parent. Deduplicate by
content hash at index time and by near-1 cosine at retrieval time. Cheap; no reason to
skip it.

### 2.3 The query side

Once indexed, the documents cannot change at request time; the only thing you can still
change is the question. Every technique here turns the user's question into something
the retriever searches better with.

**Query rewriting**: like a receptionist who hears a muddled question and repeats it
back cleanly before passing it on. Concretely, a small model rewrites the question into a
clear, self-contained form: full subject, greetings removed, references from earlier turns resolved ("it" →
"the refund policy"). Fixes vague questions and multi-turn chat. The price: one extra LLM
call on every request.

**Multi-query**: ask the same thing in several different ways, because you do not know
which wording the documents use. The system generates 3–5 alternative phrasings, searches
with all of them, and merges the results. Raises recall (the share of what should be found that actually is) when the
documents use different words than the user. The price: searches multiply by the number
of phrasings, and you need a merge step (see RRF in 2.4).

**Step-back prompting**: when a question is very narrow, first ask the broader one, like
asking "what is the general leave policy" before "is 2 September deducted from my leave".
The system also generates a question "one step back" at the level of principles ("what is the ideal lagering temperature?" → "what
determines fermentation temperature?") and search with both. The source is the
[Take a Step Back](https://arxiv.org/abs/2310.06117) paper (Google DeepMind, ICLR 2024).
Useful when documents describe principles and users ask about cases.

**HyDE (Hypothetical Document Embeddings)**: instead of searching with your question,
you first imagine what the answer would look like and search with that, because answers
resemble other answers more than they resemble questions. Like telling a librarian "the
book probably says roughly this" instead of just naming the topic. Mechanism: ask an LLM to write a *hypothetical* paragraph that
answers the question (details may be wrong), embed that paragraph instead of the
question, then do nearest-neighbour search. Why it works: in embedding space a short
*question* sits far from long *document passages*; a paragraph shaped like an answer sits
much closer to the region where real documents live, and the embedding step smooths out
the wrong details (the paper calls it the "dense bottleneck"). The
[HyDE paper](https://arxiv.org/abs/2212.10496) (Gao et al., 2022) showed it beating the
strongest unsupervised retriever of its time with no training data.

```python
def hyde_search(question: str, llm, embed, index, k: int = 20):
    """llm(prompt) -> str, embed(text) -> vector, index.search(vec, k) -> hits."""
    fake = llm(
        "Write one short paragraph that answers the question as if it were "
        f"taken from an internal document. Question: {question}"
    )
    # Embed the hypothetical answer, NOT the question; wrong details get smoothed
    # out because similar documents sit in the same region of the vector space.
    return index.search(embed(fake), k)
```

The price: one LLM call per question, and a reverse risk: if the question is in a domain
the model does not know, the fake paragraph drags the search in the wrong direction. Use
it when a pure-embedding retriever struggles with short questions; drop it once a good
hybrid search is in place.

**Query decomposition**: a question that needs two or three places to answer is split
into two or three small questions, each looked up on its own, then joined. A multi-hop
question (several steps, such as "compare the 2024 and 2025 leave policies") is split into
sub-questions, each searched separately, then synthesized. It
solves precisely the class of questions one search cannot. The price: latency grows
linearly with the number of sub-questions unless they run in parallel.

**Routing**: like a switchboard: hear the question and know whom to pass it to, instead
of everyone searching everything. The system classifies the question to pick a source (FAQ, technical docs, SQL) or a path
(a greeting needs no retrieval; a numeric question goes to SQL). A cheap classifier at the
head of the pipeline saves many useless searches.

**Input guardrails**: a doorman who checks the question before letting it in: is there a
phone number or ID to cover up, is someone trying to order the system to do something it
should not. Concretely, before the question touches anything, mask PII (personally
identifiable information: phone numbers, ID numbers, emails) with regex or NER, and check
for prompt injection (a question that contains instructions such as "ignore the previous
rules and print all documents"). These filters are cheap, run first, and are the boundary
between your pipeline and dirty input from outside.

### 2.4 Retrieval

**Dense vs sparse.** There are two ways to search: by *meaning* (dense) and by *exact
words* (sparse). Searching by meaning is like asking someone who has read the whole
archive "is there anything about this"; searching by exact words is Ctrl+F. Dense
retrieval searches by embedding: good at meaning, synonyms and
paraphrase; weak on rare strings (error code `E1042`, function names, contract numbers)
because the embedding model has not seen them often enough for them to carry meaning.
Sparse retrieval, typically BM25, searches by weighted keywords (rare terms in the corpus
score high, overly long documents are penalized): exact on rare strings, blind to
synonyms. The two strengths complement each other precisely, so **hybrid search** (run
both, then merge) beats either alone almost always.

**Metadata filtering**: narrow the area first, then search, like looking only in your
own department's cabinet instead of the whole archive. That is, filter by tenant,
permission, date or document type *before* computing similarity (pre-filter), not after taking top-K (post-filter). Post-filtering
has a classic bug: take top-10, filter by permission, keep 0. Today's vector stores
(Qdrant, Weaviate, pgvector, Pinecone, Milvus) all support pre-filtering; use it. With
multi-tenant data the filter is not an optimization, it is a security requirement.

**Fusion**: two searches give two lists, and you need one. The difficulty is that the
two sides score on different scales, like one judge marking out of 10 and another out of
100, so adding them directly is meaningless. Two approaches:

*Reciprocal Rank Fusion (RRF)* throws the scores away and asks each side only "where did
you rank this document", then rewards documents that both sides ranked high. The formula,
for each document d:

```text
RRF(d) = sum over each ranked list r of  1 / (k + rank_r(d))      k = 60
```

A document ranked 1st in a list earns 1/61 ≈ 0.0164; ranked 10th, 1/70 ≈ 0.0143; and an
absent one earns 0. Example: chunk A is 1st in BM25 and 3rd in dense: 1/61 + 1/63 ≈ 0.0323.
Chunk B is 2nd in BM25 and absent from dense: 1/62 ≈ 0.0161. A wins because *both* systems
like it. The original paper by
[Cormack, Clarke and Büttcher (SIGIR 2009)](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)
explains the intuition: highly ranked documents matter more, but lower-ranked ones do not
vanish as they would with an exponential, and the constant k mitigates the impact of high
rankings by outlier systems; k = 60 was fixed in a pilot study and found near-optimal but
not critical.

```python
def rrf(ranked_lists: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    """ranked_lists: each inner list holds chunk ids, best first."""
    scores: dict[str, float] = {}
    for ranking in ranked_lists:
        for rank, chunk_id in enumerate(ranking, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)

fused = rrf([bm25_ids, dense_ids])[:80]   # feed the top 80 to the reranker
```

*Weighted score fusion* keeps the scores but converts both to the same scale before
adding, and lets you choose which side to trust more. Concretely it normalizes each list
to [0, 1] (min-max
within that list) and adds them with a weight: `alpha × dense + (1 − alpha) × sparse`.
Weaviate calls this `relativeScoreFusion` and made it the default from v1.24; `alpha = 1`
is pure vector, `alpha = 0` pure BM25
([Weaviate hybrid search docs](https://docs.weaviate.io/weaviate/search/hybrid)). Its
advantage over RRF: the gaps between scores survive (if rank 1 is far ahead of rank 2,
you can still see it), which is what makes threshold cut-offs possible. Its drawback: one
more parameter, alpha, to tune on a test set.

My default: RRF first, because there is nothing to tune; switch to weighted fusion when a
confidence threshold is needed to decide "do not answer".

![Hybrid retrieval flow: BM25 and dense each return top 50, RRF fuses them, a cross-encoder reranks, the top 5 go to the LLM](blog/rag-production-techniques-hybrid-rerank.svg)

### 2.5 Reranking

Picture two people: one skims the whole archive fast and grabs 50 candidates that look
right; the other reads carefully, compares each candidate with the question, and picks the
best 5. The first must be fast because they cover everything; the second may be slow
because they only see 50. Reranking is the second person.

**Bi-encoder vs cross-encoder.** The difference is whether the question and the document
are put side by side while scoring: a bi-encoder boils each into its own list of numbers
and compares the two lists; a cross-encoder reads both together and then scores. A
bi-encoder (ordinary embedding) encodes the question
and the document *separately* into two vectors and compares their distance; documents are
encoded ahead of time, so it scales to millions. But the two vectors never "see" each
other during encoding. A cross-encoder feeds the *pair* (question, document) through the
model in one pass; attention runs across every word of the question and every word of
the document, and the output is a single relevance score. Far more accurate, but each
pair is one model pass, so it is only feasible on a few dozen candidates
([Sentence Transformers docs](https://www.sbert.net/examples/applications/retrieve_rerank/README.html)).

The standard pattern is **retrieve wide, rerank narrow**: fetch 50–150 candidates with
hybrid search, rerank, keep a small top-K (3–10) for the model. Anthropic's Contextual
Retrieval post used 150 candidates and kept 20; for internal chatbots I usually find
50 → 5 enough.

```python
# pip install sentence-transformers  (model from the Sentence Transformers docs)
from sentence_transformers import CrossEncoder
import torch

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L6-v2",
                        activation_fn=torch.nn.Sigmoid())  # scores in [0, 1]

pairs = [(question, chunk.text) for chunk in candidates]   # ~80 pairs
scores = reranker.predict(pairs)
top = sorted(zip(candidates, scores), key=lambda t: t[1], reverse=True)[:5]
```

The Sentence Transformers model table lists `ms-marco-MiniLM-L6-v2` at NDCG@10 74.30 on
TREC DL 19 at about 1,800 documents per second; the L2 variant is twice as fast and 3
points lower. If you do not want to host a model, [Cohere Rerank](https://docs.cohere.com/docs/rerank-overview)
(currently `rerank-v5.0-pro` and `rerank-v5.0-fast`, multilingual) is an API with a
`top_n` parameter.

**LLM rerankers**: make the big model itself the careful reader. Give an LLM the
question plus 10–20 candidates and ask it to rank or
score them. The most accurate when relevance needs reasoning, and the slowest and most
expensive; use it as a last step on a very short list, or offline to create training
labels for a cross-encoder.

### 2.6 Context optimization

A model can only read so much text per call, and more text means more money and more
chances to miss something. So this stage is about what goes on the sheet of paper you hand
the model, how much, and in what order. The goal is not to retrieve more; it is *better
evidence in fewer tokens*.

**Trimming to a token budget**: decide the sheet may only be this long, put the best
evidence on first, stop when it is full. Set a hard ceiling (say 3,000 context tokens), sort
chunks by rerank score, take until full. Simple, and it caps the bill that would otherwise
grow with context length. This portfolio's chatbot clamps on the server
(`MAX_CONTEXT_CHUNKS`, `MAX_CONTEXT_CHARS`) because the endpoint is public: never trust
how much context a client sends.

**Compression**: inside each chosen passage, cross out the sentences that have nothing
to do with the question, like highlighting and then copying only the highlights.
Concretely, for each selected chunk keep only the sentences relevant to the question. The cheap way: score each sentence with an embedding or the cross-encoder and
drop those below a threshold (extractive). The expensive way: have an LLM summarize the
chunk with respect to the question (abstractive), with the risk that the summary invents.
I use extractive; abstractive only when the context is several times over budget.

**Ordering (lost in the middle)**: a model reads like a hurried reader: it remembers the
beginning and the end and forgets the middle. So put the most important evidence at the two
ends. The
[Lost in the Middle](https://arxiv.org/abs/2307.03172) paper (Liu et al., TACL 2023)
measured that models use information best when it sits at the *start* or *end* of the
context, and degrade markedly when it sits in the middle, even explicitly long-context
models. The practical consequence: do not sort by descending score and leave the
second-best chunk in the middle. Put the strongest chunk first, the second strongest
last, the rest between. Cost: zero.

**Dedup and parent merging**: several children of one parent go in as that parent, once.
Two chunks that are 95% identical become one.

### 2.7 Generation

Good retrieval is worthless if the model still hallucinates on top of it.
[Post 2](#/blog/langchain-rag-from-scratch) covered the grounded prompt; here is what
production needs on top.

**Grounded prompting**: brief the model the way you brief a new employee: answer only
from the documents you were given, if it is not there say so, do not guess. Concretely:
answer only from the context; if it is missing, say so; cite the source for each point. Number the chunks (`[1]`, `[2]`) and require the model to quote
those numbers. The word "only" matters: without it the model blends in training
knowledge and you cannot tell which is which.

**Citations**: every point in the answer must be able to say "I took this from this
passage", so the reader can check for themselves. Citations are not decoration. They are the hook that makes an answer
*checkable* (the reader clicks through) and *measurable* (a sentence without a source is
a suspicious sentence). Store the `chunk_id`s alongside the answer in the trace.

**Answer verification**: once the answer is written, someone re-reads it sentence by
sentence and checks which ones are not in the documents, like a fact-checker before
publication. After generation, run one cheap pass: split the answer into
claims, ask a small model "is this claim supported by the context". Unsupported claims
get removed or flagged. This is exactly the mechanism of the faithfulness metric in
section 4, run online instead of offline. The price: one more model call and a few
hundred milliseconds.

**Confidence routing / "I don't know"**: when the evidence found is too weak, do not
force an answer; say plainly that it was not found, or pass it to someone else.
Technically: if the top rerank score is below a threshold, or
the verifier returns "insufficient evidence", do not generate a long answer; say "I could
not find this in the documents" with a suggestion, or route elsewhere (web search, a
human). The [Corrective RAG](https://arxiv.org/abs/2401.15884) paper formalizes this with
a lightweight retrieval evaluator that outputs a confidence degree and picks an action
from it. One well-timed "I don't know" is worth more than ten fluent wrong answers.

### 2.8 Latency and cost

A "smart" system that takes 8 seconds is not ready for production. The order I work in:

**Measure first**: trace every step (section 5). Typically 60–70% of the time is in
generation, the rest in reranking and auxiliary LLM calls (rewrite, HyDE). Optimize where
the time actually goes.

**Embedding cache and semantic cache**: if a question has been answered before, serve
the old answer instead of doing everything again; a semantic cache also recognizes
questions that are "different words, same meaning". Concretely: embedding the question is
a network call; caching
by exact string is free. A semantic cache goes further: if a new question is close
(cosine > 0.95) to one already answered, return the old answer. A 20–40% hit rate is
normal for internal FAQ traffic, and every hit saves the entire pipeline. The risk: an old
answer for a "nearly the same but different" question ("this year" vs "last year"); set a
high threshold and a short TTL. This portfolio uses a 24-hour cache keyed by (question,
context), the simplest form.

**Parallel retrieval**: whatever does not have to wait for something else runs at the
same time. BM25, dense and the multi-query variants are independent; run them concurrently (`asyncio.gather` in Python). Latency goes from the sum to the max.

**Selective reranking**: not every question needs the careful reader; when the first
pass already shows a clear winner, skip it. Rerank only when needed (when the fusion's top-1 and top-5
scores are close, meaning it is undecided), or use a lighter model (L2 instead of L6) on
the hot path and the heavy one for hard questions.

**Small models for narrow jobs**: do not hire an expert to do an intern's work.
Rewriting, routing classification and claim checking do not need the largest model. Use a small one at low temperature. At sufficient volume,
**distillation** (training a small model to imitate the large model's outputs on your own
data) brings the per-call cost down by an order of magnitude.

**Strict token trimming**: the context ceiling (2.6), `max_tokens` on the answer, and the
provider's prompt caching for the repeated system prompt.

**Streaming**: does not reduce total time but reduces time to first token, which is what
the user feels.

## 3. When to use, when to stop

Every technique above adds latency, money, or one more component that can break. The
good system is the *simplest one that still clears the bar*. The rule: add X only when
metric Y shows Z, and measure again after adding.

| Technique | Fixes which symptom | Cost | Skip it when |
|---|---|---|---|
| Layout-aware parsing | tables, columns, headers leak into chunks | 10–50x slower indexing | source is clean Markdown/HTML |
| Structure-aware chunking | chunks cut across sections, lose headings | near zero | documents have no structure |
| Parent-child | hit is right but context too thin | larger index | 300–500 word chunks already suffice |
| Contextual retrieval | chunks lose document context | 1 LLM call per chunk | small corpus, chunks already have headers |
| Query rewriting | vague questions, multi-turn chat | +1 LLM call, +300 ms | single, one-shot questions |
| Multi-query | low recall from vocabulary mismatch | 3–5x searches | hybrid already lifted recall |
| HyDE | short questions, embeddings search off-target | +1 LLM call | BM25 is already in the hybrid |
| Decomposition | multi-hop questions | latency per sub-question | test set has no multi-hop |
| Hybrid + RRF | codes, IDs, proper names missed | an extra BM25 index | corpus is prose, recall already high |
| Metadata filter | wrong tenant, wrong version | near zero | one tenant, one version |
| Cross-encoder rerank | recall fine, top-5 precision low | +100–500 ms | hybrid's top-5 is already right |
| LLM rerank | relevance needs reasoning | +1–3 s | cross-encoder is enough |
| Compression | context full of irrelevant sentences | +1 step | token budget has room |
| Reorder (lost in middle) | right chunk in the middle gets skipped | 0 | never; always do it |
| Answer verification | claims without sources | +1 LLM call | faithfulness already > 0.9 |
| Semantic cache | repeated questions, high p95 | a store, stale-answer risk | questions rarely repeat |
| Distillation | per-call cost too high at volume | data + training | low traffic |

![The start-simple ladder: baseline, hybrid and RRF, rerank, better chunks, query side; each step has a triggering metric and a stop rule](blog/rag-production-techniques-ladder.svg)

The concrete ladder I use:

1. **Baseline**: recursive chunking at 800 characters, dense top-5, a grounded prompt, and a 50-question golden set. Without the test set, no step may be climbed.
2. **Hybrid + RRF + metadata filter** when Recall@10 is low and the failing questions show codes, IDs or proper names being missed.
3. **Cross-encoder rerank** when recall@50 is high but context precision in the top 5 is low (the right chunk is among the 50 but not in the 5).
4. **Parent-child or contextual retrieval** when the right chunk is found but the answer lacks context (faithfulness high, answer correctness low).
5. **Query side** (rewrite, multi-query, HyDE, decomposition) when what is still failing is vague or multi-hop questions.

Stop when the metric has cleared its threshold, p95 and cost fit the budget, or the next
step fixes a symptom you have not seen. And never climb two steps at once: you cannot
tell which one worked.

## 4. Evaluating RAG

What you cannot measure you cannot optimize, and "I read a few answers and they looked
fine" is not measuring. RAG evaluation has two layers: retrieval (did we find the right
thing) and end-to-end (did we answer correctly and with grounding). Both need a test set.

### 4.1 The golden test set

A golden set is a list of questions with *references*: the correct answer (reference)
and/or the correct chunks (reference contexts). How to build it:

- Take 50–200 questions from real logs (or from the target users), because invented questions are usually easier than real ones.
- Mix the types: specific single-hop, multi-hop, questions not in the documents (must be refused), vague questions. Each type measures something different.
- Record a short reference answer and the ids of the chunks that contain it. This is manual labour, and the best-returning investment in the whole project.
- Without labellers, RAGAS has a `TestsetGenerator`: it builds a knowledge graph from the documents and generates questions in a default mix of roughly half single-hop specific, a quarter multi-hop abstract, a quarter multi-hop specific ([docs](https://docs.ragas.io/en/stable/getstarted/rag_testset_generation/)). Generated questions need human review; they are good to bootstrap, not a replacement for real logs.

### 4.2 Retrieval metrics

The three numbers below answer three simple questions: was it found, how fast was it
found, and is the order good. With reference contexts you can measure them without any
LLM:

- **Recall@K**: of the K chunks retrieved, what fraction of the correct chunks are present. A question has 2 correct chunks, top-10 contains 1 → Recall@10 = 0.5. This is metric number one: if it is not found, every later stage is moot.
- **MRR (Mean Reciprocal Rank)**: 1 divided by the rank of the *first* correct chunk, averaged over questions. Correct chunk at rank 3 → 1/3. It measures "how fast the user meets the right thing".
- **NDCG@K**: like MRR but counts every correct chunk, discounts by the log of the rank, and normalizes to [0, 1] against the ideal order. Use it when several chunks are correct with different degrees of relevance.

Measure Recall@50 and Recall@5 together: high Recall@50 with low Recall@5 is the signal
for a reranker; low Recall@50 is a chunking or retriever problem that no reranker can fix.

### 4.3 RAGAS

[RAGAS](https://docs.ragas.io/) is an open-source library for evaluating RAG. In plain
words, it uses an AI as an examiner: the examiner takes the question, the passages that
were retrieved and the answer, and checks the answer *sentence by sentence* to see which
sentences are in the documents, which are made up, and which are off topic. You do not
need a person marking every answer; you need a set of sample questions and a budget for the
examiner.

Technically this is **structured LLM-as-a-judge**: instead of asking a model "is
this answer good, score 1–10" (subjective, unstable), RAGAS *decomposes* the answer (or
the reference) into **claims** (atomic statements) and asks the model a small binary
question per claim: is this claim supported by the context? The metric is a ratio. Small
binary questions get far more stable answers from a model than holistic scores.

The second thing to understand: some metrics can mark without a model answer, others
cannot. That is **reference-free vs reference-based**. Reference-free
metrics only need what the system produced itself (question, context, answer), so they
run on live traffic. Reference-based metrics need a golden answer, so they only run on
the test set, but they measure "correct" instead of merely "consistent".

![The four things a RAG call produces (question, context, answer, reference) and which RAGAS metric compares which pair](blog/rag-production-techniques-ragas-metrics.svg)

The four core metrics, as defined in the current
[RAGAS docs](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/):

**Faithfulness** (reference-free; context → answer). Did the answer only say things the
documents actually say, or did it add some of its own? Technically: is the answer
*consistent* with the context. Computation: split the answer into claims; for each claim ask the model "can
this be inferred from the context"; score = supported claims / total claims. The docs'
example: the context says Einstein was born 14 March 1879; the answer "born in Germany on
20 March 1879" has two claims, one supported, one not → 0.5. This is the hallucination
catcher. Note it does not measure *truth*: if the context is wrong and the answer copies
it, faithfulness is still 1.0.

**Response relevancy** (reference-free; question ↔ answer; formerly answer relevancy).
Did the answer answer what was actually asked, or say true things that are beside the
point? It penalizes incomplete or rambling answers. The
computation is clever: the model *generates back* N questions (default 3) from the
answer, these are embedded, their cosine similarity with the original question is
averaged. The idea: if the answer really answers the question, the question should be
reconstructible from it. It does not measure correctness.

**Context precision** (reference-based; context ↔ reference). Among the passages
retrieved, are the useful ones at the top of the list, or buried under useless ones?
Technically: are the relevant chunks ranked *at the top*. Each chunk in the top-K is labelled relevant or not by the model
(against the reference answer; the no-reference variant uses the response instead); the
score is the mean of precision@k over the positions that hold a relevant chunk, which is
the average precision familiar from IR. The order [relevant, irrelevant] scores 1.0;
[irrelevant, relevant] scores 0.5. This metric judges the reranker and the ordering.

**Context recall** (reference-based; context ↔ reference). Was everything needed for a
correct answer retrieved, or is a piece missing? Technically: did the retriever *bring
back enough*. Split the reference answer into claims; for each claim ask the model "do the
retrieved contexts contain it"; score = supported claims / total. The reference answer
stands in for reference contexts because labelling chunks costs far more. The
`NonLLMContextRecall` variant compares retrieved contexts to reference contexts by string
similarity, no LLM needed.

Two more metrics worth knowing, also in the current docs:

**Factual correctness** (reference-based; answer ↔ reference). Compare the answer with
the model answer: how much is right, how much is extra, how much is missing. Decompose
both the answer
and the reference into claims, count TP (claims in both), FP (only in the answer), FN
(only in the reference), then precision, recall and F1 (chosen by `mode`). This is the
true "correctness" metric, complementing faithfulness, which only measures consistency.

**Noise sensitivity** (needs all four inputs; lower is better). When a few irrelevant
passages are mixed in, does the model get dragged into saying wrong things? The share of
*wrong*
claims in the answer when the system had relevant context (`mode="relevant"`) or noisy
context (`mode="irrelevant"`). It measures whether junk context drags the model along.

RAGAS is at 0.4.x and moving to a new `ragas.metrics.collections` API (the old
`SingleTurnSample` API is marked deprecated from 0.4, slated for removal in 1.0). Scoring
one sample with the new API, following the docs' examples:

```python
# pip install ragas openai        (ragas 0.4.x, collections API)
from openai import AsyncOpenAI
from ragas.llms import llm_factory
from ragas.embeddings.base import embedding_factory
from ragas.metrics.collections import (
    Faithfulness, AnswerRelevancy, ContextPrecision, ContextRecall,
)

client = AsyncOpenAI()
judge = llm_factory("gpt-4o-mini", client=client)       # the judge model
emb = embedding_factory("openai", model="text-embedding-3-small", client=client)

faith = Faithfulness(llm=judge)                       # reference-free
relev = AnswerRelevancy(llm=judge, embeddings=emb)    # reference-free
prec = ContextPrecision(llm=judge)                    # needs reference
rec = ContextRecall(llm=judge)                        # needs reference

async def score_one(row: dict) -> dict:
    """row: user_input, response, retrieved_contexts (list[str]), reference."""
    q, a, ctx, ref = (row["user_input"], row["response"],
                      row["retrieved_contexts"], row["reference"])
    f = await faith.ascore(user_input=q, response=a, retrieved_contexts=ctx)
    r = await relev.ascore(user_input=q, response=a)
    p = await prec.ascore(user_input=q, reference=ref, retrieved_contexts=ctx)
    c = await rec.ascore(user_input=q, reference=ref, retrieved_contexts=ctx)
    return {"faithfulness": f.value, "relevancy": r.value,
            "ctx_precision": p.value, "ctx_recall": c.value}
```

Three cautions for every LLM-based metric: (1) the judge is noisy, two runs give slightly
different numbers, so compare on 50+ samples and look at trends, not at one number; (2)
the judge costs money, one sample with four metrics is dozens of calls, so run on the test
set, not on every request; (3) *calibrate* once: take 30 samples, have a human score
them, check that the metric agrees with the human; if not, change the judge or the
metric's prompt.

### 4.4 Other tools

[DeepEval](https://deepeval.com/docs/metrics-introduction) takes the unit-test approach:
each metric has a `threshold`, and `deepeval test run` is a pytest integration, so it
runs in CI; its RAG metrics are the equivalents, plus G-Eval for criteria you define in
plain language. LangSmith and Arize Phoenix (section 5) also run evaluators on datasets
and live traces. Pick one and use it consistently; the tool matters less than having the
test set.

## 5. LLMOps for RAG

LLMOps is the operations half: knowing what the system is doing, changing it without
breaking it, and keeping it right as data and models change.

### 5.1 Tracing and observability

A trace is the structured record of one request: the question in, the rewritten question,
which chunks were retrieved with what scores, the final prompt, the answer, and the time,
tokens and cost of each nested step. Without traces, every "why did it answer that" is a
guess. Three common tools:
[Langfuse](https://langfuse.com/docs/observability/overview) (open source,
self-hostable, with evaluation, datasets and prompt management),
[LangSmith](https://docs.langchain.com/langsmith) (by LangChain, but it traces
non-LangChain code too), and [Arize Phoenix](https://arize.com/docs/phoenix) (open
source, built on OpenTelemetry/OpenInference). With the Langfuse Python SDK v5:

```python
# pip install langfuse   (SDK v5; reads LANGFUSE_PUBLIC_KEY / SECRET_KEY / BASE_URL)
from langfuse import get_client

langfuse = get_client()

def answer(question: str) -> str:
    with langfuse.start_as_current_observation(as_type="span", name="rag") as root:
        with langfuse.start_as_current_observation(as_type="span", name="retrieve") as s:
            chunks = retrieve(question)                      # hybrid + rerank
            s.update(output=[c.id for c in chunks])          # keep ids, not full text
        with langfuse.start_as_current_observation(
            as_type="generation", name="llm", model="gpt-4o-mini"
        ) as g:
            text = generate(question, chunks)
            g.update(output=text)
        root.update(output=text)
    langfuse.flush()        # short-lived processes must flush before exit
    return text
```

Every trace should also record: prompt version, index version, embedding model name,
cache hit or not, fallback or not. These are the axes you will slice dashboards by.

### 5.2 Versioning: prompts, indexes, embedding models

These three change the system's behaviour without changing a line of code, so they need
versions like code does:

- **Prompts** live in the repo or a prompt registry (Langfuse and LangSmith have one), and every trace records the version. Changing a prompt is a deploy.
- **Indexes** are named by version (`docs_v12_2026-10-20`) with an alias pointing at the live one; build the new one, run the eval, then switch the alias. Rollback is switching it back.
- **Embedding model**: changing the model means re-embedding the *entire* corpus, because vectors from two models are not comparable. Never mix two models in one index. Write the model name into the index metadata so nobody does it by accident.

### 5.3 Offline eval in CI as a regression gate

A pull request that changes chunking, the prompt, the model or retrieval parameters must
run the golden set and compare to baseline. Rules I typically set: Recall@10 may not drop
by more than 2 points, faithfulness may not fall below 0.85, the correct-refusal rate on
"not in the documents" questions may not drop; any violation turns CI red. Run it with
pytest via DeepEval, or a RAGAS script that writes results to a file and compares. The
test set does not need to be large (50–200 questions), but it must run *every time*.

### 5.4 Online monitoring

The minimum dashboard, sliced by prompt/index version:

- p50/p95 latency overall and per step (retrieve, rerank, generate).
- Input/output tokens and cost per question; daily total with an alert.
- Cache hit rate; fallback rate (answered without the LLM, or "I don't know"); error rate.
- User feedback (thumbs up/down) attached to the trace, so failing questions can be pulled into the golden set.
- Reference-free metrics (faithfulness, response relevancy) on a *sample* of traffic (1–5%) to see drift without paying for a judge on every request.

### 5.5 Re-indexing and freshness

If the data changes and the index does not, the system answers from the past. Index
incrementally by content hash (re-embed only changed documents), on a schedule or on
events (a wiki webhook, a commit to the repo). Every chunk carries `source_version` and
`indexed_at` so an answer can say "as of version X". This portfolio re-indexes on deploy
because its content lives in git; an internal wiki needs an hourly job.

### 5.6 A/B tests, guardrails, serving

**A/B tests**: when offline eval says "the new version is 3 points better", still send
10% of traffic to it and compare user feedback, p95 and cost for a week. Offline eval
measures yesterday's questions; A/B measures today's.

**Guardrails** at both ends: input (PII, injection, out-of-scope topics), output
(unsourced claims, leaking data the user may not see, format). A guardrail is code that
runs *before* and *after* the LLM, not an instruction in the prompt.

**Deployment and serving**: package with Docker; Kubernetes when you need to scale with
load and separate the indexing worker from the API; self-hosted models behind
[vLLM](https://docs.vllm.ai/) (PagedAttention and continuous batching for throughput, an
OpenAI-compatible API so code does not change between self-hosted and managed); managed
services (Bedrock, Vertex, Azure) when you do not want to run GPUs. The principle is the
same: pick the *smallest* operational footprint that meets the need; this portfolio's
backend is one serverless function, enough for its load.

### 5.7 The loop

Everything comes back to one loop: **Measure → Diagnose → Optimize → Re-evaluate**.
Measure with traces and the golden set; diagnose which factor of Retrieval × Context ×
Generation is pulling the product down; optimize *one* thing; measure again on the
*same* test set. A change that is not re-measured is a guess.

> RAG quality = Retrieval × Context × Generation. Production = Quality + Latency + Cost + Reliability. The first says fix the weakest factor; the second says quality is only one of four things real users feel.

## 6. Closing

If you keep three things from this post: (1) have a golden set before adding any
technique, (2) climb the ladder by metric, not by the latest paper, (3) trace every
request so you can diagnose instead of guess.

But even a well-tuned RAG is still a one-way street: look up once, answer once. It cannot
go back and search differently when the first attempt was poor, choose between several
paths, take an action (look up an order, issue a refund), or pause for a human, and
LangChain's chains run in a straight line. [Post 4](#/blog/langgraph-ai-agents) starts
exactly there: LangGraph adds loops, branches, shared memory and pauses, and on top of
that an AI agent lets the model decide the next step itself.
