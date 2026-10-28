---
title: "Harness engineering: an agent is an LLM plus a harness"
date: "2026-10-28"
tags: ["agents", "harness", "llmops"]
summary: "Why a strong LLM still fails long tasks, what a harness is made of, and how to design a research agent whose folder tree shows the agent and the harness at a glance."
---

# Harness engineering: an agent is an LLM plus a harness

The last four posts went from RAG to LangChain, LangGraph and MCP. By now you know how to give a
model documents, let it call tools, branch on state, and plug tools in through a shared protocol.
This final post answers the question that is left: why an agent built from all those parts still
fails when it has to run for a long time, and what turns "an LLM that can call tools" into "a
system that finishes the job".

## Same model, very different outcomes

In early 2026 an Anthropic engineer ran one prompt ("build a 2D retro game maker") with one model
(Claude Opus 4.5) in two ways. First: the model alone, no support. After 20 minutes and 9 USD the
app opened, but the entities did not respond to input. Second: the same model inside a harness of
three roles (a planner that expands the prompt into a spec, a generator that builds one feature at
a time, an evaluator that clicks through the app like a user). After 6 hours and 200 USD the author
could actually play the game, rough physics and all. His own words: the harness was over 20 times
more expensive, but the difference in quality was immediately apparent. Source:
[Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps).

The model did not change. What changed was everything *around* the model. That is the harness.

You will meet this sooner than you expect. Give an agent a 30-minute job: it starts well, reads
files, writes code, looks productive. Then it skips a step, breaks a test, reports "done" while
nothing runs, and the next session remembers none of it. Most people's first reflex is "the model
is not smart enough, try a more expensive one". The
[learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering) course by
walkinglabs opens with the opposite advice: when things fail, check the harness first, swap the
model last.

## Agent = LLM + harness

The formula is short enough to pass for a slogan, so let us be precise about where it comes from.
The term *harness engineering* was used by Mitchell Hashimoto in
[My AI adoption journey](https://mitchellh.com/writing/my-ai-adoption-journey) (February 2026) with
a very practical definition: whenever an agent makes a mistake, you take the time to engineer a
fix so it *never* makes that mistake again, through instructions in `AGENTS.md` or through real
tools. The equation "Agent = Model + Harness" was written down by Vivek Trivedy in LangChain's
[The anatomy of an agent harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness)
(March 2026), with the definition: a harness is *every piece of code, configuration and execution
logic that is not the model itself*. Anthropic does not use the formula, but calls the Claude Agent
SDK "a general-purpose agent harness" in
[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents),
and back in late 2024 described agents in
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) as
"LLMs using tools based on environmental feedback in a loop". That loop and that environment *are*
the harness; it just had no name yet.

So what is a harness, in plain words? If the model is the *brain*, the harness is everything else
the brain needs to get work done: the loop that calls the model and then runs its tools, the tools
and their descriptions, context management (what the model gets to see at each step), memory and
state outside the context, the runtime environment (sandbox, limits), permissions and guardrails
(what it may and may not do), verification and feedback (how we know it is right), observability
(traces, logs, evals) and recovery (what happens after a failure).

A familiar picture: you hire a brilliant engineer. On day one you say "add search" and walk into a
meeting. No README, no one tells them how to run the tests, no one explains the team's conventions,
no one reviews. They are still brilliant, but they will guess the requirement wrong, pick the wrong
library, and confidently report done because nothing lets them check. The same person with a clear
brief, a machine that is already set up, a checklist of what "done" means, just enough access, and
an independent reviewer ships something usable. The course uses exactly this image in
[lecture 02](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md),
and adds a point that matters: an agent is worse off than a new hire, because the new hire can at
least ask a colleague. The agent sees only the files you put in front of it and the commands you
let it run.

![Agent = LLM + harness: the model in the centre, nine harness components around it, connected by the loop that calls the model and runs tools](blog/harness-engineering-agent-anatomy.svg)

What does the harness give the agent? Five things, each matching a typical failure:

- **Endurance on long work.** Real tasks span many context windows and many sessions; without state outside the context, every session starts from zero.
- **Staying on track.** Agents try to do too much at once or quietly change the goal; the harness holds the scope and the definition of done.
- **Not repeating mistakes.** Every failure becomes a rule or an automatic check, in Hashimoto's spirit.
- **Safety.** Permissions, sandbox, spending limits: the agent can only do what you allow.
- **Measurability.** Traces and evals turn "it feels fine" into numbers, so you know which change actually helped.

