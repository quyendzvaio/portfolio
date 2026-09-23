---
title: "RAG From Scratch: Chunking Is All You Need (Almost)"
date: "2026-08-20"
tags: ["rag", "llm", "retrieval"]
summary: "How chunk size, overlap, and hybrid scoring shape answer quality in a client-side RAG pipeline."
---

# RAG From Scratch: Chunking Is All You Need (Almost)

Retrieval-augmented generation lives or dies at **chunking time**, not at generation time. A great model cannot cite what retrieval never found.

## Chunk size

For technical blogs, **100–150 words per chunk** with ~25% overlap is a solid default. Smaller chunks raise precision; larger chunks keep context. Measure both.

## Hybrid scoring

Pure vector search misses exact terms like function names and error codes. Combine:

1. **Keyword/TF-IDF score** — catches exact matches (`Error 429`, `useEffect`).
2. **Title boost** — a match in the title outweighs a match in the body.
3. **Recency** — newer posts win ties on fast-moving topics.

## Rerank, then cite

Retrieve top-10 cheaply, rerank to top-3 carefully, and always attach **citations**. An uncited RAG answer is just a guess with extra steps.
