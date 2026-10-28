---
title: "Harness engineering: an agent is an LLM plus a harness"
date: "2026-10-28"
tags: ["agents", "harness", "llmops"]
summary: "Why a strong LLM still fails long tasks, what a harness is made of, and how to design a research agent whose folder tree shows the agent and the harness at a glance."
---

# Harness engineering: an agent is an LLM plus a harness

In [post 5](#/blog/mcp-model-context-protocol) we gave the agent one standard plug for every tool:
MCP. At this point the model is smart and has the right tools in hand. Yet hand it a job of a few
dozen steps and you will still watch it drift: it forgets what it already did, repeats old mistakes,
says "done" too early, or does things it was not allowed to do. What fixes that is not a smarter
model but the environment built around the model. This last post is about that environment: the
harness.

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

Put plainly: the model is the brain. It reads, thinks, and decides the next step. But a brain on its
own does not finish a long job. It needs a description of the work, a desk with tools, a notebook of
what has been done, a few rules about what is and is not allowed, and someone who checks the result
before it may say "done". All of that "around the brain" is the harness. An agent is the brain plus
everything around it.

Picture this. You hire a brilliant engineer. On day one you say "add search" and walk into a
meeting. No documentation, nobody tells them how to run the tests, nobody explains the team's
conventions, nobody reviews. They are still brilliant, but they will guess the requirement wrong,
pick the wrong library, and confidently report done because nothing lets them check. The same person
with a clear brief, a machine that is already set up, a checklist of what "done" means, just enough
access, and an independent reviewer ships something usable. The person did not change; everything
around the person did. An agent is exactly the same, only worse off: a new hire can at least ask a
colleague, while the agent sees only the files you put in front of it and the commands you let it
run. The course uses exactly this image in
[lecture 02](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md).

So what does the harness do for the agent? It lets the brain work on a long job without drifting:
it knows where it is after its short-term memory fills up, it does not repeat a mistake it already
made, it does not quietly widen the job, it does not do what is forbidden, and it may not say "done"
until there is proof. The harness does not make the model one bit smarter. It makes that
intelligence produce results you can trust.

### Where the formula comes from

The formula is short enough to pass for a slogan, so let us be precise about its source. The term
*harness engineering* was used by Mitchell Hashimoto in
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

In more technical terms, the harness holds: the loop that calls the model and then runs its tools,
the tools and their descriptions, context management (what the model gets to see at each step),
memory and state outside the context, the runtime environment (sandbox, limits), permissions and
guardrails (what it may and may not do), verification and feedback (how we know it is right),
observability (traces, logs, evals) and recovery (what happens after a failure).

![Agent = LLM + harness: the model in the centre, eight harness components around it, connected by the loop that calls the model and runs tools](blog/harness-engineering-agent-anatomy.svg)

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

Put simply, this is the sheet of paper you leave on a new hire's desk on day one: what the job is,
what done looks like, how the team does things. Without that sheet the agent does not fail because it
is weak; it fails because it has to guess.

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

This is the toolbox on the desk. A good mechanic with no screwdriver can only watch; a jumbled box
with no labels means grabbing the wrong tool. Tools need clear names and descriptions, like labels on
each instrument.

Holds: the tools, their descriptions, their parameter schemas, and how they are exposed (possibly
over MCP, as in [post 5](#/blog/mcp-model-context-protocol)). Prevents: the agent having no way to act, or so many overlapping tools
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

This is the workshop: is the power on, is the software the right version, which doors are open. A
broken workshop means the mechanic spends the day fixing the workshop instead of doing the job.

Holds: where the agent runs, runtime versions, locked dependencies, sample data, and limits
(network, time, memory). Prevents: the agent burning its context window on failed `pip install`
and version conflicts instead of the real task. Example from lecture 06: make *initialization* its
own phase with an `init.sh` (install, verify, start) and a readiness checklist of four items: can
start, can test, can see progress, knows the next step. For a research agent the environment also
means an allow-list of fetchable domains and a size cap per page, so a hostile web page cannot
become a prompt injection that hijacks the agent.

### Context: a finite resource with diminishing returns

Context is what the model can "see" right now, like a desk with limited surface. Pile papers on it
and the important sheet gets buried. The harness has to clear the desk: file old papers away in a
cabinet and leave out only what is needed next.

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

If context is the desk, state is the notebook and the cabinet: what was done, what is in progress,
what is left, written down outside so the next shift can open it. Without the notebook, every new
shift starts as if there had been no shift before.

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

This is the "one thing at a time" rule. Anyone who has had five tasks open at once knows how it
ends: all of them half-done. An agent is exactly the same, it just gets there faster.

Holds: a limit on open work (WIP, work in progress) and the boundary of each task, written to a
file. Prevents: the twin failures lecture 07 calls *overreach* and *under-finish*. Example:
Anthropic asked its coding agent to work on one feature per session and found this critical against
the urge to "one-shot the app". The course measured it: with the same eight features, the
unconstrained mode left three half-done; WIP=1 finished seven after four sessions. Lines of code and
completion rate were negatively correlated.

### Verification: confidence is not correctness

This is the examiner, separate from the student. Grade your own paper and you will find yourself
right; so does an agent. "Done" has to be proven by a test that actually runs, not by a feeling.

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

This is the workshop's camera and logbook: who did what and when, what it cost, how it turned out.
Without it, when something breaks all you know is "it broke", not where to fix it.

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

The design below assumes you call the model's API directly through the official SDK and write the
loop yourself, so every harness component is visible instead of hidden inside a framework; the tools
can be wrapped as MCP. If you use LangGraph as in [post 4](#/blog/langgraph-ai-agents), each box in the diagram becomes a node and the graph state
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
│   ├── registry.py           # tool directory: name, description, schema, policy flags
│   ├── search.py             # web search: domain filter, compact title+url+snippet
│   ├── fetch.py              # page -> clean text, truncated to a cap, raw copy saved
│   ├── notes.py              # write and read back structured notes: claim, quote, url
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
in `notes.md`, and it can call the notes tool to read them back.

Step 20: the model sees that every sub-question has at least two sources, writes a draft, and
calls `submit_report`. This is where the harness shows its intent: submitting the report *is a
tool*, and that tool runs `verifiers/`. `citations.py` finds that paragraph three states a number
without a `[n]`, and that `[4]` points to a URL that appeared in search results but was never
`fetch`ed. The tool returns an error result with two lines naming the paragraph, the URL, and the
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

### The four pieces that decide reliability

You do not need to read code to understand this harness. You need to know what each piece does,
where it sits in the tree, and why the system drifts without it.

| Piece | Lives in | What it does | Why it must exist |
|---|---|---|---|
| The loop | agent/loop.py | calls the model, runs tools, saves state, decides to stop | the model may not declare itself done |
| Policy gate | harness/policy.py | approves every tool call before it runs | blocks unknown domains, forbidden tools, overuse |
| Verifiers | harness/verifiers/ | check the report with plain code | a model grading itself always finds itself right |
| Compaction | harness/context.py | clears old results, then summarizes | long jobs outgrow one context window |

**The loop.** Each turn does one fixed sequence: check the budget (steps, tokens) and stop if it is
spent; compact the context if it is over the threshold; call the model with the system prompt, a
condensed `progress.json` and the tool list; if the model calls tools, pass each call through the
policy gate before running it and hand the result (including errors, with a reason) back to the
model; at the end of the turn save `progress.json` so the next session can resume. Two design
decisions live here. First, the model going quiet does not mean done: the only path to "done" is
`submit_report` passing the verifiers; if the model stops without submitting, the loop tells it to
continue. That is the course's *pass-state gating* applied to a report instead of a feature. Second, a
refused tool call still gets an answer with a reason, so the model changes course instead of being
silently ignored. When the budget runs out, the loop does not try to submit an unverified report; it
writes a handoff and exits.

**Tools and their descriptions.** A tool description is a prompt: it tells the model when to use the
tool, what the parameters mean, what comes back, and the most important warning in this system:
search results are candidates only, a page must be fetched before it can be cited. The body of the
tool takes care of saving context: it filters by the domain allow-list, returns only a title, a URL
and one snippet, and records the URLs it has shown in the state so the verifiers can cross-check. Each
tool carries two flags, *read-only* and *uses the network*, so the policy gate can decide without
knowing each tool; that is the same idea as MCP's tool annotations from
[post 5](#/blog/mcp-model-context-protocol). If another agent should reuse the tool set,
`tools/mcp_server.py` simply exposes the same functions over MCP, without rewriting the logic.

**The citation verifier.** A verifier is plain code with no model call, so it cannot "talk itself
into" deciding an issue is not a big deal, which is what Anthropic observed in an untuned LLM
evaluator. It runs three checks: any paragraph that states a figure must carry a citation mark; every
citation mark must appear in the source list at the end of the report; and the source's URL must be
in the list of URLs *actually fetched*, which the harness records when the `fetch` tool runs, not
something the model claims. A URL that merely appeared in search results is not enough to be cited.
Every error comes back with its fix ("fetch the URL and take a note, or drop the claim"). This blocks
the "invented source" failure structurally, not with a line in the prompt.

**Compaction.** Two tiers, light to heavy, always trying the light one first. Tier one clears the
contents of old tool results and keeps the six most recent; no decision is lost, because decisions
live in the model's own words, not in tool output. If the history is still too long, tier two calls
the model with `compaction.md` to summarize the older part into one passage, keeping the plan and the
status of each sub-question, URLs read and not yet read, open doubts and decisions made, and dropping
page contents already captured in notes and searches that found nothing. The new history is the
summary plus the last few turns; the detail is always still in `notes.md`. On the Claude API you can
replace tier one with the context editing feature and tier two with server-side compaction (both in
beta); understanding the hand-designed version tells you what you are switching on. One caution: on
the newest models, editing history that was already sent can invalidate earlier reasoning blocks, so
check the model docs before compacting by overwriting.

**Configuration and evidence.** `config.yaml` is where every "assumption about what the model cannot
do yet" becomes a number, to be loosened as models improve: which model; at most 40 steps and 400
thousand tokens; compact above 120 thousand tokens, keeping the 6 most recent tool results; the domain
allow-list, 200 KB and 15 seconds per page; at least 3 sources, and every figure must be cited.
`evals/tasks.jsonl` holds one line per task: the question, the domains that must be cited, the
minimum number of sources, and the failures that are forbidden (for example an uncited figure).
`run_evals.py` runs each task k times, grades the *outcome* (does the final report pass the graders)
rather than the path, and reports both pass@k and pass^k. For a research agent whose users will trust
the output, pass^k is the number to watch: 75% per trial sounds fine, but the chance that three trials
in a row all succeed is only about 42%.

## When you do not need the full harness

Every component above has a price: code to maintain, tokens for summaries, money for an evaluator,
wall-clock time. Anthropic's full harness cost 20 times the bare call. So:

- A question answered by one search and one model call needs no agent, let alone a harness; the RAG from [post 1](#/blog/rag-fundamentals) is enough.
- Work with a fixed path (search, summarize, translate) should be a code-controlled workflow, which Anthropic distinguishes from an agent; verifiers and traces still help, but drop the open loop.
- Start with the three cheapest, highest-return pieces: a definition of done a command can check, one code verifier, and one progress file. Both the course and Anthropic rank verification feedback as the highest-ROI component.
- Add a component only when a *real failure* demands it, and measure with evals before and after. Remove a component when a new model makes it redundant.

> A harness does not make the model smarter. It makes the model's output reliable, and it makes
> every mistake happen only once. A good system is the simplest one that still achieves that.

## Closing the series

The six posts are one path, and each step fixes the weakness the previous one left behind. An LLM
on its own does not know your data and will happily make things up; [post 1](#/blog/rag-fundamentals)
brings in RAG so the model answers from real documents. But gluing the pieces of RAG together by
hand is tedious and every vendor does it differently, so
[post 2](#/blog/langchain-rag-from-scratch) uses LangChain to give every piece a standard shape that
snaps in and swaps out. That RAG only looks good in a demo; [post 3](#/blog/rag-production-techniques)
tunes each stage so it survives real documents and real users, and can be measured. However well
tuned, RAG is still a one-way street, one lookup and one answer;
[post 4](#/blog/langgraph-ai-agents) adds loops, branches and shared memory with LangGraph, then lets
the model choose its own next step, which is what makes it an agent. An agent is only as useful as
its tools, and every tool is another API wired up by hand;
[post 5](#/blog/mcp-model-context-protocol) brings in MCP as the one shared plug. And once the model
is smart and the tools are all there, long jobs still drift; this post builds the harness around the
model so it runs for a long time, verifies itself, leaves a trace, and can continue after a session
dies. Models will keep getting stronger, and part of today's harness will become redundant; but the
question "what can the model still not do by itself, and what structure makes up for it" stays.
