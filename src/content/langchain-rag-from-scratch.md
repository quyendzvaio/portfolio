---
title: "What LangChain Is, and Building RAG From Scratch With It"
date: "2026-10-24"
tags: ["langchain", "rag", "python"]
summary: "What problem LangChain solves, how each component serves RAG and agents, then a RAG codebase whose folder tree reads like the pipeline."
---

# What LangChain Is, and Building RAG From Scratch With It

Post 1 of this series explained why LLMs need RAG: a model only knows what it was trained on,
so we retrieve the relevant passages and put them into the context, and the model answers from
evidence. This post answers the next question: *what do you write that with?* The first half
explains what LangChain was built to solve and where each of its components sits in a RAG
pipeline versus an agent. The second half builds a small RAG system that runs on your laptop,
with a folder structure that shows the pipeline at a glance.

Every API here was checked against **LangChain 1.x** at the time of writing (28 Oct 2026, per
PyPI): `langchain` 1.4.7, `langchain-core` 1.7.1, `langgraph` 1.2.18,
`langchain-text-splitters` 1.1.3, `langchain-chroma` 1.1.0, `langchain-ollama` 1.1.0,
`langchain-openai` 1.7.3. Python 3.10 or newer. I am explicit about this because LangChain's
import paths changed a lot between 0.x and 1.x; code copied from older posts often no longer
runs.

## 1. What problem LangChain was built to solve

Picture writing RAG with no framework. You need to: call a model provider's API (OpenAI,
Anthropic, Google, or Ollama running locally), each with its own request and response format;
read PDF, Markdown and HTML; cut text into pieces; call a separate embedding API; write vectors
into a database; write a search function; assemble a prompt; parse the result. That is a lot
of glue code. Then one day you want to swap GPT for Claude to compare, or move the vector store
from Chroma to Postgres, and you discover the glue is welded to the old vendor.

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

```python
from langchain.chat_models import init_chat_model

llm = init_chat_model("ollama:llama3.1", temperature=0)   # local
# llm = init_chat_model("openai:gpt-5.5", temperature=0)  # hosted
reply = llm.invoke("Explain embeddings in one sentence.")
print(reply.content)
```

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

```python
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "Answer only from the context below. Cite [n].\n\n{context}"),
    ("human", "{question}"),
])
messages = prompt.invoke({"context": "...", "question": "..."}).to_messages()
```

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

- **In RAG:** decides retrieval quality more than anything else; post 3 goes deep on it.
- **In an agent:** no role at run time, unless the agent indexes new documents itself.

### Embeddings

An embedding is a list of numbers that captures the meaning of a text, so two passages with
similar meaning get two nearby vectors. The interface has two methods:
`embed_documents(list[str])` at index time and `embed_query(str)` at question time.
Construct one with `init_embeddings("provider:model")`, the same style as chat models.

```python
from langchain.embeddings import init_embeddings

emb = init_embeddings("ollama:nomic-embed-text")
# emb = init_embeddings("openai:text-embedding-3-small")
vec = emb.embed_query("rotate API keys")
print(len(vec))  # dimensions, e.g. 768
```

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

```python
from langchain.tools import tool

@tool
def search_docs(query: str) -> str:
    """Search the internal docs. Returns numbered passages with their sources."""
    return format_docs(retriever.invoke(query))
```

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
the graph yourself. Post 4 of the series is about exactly that.

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

### The folder structure

Naming rule: each folder is a stage of the pipeline, each file is one LangChain component.
Someone new to the project only needs this tree to know which way the data flows.

