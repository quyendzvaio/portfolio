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

The course opens lecture 02 with a picture, and I will borrow it because it gets to the heart of the
matter. Imagine you are a newly hired engineer dropped into a project with zero documentation. No
README, no comments in the code, nobody tells you how to run the tests, the CI config is buried
somewhere. Can you write good code? Maybe, if you are smart enough and patient enough. But you will
spend most of your time "figuring out what this project is about" instead of solving the problem. An
agent is in exactly that spot, and worse off: you can at least ask the colleague next to you; the
agent sees only the files you put in front of it and can only run the commands you allow.

From there the course's definition is short: a harness is *everything outside the model weights*.
The weights are the trained "brain", which you cannot edit. Everything else you build around it, from
the instruction sheet, the toolbox and the workplace to the progress notebook and the way results are
checked, is harness. Put bluntly: if it is not model weights, it is harness. With it comes a principle
that sounds odd but matters a lot: *the repository is the single source of truth*. Anything the agent
cannot see in the repo does not exist for it. A convention that lives in your head or in a Slack
message from three months ago is, to the agent, not there.

So what does the harness do for the agent? It lets the brain work on a long job without drifting: it
knows where it is after its short-term memory fills up, it does not repeat a mistake it already made,
it does not quietly widen the job, it does not do what is forbidden, and it may not say "done" until
there is proof. The harness does not make the model one bit smarter. The course puts it plainly: *the
model decides what code to write; the harness governs when, where and how it writes it*. It does not
make the model better; it makes the model's output reliable.

### Where the formula comes from

The formula is short enough to pass for a slogan, so let us be precise about its source. The
[learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md) course names its own two main references: OpenAI's harness
engineering article and Anthropic's articles on harnesses for long-running agents. The term *harness
engineering* was used by Mitchell Hashimoto in
[My AI adoption journey](https://mitchellh.com/writing/my-ai-adoption-journey) (February 2026) with
a very practical definition: whenever an agent makes a mistake, you take the time to engineer a fix
so it *never* makes that mistake again. The equation "Agent = Model + Harness" was written down by
Vivek Trivedy in LangChain's
[The anatomy of an agent harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness)
(March 2026), with a definition that matches the course's: a harness is *every piece of code,
configuration and execution logic that is not the model itself*. Anthropic does not use the formula,
but calls the Claude Agent SDK "a general-purpose agent harness" in
[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents),
and back in late 2024 described agents in
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) as
"LLMs using tools based on environmental feedback in a loop". That loop and that environment *are*
the harness; it just had no name yet.

![Agent = LLM + harness: the model in the centre, the five harness subsystems of lecture 02 around it (Instructions, Tools, Environment, State, Feedback), and below them the two operational disciplines from the README (Scope and Session lifecycle)](blog/harness-engineering-agent-anatomy.svg)

What does the harness give the agent? Five things, each matching one of the failure modes that the
course's [lecture 01](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-01-why-capable-agents-still-fail/index.md) lists:

- **Endurance on long work.** Real tasks span many context windows and many sessions; without state outside the context, every session starts from zero.
- **Staying on track.** Agents try to do too much at once or quietly change the goal; the harness holds the scope and the definition of done.
- **Not repeating mistakes.** Every failure becomes a rule or an automatic check, in Hashimoto's spirit.
- **Safety.** Permissions, sandbox, spending limits: the agent can only do what you allow.
- **Measurability.** Traces and evals turn "it feels fine" into numbers, so you know which change actually helped.

One sentence from Anthropic's harness article (not from the course) is worth keeping: *every
component in a harness encodes an assumption about what the model cannot do on its own*. As models
improve, some parts become redundant (the author dropped context resets with Opus 4.5 and sprints
with Opus 4.6), but the space of useful harness designs does not shrink, it *moves*. The course says
the same thing differently in lecture 02: a harness rots like code, so audit it and pay down harness
debt the way you pay down technical debt.

## The components of a harness, as the course lays them out

[Lecture 02](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md) defines a harness with a five-part formula:
**Harness = Instructions + Tools + Environment + State + Feedback**. It is also the framework the
course uses to dissect four real products (Pi, Claude Code, Codex, DeepSeek) in its
[harness designs](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/harness-designs/index.md) section. Missing any one part means an incomplete harness, and the agent
"will always feel awkward to use". Below I take each part in the same shape: the plain idea, the
concrete thing the course tells you to create, and the failure it prevents.