One sentence from Anthropic's harness article is worth keeping: *every component in a harness
encodes an assumption about what the model cannot do on its own*. As models improve, some parts
become redundant (the author dropped context resets with Opus 4.5 and sprints with Opus 4.6), but
the space of useful harness designs does not shrink, it *moves*. A harness is therefore not
something you write once; it is code, and it rots like code.

## The components of a harness

learn-harness-engineering (14 lectures, 8 projects, all built around coding agents) gives a
five-subsystem framework. Interestingly the course names it two ways. The README splits by *what
the harness has to do*: Instructions, State, Verification, Scope, Session lifecycle. Lecture 02
splits by *technical layer*: Instructions, Tools, Environment, State, Feedback. The two complement
each other, so below I merge them into eight components, each answering three questions: what it
holds, what failure it prevents, and a concrete example. Context gets its own row because the
course treats it as a separate subsystem when it dissects Claude Code, and because it is where
long-running research agents die most often.

| Component | What it holds | Failure it prevents |
|---|---|---|
| Instructions | system prompt, AGENTS.md, definition of done | guessed requirements, broken unwritten conventions |
| Tools | tools + descriptions, schemas, MCP server | cannot act, or acts the wrong way |
| Environment | sandbox, versions, allow-lists | burning context on environment errors |
| Context | compaction, notes, sub-agents | context rot, forgetting mid-task |
| State | progress file, feature list, git | next session restarts from scratch |
| Scope | one task at a time, WIP=1 | many things started, none finished |
| Verification | tests, checkers, independent evaluator | confident "done" that is not done |
| Observability | traces, rubrics, evals | cannot fix what you cannot see |

### Instructions: a map, not an encyclopedia

