---
title: "Prompt Engineering for Grounded Answers"
date: "2026-09-02"
tags: ["prompting", "llm", "rag"]
summary: "System-prompt patterns that keep a portfolio chatbot inside its knowledge base."
---

# Prompt Engineering for Grounded Answers

A RAG chatbot needs a system prompt that enforces **grounding**: answer only from the provided context, cite sources, refuse the rest.

## The pattern

- State the role: "You answer questions about this portfolio and its blog posts."
- Paste retrieved chunks as `Context:` with source labels.
- Add the rule: "If the answer is not in the context, say so and suggest what to ask instead."
- Require citations: every factual claim points at `[source title]`.

## Failure modes

- **Context stuffing**: too many chunks drowns the signal. Top-3 beats top-10.
- **Polite hallucination**: models would rather invent than refuse. The explicit refuse-rule fixes most of it.
- **Stale context**: re-sync the index every time content changes — hence the Sync button.