```text
docs-rag/
├── pyproject.toml            # deps: langchain, langchain-chroma, langchain-ollama...
├── .env.example              # CHAT_MODEL, EMBEDDING_MODEL (provider:model)
├── data/
│   └── raw/                  # source documents (.md); git-tracked
├── storage/
│   └── chroma/               # persisted Chroma index; gitignored, rebuilt by ingest
├── src/docs_rag/
│   ├── config.py             # Settings: model names, paths, chunk_size, top_k
│   ├── ingestion/            # STAGE 1: sources -> Document -> chunks
│   │   ├── loaders.py        #   Document loader: .md -> Document(page_content, metadata)
│   │   └── chunking.py       #   Text splitter: Document -> chunks, with stable chunk_id
│   ├── indexing/             # STAGE 2: chunks -> vectors -> store
│   │   ├── embeddings.py     #   init_embeddings(settings.embedding_model)
│   │   └── vectorstore.py    #   Chroma: add_documents / similarity_search, persisted
│   ├── retrieval/            # STAGE 3: question -> top-k chunks
│   │   └── retriever.py      #   as_retriever(k) + format_docs() -> [n] for citations
│   ├── generation/           # STAGE 4: chunks + question -> answer
│   │   ├── prompts.py        #   grounded ChatPromptTemplate that requires citations
│   │   ├── llm.py            #   init_chat_model(settings.chat_model)
│   │   └── chain.py          #   LCEL: retriever | prompt | model | parser, plus sources
│   ├── api/
│   │   └── main.py           # FastAPI: POST /ask -> {answer, sources}
│   └── cli.py                # python -m docs_rag.cli ask "question"
├── scripts/
│   └── ingest.py             # offline: load -> split -> embed -> store
├── eval/
│   ├── golden.jsonl          # question, expected answer, expected source
│   └── run_eval.py           # retriever hit rate, citation checks
└── tests/
    ├── test_chunking.py      # splitter yields right-sized chunks with full metadata
    └── test_chain.py         # run the chain with fake embeddings + a fake chat model
```

`ingestion` and `indexing` only run offline (when the documents change). `retrieval` and
`generation` run for every question. The split guarantees that the per-request path never
imports file-reading or chunking code.

### Install

```bash
uv init docs-rag && cd docs-rag
uv add langchain langchain-ollama langchain-chroma langchain-text-splitters \
       fastapi "uvicorn[standard]"
# optional: uv add langchain-openai   (to switch to OpenAI via env)
ollama pull llama3.1
ollama pull nomic-embed-text
```

### config.py: one place for every parameter

```python
# src/docs_rag/config.py
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    # "provider:model" strings, understood by init_chat_model / init_embeddings.
    chat_model: str = os.getenv("CHAT_MODEL", "ollama:llama3.1")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "ollama:nomic-embed-text")
    raw_dir: Path = ROOT / "data" / "raw"
    chroma_dir: Path = ROOT / "storage" / "chroma"
    collection: str = "docs"
    chunk_size: int = 800      # characters
    chunk_overlap: int = 120   # ~15%, so a sentence cut in half still appears whole once
    top_k: int = 4


settings = Settings()
```

Set `CHAT_MODEL=openai:gpt-5.5` in `.env` and the whole system runs on OpenAI; no other file
knows about it. That is the "standard interfaces" benefit from section 1, made visible.

### ingestion/loaders.py: sources into Documents

```python
# src/docs_rag/ingestion/loaders.py
from collections.abc import Iterator
from pathlib import Path

from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document


class MarkdownDirLoader(BaseLoader):
    """One Document per .md file; metadata carries source and title for citations."""

    def __init__(self, root: Path, glob: str = "**/*.md") -> None:
        self.root, self.glob = root, glob

    def lazy_load(self) -> Iterator[Document]:
        for path in sorted(self.root.glob(self.glob)):
            text = path.read_text(encoding="utf-8")
            title = next(
                (line[2:] for line in text.splitlines() if line.startswith("# ")),
                path.stem,
            )
            yield Document(
                page_content=text,
                metadata={"source": str(path.relative_to(self.root)), "title": title},
            )
```

You only define `lazy_load`; `load()` is inherited from `BaseLoader` and collects the list.
For PDFs, swap this class for `DoclingLoader` from `langchain-docling` (keeps tables and
headings) or `PyPDFLoader` from `langchain-community` if you accept the sunset package. The
rest of the pipeline does not change, because everything else only sees `Document`.

### ingestion/chunking.py: Documents into chunks with stable ids

```python
# src/docs_rag/ingestion/chunking.py
import hashlib

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from docs_rag.config import settings


def split(docs: list[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        add_start_index=True,  # metadata["start_index"] = char offset in the source file
    )
    chunks = splitter.split_documents(docs)
    for chunk in chunks:
        # id = hash(source, start_index): re-ingesting never duplicates rows in the store
        key = f"{chunk.metadata['source']}:{chunk.metadata['start_index']}"
        chunk.metadata["chunk_id"] = hashlib.sha1(key.encode()).hexdigest()[:16]
    return chunks
```