Holds: the system prompt, the instruction file at the repo root (`AGENTS.md` or `CLAUDE.md`), and a
*definition of done* that a command can check. Prevents: the two top failures in the course's
lecture 01, vague requirements (the agent can only guess) and unwritten conventions (the agent
cannot follow a rule it has never seen). Example: replace "add search" with "endpoint
`GET /api/search?q=`, 20 per page, passes `pytest` and `mypy --strict`". Lecture 04 stresses that a
giant file backfires; keep `AGENTS.md` around 100 lines as a table of contents, and put details in
`docs/` for the agent to read on demand. Anthropic's
[context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
post calls this the "right altitude" for a prompt: specific enough to guide, flexible enough to let
the model handle the situation, no brittle hardcoded logic.

### Tools: a contract between deterministic systems and a non-deterministic agent

Holds: the tools, their descriptions, their parameter schemas, and how they are exposed (possibly
over MCP, as in post 5). Prevents: the agent having no way to act, or so many overlapping tools
that it picks the wrong one. Anthropic's
[Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
defines a tool as "a contract between deterministic systems and non-deterministic agents" and
draws a few rules: a few tools aimed at real workflows beat a wrapper per endpoint;
`search_contacts` beats `list_contacts` because context is finite; return high-signal information
(drop UUIDs, drop mime types); offer a `response_format` so the model can choose concise or detailed;
error messages must say *how to fix it*, not just "wrong". The course adds least privilege: do not
turn off the shell "for safety" so the agent cannot install anything, but do not open everything
either.

### Environment: self-describing surroundings

Holds: where the agent runs, runtime versions, locked dependencies, sample data, and limits
(network, time, memory). Prevents: the agent burning its context window on failed `pip install`
and version conflicts instead of the real task. Example from lecture 06: make *initialization* its
own phase with an `init.sh` (install, verify, start) and a readiness checklist of four items: can
start, can test, can see progress, knows the next step. For a research agent the environment also
means an allow-list of fetchable domains and a size cap per page, so a hostile web page cannot
become a prompt injection that hijacks the agent.

### Context: a finite resource with diminishing returns

Holds: the policy for *what sits in the context window at each step*. Prevents: *context rot*, the
model recalling less as the context grows, and the agent "running out of breath" mid-task.
Anthropic treats context as a finite attention budget; the goal is *the smallest set of tokens with
the highest signal*. Three techniques for long work: **compaction** (summarize the history, keep
architectural decisions, open bugs and implementation details, drop redundant tool output; the
lightest and safest form is clearing old tool results), **structured note-taking** (the agent writes
`NOTES.md` outside the context and reads it back), and **sub-agents** (each sub-task runs in a clean
context and returns a 1-2 thousand token summary). When the course dissects Claude Code it finds a
multi-stage compaction pipeline: lossless pruning first, structured distillation next, LLM
summaries last, with circuit breakers against over-compaction.

### State: memory that lives outside the context

Holds: a progress file, a task list with states, git history, a handoff note. Prevents: losing
continuity between sessions, redoing finished work, or "looking around, seeing progress, and
declaring the whole project done" (a failure Anthropic records verbatim). Anthropic's example: an
`init.sh`, a `claude-progress.txt` logging what was done, a `feature_list.json` with over 200
features all starting as `failing`, where the agent may only flip the `passes` field and must never
delete or edit tests. They chose JSON over Markdown because the model is less likely to rewrite
JSON on its own. The course (lecture 08) calls each list item a triple *(behaviour description,
verification command, state)*, and rules that a state moves to `passing` only when the verification
command succeeds, executed by the harness, not written by the agent.

### Scope: one thing at a time

Holds: a limit on open work (WIP, work in progress) and the boundary of each task, written to a
file. Prevents: the twin failures lecture 07 calls *overreach* and *under-finish*. Example:
Anthropic asked its coding agent to work on one feature per session and found this critical against
the urge to "one-shot the app". The course measured it: with the same eight features, the
unconstrained mode left three half-done; WIP=1 finished seven after four sessions. Lines of code and
completion rate were negatively correlated.

### Verification: confidence is not correctness

Holds: verification commands, automatic checkers, and an evaluator *separate from* the maker.
Prevents: the most common failure of all, *declaring victory early*. Lecture 09 calls it the
verification gap, the distance between the agent's confidence and actual correctness, and proposes
three layers: syntax passes, behaviour passes (tests run, the app starts), system passes
(end-to-end). Anthropic learned the same lesson the hard way: unit tests and `curl` passed while the
app broke in real use; only when the agent was told to use browser automation and "test as a human
user would" did results improve sharply. And because a generator tends to praise its own work, they
split out an evaluator with hard thresholds per criterion. Lecture 13 of the course turns this into
a principle: *the maker and the checker must be separate*, sometimes two different models.

### Observability: you cannot fix what you cannot see

Holds: a trace of every step (which tool, which input, how many tokens), runtime logs, scoring
rubrics, and an eval suite. Prevents: blind retries, gut-feeling evaluation, and handoffs that lose
information. Lecture 11 splits it in two layers: *runtime observability* answers "what did the
system do", *process observability* answers "why should this change be accepted" (sprint contracts,
rubrics). Anthropic's
[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
supplies the vocabulary: a *task* (one test case), a *trial* (one run), a *grader* (scoring logic),
a *transcript* (the full record), an *outcome* (the final state of the environment, not what the
agent claims). Its most valuable advice: grade the *result*, not the *path*; use code graders where
possible, LLM graders where necessary, humans where it really matters; and do not trust a score
until you have read transcripts. Nor should you wait: 20 to 50 tasks drawn from real failures is a
good start.

Finally, how to *choose* components: hold the model fixed, remove one component at a time, and see
which removal hurts most. The course tells of a team using the same GPT-4o on a 20,000-line React
project: README only, 1 run in 5 succeeded; add `AGENTS.md`, 60%; add verification commands, 80%;
add a progress file, stable at 80 to 100%. Four rounds, no model change. But ablation only says
"which component is worth most right now", not "where the bottleneck is"; for that you have to
read the failure logs and attribute each failure to a layer.

## A real case: a research agent with a complete harness

Time for a concrete system. I chose a research agent because it is long enough to expose every
weakness: it takes a question, plans, finds sources, reads, takes notes, then synthesizes a report
with citations, across a few dozen steps. Without a harness, this kind of agent invents URLs, cites
pages it never opened, reads 40 pages and forgets the first 30, and stops when it "feels" done.

The worked question for this section: *"What measured evidence shows that changing the harness,
not the model, changes an agent's results?"*

### System flow

![Research agent flow: question in, plan, a search-fetch-note loop behind a policy gate, synthesize, citation verification, and the harness components under the loop](blog/harness-engineering-research-flow.svg)

Read the top row first: a question comes in, the model plans (which sub-questions, which sources
are trustworthy), enters the *search, read, note* loop until it has enough, synthesizes a draft, and
submits it to the verifiers. If verification fails the draft goes back to synthesis (or back to
search for more sources); if it passes, a report comes out. The bottom row is the harness: every
tool call passes a policy gate; context is compacted when it crosses a threshold; progress and notes
are written to disk after every step; each step is traced; a budget and stop conditions wrap the
whole loop. The model decides *what to do next*; the harness decides *within which frame*, and
*when it counts as done*.

### The folder tree: agent and harness visible at a glance

The code below uses the Anthropic Python SDK 2.x (calling the Messages API directly, with a
hand-written loop so every harness component is visible) and the MCP Python SDK 2.x for the tools.
If you use LangGraph as in post 4, each box in the diagram becomes a node and the graph state
replaces `progress.json`; the harness components stay the same, they just move house.

```text
research-agent/
├── AGENTS.md                 # the agent's map: goal, citation rules, verify commands
├── config.yaml               # model, budgets, compaction threshold, domain allow-list
├── run.py                    # entry point: python run.py "question" [--resume RUN_ID]
├── agent/                    # what the "brain" uses: the loop and the prompts
│   ├── loop.py               # call model -> run tools -> save state; stop conditions
│   ├── prompts/
│   │   ├── system.md         # role, plan-search-read-note-synthesize, report format
│   │   └── compaction.md     # history-summary prompt: what to keep, what to drop
│   └── report_schema.py      # report structure: paragraphs + [n] + source list
├── tools/                    # what the agent can do (can be wrapped as MCP)
│   ├── registry.py           # ToolSpec: name, description, schema, fn, policy flags
│   ├── search.py             # web search: domain filter, compact title+url+snippet
│   ├── fetch.py              # page -> clean text, truncated to a cap, raw copy saved
│   ├── notes.py              # structured notes: claim, quote, url
│   ├── submit_report.py      # runs verifiers; returns errors for the model to fix
│   └── mcp_server.py         # exposes the tools above over MCP for other agents to reuse
├── harness/                  # what governs the loop, independent of the model
│   ├── context.py            # compaction: clear old tool_results, then summarize
│   ├── state.py              # progress.json + notes.md: load, save, resume, handoff
│   ├── policy.py             # permission gate: which tool, which domain, how many times
│   ├── sandbox.py            # network/time/size limits for fetch
│   ├── budget.py             # counts tokens, steps, money; decides when to stop
│   ├── tracing.py            # trace.jsonl: every step, tool call, usage, verdict
│   └── verifiers/
│       ├── citations.py      # every claim has [n]; every [n] points to a fetched URL
│       └── structure.py      # all sections present, minimum sources, no empty paragraphs
├── evals/
│   ├── tasks.jsonl           # 30 questions from real failures + grading criteria
│   ├── graders.py            # code graders (required domains, every claim sourced)
│   └── run_evals.py          # k trials per task, pass@k and pass^k, keeps transcripts
└── runs/
    └── 2026-10-28_harness-evidence/
        ├── progress.json     # current step, plan, URLs opened, status
        ├── notes.md          # notes the agent wrote, re-read after compaction
        ├── sources/          # raw copy of each page, so verifiers can check quotes
        ├── trace.jsonl       # trace of this run
        └── report.md         # final report, exists only once the verifiers pass
```

`agent/` and `tools/` are what every demo shows. `harness/` is what separates a demo from a system,
and it imports nothing from the model: swap the model or the framework and `harness/` still works.
`evals/` and `runs/` are the evidence; without them you only have a feeling.

### Walking one question through the system

Run `python run.py "What measured evidence shows that changing the harness, not the model, changes
an agent's results?"`. `state.py` creates the run folder, a `progress.json` with `step: 0`, and the
tracer opens `trace.jsonl`. At step 0 the model receives the system prompt (from `system.md`, plus
a condensed state from `progress.json`) and plans: three sub-questions (controlled experiments with
the same model, benchmarks before and after a harness change, ablation studies) and the preferred
source types (vendor engineering blogs, repos, papers). The plan is written to `progress.json`; from
now on it is what the model re-reads after every compaction.

Steps 1 to 4: the model calls `search` for each sub-question. Every call passes through
`policy.py`: `search` is read-only and allowed, but the results are filtered by the domain
allow-list in `config.yaml`. The tool returns at most eight hits, each just a title, a URL and a
snippet; no HTML, no stray metadata. The model picks three URLs and calls `fetch`. `sandbox.py`
caps each page at 200 KB and 15 seconds, saves the raw copy under `sources/`, and returns clean
truncated text with a line "truncated at 60%, use `offset` to continue" if the page is long. After
reading a page the model calls `write_note` with three fields: claim (one sentence), quote (short,
verbatim), url. `notes.py` appends to `notes.md` and marks the URL as read in `progress.json`.

Step 12: `budget.py` reports that the estimated context has crossed the 120 thousand token
threshold. `context.py` does two things in order: first it clears the content of old `tool_result`
blocks (keeping the six most recent), because that is the lightest and safest compaction; it
measures again, and if the history is still too long it calls the model with `compaction.md` to
summarize the older part into one passage, keeping exactly what the prompt asks for: the plan,
which sub-questions are closed, which sources were read and which not, open doubts. The new history
is the summary plus the last few turns. The agent does not panic about lost detail: the detail is
in `notes.md`, and it can call `read_notes`.

Step 20: the model sees that every sub-question has at least two sources, writes a draft, and
calls `submit_report`. This is where the harness shows its intent: submitting the report *is a
tool*, and that tool runs `verifiers/`. `citations.py` finds that paragraph three states a number
without a `[n]`, and that `[4]` points to a URL that appeared in search results but was never
`fetch`ed. The tool returns `is_error: true` with two lines naming the paragraph, the URL, and the
fix ("fetch the URL and take a note, or drop the claim"). The model fetches the page, takes a note,
repairs the draft, and resubmits at step 23. The verifiers pass, `report.md` is written,
`progress.json` flips to `done: true`, the loop stops.

If at step 23 the budget of 40 steps or 400 thousand tokens had run out first, `loop.py` would not
try to submit an unverified report; it writes a handoff entry to `progress.json` (where it is, what
is missing, what the next step is) and exits with an error code. The next `--resume` run reads the
progress, notes and source list and starts at step 23, not step 0. Throughout, `trace.jsonl` has one
line per step and per tool call; `run_evals.py` reruns this question and 29 others three times each
and reports pass^3, the number that tells you how *consistent* the system is, not just whether it is
sometimes right.

### Code skeletons for the four pieces that matter

**The loop.** Every harness decision lives on the lines that do not call the model: the policy gate
before a tool, compaction before a call, state saved after every step, and stop conditions the model
does not own.

```python
# agent/loop.py  (Anthropic Python SDK 2.x)
import anthropic
from harness import budget, context, policy, state, tracing
from tools.registry import REGISTRY

def run(question: str, cfg: dict, run_id: str) -> state.Progress:
    client = anthropic.Anthropic()
    prog = state.load_or_create(run_id, question)      # progress.json + notes.md
    messages = state.load_messages(run_id) or [
        {"role": "user", "content": question}]
    tracer = tracing.Tracer(run_id)

    while not prog.done:
        # Stop conditions belong to the harness, not to the model.
        if budget.exhausted(prog, cfg):
            state.write_handoff(prog, reason="budget")
            break
        # Compact before calling the model, only when over the threshold.
        messages = context.maybe_compact(client, messages, prog, cfg)

        resp = client.messages.create(
            model=cfg["model"],
            max_tokens=16000,
            system=state.render_system(prog),          # system.md + condensed state
            tools=REGISTRY.schemas(),
            messages=messages,
        )
        tracer.model_call(prog.step, resp.usage, resp.stop_reason)
        budget.record(prog, resp.usage)

        if resp.stop_reason == "end_turn":
            # Stopped without submit_report: remind it; bare text is not accepted.
            messages.append({"role": "assistant", "content": resp.content})
            messages.append({"role": "user", "content":
                "No report has been submitted through submit_report yet. Continue."})
            prog.step += 1
            continue
        if resp.stop_reason == "pause_turn":           # a server tool paused; resend
            messages.append({"role": "assistant", "content": resp.content})
            continue

        messages.append({"role": "assistant", "content": resp.content})
        results = []
        for call in (b for b in resp.content if b.type == "tool_use"):
            verdict = policy.check(call.name, call.input, prog, cfg)
            if not verdict.allowed:                    # policy gate: refuse with a reason
                out = f"Refused: {verdict.reason}"
                is_error = True
            else:
                out, is_error = REGISTRY.run(call.name, call.input, prog)
            tracer.tool_call(prog.step, call.name, call.input, is_error)
            results.append({"type": "tool_result", "tool_use_id": call.id,
                            "content": out, "is_error": is_error})
        messages.append({"role": "user", "content": results})

        prog.step += 1
        state.save(prog, messages)                     # the next session resumes here
    return prog
```

Two details deserve attention. First, `end_turn` is not "done": the only way to be done is
`submit_report` passing the verifiers and flipping `prog.done`. That is the course's *pass-state
gating* applied to a report instead of a feature. Second, a refused tool still returns a
`tool_result` with `is_error`, so the model learns why and changes course instead of being silently
ignored.

**One tool.** A tool description is a prompt. It tells the model when to use the tool, what the
parameters mean, and what comes back. The body of the tool takes care of saving context.

```python
# tools/search.py
from tools.registry import ToolSpec

def search(query: str, max_results: int = 8, *, prog, cfg) -> tuple[str, bool]:
    allowed = cfg["permissions"]["allowed_domains"]
    hits = [h for h in cfg["search_backend"](query, max_results * 2)
            if any(h.domain.endswith(d) for d in allowed)][:max_results]
    if not hits:
        return ("No results within the allowed domains. "
                "Try different or more specific keywords.", True)
    # Return only high-signal fields: title, URL, one snippet. No HTML, no ids.
    lines = [f"- {h.title}\n  {h.url}\n  {h.snippet[:200]}" for h in hits]
    prog.seen_urls.update(h.url for h in hits)        # verifiers cross-check against this
    return "\n".join(lines), False

SEARCH = ToolSpec(
    name="search",
    description=(
        "Search the web within the allowed source domains (vendor engineering blogs, "
        "repos, papers). Use it to find SOURCES for one sub-question at a time. "
        "Results are candidates only: a page must be fetched before it is cited."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string",
                      "description": "Short query, 3-8 keywords, in English"},
            "max_results": {"type": "integer", "minimum": 1, "maximum": 10,
                            "description": "Default 8; raise when recall is low"},
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    fn=search,
    read_only=True,
    network=True,
)
```

`ToolSpec` carries the two flags `read_only` and `network` so `policy.py` can decide without knowing
each tool; that is the same idea as MCP's tool *annotations* from post 5. If another agent should
reuse this tool set, `tools/mcp_server.py` only has to wrap it:

```python
# tools/mcp_server.py  (MCP Python SDK 2.x)
from mcp.server import MCPServer
from tools import search as s

mcp = MCPServer("research-tools")

@mcp.tool()
def search(query: str, max_results: int = 8) -> str:
    """Search sources within the allowed domains. Returns title, url, snippet."""
    text, _ = s.search(query, max_results, prog=..., cfg=...)
    return text
```

**One verifier.** A verifier is plain code with no model call, so it cannot "talk itself into"
deciding an issue is not a big deal, which is what Anthropic observed in an untuned LLM evaluator.
The errors it returns must say how to fix the problem.

```python
# harness/verifiers/citations.py
import re
CITE = re.compile(r"\[(\d+)\]")

def check_citations(report: str, prog) -> list[str]:
    """Return a list of errors; empty means pass."""
    body, _, sources = report.partition("\n## Sources\n")
    src = dict(re.findall(r"^\[(\d+)\]\s+(\S+)", sources, flags=re.M))
    errors = []

    for i, para in enumerate(p for p in body.split("\n\n") if p.strip()):
        if para.startswith("#"):
            continue
        has_number = re.search(r"\d", para) is not None
        if has_number and not CITE.search(para):
            errors.append(
                f"Paragraph {i + 1} states a figure but has no [n]. "
                "Cite a fetched source, or drop the figure.")

    for n in set(CITE.findall(body)):
        url = src.get(n)
        if url is None:
            errors.append(f"[{n}] is used but missing from ## Sources.")
        elif url not in prog.fetched_urls:
            errors.append(
                f"[{n}] points to {url} but this URL was never fetched. "
                "Call fetch and write_note before citing it.")
    return errors
```

The key is `prog.fetched_urls`: it is ground truth recorded by the harness when `fetch` ran, not a
claim made by the model. A URL that merely appeared in search results (`seen_urls`) is not enough to
be cited. This blocks the "invented source" failure structurally, not with a line in the prompt.

**The compaction step.** Two tiers, light to heavy, and always try the light one first.

```python
# harness/context.py
from harness import budget

def maybe_compact(client, messages, prog, cfg):
    trig = cfg["compaction"]["trigger_tokens"]
    if budget.estimate_tokens(messages) < trig:
        return messages

    # Tier 1: clear old tool_result contents, keep the N most recent. No decisions lost.
    keep = cfg["compaction"]["keep_recent_tool_results"]
    seen = 0
    for msg in reversed(messages):
        if msg["role"] != "user" or not isinstance(msg["content"], list):
            continue
        for block in msg["content"]:
            if block.get("type") == "tool_result":
                seen += 1
                if seen > keep:
                    block["content"] = "[cleared during compaction; details in notes.md]"
    if budget.estimate_tokens(messages) < trig:
        return messages

    # Tier 2: summarize the older part with the model, following compaction.md.
    old, recent = messages[:-6], messages[-6:]
    summary = client.messages.create(
        model=cfg["model"], max_tokens=4000,
        system=open("agent/prompts/compaction.md").read(),
        messages=old + [{"role": "user", "content":
            "Summarize the history above so a fresh session can continue the work."}],
    )
    text = next(b.text for b in summary.content if b.type == "text")
    prog.compactions += 1
    return [{"role": "user", "content":
             f"[History summary after {prog.compactions} compactions]\n{text}"}] + recent
```

`compaction.md` spells out what to keep: the plan and the status of each sub-question, URLs read
and not yet read, open doubts, decisions made; and what to drop: page contents already captured in
notes, searches that found nothing. On the Claude API you can replace tier 1 with the context
editing feature and tier 2 with server-side compaction (both in beta); understanding the hand-written
version tells you what you are switching on. One more caution: on the newest models, editing
history that was already sent can invalidate earlier reasoning blocks, so check the model docs
before compacting by overwriting.

**Configuration and evidence.** `config.yaml` is where every "assumption about what the model
cannot do yet" becomes a number, so it can be loosened as models improve:

```yaml
model: claude-opus-5-5
limits:
  max_steps: 40
  token_budget: 400000
compaction:
  trigger_tokens: 120000
  keep_recent_tool_results: 6
permissions:
  allowed_domains: [anthropic.com, langchain.com, github.com, arxiv.org]
  fetch_max_bytes: 200000
  fetch_timeout_s: 15
verifiers:
  min_sources: 3
  require_citation_for_numbers: true
```

And `evals/tasks.jsonl`, one task per line with code-gradable criteria (pretty-printed here
for readability; in the file each task is a single line):

```json
{
  "id": "harness-evidence",
  "question": "Evidence that changing the harness, not the model, changes agent results?",
  "must_cite_domains": ["anthropic.com"],
  "min_sources": 3,
  "forbidden": ["uncited_number"]
}
```

`run_evals.py` runs each task k times, grades the *outcome* (does `report.md` pass the graders) rather
than the path, and reports both pass@k and pass^k. For a research agent whose users will trust the
output, pass^k is the number to watch: 75% per trial sounds fine, but the chance that three trials
in a row all succeed is only about 42%.

## When you do not need the full harness

Every component above has a price: code to maintain, tokens for summaries, money for an evaluator,
wall-clock time. Anthropic's full harness cost 20 times the bare call. So:

- A question answered by one search and one model call needs no agent, let alone a harness; the RAG from post 1 is enough.
- Work with a fixed path (search, summarize, translate) should be a code-controlled workflow, which Anthropic distinguishes from an agent; verifiers and traces still help, but drop the open loop.
- Start with the three cheapest, highest-return pieces: a definition of done a command can check, one code verifier, and one progress file. Both the course and Anthropic rank verification feedback as the highest-ROI component.
- Add a component only when a *real failure* demands it, and measure with evals before and after. Remove a component when a new model makes it redundant.

> A harness does not make the model smarter. It makes the model's output reliable, and it makes
> every mistake happen only once. A good system is the simplest one that still achieves that.

## Closing the series

The six posts are one path. RAG brings outside knowledge into the context. LangChain gives standard
blocks to assemble a pipeline. LangGraph adds state and branches when the pipeline stops being a
straight line. Agents give the model the right to choose its next step, and MCP gives it one way to
talk to every tool. Harness engineering is the last layer: it turns all of that into a system that
runs for a long time, verifies itself, leaves a trace, and can continue after a session dies. Models
will keep getting stronger, and part of today's harness will become redundant; but the question
"what can the model still not do by itself, and what structure makes up for it" stays.
