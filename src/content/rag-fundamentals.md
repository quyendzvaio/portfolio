---
title: "RAG from the Ground Up: Why LLMs Need to Look Things Up, and How a RAG Pipeline Runs"
date: "2026-10-23"
tags: ["rag", "llm", "fundamentals"]
summary: "The inherent weaknesses of LLMs, the core idea behind RAG, its building blocks, and one example walked end to end from indexing to a cited answer."
---

# RAG from the Ground Up: Why LLMs Need to Look Things Up, and How a RAG Pipeline Runs

This is the first of six posts that go from "why LLMs need RAG" to "harness engineering for
agents". There is no framework in this one and no particular vector database. The goal is that
after reading it, you can look at any RAG system, point at each block, and say what it does and
why it has to be there. Later posts build the thing with LangChain, tune it, evaluate it, and
grow it into agents.

## 1. Where LLMs are strong, and where they are inherently weak

Before the weaknesses, you need to see how an LLM (large language model, the "brain" behind
ChatGPT, Claude or Gemini) is made and how it produces text, because every weakness below
follows from that.

### How an LLM is trained and how it generates text

Put simply, picture a person who has read almost everything ever written on the Internet, but
only up to a certain day, and then stopped. After that, every book is locked away. What stays in
their head is not the pages; it is a very good feel for which word tends to follow which, plus a
huge number of facts remembered roughly. When you ask them something, they are not allowed to
open a book; they just say the sentence that sounds most natural, from memory. That is an LLM.

Now the same thing in technical words, each explained once. The model is a calculating machine
holding billions of numbers, called parameters or weights; training is the process of nudging
those numbers again and again. Text is cut into small pieces called tokens, usually a word or a
piece of a word. There is only one training exercise: look at the pieces so far, guess the next
one. Doing that trillions of times over text collected **up to a fixed point in time**, the
numbers gradually "compress" both the patterns of language and countless facts.

When you ask it something, the model looks nothing up. It takes the prompt (the prompt is all
the text you hand it, the question plus anything you attach), guesses the next piece of text,
appends it, and repeats until the answer is done. The answer is woven from exactly two sources:
what the numbers "remember", and what is in the prompt. Keep that sentence in mind, because RAG
is entirely about the second source.

Given that mechanism, the six weaknesses below are consequences, not bugs of any one vendor.

### Weakness 1: knowledge stops at the training cutoff

The training data is frozen at a point in time, the knowledge cutoff. Anything after it, the
model does not know: new library versions, new policies, new prices. Worse, the model has no
sense of "I don't know this", so it answers with the old version it remembers, in a confident
voice.

### Weakness 2: it does not know your private data

Your company handbook, your contracts, your support tickets, your internal docs, your customer
database: none of it was in the training set. Most real use cases need exactly this kind of
data. A model that knows all of Wikipedia but not your leave policy cannot answer a new hire's
simplest question.

### Weakness 3: hallucination

Hallucination is when the model makes up something that sounds right: a number, a regulation, an
API function that does not exist. The cause is in the generation mechanism itself: the model is
optimised to produce token sequences that are *likely*, not token sequences that are *true*. When
the parameters do not contain the answer, the model still has to emit a next token, and the
"most plausible" one is usually a fluent, wrong answer.

### Weakness 4: no source to check

Knowledge in parameters is knowledge that has been compressed and blended. The model cannot say
"I got this from page 12 of document X", because there is no page 12 anywhere in the parameters.
To a user, an answer without a source cannot be verified, and in legal, medical or financial
settings that means it cannot be used.

### Weakness 5: the context window is finite