That `chunk_id` matters more than it looks. Call `add_documents` without `ids` and every
ingest run adds another copy of every chunk, until the retriever returns four copies of the
same passage. With stable ids, Chroma upserts: run ingest ten times and you still have one
set.

### indexing/embeddings.py and indexing/vectorstore.py

```python
# src/docs_rag/indexing/embeddings.py
from functools import lru_cache

from langchain.embeddings import init_embeddings
from langchain_core.embeddings import Embeddings

from docs_rag.config import settings


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    return init_embeddings(settings.embedding_model)
```

```python
# src/docs_rag/indexing/vectorstore.py
from functools import lru_cache

from langchain_chroma import Chroma

from docs_rag.config import settings
from docs_rag.indexing.embeddings import get_embeddings


@lru_cache(maxsize=1)
def get_vector_store() -> Chroma:
    return Chroma(
        collection_name=settings.collection,
        embedding_function=get_embeddings(),
        persist_directory=str(settings.chroma_dir),  # drop this line = in-memory only
    )
```

I picked Chroma because it persists to a folder without a server, handles tens of thousands
of chunks comfortably, and its LangChain API is identical to every other store. For FAISS,
replace the function body with `FAISS(embedding_function=..., index=faiss.IndexFlatL2(dim),
docstore=InMemoryDocstore(), index_to_docstore_id={})` and remember `save_local` and
`load_local`. For Postgres, `PGVector` from `langchain-postgres`. No other file changes.

### scripts/ingest.py: wiring stages 1 and 2

```python
# scripts/ingest.py
from docs_rag.config import settings
from docs_rag.indexing.vectorstore import get_vector_store
from docs_rag.ingestion.chunking import split
from docs_rag.ingestion.loaders import MarkdownDirLoader


def main() -> None:
    docs = MarkdownDirLoader(settings.raw_dir).load()      # loader
    chunks = split(docs)                                   # splitter
    store = get_vector_store()                             # embeddings + store
    store.add_documents(chunks, ids=[c.metadata["chunk_id"] for c in chunks])
    print(f"{len(docs)} documents -> {len(chunks)} chunks -> {settings.chroma_dir}")


if __name__ == "__main__":
    main()
```

This script is the whole indexing phase in six meaningful lines. `add_documents` calls the
embedding model's `embed_documents` for you and writes vectors plus metadata into Chroma.

### retrieval/retriever.py: question into numbered top-k chunks

```python
# src/docs_rag/retrieval/retriever.py
from langchain_core.documents import Document

from docs_rag.config import settings
from docs_rag.indexing.vectorstore import get_vector_store


def get_retriever():
    # A Runnable: str in, list[Document] out; plugs straight into the chain
    return get_vector_store().as_retriever(
        search_type="similarity", search_kwargs={"k": settings.top_k}
    )


def format_docs(docs: list[Document]) -> str:
    """Number passages [1]..[k] so the model can cite and the API can map back."""
    parts = []
    for i, doc in enumerate(docs, start=1):
        src = doc.metadata.get("source", "?")
        parts.append(f"[{i}] ({src})\n{doc.page_content}")
    return "\n\n".join(parts)
```

`format_docs` is where you decide what the model "sees" as context. The bracketed number is
the contract between the prompt and the API: the model writes `[2]`, the API knows which file
`[2]` is.

### generation/prompts.py: a grounded prompt that cites

```python
# src/docs_rag/generation/prompts.py
from langchain_core.prompts import ChatPromptTemplate

SYSTEM = """You answer questions about the team's internal documentation.

Rules:
- Use ONLY the context below. If it does not contain the answer, say
  "I can't find this in the docs" and suggest what to search for instead.
- End every factual sentence with the bracket number of its source, like [1] or [2].
- Keep answers short. Never invent a source number that is not in the context.

Context:
{context}"""

RAG_PROMPT = ChatPromptTemplate.from_messages([
    ("system", SYSTEM),
    ("human", "{question}"),
])
```