### Instructions: the sheet of paper on the new hire's desk

Put simply, this is the sheet of paper you leave on a new hire's desk on day one: what this project
is, what the job is, what done looks like, how the team does things. Without that sheet the agent
does not fail because it is weak; it fails because it has to guess.

The course tells you to create an `AGENTS.md` (or `CLAUDE.md`) at the repo root containing: a project
overview and purpose, the tech stack and versions, first-run commands, non-negotiable hard
constraints, and links to more detailed documentation. [Lecture 04](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-04-why-one-giant-instruction-file-fails/index.md) adds the size rule: about
100 lines, a *table of contents*, not an encyclopedia; details go into `docs/` for the agent to read
on demand. [Lecture 01](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-01-why-capable-agents-still-fail/index.md) adds the most important item on the sheet: a *definition of done* a
command can check, such as "endpoint `GET /api/search?q=`, 20 per page, passes `pytest` and
`mypy --strict`", instead of "add search". Failure prevented: the two top failures of lecture 01,
vague requirements and unwritten conventions. The course adds a line worth pinning: one `AGENTS.md`
file might be more effective than upgrading to a more expensive model.

### Tools: the toolbox, just enough and labelled

This is the toolbox on the desk. A good mechanic with no screwdriver can only watch; hand over a
jumbled box with no labels and they grab the wrong tool.