The context window is all the text the model can "see" in one call, the prompt plus the answer
it is generating. Anthropic's documentation describes it as the model's "working memory", as
opposed to the corpus it was trained on
([Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)).
The limit keeps growing, now into hundreds of thousands or a million tokens, but it is still a
limit: an internal corpus of tens of thousands of pages never fits. And even when it fits, the
"Lost in the Middle" study by Liu and colleagues shows accuracy dropping sharply when the
relevant information sits in the middle of a long context, even for models built for long
context ([Liu et al., 2023](https://arxiv.org/abs/2307.03172)). More is not better; every
unnecessary token is also money and latency.

### Weakness 6: teaching the model new knowledge is expensive

To make the model "know" more, you have two options: retrain it, or fine-tune it (continue
training on your data so the parameters shift). Both cost GPUs, cost people to prepare data, and
have to be redone whenever the documents change. More importantly, fine-tuning is bad at
absorbing new facts. Ovadia and colleagues compared the two approaches head to head and found
that LLMs "struggle to learn new factual information through unsupervised fine-tuning", while
retrieval consistently did better, for knowledge seen during training and for entirely new
knowledge alike ([Ovadia et al., 2023](https://arxiv.org/abs/2312.05934)).

> The six weaknesses share one root: knowledge that lives in parameters is static, blurry,
> untraceable and expensive to change. The second source, the prompt, is the opposite: dynamic,
> explicit, can be pointed at, and changes by editing text.

## 2. RAG was developed to solve exactly these problems

RAG (Retrieval-Augmented Generation) was proposed by Lewis and colleagues at Facebook AI in
2020. The original paper names the problems above: models store knowledge in parameters but
cannot access and manipulate it precisely, cannot show where an answer came from, and cannot
easily update what they know. Their fix was to combine two kinds of memory: **parametric memory**
(the model's parameters) and **non-parametric memory** (a dense vector index of Wikipedia,
queried by a pre-trained retriever). The generated text came out "more specific, diverse and
factual" than a parametric-only model ([Lewis et al., 2020](https://arxiv.org/abs/2005.11401)).

Five years on, "RAG" in practice no longer means the jointly trained architecture of that paper.
It means a system design pattern: leave the LLM alone, build a search system next to it, and
connect the two through the prompt. The survey by Gao and colleagues splits this history into
three stages, Naive RAG, Advanced RAG and Modular RAG, and identifies the three foundations of
every RAG system: retrieval, generation and augmentation
([Gao et al., 2023](https://arxiv.org/abs/2312.10997)). This post follows those three.

Mapping back to the six weaknesses:

| LLM weakness | What RAG does about it |
|---|---|
| Stale knowledge | New documents just get re-indexed |
| No private data | Private data is the corpus being searched |
| Hallucination | The model is told to answer from the passages given |
| No sources | Every retrieved chunk carries an id, title, page |
| Finite context window | Only a few relevant chunks go in, not the corpus |
| Expensive to teach | Parameters are never touched; edit the docs |

RAG does not cure hallucination at the root, because the model can still ignore the context or
misread it. But it turns the problem from "what does the model remember" into "what do we put in
the prompt", and the second one can be controlled and measured.

## 3. The essence of RAG: an open-book exam instead of a closed-book one

Picture this. You are sitting an exam. Closed book, you have only what you memorised; faced with
a question on something you never studied, you either leave it blank or write something that
sounds right. Open book, you are still you, but you may bring the material in, turn to the right
page, and only then write. The answer is far more accurate, and you can even add "see page 12".

Notice one thing: an open-book exam does not make you smarter. It only makes you **better
informed** at the moment you need it. RAG does exactly that for the model. In plain words, RAG
is: before letting the model answer, go and find a few passages from your documents that talk
about the thing being asked, put them right in front of the model together with the question,
and tell it "answer from these". The model does not need to remember anything about your
company; it only needs to be shown the right page.

So the long name, Retrieval-Augmented Generation, is really three moves: go and find
(retrieval), add it to the question (augmented), and only then write the answer (generation).
Everything else in this post, chunks, embeddings, vector stores, rerankers, is just a way of
making the "go and find" move fast and accurate.

![LLM alone is a closed-book exam: memory only, a fluent answer that may be outdated or invented; LLM plus retrieval is an open-book exam: the question goes through a retriever that pulls passages from your documents, they are placed in the prompt, and only then does the model generate a cited answer](blog/rag-fundamentals-open-book.svg)

### Before and after, on the same question

Say your company has an employee handbook, and a new hire asks the internal chatbot.

The prompt **without** RAG:

```text
How many days a week can an employee on probation at our company work remotely?
```

The model has no idea which company "our company" is. It will answer something like "Most
companies allow one or two days..." or, worse, state a number. Grammatically fine, practically
worthless, and possibly misleading.

The prompt **with** RAG, after the retriever found two relevant passages:

```text
You are an internal assistant. Answer only from the CONTEXT passages below.
If the context is not enough to answer, say that you could not find it.
For every point, cite the source as [document name, section].

CONTEXT
[1] Remote Work Policy v3 (updated 2026-03), section 2.1:
Employees who have completed probation may work remotely up to 3 days
per week. During the 2-month probation period, remote work is limited
to 1 day per week and must be approved in advance by the line manager.

[2] Remote Work Policy v3 (updated 2026-03), section 2.3:
Remote days must be registered in the HR system before 17:00 on the
previous day.

QUESTION
How many days a week can an employee on probation work remotely?
```

The answer can now be: "During probation (2 months) you may work remotely at most 1 day per
week, with prior approval from your line manager [Remote Work Policy v3, section 2.1]. Register
the day in the HR system before 17:00 the day before [section 2.3]." Correct, sourced, and if the
policy changes to 2 days next month, you re-index the new file and nothing else.

Notice three things in the second prompt, because they are the three levers you will keep
adjusting for as long as you build RAG systems: the instruction "answer only from the context",
the context passages with source labels, and the demand for citations. Everything else in a RAG
system exists only to fill that template with the right content.

## 4. The building blocks of RAG

A RAG system has two halves that run at different times. The **indexing side** runs offline,
whenever a document is added or changed, to prepare the "book" so it can be searched quickly.
The **query side** runs online, once per question, to open the right page and write the answer.

![RAG pipeline with two rows: the offline indexing row goes from document sources through load, parse and chunk, embed, into the vector store; the online query row goes from the question through query processing, retrieve top-k from the vector store, rerank, build prompt, then the LLM generates an answer with citations](blog/rag-fundamentals-pipeline.svg)

### Indexing side (offline)

**Load.** Read documents from their sources: PDFs, wiki pages, database tables, APIs, Notion.
The output is raw text plus metadata (data describing the document: file name, last updated,
version, department, access rights). Metadata is easy to neglect at this step, but it is what
later lets you filter "latest version only" and what makes citations possible.

**Parse and chunk.** Parsing turns the original format into clean text while keeping structure:
headings, tables, lists. PDFs are where many RAG systems die quietly, because a broken table or
two columns merged into one never shows up as an error. Chunking splits the text into small
pieces (chunks), usually a few hundred tokens. You must split for two reasons: the embedding of a
very long passage goes "blurry" (one vector cannot represent ten topics well), and at answer
time you want to paste only the relevant passage, not the whole document. The simplest split is
fixed size with overlap, so a sentence cut in half still appears whole in at least one chunk.
Smarter splitting is covered in [post 3](#/blog/rag-production-techniques).

**Embed.** An embedding is a list of numbers (a vector) that captures the meaning of a text, so
that two texts with similar meaning get nearby vectors. OpenAI's documentation puts it plainly:
the distance between two vectors measures their relatedness; small distances mean high
relatedness ([OpenAI, Embeddings](https://developers.openai.com/api/docs/guides/embeddings)). An
embedding model (a separate model, much smaller than an LLM) takes a chunk and returns a vector,
for example 1,536 numbers with `text-embedding-3-small`. Closeness is usually measured with
cosine similarity, the angle between two vectors: 1 means same direction, 0 means unrelated.

```python
# Cosine similarity in plain Python, to show that "similarity" is just arithmetic.
# Real embeddings have thousands of dimensions, but the formula is identical.
import math

def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))          # dot product
    norm_a = math.sqrt(sum(x * x for x in a))        # length of a
    norm_b = math.sqrt(sum(y * y for y in b))        # length of b
    return dot / (norm_a * norm_b)

q  = [0.9, 0.1, 0.4]   # the question's vector (illustrative)
c1 = [0.8, 0.2, 0.5]   # a chunk on the same topic
c2 = [0.1, 0.9, 0.0]   # a chunk on a different topic
print(round(cosine(q, c1), 2), round(cosine(q, c2), 2))  # 0.98 0.2
```

**Vector store.** Where each chunk is kept with its vector and metadata, and above all, where the
question "give me the k vectors nearest to this one" is answered quickly over millions of
vectors. With a few thousand chunks, a NumPy array and one matrix multiplication are enough.
With tens of millions you need an approximate nearest-neighbour (ANN) index, as in FAISS, Qdrant,
Milvus or pgvector. Note that a vector store is only one way to search; many good systems keep a
keyword index like BM25 (a ranking algorithm based on term frequency, as in classic search
engines) alongside it, because embeddings tend to miss exact strings such as error codes,
product codes and function names.

### Query side (online)

**Query processing.** At minimum, embed the question with the *same* embedding model used at
indexing time (using a different one is the classic mistake, because the two vector spaces are
not comparable). Beyond that: rewrite the question for clarity, split a double question, and
derive metadata filters from it ("latest version", "finance department").

**Retrieve.** Fetch the top-k chunks nearest to the question vector, possibly combined with BM25
results. When merging two ranked lists from two different systems, the usual method is
Reciprocal Rank Fusion: a document's score is the sum of `1 / (k + rank)` over each list, with
k = 60 in the original paper
([Cormack, Clarke, Büttcher, 2009](http://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)). At this
step you deliberately cast a wide net, say 20-50 chunks, accepting noise so as not to miss
anything.

**Rerank.** A second model, called a reranker or cross-encoder, reads the *pair* (question,
chunk) and scores relevance far more accurately than comparing two independent vectors. It is
slower, so it runs only on the 20-50 candidates and keeps the best 3-5. The reason for this step:
embedding search is tuned for *recall* (miss nothing), the reranker is tuned for *precision*
(whatever enters the prompt must actually be relevant).

**Build prompt (also called augmentation).** Assemble the system prompt (role, the "use only the
context" rule, the citation requirement), the selected chunks with source labels, and the
question. This is also where you decide chunk order, trim when over the token budget, and
deduplicate.

**Generate.** The LLM reads the prompt and writes the answer with citations. The "with citations"
part does not happen on its own; it comes from the `[1]`, `[2]` labels in the prompt and the
instruction to cite. Afterwards you can check: does every citation point at a real chunk, does
the answer contradict the context.

## 5. The RAG flow block by block: one example end to end

Back to the handbook, this time walking through every block with concrete data. The numbers are
illustrative but in proportion to what you will see.

### Offline: indexing the handbook

Sources: 14 files, including `remote-work-v3.pdf` (6 pages, updated 2026-03),
`remote-work-v2.pdf` (the old version, 2024), `leave-policy.pdf`, `onboarding.md`, and a few
others.

**Load.** In: 14 files. Out: 14 records of `{text, metadata}`. For example the remote work
policy's metadata is `{source: "remote-work-v3.pdf", version: 3, updated: "2026-03", dept: "HR"}`.
One important decision happens right here: mark v2 as `superseded: true` so it can be filtered
out later, or do not index it at all. If you index both without metadata, the retriever will
return the old version's "2 days per week" alongside the new one and the model has to guess.

**Parse and chunk.** In: 14 text records. Out: about 180 chunks of ~300 tokens each with a
50-token overlap, each chunk inheriting its parent document's metadata plus `section` and
`page`. Chunk 12 is the section 2.1 passage above. Chunk 13 is section 2.2 on the equipment
allowance. Chunk 14 is section 2.3 on HR registration.

**Embed.** In: 180 passages. Out: 180 vectors of 1,536 floats each. Call the embedding model in
batches; it takes a few seconds and a few cents. Run once; re-run only for chunks of files that
changed.

**Vector store.** In: 180 tuples of `(id, vector, text, metadata)`. Out: an index ready to answer
nearest-neighbour queries, plus a BM25 index over the same 180 passages. With 180 chunks the
"vector store" can be a single file. Indexing ends here; so far no LLM has been called.

### Online: answering one question

Question: *"How many days a week can an employee on probation work remotely?"*

**Query processing.** In: the question string. Out: the question vector (1,536 floats, same model
as at indexing), the keyword list for BM25 (`probation`, `remote`, `days`, `week`), and the
metadata filter `superseded != true`. No rewriting needed; the question is already clear.

**Retrieve.** In: question vector, keywords, filter. Out: 20 candidates with scores. Vector search
returns chunk 12 (cosine 0.83), chunk 14 (0.71), chunk 13 (0.66), a chunk from
`leave-policy.pdf` about "leave during probation" (0.64), then fading matches. BM25 also ranks
chunk 12 first since it matches both "probation" and "remote". Merged with RRF, chunk 12 leads by
a wide margin. Without the filter, the v2 chunk would also get in at cosine ~0.80, because its
wording is nearly identical; that is why metadata matters more than the search algorithm.

**Rerank.** In: 20 (question, chunk) pairs. Out: 3 chunks, reordered. The reranker gives chunk 12
a very high score (it contains the exact answer), chunk 14 a medium score (a related procedure),
and pushes the leave-policy chunk down because, although it mentions probation, it says nothing
about remote work. Keep 12, 14, 13.

**Build prompt.** In: system prompt, 3 chunks, question. Out: a prompt of roughly 600 tokens in
the shape shown in section 3, with `[1]` for chunk 12, `[2]` for chunk 14, `[3]` for chunk 13.
Chunk 13 could be dropped under a tight token budget; here it stays to give the model more
context.

**Generate.** In: the 600-token prompt. Out: an answer of ~80 tokens with two citations, as in
section 3. A light check afterwards: every `[n]` in the answer exists in the prompt. If the model
answers without citing, or cites a `[4]` that does not exist, the system should refuse or
regenerate.

Total cost for one question: one embedding call (very cheap), one local search, one reranker
pass over 20 pairs, and one LLM call with 600 input tokens. Compared with pasting all 14 files
(about 60,000 tokens) into every question, that is two orders of magnitude cheaper and more
accurate, because the model is not hunting for a needle in a haystack.

## 6. RAG, fine-tuning, or just a long context window?

These three are often weighed against each other as if they were mutually exclusive. They
actually answer three different questions.

| Criterion | RAG | Fine-tuning | Long context |
|---|---|---|---|
| Adding new facts | Good, edit the docs | Poor, costly and unreliable | Good if it fits |
| Data changes often | Very suitable | Unsuitable | Fine if corpus is small |
| Source citations | Built in | None | Yes, if prompt is labelled |
| Tone, format, skills | No | Best fit | Partly, via examples |
| Cost per question | Low, a few chunks | Lowest | High, scales with corpus |
| System complexity | Medium | High up front | Lowest |

**Fine-tuning** teaches the model *how to do things* (tone, output format, a narrow skill), not
*what is true today*. If you need the model to always answer in one JSON schema or in your brand
voice, fine-tuning is the right tool, and it combines well with RAG rather than replacing it.

**Long context** is the right choice when your corpus is small. Anthropic's Contextual Retrieval
post says it outright: if the whole knowledge base is under about 200,000 tokens (roughly 500
pages), you can put the entire thing in the prompt, use prompt caching to cut cost and latency,
and skip RAG ([Anthropic, Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)).
Once the corpus is bigger, or when each question needs only a tiny slice of it, RAG wins on both
cost and accuracy because of the "lost in the middle" effect above.

## 7. When RAG is not the right tool

A good system is the simplest one that meets the bar. Consider not using RAG when:

- The corpus is small and stable: paste it into the prompt, cache it, measure quality. Move to RAG only when cost or accuracy falls short.
- The question needs the whole corpus: "summarise every policy change this year", "how many contracts expire next month". RAG fetches *pieces*, not the *whole*. These need batch summarisation or a structured query.
- The data is already structured: if the answer is a SQL query over the HR table, let the model write SQL (or call a tool); do not embed table rows.
- The problem is behaviour, not knowledge: the model knows enough but answers in the wrong format or tone. That is a prompt or fine-tuning job.
- It is general knowledge the model already has: asking about standard Python syntax, RAG only adds latency.
- You have no way to measure: RAG has many places to fail silently (parse, chunk, retrieval, prompt). If you have no golden question set to check against, build that before the pipeline.

And even when RAG is the right call, start with the most naive version: fixed-size chunks, one
embedding model, top-5, one clear prompt. Measure. Then add BM25, a reranker, query rewriting,
one at a time, when the numbers say you need them.

## 8. What RAG "on paper" still does not solve

> If you remember one thing: an LLM has two sources of information, its parameters and its
> prompt. You do not control the parameters. RAG is the discipline of putting the right thing in
> the prompt.

This post deliberately uses no framework, so you can see that RAG is just: prepare the book,
open the right page, make the model read that page before it answers. The idea is that simple,
but the moment you build it for real, you find it is a pile of separate pieces that have to be
glued together: reading files, cutting chunks, calling an embedding model, writing to a vector
store, calling the LLM. Every vendor has its own way of doing each piece. Swapping the embedding
model or the vector store means rewriting the glue code in between, and the pipeline quickly
turns into something hard to read and hard to change. That is exactly where LangChain comes in:
it gives every piece a standard shape so they snap together and can be swapped.
[Post 2](#/blog/langchain-rag-from-scratch) starts from precisely this point and rebuilds the
pipeline above with LangChain, with a folder layout where each block is visible at a glance.