Three rules, each blocking one failure: "only the context" blocks outside knowledge, "say you
can't find it" blocks polite hallucination, "never invent a source number" blocks phantom
citations.

### generation/llm.py and generation/chain.py: composed with LCEL

```python
# src/docs_rag/generation/llm.py
from functools import lru_cache

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from docs_rag.config import settings


@lru_cache(maxsize=1)
def get_llm() -> BaseChatModel:
    return init_chat_model(settings.chat_model, temperature=0)
```

```python
# src/docs_rag/generation/chain.py
from functools import lru_cache

from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import (
    RunnableLambda, RunnableParallel, RunnablePassthrough,
)

from docs_rag.generation.llm import get_llm
from docs_rag.generation.prompts import RAG_PROMPT
from docs_rag.retrieval.retriever import format_docs, get_retriever


@lru_cache(maxsize=1)
def build_chain():
    # Generation branch: dict{docs, question} -> prompt -> model -> str
    generate = (
        RunnableLambda(
            lambda x: {"context": format_docs(x["docs"]), "question": x["question"]}
        )
        | RAG_PROMPT
        | get_llm()
        | StrOutputParser()
    )
    # Full chain: keep docs so we can return sources, add an "answer" key
    return (
        RunnableParallel(docs=get_retriever(), question=RunnablePassthrough())
        | RunnablePassthrough.assign(answer=generate)
    )


def answer_question(question: str) -> dict:
    out = build_chain().invoke(question)
    return {
        "answer": out["answer"],
        "sources": [
            {"n": i, "source": d.metadata["source"], "title": d.metadata.get("title")}
            for i, d in enumerate(out["docs"], start=1)
        ],
    }
```

Read the chain top to bottom: `RunnableParallel` takes the question string, runs two branches
side by side (the retriever fetches docs, the passthrough keeps the question) and produces the
dict `{docs, question}`. `assign(answer=generate)` keeps that dict and adds an `answer` key
by running the `generate` branch. Because `docs` is still in the dict, `answer_question` can
return the sources without retrieving a second time. To stream the answer into a UI, call
`.stream` instead of `.invoke` on the `generate` branch; LCEL already handles the rest.

### cli.py and api/main.py

```python
# src/docs_rag/cli.py
import argparse
import json

from docs_rag.generation.chain import answer_question


def main() -> None:
    parser = argparse.ArgumentParser(prog="docs-rag")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ask").add_argument("question")
    args = parser.parse_args()
    print(json.dumps(answer_question(args.question), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

```python
# src/docs_rag/api/main.py
from fastapi import FastAPI
from pydantic import BaseModel

from docs_rag.generation.chain import answer_question

app = FastAPI(title="docs-rag")


class AskRequest(BaseModel):
    question: str


@app.post("/ask")
def ask(req: AskRequest) -> dict:
    return answer_question(req.question)