Lecture 02 gives this subsystem two sides. One: give the agent *sufficient* tool access; do not
disable the shell "for security reasons", because an agent that cannot even run `pip install` cannot
get anything done. Two: do not open everything either; follow least privilege. For a coding agent the
course's list is the shell, file read and write, git, plus startup scripts and test commands. Failure
prevented: the agent "wants to do something but can't", or has so many overlapping tools that it
picks the wrong one. Anthropic's
[Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
adds the "labels": write tool descriptions the way you would brief a new hire, return high-signal
information, and make error messages say how to fix the problem.

### Environment: a self-describing workshop

This is the workshop: is the power on, is the software the right version, which doors are open. A
broken workshop means the mechanic spends the day fixing the workshop instead of doing the job.

The course asks for an environment that *describes itself*: lock dependencies with `pyproject.toml`
or `package.json`, pin the runtime with `.python-version` or `.nvmrc`, and use Docker or a
devcontainer so it can be rebuilt identically anywhere. [Lecture 06](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-06-why-initialization-needs-its-own-phase/index.md) makes *initialization* its
own phase, with an `init.sh` (install, verify, start) and a readiness checklist of four items: can
start, can test, can see progress, knows the next step. Codex, as lecture 02 notes, goes further and
gives each task its own git worktree so changes never step on each other. Failure prevented: the
agent burning its context window on install errors and version conflicts. For a research agent the
workshop also includes the allow-list of fetchable domains and a size cap per page, so an unknown web
page cannot hijack the agent.

### State: the notebook and the cabinet

If the context (what the model can "see" right now) is the desk surface, state is the notebook and
the cabinet: what was done, what is in progress, what is left, written down outside so the next shift
can open it. Without the notebook, every new shift starts as if there had been no shift before.

The concrete thing lecture 02 asks for is a simple `PROGRESS.md` with three sections: done, in
progress, blocked; updated before a session ends, read when the next one starts.
[Lecture 05](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-05-why-long-running-tasks-lose-continuity/index.md) widens it to a trio: the progress file, a decision log, and git commits as
checkpoints, with one metric to watch: *rebuild cost*, the time a new session needs to become
productive. [Lecture 08](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-08-why-feature-lists-are-harness-primitives/index.md) adds a machine-readable feature list where each item is a triple
(behaviour description, verification command, state), and a state moves to `passing` only when the
verification command succeeds. Failure prevented: losing continuity between sessions, redoing finished
work, or "looking around, seeing progress, and declaring the whole project done".

Context management within a session belongs to this subsystem too, because it is the same question
of what to keep and what to drop. When the course dissects [Claude Code](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/harness-designs/claude-code/index.md) it finds a multi-stage
compaction pipeline: lossless pruning first (removing redundant tool results), structured distillation
next, LLM summaries last, with circuit breakers against over-compaction. Anthropic's
[context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
post names the same three techniques for long work: compaction, structured notes outside the context,
and sub-agents that return a summary.

### Feedback: the examiner, separate from the student

This is the examiner. Grade your own paper and you will find yourself right; so does an agent.
"Done" has to be proven by a test that actually runs, not by a feeling.

Lecture 02 calls this the subsystem with the *highest return on investment*, and the concrete step
is cheap: list the verification commands explicitly in `AGENTS.md` (tests, type check, lint, and one
command that runs them all). [Lecture 09](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-09-why-agents-declare-victory-too-early/index.md) stacks verification in three layers that must pass in
order: syntax, behaviour (tests run, the app starts), system (end-to-end). [Lecture 10](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-10-why-end-to-end-testing-changes-results/index.md) shows
that end-to-end tests not only catch defects but change how the agent writes code, and that
architectural rules must be *executable* rather than sit in a document. [Lecture 13](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-13-loop-engineering/index.md) turns it
into a principle: *the maker and the checker must be separate*, sometimes two different models. Logs
and traces live here as well: lecture 02 describes Codex shipping with an observability stack (logs,
metrics, traces) so every change is verified in its own environment, and [lecture 11](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/index.md) splits
observability into two layers, runtime (what the system did) and process (why this change should be
accepted: sprint contracts, scoring rubrics). Failure prevented: the most common one, *declaring
victory early*. Anthropic's
[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
adds the vocabulary for measuring: task, trial, grader, transcript, outcome; grade the result, not the
path; and pass^k for consistency.

### Two operational disciplines: Scope and Session lifecycle

The course's [README](https://github.com/walkinglabs/learn-harness-engineering#what-harness-engineering-actually-means) names the five subsystems a different way, from the angle of *what
the harness has to do*: Instructions, State, Verification, Scope, Session Lifecycle. The first three
coincide with lecture 02 (Verification is Feedback). The other two are not new technical layers but
two disciplines laid on top of the five.

**Scope.** This is the "one thing at a time" rule. Anyone who has had five tasks open at once knows
how it ends: all of them half-done. An agent is exactly the same, it just gets there faster. The
README says: constrain the agent to one feature at a time, no overreach, no half-finishing three
things, no rewriting the feature list to hide unfinished work. [Lecture 07](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-07-why-agents-overreach-and-under-finish/index.md) calls it WIP=1
(one piece of work in progress) and names the twin failures *overreach* and *under-finish*; the
course measured it with the same eight features: the unconstrained mode left three half-done, WIP=1
finished seven after four sessions. The boundary of the work has to live in a file, and that file is
the feature list of lecture 08.

**Session lifecycle.** This is the start-of-shift and end-of-shift routine. At the start: read the
instruction sheet, run `init.sh`, read the progress notebook, look at the task list, check git
history, then pick *one* task. At the end: update the notebook, update the task list, write down what
is still broken, commit when it is safe, and leave a clean restart path for the next shift.
[Lecture 12](https://github.com/walkinglabs/learn-harness-engineering/blob/main/docs/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/index.md) defines "clean state" as five conditions, none optional: build passes, tests
pass, progress recorded, no stale artifacts, startup path available. Miss one and the session is not
done.

| README (what to do) | Lecture 02 (technical layer) | Note |
|---|---|---|
| Instructions | Instructions | same |
| State | State | same; in-session context lives here too |
| Verification | Feedback | one thing, two names |
| Scope | (discipline on top of State) | WIP=1, the feature list is the boundary |
| Session Lifecycle | (discipline on top of Environment and State) | init at start, clean state at end |
| | Tools, Environment | the README folds them into "the working environment" |

Finally, how to *choose* where to invest, also from lecture 02. First, the five-tuple audit: score
each subsystem 1 to 5, take the lowest, spend 30 minutes improving it, and watch how the agent
changes. Second, exclusion: hold the model fixed, remove one subsystem at a time, and see which
removal hurts most. The course tells of a team using the same GPT-4o on a 20,000-line React
project: README only, 1 run in 5 succeeded; add `AGENTS.md`, 60%; add verification commands, 80%;
add a progress file, stable at 80 to 100%. Four rounds, no model change. But exclusion only says
"which component is worth most right now", not "where the bottleneck is"; for that you have to read
the failure logs and attribute each failure to a layer.

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
replaces `PROGRESS.md` and `questions.json`; the harness components stay the same, they just move house.

```text
research-agent/
├── AGENTS.md                 # [Instructions] ~100-line map: purpose, rules, checks
├── docs/
│   ├── report-format.md      # [Instructions] what a finished report looks like
│   └── source-policy.md      # [Instructions] which sources count, how to quote
├── init.sh                   # [Lifecycle] install, check keys, smoke search, print state
├── pyproject.toml            # [Environment] locked dependencies and Python version
├── .devcontainer/            # [Environment] rebuild identically; network allow-list
├── config.yaml               # [Environment] model, budgets, thresholds, domains
├── agent/
│   ├── loop.py               # loop: call model -> run tool -> save state -> stop?
│   └── prompts/
│       ├── system.md         # [Instructions] role and procedure, read every turn
│       └── compaction.md     # [State] what a history summary must keep and drop
├── tools/                    # [Tools] least privilege: read-only / network flags
│   ├── registry.py           # tool directory: name, description, schema, flags
│   ├── search.py             # search allowed domains: title + URL + snippet
│   ├── fetch.py              # page -> clean text, truncated to a cap, raw copy saved
│   ├── notes.py              # write and read back notes: claim, quote, url
│   ├── submit_report.py      # [Feedback] hands draft to checker; only path to done
│   └── mcp_server.py         # exposes the tools over MCP for other agents
├── harness/
│   ├── policy.py             # [Tools] permission gate: tool, domain, call count
│   ├── context.py            # [State] compaction: clear old results, then summarize
│   ├── budget.py             # [Lifecycle] counts steps and tokens; stop decision
│   ├── handoff.py            # [Lifecycle] clean-state check and handoff note on exit
│   ├── tracing.py            # [Feedback] trace.jsonl: steps, tool calls, verdicts
│   └── verifiers/            # [Feedback] checker separate from the model
│       ├── citations.py      # every figure has [n]; every [n] points to a fetched URL
│       └── structure.py      # all sections present, minimum sources, no empty paragraphs
├── evals/                    # [Feedback] 30 tasks from real failures; pass^k
│   ├── tasks.jsonl
│   └── run_evals.py
└── runs/
    └── 2026-10-28_harness-evidence/
        ├── PROGRESS.md       # [State] done / in progress / blocked / next step
        ├── questions.json    # [Scope] sub-questions + state; one active at a time
        ├── notes.md          # [State] the agent's own notes, re-read after compaction
        ├── sources/          # [State] raw copy of each page for the checker
        ├── trace.jsonl       # [Feedback] trace of this run
        └── report.md         # exists only once the checker has passed
```

The labels in square brackets name the course subsystem each part belongs to. Read by label, you
find all five layers of lecture 02 (Instructions, Tools, Environment, State, Feedback) and the two
README disciplines (Scope through `questions.json`, Lifecycle through `init.sh`, `budget.py`,
`handoff.py`). `agent/` and `tools/` are what every demo shows. `harness/` is what separates a demo
from a system, and it imports nothing from the model: swap the model or the framework and `harness/`
still works. `evals/` and `runs/` are the evidence; without them you only have a feeling.

### Walking one question through the system

**Start of shift (Lifecycle).** You run `init.sh`: it installs dependencies from the lockfile, checks
the API keys, runs one smoke search to confirm the network and the allow-list work, and prints the
state. Then you start the agent with the question. The loop follows the README's start-of-session
routine: read `AGENTS.md`, create the run folder with an empty `PROGRESS.md` and an empty
`questions.json`, open `trace.jsonl`.

**Planning (Instructions, Scope).** At step 0 the model receives the system prompt (role, procedure,
report format from `docs/report-format.md`) and writes a plan: three sub-questions (controlled
experiments with the same model, benchmarks before and after a harness change, remove-one-at-a-time
studies) and the preferred source types. The harness writes the three sub-questions to
`questions.json`, each with a state and a done criterion ("at least two fetched sources, with
notes"), the triple of lecture 08. Only one is marked `active`. This is lecture 07's WIP=1 applied to
research: the model may not search for all three at once.

**Search, read, note (Tools, Environment).** Steps 1 to 4: the model calls `search` for the active
sub-question. Every call passes the permission gate: `search` is a read-only tool and allowed, but
its results are filtered by the domains in `config.yaml`. The tool returns at most eight hits, each
just a title, a URL and a snippet. The model picks three URLs and calls `fetch`; the environment caps
each page at 200 KB and 15 seconds, saves the raw copy under `sources/`, and returns clean truncated
text with a hint on how to read further if the page is long. After reading, the model calls the notes
tool with three fields: claim (one sentence), quote (short, verbatim), url. The harness appends to
`notes.md` and marks the URL as *fetched*. When the sub-question meets its criterion, the harness,
not the model, moves it to `passing` in `questions.json` and opens the next one.

**Compaction (State).** At step 12 the counter reports that the estimated context has crossed the
120 thousand token threshold. The harness does two things in order: it clears the contents of old
tool results (keeping the six most recent), the lightest and safest compaction; it measures again,
and if the history is still too long it calls the model with `compaction.md` to summarize the older
part, keeping exactly what that file asks for: the plan, closed sub-questions, sources read and not
read, open doubts. The agent does not panic about lost detail: the detail is in `notes.md` and
`questions.json`, which it can read back.

**Submit and check (Feedback).** At step 20 all three sub-questions are `passing`; the model writes
a draft and calls `submit_report`. This is where the harness shows its intent: submitting the report
*is a tool*, and that tool runs the checkers in `verifiers/`. The citation checker finds that
paragraph three states a figure without a `[n]`, and that `[4]` points to a URL that appeared in
search results but was never fetched. The tool returns an error result with two lines naming the
paragraph, the URL, and the fix ("fetch the URL and take a note, or drop the claim"). The model
fetches the page, takes a note, repairs the draft, and resubmits at step 23. The checker passes and
`report.md` is written.

**End of shift (Lifecycle).** Before exiting, `handoff.py` runs the clean-state check, lecture 12's
five conditions translated to a research agent: the report passed the checker, `PROGRESS.md` is
updated, `questions.json` matches reality, no temporary files are left in `sources/`, and the rerun
command works. If the budget of 40 steps or 400 thousand tokens had run out before step 23, the loop
would not try to submit an unverified report; it writes to `PROGRESS.md` where it is, what is
missing and what the next step is, and exits with an error code. The next run on the same run folder
reads `PROGRESS.md`, `questions.json` and `notes.md` and starts at step 23, not step 0. Throughout,
`trace.jsonl` has one line per step and per tool call; `run_evals.py` reruns this question and 29
others three times each and reports pass^3, the number that tells you how *consistent* the system is,
not just whether it is sometimes right.

### The four pieces that decide reliability

You do not need to read code to understand this harness. You need to know what each piece does,
where it sits in the tree, and why the system drifts without it.

| Piece | Lives in | Subsystem | What it does | Why it must exist |
|---|---|---|---|---|
| The loop | agent/loop.py | skeleton of the whole harness | calls the model, runs tools, saves state, checks stop | the model may not declare itself done |
| Policy gate | harness/policy.py | Tools | approves every tool call before it runs | blocks unknown domains, forbidden tools, overuse |
| Checker | harness/verifiers/ | Feedback | checks the report with plain code | a model grading itself always finds itself right |
| Compaction | harness/context.py | State | clears old results, then summarizes | long jobs outgrow one context window |

**The loop.** Each turn does one fixed sequence: check the budget (steps, tokens) and stop if it is
spent; compact the context if it is over the threshold; call the model with the system prompt, a
condensed `PROGRESS.md` and `questions.json`, and the tool list; if the model calls tools, pass each call through the
policy gate before running it and hand the result (including errors, with a reason) back to the
model; at the end of the turn save `PROGRESS.md` so the next session can resume. Two design
decisions live here. First, the model going quiet does not mean done: the only path to "done" is
`submit_report` passing the checker; if the model stops without submitting, the loop tells it to
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
