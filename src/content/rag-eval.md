---
title: "Evaluating Small RAG Pipelines Without a Big Budget"
date: "2026-09-10"
tags: ["rag", "eval", "testing"]
summary: "A lightweight eval loop: golden questions, citation checks, and regression on every content update."
---

# Evaluating Small RAG Pipelines Without a Big Budget

You do not need an eval platform to keep RAG honest. You need **golden questions**.

## The loop

1. Write 10–20 questions with known answers from your own content.
2. After every content update (or Sync), run them and check: correct answer? correct citation?
3. Track the pass rate in a file. Regressions mean the new content broke retrieval — usually a chunking problem.

## What to measure

- **Answer accuracy**: does the response match the golden answer?
- **Citation precision**: does every claim point at a real chunk?
- **Refusal rate**: unknown questions must be refused, not invented.

Small, consistent evals beat big, occasional ones.