```

Both entry points call one function. The RAG logic does not know whether it is being called
from a terminal or over HTTP, so testing the chain needs no server.

### Running it

```bash
cp .env.example .env                       # keep the Ollama defaults
cp -r ~/team-docs/*.md data/raw/
uv run python scripts/ingest.py            # 42 documents -> 388 chunks -> storage/chroma
uv run python -m docs_rag.cli ask "How do we rotate the production API keys?"
uv run uvicorn docs_rag.api.main:app --reload
curl -X POST localhost:8000/ask -H 'content-type: application/json' \
     -d '{"question": "How do we rotate the production API keys?"}'
```

The output looks like:

```json
{
  "answer": "Rotate keys in the admin console, then redeploy the gateway [1][3].",
  "sources": [
    {"n": 1, "source": "runbooks/api-keys.md", "title": "API key rotation"},
    {"n": 2, "source": "onboarding/access.md", "title": "Getting access"},
    {"n": 3, "source": "runbooks/gateway.md", "title": "Gateway deploys"}
  ]
}
```

Source `[2]` was retrieved but the model did not use it; that is normal, and it is exactly
what you will measure in the eval step (how many retrieved chunks were actually useful).

### How one question travels through the files

![Flow of one question through the docs-rag folder tree: scripts/ingest.py runs offline through loaders, chunking, embeddings and vectorstore; online, api/main.py calls generation/chain.py, which calls retrieval/retriever.py and indexing/vectorstore.py, then prompts.py and llm.py, and returns answer and sources](blog/langchain-rag-from-scratch-flow.svg)

1. `POST /ask` reaches `api/main.py`; Pydantic validates the body and calls `answer_question`.
2. `generation/chain.py` feeds the raw question into `RunnableParallel`; the `docs` branch calls the retriever.
3. `retrieval/retriever.py` asks Chroma in `indexing/vectorstore.py`; Chroma calls `embed_query` from `indexing/embeddings.py` to turn the question into a vector.
4. The four nearest chunks come back as `Document` objects, carrying `source` and `title` from the loader.
5. `format_docs` numbers them `[1]`..`[4]`; `generation/prompts.py` fills `{context}` and `{question}` into two messages.
6. `generation/llm.py` sends the messages to the chat model; `StrOutputParser` pulls the text out of the `AIMessage`.
7. `chain.py` returns `{answer, sources}`; `main.py` serialises it as JSON.

Each step is one file, and each file is one component from the table in section 2. When an
answer is wrong, you know which file to open: wrong sources, look at `retrieval/` and
`ingestion/chunking.py`; right sources but wrong answer, look at `generation/prompts.py` and
the model.

### Testing with fake components

`langchain-core` ships fakes so you can test the chain without Ollama or an API key:
`DeterministicFakeEmbedding` (fake but stable vectors per text) and `FakeListChatModel`
(returns scripted replies in order). Because `get_llm` and `get_embeddings` are module-level
functions, a test only needs to monkeypatch them.

```python
# tests/test_chain.py
from langchain_core.embeddings import DeterministicFakeEmbedding
from langchain_core.language_models.fake_chat_models import FakeListChatModel


def test_answer_carries_sources(monkeypatch, tmp_path):
    monkeypatch.setattr("docs_rag.indexing.embeddings.get_embeddings",
        lambda: DeterministicFakeEmbedding(size=64))
    monkeypatch.setattr("docs_rag.generation.llm.get_llm",
        lambda: FakeListChatModel(responses=["Rotate in the console [1]."]))
    # ... ingest 2 small files under tmp_path, then:
    from docs_rag.generation.chain import answer_question
    out = answer_question("how to rotate keys")
    assert "[1]" in out["answer"] and out["sources"][0]["source"].endswith(".md")
```

This runs in under a second and catches the most common bugs: metadata lost along the way,
`format_docs` numbering drift, the chain returning a missing key.

### The agent variant: same retriever, plus a loop

When you genuinely need agentic RAG (questions that require several lookups), the change
lives outside the existing folders: wrap the retriever as a tool and hand it to
`create_agent`. Everything in `ingestion`, `indexing` and `retrieval` is reused as is.

```python
# src/docs_rag/agent.py  (optional)
from langchain.agents import create_agent
from langchain.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

from docs_rag.config import settings
from docs_rag.retrieval.retriever import format_docs, get_retriever


@tool
def search_docs(query: str) -> str:
    """Search the team's internal docs. Returns numbered passages with sources."""
    return format_docs(get_retriever().invoke(query))


agent = create_agent(
    model=settings.chat_model,          # needs a model that supports tool calling
    tools=[search_docs],
    system_prompt="Answer only from search_docs. Cite [n]. Search again if needed.",
    checkpointer=InMemorySaver(),       # history per thread_id
)

question = "Compare key rotation for prod and staging."
result = agent.invoke(
    {"messages": [{"role": "user", "content": question}]},
    {"configurable": {"thread_id": "demo"}},
)
print(result["messages"][-1].content)
```

The model may call `search_docs` twice with two different queries and then synthesise. The
price: the number of model calls is no longer fixed, and you have to read the trace to know
what it searched. Keep `agent.py` next to `chain.py` as an option, not a replacement.

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

The next post is about where this system breaks on real data: chunks cut in the wrong place,
the retriever fetching the wrong passage, answers that "sound right", and the techniques that
fix each one, together with how to measure whether a fix is needed at all.
