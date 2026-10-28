---
title: "What LangChain Is, and Building RAG From Scratch With It"
date: "2026-10-24"
tags: ["langchain", "rag", "python"]
summary: "What problem LangChain solves, how each component serves RAG and agents, then a RAG codebase whose folder tree reads like the pipeline."
---

# What LangChain Is, and Building RAG From Scratch With It

In [post 1](#/blog/rag-fundamentals) we saw how RAG fixes the LLM's blind spot about your own
data: find the right passage, put it in the context, and the model answers from evidence. The
idea is simple. But the moment you start building it, you find that RAG is not one thing but
five or six separate pieces that have to be glued together: reading files, cutting them up,
embedding, a vector store, then the LLM. Every vendor does each piece its own way, so swapping
one piece means rewriting the glue. This post is about the tool built to fix exactly that
weakness: LangChain. The first half explains what problem LangChain solves and where each of
its components sits in a RAG pipeline versus an agent. The second half builds a small RAG
system that runs on your laptop, with a folder structure that shows the pipeline at a glance.

Every API here was checked against **LangChain 1.x** at the time of writing (28 Oct 2026, per
PyPI): `langchain` 1.4.7, `langchain-core` 1.7.1, `langgraph` 1.2.18,
`langchain-text-splitters` 1.1.3, `langchain-chroma` 1.1.0, `langchain-ollama` 1.1.0,
`langchain-openai` 1.7.3. Python 3.10 or newer. I am explicit about this because LangChain's
import paths changed a lot between 0.x and 1.x; code copied from older posts often no longer
runs.

## 1. What problem LangChain was built to solve

Here is the plain version. Imagine you bought appliances in five different countries, each
with a different plug. To use them you have to build an adapter for every single one, and the
day you swap one appliance for another, you build another adapter. LangChain is the standard
socket: every piece of RAG is shaped to the same plug, so anything fits, and you can pull one
piece out and put another in without touching the rest. Put differently, it turns the pile of
loose parts from [post 1](#/blog/rag-fundamentals) into Lego bricks that click together.

More concretely, what happens if you write RAG with no framework? You need to: call a model
provider's API (OpenAI, Anthropic, Google, or Ollama running locally), each with its own
request and response format; read PDF, Markdown and HTML; cut text into pieces; call a
separate embedding API; write vectors into a database; write a search function; assemble a
prompt; parse the result. That is a lot of glue code. Then one day you want to swap GPT for
Claude to compare, or move the vector store from Chroma to Postgres, and you discover the glue
is welded to the old vendor.

LangChain states its goal in its
[design philosophy page](https://docs.langchain.com/oss/python/langchain/philosophy):
providers "expose different APIs, with different model parameters and different message
formats", so "standardizing these model inputs and outputs is a core focus". In short,
LangChain does two things:

- **Standard interfaces.** Every chat model has `invoke`, `stream`, `bind_tools` and `with_structured_output`. Every vector store has `add_documents`, `similarity_search` and `as_retriever`. Changing vendor is one constructor line, not a rewrite of the pipeline.
- **Composition.** The pieces are designed to plug into each other: a loader emits `Document`, a splitter takes `Document`, a vector store takes `Document`, a retriever returns `Document`. One data type flows through, so assembling a pipeline feels like snapping Lego together.

The name "chain" comes from the early days, when everything was a fixed sequence of steps.
LangChain then added LCEL (a way to compose chains with the `|` operator), then LangGraph for
flows with loops and state, and in 1.0 replaced all the old chains and agents with a single
abstraction, `create_agent`, running on LangGraph. We will meet each of these layers below.

### The current packages

LangChain 1.x is not one package but a family. Knowing what lives where makes import errors
much faster to read.

| Package | Contains | When you need it |
|---|---|---|
| `langchain-core` | Base interfaces: `Runnable`, `Document`, messages, prompts, parsers | Always (pulled in) |
| `langchain` | `create_agent`, `init_chat_model`, `init_embeddings`, middleware; re-exports core | Always |
| `langchain-openai`, `-anthropic`, `-ollama`, ... | Partner packages: one adapter per model vendor | Per vendor you use |
| `langchain-chroma`, `-qdrant`, `-postgres`, ... | Partner packages for vector stores | Per store you use |
| `langchain-text-splitters` | The text splitters | When chunking |
| `langgraph` | Runtime: graphs, state, checkpointers | Agents, or any looping flow |
| `langchain-classic` | Legacy chains, retrievers, indexing API | Only when porting 0.x code |
| `langchain-community` | Community integrations (PDF loaders, FAISS...) | Being sunset, see below |

Two things to know. First, per the
[v1 release notes](https://docs.langchain.com/oss/python/releases/langchain-v1), chains like
`RetrievalQA`, `MultiQueryRetriever`, the `langchain.retrievers` module and the indexing API
moved to `langchain-classic`; when you find sample code using them, read it as the old API.
Second, `langchain-community` was
[announced as sunset](https://github.com/langchain-ai/langchain-community/issues/674) in May
2026: it still installs, but it is no longer maintained, and the direction is standalone
packages per integration (for example `langchain-docling` and `langchain-unstructured` for
loaders). The sample project below avoids depending on it.

## 2. The components, and their role in RAG and in an agent

Before going one by one, look at the whole picture: how the components plug into each other
in a RAG chain, and where the agent variant differs.

![LangChain components snapped into a RAG chain: the top row is offline indexing (loaders, splitters, embeddings, vector store), the bottom row is the online query chain (retriever, prompt, chat model, parser), with the agent variant and LangSmith tracing below](blog/langchain-rag-from-scratch-components.svg)

### Chat models

A chat model is the adapter that talks to an LLM. It takes a list of messages and returns an
`AIMessage`. In 1.x the recommended constructor is `init_chat_model` with a
`"provider:model"` string; LangChain imports the matching partner package for you.

For example, the string `ollama:llama3.1` points at a local model served by Ollama and
`openai:gpt-5.5` at a hosted one; change the string and you change vendor, and the rest of the
program never notices.

Three methods you will use constantly: `invoke` (one call), `stream` (receive pieces as they
arrive, for a live UI), and `bind_tools` (declare tools the model may ask to call).
`with_structured_output` forces the model to return exactly one Pydantic schema.

- **In RAG:** sits at the end of the chain, receives the prompt with context and writes the answer. `temperature=0` keeps results stable and close to the documents.
- **In an agent:** the "brain" of the loop: each turn the model reads the history and decides which tool to call or whether to answer. The model must support tool calling.

### Messages

Messages are the units of a conversation: `SystemMessage` (instructions), `HumanMessage`
(the user), `AIMessage` (the model), `ToolMessage` (the result of one tool call, which must
carry a `tool_call_id` matching the request in the `AIMessage`). You can write them as dicts,
`{"role": "user", "content": ...}`, or import the classes from `langchain.messages`. 1.x adds
a `content_blocks` property: a standardised view of the content (text, reasoning, tool calls,
citations) that looks the same across vendors, per the
[messages docs](https://docs.langchain.com/oss/python/langchain/messages).

- **In RAG:** usually just system + human; the context lives in the system message.
- **In an agent:** the whole history is a list of messages; `ToolMessage` is how a tool result gets back to the model.

### Prompt templates

A template is a prompt with holes. `ChatPromptTemplate.from_messages` takes a list of
`(role, text)` pairs; `{context}` and `{question}` are filled at run time.
`MessagesPlaceholder` inserts a whole list of messages (chat history) in the middle.

For example, the RAG template of the project below is a system message "Answer only from the
context below. Cite [n]." followed by the `{context}` hole, and a human message that is just
the `{question}` hole. At run time you pass the two values in and get back a list of messages
ready to send to the model.

- **In RAG:** this is where the grounding rules live: "use only the context, say so if it is not there, cite sources".
- **In an agent:** `create_agent` takes `system_prompt` as a plain string; templates come in when you need a prompt that changes per user (through middleware).

### Output parsers and structured output

A parser turns an `AIMessage` into something code can use. `StrOutputParser` extracts the
text. `PydanticOutputParser` parses JSON against a schema. But the
[output parsers reference](https://reference.langchain.com/python/langchain_core/output_parsers/)
is clear: "most LLMs support structured output natively", so when you need structured JSON,
use `llm.with_structured_output(Schema)` or `response_format=Schema` on `create_agent` (the
result lands in `result["structured_response"]`). Parsers remain for models without native
support.

- **In RAG:** `StrOutputParser` at the end of the chain is enough; or structured output if you want `{"answer": ..., "citations": [...]}` as separate fields.
- **In an agent:** `response_format` makes the agent finish with a validated object.

### Document loaders

A loader reads a data source (files, URLs, a database) and returns a list of `Document`: an
object with `page_content` (the text) and `metadata` (any dict, typically `source`, `title`,
`page`). Every loader subclasses `BaseLoader` from `langchain-core` with two methods,
`load()` and `lazy_load()` (streams one document at a time, good for large corpora). Writing
your own is ten lines, and for a Markdown corpus I prefer that to pulling in a dependency.

- **In RAG:** the first step of indexing. The metadata you attach here travels with the chunk all the way to the answer, so think about citations at the loader.
- **In an agent:** rarely called directly; the agent usually uses a tool around an already indexed retriever. A "fetch URL" tool is a loader running at run time.

### Text splitters

A splitter cuts long `Document`s into chunks small enough to retrieve precisely and to fit the
context window. They live in `langchain-text-splitters`. The docs' recommended starting point
is `RecursiveCharacterTextSplitter`: it tries to keep paragraphs whole, falls back to
sentences, then words. `add_start_index=True` records each chunk's character offset in the
metadata, which is handy for stable ids. There is also `MarkdownHeaderTextSplitter` (split on
headings, keep the heading as metadata) and `CharacterTextSplitter.from_tiktoken_encoder`
(count tokens instead of characters).

- **In RAG:** decides retrieval quality more than anything else; [post 3](#/blog/rag-production-techniques) goes deep on it.
- **In an agent:** no role at run time, unless the agent indexes new documents itself.

### Embeddings

An embedding is a list of numbers that captures the meaning of a text, so two passages with
similar meaning get two nearby vectors. The interface has two methods:
`embed_documents(list[str])` at index time and `embed_query(str)` at question time.
Construct one with `init_embeddings("provider:model")`, the same style as chat models.

For example `ollama:nomic-embed-text` locally, `openai:text-embedding-3-small` hosted. Call
`embed_query` with a short question and you get back a list of a few hundred numbers (768 for
nomic-embed-text); that count is the vector's dimension.

One rule you cannot break: **the question and the documents must be embedded by the same
model.** Changing the embedding model means re-indexing everything.

- **In RAG:** used in both phases, index and query.
- **In an agent:** indirectly, through the retriever inside a tool; or for long-term memory with semantic lookup.

### Vector stores

A vector store keeps vectors next to their original `Document` and finds the k vectors nearest
to the question's vector. The shared interface: `add_documents(docs, ids=...)`,
`similarity_search(query, k)`, `similarity_search_with_score`, `as_retriever()`. Local
options: `InMemoryVectorStore` (in `langchain-core`, gone when the process exits, good for
tests), **Chroma** (`langchain-chroma`, persists to a folder, no server), FAISS
(`langchain-community`, fast but a pure index library, you handle persistence). When you
need multiple processes reading and writing, rich metadata filters, or data larger than RAM:
pgvector (`langchain-postgres`), Qdrant, Milvus, Pinecone.

- **In RAG:** the system's memory; written at index time, read at query time.
- **In an agent:** the backend of the search tool; the agent never sees it directly.

### Retrievers

A retriever is a narrow interface: string in, `list[Document]` out. What makes it valuable is
that it is a `Runnable`, so it has `invoke`, `batch`, `stream`, `ainvoke` and plugs straight
into a chain. Get one from a vector store with
`as_retriever(search_type=..., search_kwargs={"k": 4})`; `search_type` accepts
`"similarity"`, `"mmr"` (reduces redundancy among results) or
`"similarity_score_threshold"`. A retriever does not have to be vector search: a function
that calls BM25, SQL or an API, wrapped with the `@chain` decorator, is also a retriever.

- **In RAG:** the link between the index phase and the generation phase.
- **In an agent:** wrapped in `@tool` so the model calls it when it sees the need.

### LCEL and Runnables

`Runnable` is the common interface of everything in LangChain: prompts, models, parsers,
retrievers, and even a compiled LangGraph graph. LCEL (LangChain Expression Language) is how
you compose them with the `|` operator: the output of the left side becomes the input of the
right. Primitives you will use: `RunnablePassthrough` (forward the input unchanged),
`RunnableParallel` (run several branches, collect into a dict), `RunnableLambda` (wrap a plain
Python function), and `RunnablePassthrough.assign(key=...)` (add one key to the dict flowing
through).

What you get for free by composing with LCEL: `invoke`, `batch`, `stream` and their async
versions work on the whole chain without extra code; and each step becomes its own span when
tracing is on.

- **In RAG:** a great fit for two-step RAG (retrieve, then generate), because the flow is linear and stateless.
- **In an agent:** LCEL cannot express a loop or a branch that depends on a result. That is why LangGraph exists, and `create_agent` is a prebuilt graph for the most common loop.

### Tools

A tool is a Python function the model is allowed to ask for. The `@tool` decorator uses the
**type hints** as the parameter schema and the **docstring** as the description the model
reads; per the [tools docs](https://docs.langchain.com/oss/python/langchain/tools), type
hints are required. A `runtime: ToolRuntime` parameter lets a tool read state, context and
the store without exposing them to the model.

For example, the search tool of the project below is just a function that takes a `query`
string, calls the retriever, and returns the numbered passages with their sources; its one-line
docstring is everything the model knows about the tool.

- **In RAG:** not needed; the retriever is called directly in the chain.
- **In an agent:** everything the agent can do. A good tool has a clear name, a docstring that says when to use it, and returns text the model can read (number the sources so the model can cite them).

### Agents and how they relate to LangGraph

An agent is a loop: the model reads the messages, then either answers or asks for a tool
call; the tool runs; its result becomes a `ToolMessage` appended to the history; repeat until
the model stops calling tools. In 1.x, `create_agent` (replacing the old
`create_react_agent` and `AgentExecutor`) builds this loop and returns a LangGraph
`CompiledStateGraph`. That means you get persistence (checkpointers), streaming,
human-in-the-loop and time travel without learning LangGraph, as the
[overview page](https://docs.langchain.com/oss/python/langchain/overview) puts it:
"LangChain's agents are built on top of LangGraph."

The defining feature of `create_agent` is **middleware**: hooks such as `before_model`,
`after_model` and `wrap_tool_call` for summarising history, redacting PII, or requiring human
approval before a sensitive tool. When your flow does not fit "one model-tool loop" (several
agents, predetermined branches, a human in the middle), you drop down to LangGraph and draw
the graph yourself. [Post 4](#/blog/langgraph-ai-agents) of the series is about exactly that.

### Memory and chat history

With a two-step RAG chain, "memory" is you keeping a list of messages and inserting it into
the prompt through `MessagesPlaceholder`. With an agent, the history lives in the graph's
state; pass `checkpointer=InMemorySaver()` (or `PostgresSaver` in production) and invoke with
`{"configurable": {"thread_id": "..."}}`; the same `thread_id` is the same conversation. When
the history grows, `SummarizationMiddleware` summarises the old part instead of dropping it,
per the
[short-term memory docs](https://docs.langchain.com/oss/python/langchain/short-term-memory).

### Callbacks and tracing with LangSmith

Every `Runnable` emits events when it starts, ends or fails. LangSmith is the service that
turns those events into a trace: you see the question, the chunks the retriever returned,
the final prompt that was sent, and the tokens and time of each step. Turn it on with two
environment variables and no code changes: `LANGSMITH_TRACING=true` and
`LANGSMITH_API_KEY=...`, per the
[tracing guide](https://docs.langchain.com/langsmith/trace-with-langchain). For RAG, this is
the fastest way to answer the eternal question "did the model hallucinate, or did the
retriever fetch the wrong passage?". For agents, the trace shows the sequence of tool calls
the model decided on.

### Summary table

| Component | Role in RAG | Role in an agent |
|---|---|---|
| Chat model | Writes the answer from the prompt with context | Brain of the loop, decides tool calls |
| Messages | System + human | The whole history, including ToolMessage |
| Prompt template | Grounding rules, hole for the context | system_prompt, dynamic prompts via middleware |
| Output parser / structured | Extract text; JSON when needed | response_format for the final result |
| Document loader | Read sources into Document | Tools that fetch data at run time |
| Text splitter | Chunk at index time | Almost never |
| Embeddings | Index and query | Indirectly, via the retriever in a tool |
| Vector store | Store and search chunks | Backend of the search tool |
| Retriever | Link index to generation | Wrapped as a tool |
| LCEL / Runnable | Compose the linear chain | Every node and tool is a Runnable |
| Tools | Not needed | Every action the agent can take |
| Agent / LangGraph | Only for agentic RAG | The model-tool loop, state, checkpoints |
| Memory | Keep history yourself, MessagesPlaceholder | checkpointer + thread_id |
| Tracing | Debug retrieval and prompts | Follow the chain of tool calls |

### Two-step RAG or agentic RAG?

The [retrieval docs](https://docs.langchain.com/oss/python/langchain/retrieval) separate the
two. **Two-step RAG**: always retrieve, then generate; the number of model calls has a fixed
upper bound, latency is predictable, testing is easy; suits FAQs and docs bots. **Agentic
RAG**: the model decides when and what to search, possibly several times; more flexible, but
latency and cost vary, and it is harder to evaluate. My advice: start with two-step. Move to an
agent only when you have measured that real questions need several lookups (comparing
documents, follow-up questions) and the straight chain is not enough.

> A framework does not replace understanding: LangChain lets you swap a piece quickly, it does not tell you which piece to swap. That comes from measurement.

## 3. Building RAG from scratch with LangChain

The problem: a question-answering bot over a team's internal docs (a folder of Markdown:
runbooks, onboarding guides, architecture decisions). Requirements: runs fully local with
Ollama, answers with source citations, has a CLI and one HTTP endpoint, and switches to a
hosted model with nothing but an environment variable.

This part deliberately prints no code. The "base code" here is the folder structure plus the
system flow: every file in the tree calls exactly one component from section 2, so once you
know what that file takes in and gives back, you can write it in a few dozen lines, and more
importantly you know why it sits where it does.

### The folder structure

Naming rule: each folder is a stage of the pipeline, each file is one LangChain component.
Someone new to the project only needs this tree to know which way the data flows.

```text
docs-rag/
├── pyproject.toml            # dependencies: langchain, langchain-chroma, -ollama...
├── .env.example              # CHAT_MODEL, EMBEDDING_MODEL as "provider:model"
├── data/
│   └── raw/                  # source documents (.md); git-tracked, the only input
├── storage/
│   └── chroma/               # Chroma index on disk; gitignored, rebuilt by ingest
├── src/docs_rag/
│   ├── config.py             # Settings: model names, paths, chunk_size, overlap, top_k
│   ├── ingestion/            # STAGE 1 (offline): sources -> Document -> chunks
│   │   ├── loaders.py        #   Document loader: each .md file -> 1 Document + metadata
│   │   └── chunking.py       #   Text splitter: Document -> chunks + stable chunk_id
│   ├── indexing/             # STAGE 2 (offline): chunks -> vectors -> store
│   │   ├── embeddings.py     #   the embedding model, shared by indexing and querying
│   │   └── vectorstore.py    #   Chroma: writes chunks at ingest, searches them at query
│   ├── retrieval/            # STAGE 3 (online): question -> numbered top-k chunks
│   │   └── retriever.py      #   retriever from the store + numbering [n] for citations
│   ├── generation/           # STAGE 4 (online): chunks + question -> answer
│   │   ├── prompts.py        #   grounded prompt: context only, citations required
│   │   ├── llm.py            #   the chat model, temperature 0
│   │   └── chain.py          #   LCEL: retriever | prompt | model | parser, plus sources
│   ├── api/
│   │   └── main.py           # FastAPI: POST /ask: question in, answer + sources out
│   └── cli.py                # CLI: one question from the terminal -> answer + sources
├── scripts/
│   └── ingest.py             # offline: load -> split -> embed -> store
├── eval/
│   ├── golden.jsonl          # question, expected answer, expected source
│   └── run_eval.py           # retriever hit rate, citation checks
└── tests/
    ├── test_chunking.py      # splitter yields right-sized chunks with full metadata
    └── test_chain.py         # run the chain with a fake embedding + a fake chat model
```

`ingestion` and `indexing` only run offline (when the documents change). `retrieval` and
`generation` run for every question. The split guarantees that the per-request path never
imports file-reading or chunking code, and that when something breaks you know which folder
to open.

### What each part does, and why it lives there

The table below is each file's "contract": what it takes, what it returns. Keep the contract
and you can rewrite any file without touching the others.

| File | Takes | Returns | LangChain component |
|---|---|---|---|
| `config.py` | environment variables | one immutable Settings object | none (plain Python) |
| `ingestion/loaders.py` | the `data/raw` folder | list of Document with source and title metadata | Document loader |
| `ingestion/chunking.py` | list of Document | list of chunks (also Document), each with chunk_id | Text splitter |
| `indexing/embeddings.py` | Settings | the embedding model | Embeddings |
| `indexing/vectorstore.py` | Settings + embeddings | Chroma opened from `storage/chroma` | Vector store |
| `scripts/ingest.py` | nothing | a written index, prints document and chunk counts | wires the 4 files above |
| `retrieval/retriever.py` | a question | top-k Document, and their numbered text form | Retriever |
| `generation/prompts.py` | context + question | a list of messages | Prompt template |
| `generation/llm.py` | Settings | the chat model | Chat model |
| `generation/chain.py` | a question | answer + sources | LCEL |
| `api/main.py`, `cli.py` | an HTTP request or a CLI argument | JSON answer + sources | none |

A few design decisions deserve a word, because they are where beginners usually go wrong.

**config.py holds every parameter, including model names as `"provider:model"`.** The
defaults are `ollama:llama3.1` for chat and `ollama:nomic-embed-text` for embeddings, both
local. Set the environment variable `CHAT_MODEL=openai:gpt-5.5` and the whole system runs on
OpenAI; no other file knows about it. That is the "standard socket" benefit from section 1,
made visible. The other numbers that matter: chunks of 800 characters with 120 characters of
overlap (about 15%, so a sentence cut in half still appears whole in at least one chunk), and
top-k of 4.

**loaders.py is hand-written, no extra library.** For a Markdown corpus, a loader that
subclasses `BaseLoader` only has to walk the folder, read each file, take the first heading
line as `title`, and build one `Document` whose `source` is the relative path. Those two
metadata fields travel with the chunk all the way to the answer; think about citations here.
For PDFs, replace this file with `DoclingLoader` from `langchain-docling` (keeps tables and
headings) or `PyPDFLoader` from `langchain-community` if you accept the sunset package.
Nothing else changes, because everything else only sees `Document`.

**chunking.py gives every chunk a stable id.** The splitter is
`RecursiveCharacterTextSplitter` with `add_start_index` on, so each chunk knows its character
offset in the original file. The chunk id is a hash of the pair (source, start offset). Why it
matters: write to the vector store without ids and every ingest run adds another copy of every
chunk, until the retriever returns four copies of the same passage. With stable ids, Chroma
overwrites the old chunk: run ingest ten times and you still have one set.

**embeddings.py and vectorstore.py each create exactly one object and keep it for the life of
the process.** The embedding model is shared by both phases (the "same model" rule from
section 2). Chroma opens with `persist_directory` pointing at `storage/chroma`, so the index
survives restarts. I picked Chroma because it persists to a folder without a server, handles
tens of thousands of chunks comfortably, and its LangChain API is identical to every other
store. For FAISS or pgvector, this is the only file you edit.

**retriever.py does two things.** One, it asks the vector store for a retriever with
`search_type` similarity and k of 4. Two, a small function turns a list of `Document` into one
block of text, each passage starting with its bracketed number and source file name. That
number is the contract between the prompt and the API: the model writes `[2]`, the API knows
which file `[2]` is.

**prompts.py holds the grounded prompt.** This is text the model reads, not code, so here it
is:

```text
You answer questions about the team's internal documentation.

Rules:
- Use ONLY the context below. If it does not contain the answer, say
  "I can't find this in the docs" and suggest what to search for instead.
- End every factual sentence with the bracket number of its source, like [1] or [2].
- Keep answers short. Never invent a source number that is not in the context.

Context:
{context}
```

That is the system message; the human message is just `{question}`. Three rules, each
blocking one failure: "only the context" blocks outside knowledge, "say you can't find it"
blocks polite hallucination, "never invent a source number" blocks phantom citations.

**chain.py composes everything with LCEL, and deliberately keeps the docs.** The chain takes a
question string. Step one runs two branches side by side: the retriever fetches docs, the other
branch keeps the question; the result is a dict with two keys. Step two adds an `answer` key
to that dict through the generation branch: number the docs, fill the prompt, call the model,
pull the text out with `StrOutputParser`. Because the docs are still in the dict, the answer
function can return `sources` (number, file, title) without retrieving a second time. To
stream the answer into a UI, call `stream` instead of `invoke` on the generation branch; LCEL
handles the rest.

**cli.py and api/main.py call one function.** The RAG logic does not know whether it is being
called from a terminal or over HTTP, so testing the chain needs no server, and adding a new
front end (a Slack bot, say) is one thin file that never touches the pipeline.

### The offline flow: ingest

You run the ingest script whenever the documents change. It does five things in order, each
one a file in the tree: the loader reads `data/raw` into `Document`s; the splitter cuts them
into chunks and attaches ids; the vector store takes the list of chunks and the list of ids,
calls the embedding model to turn each chunk into a vector, then writes vector, text and
metadata into `storage/chroma`. Finally it prints one line like "42 documents -> 388 chunks"
so you notice unexpected changes to the index (the chunk count doubling after a splitter
change is a signal to look again).

### The online flow: how one question travels through the files

![Flow of one question through the docs-rag folder tree: scripts/ingest.py runs offline through loaders, chunking, embeddings and vectorstore; online, api/main.py calls generation/chain.py, which calls retrieval/retriever.py and indexing/vectorstore.py, then prompts.py and llm.py, and returns answer and sources](blog/langchain-rag-from-scratch-flow.svg)

1. A `POST /ask` request with a question reaches `api/main.py`; Pydantic validates the body and calls the answer function in `chain.py`.
2. `generation/chain.py` feeds the raw question into the parallel step; the docs branch calls the retriever.
3. `retrieval/retriever.py` asks Chroma in `indexing/vectorstore.py`; Chroma calls `embed_query` from `indexing/embeddings.py` to turn the question into a vector, then finds the k nearest vectors.
4. The four nearest chunks come back as `Document` objects, carrying `source` and `title` from the loader.
5. The numbering function in `retriever.py` turns them into a text block `[1]`..`[4]`; `generation/prompts.py` fills `{context}` and `{question}` into two messages.
6. `generation/llm.py` sends the two messages to the chat model; `StrOutputParser` pulls the text out of the `AIMessage`.
7. `chain.py` returns the answer with its sources; `main.py` serialises it as JSON.

For the question "How do we rotate the production API keys?", the result looks like this: the
answer is one or two sentences, each ending in `[1]` or `[1][3]`; the sources are three
entries, each with a number, a file name (say `runbooks/api-keys.md`) and a title. Source `[2]`
was retrieved but the model did not use it; that is normal, and it is exactly what you will
measure in the eval step (how many retrieved chunks were actually useful).

Each step is one file, and each file is one component from the table in section 2. When an
answer is wrong, you know which file to open: wrong sources, look at `retrieval/` and
`ingestion/chunking.py`; right sources but wrong answer, look at `generation/prompts.py` and
the model.

### Running, testing and extending it, in words

To run it you need four things: install the packages listed in `pyproject.toml` (langchain,
langchain-ollama, langchain-chroma, langchain-text-splitters, fastapi); pull the two Ollama
models, `llama3.1` and `nomic-embed-text`; copy your documents into `data/raw`; run the
ingest script. Then ask through the CLI, or start FastAPI and send `POST /ask` with a body
that has one field, `question`.

To test without Ollama or an API key, `langchain-core` ships two fake components:
`DeterministicFakeEmbedding` (fake but stable vectors per text) and `FakeListChatModel`
(returns scripted replies in order). `test_chain.py` swaps the two model factories in
`embeddings.py` and `llm.py` for those fakes, ingests two small files into a temporary folder,
asks one question, and checks three things: the answer contains `[1]`, the sources carry the
right file name, and no metadata was lost along the way. It runs in under a second and catches
the most common bugs.

To extend it, you edit exactly one file per change: a different model vendor is `.env`; a
different vector store is `vectorstore.py`; PDFs are `loaders.py`; a different chunking
strategy is `chunking.py` followed by a re-ingest; a new answering rule is `prompts.py`. The
`eval` folder keeps the golden questions so that after every change you know whether you made
things better or worse; [post 3](#/blog/rag-production-techniques) covers that measurement in
depth.

### The agent variant: same retriever, plus a loop

When you genuinely need agentic RAG (questions that require several lookups), the change
lives outside the existing folders: add one file, `agent.py`, that wraps the retriever as a
tool and hands it to `create_agent`. That tool, call it `search_docs`, is just a function that
takes a `query` string, calls the retriever, and returns the numbered text block; its
docstring tells the model "search the internal docs, returns passages with sources".
`create_agent` receives the model name from Settings (it must be a model that supports tool
calling), a tool list with that one entry, a `system_prompt` that says to answer only from
search results and cite `[n]`, and a checkpointer so the history is remembered per
`thread_id`. Everything in `ingestion`, `indexing` and `retrieval` is reused as is.

For a question like "compare key rotation for prod and staging", the model may call
`search_docs` twice with two different queries and then synthesise. The price: the number of
model calls is no longer fixed, and you have to read the trace to know what it searched. Keep
`agent.py` next to `chain.py` as an option, not a replacement.

### When not to use LangChain

To be fair, there are times when a framework is a burden. If your system has one model, one
vector store and one prompt, then 150 lines of Python calling the vendor SDK directly is about
as short as the LangChain version and has fewer layers to debug. The chatbot on this very
portfolio is an example: retrieval is TF-IDF running in the browser, no LangChain, because the
problem did not need it. LangChain pays off when you need to swap pieces (compare models,
change stores), want streaming, batch and async for free, want per-step tracing, or are about
to move up to agents. Pick a framework because you have the problem it solves, not because it
is popular.

## Summary

LangChain standardises the interfaces of models, embeddings, vector stores and retrievers,
and gives them a shared data type (`Document`, messages, `Runnable`) so they compose into
chains. In RAG the pieces form a straight line: loader, splitter, embeddings, store at index
time; retriever, prompt, model, parser at question time. In an agent the same pieces appear,
but the retriever becomes a tool, the chain becomes a loop, and the loop runs on LangGraph.
The `docs-rag` codebase puts each piece in one file and each stage in one folder, so reading
the tree is reading the pipeline.

But let's be honest: the `docs-rag` we just built is the "naive" version of RAG. It looks
great in a demo; with real documents and real users it starts pulling the wrong passages,
misreading vague questions, getting slower, costing more than planned, and nobody can measure
whether it is good or bad. LangChain gives you standard pieces, but it does not tell you which
piece is failing. [Post 3](#/blog/rag-production-techniques) starts from exactly there: it
walks through each stage of this pipeline, shows how it breaks, which technique fixes it, and
what to measure to know whether a fix is needed at all.
