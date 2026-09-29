# harness-training

Learn to build the six layers of an agent harness **from scratch in TypeScript**, in about one week, using one small, concrete use case.

Inspired by the layering in [earendil-works/pi](https://github.com/earendil-works/pi) (`pi-ai` → `pi-agent-core` → coding agent, plus telemetry). We build a much smaller version of the same ideas so you understand every line.

## The use case: "Refund Desk Agent"

A customer-support agent that handles messages like *"Refund my order #1002, the mug arrived broken."*

It runs against a **fake in-memory database** (no real money, no real network needed for tests). It is small enough to finish in a week and rich enough to need every layer:

| Layer | What the Refund Desk needs |
|---|---|
| 1. Tools | `lookup_order`, `check_refund_policy`, `issue_refund`, `escalate_to_human` |
| 2. Orchestration | ReAct loop: think → call tool → observe → repeat → final answer, with a step budget |
| 3. Context | Trim/summarize long conversations and truncate huge tool outputs |
| 4. Guardrails | Refunds over $100 need human confirmation; never refund twice; validate tool args and model output |
| 5. Evals | 15–20 scripted customer scenarios with pass/fail graders |
| 6. Observability | JSONL trace of every model call, tool call, guardrail decision |

**Week 2 (F13–F15):** the agent joins a shared Slack channel. Reps talk to it in threads, a second "Auditor" agent reviews risky refunds, and a human approves or denies with buttons in the thread.

## Read in this order

1. [`docs/ROADMAP.md`](docs/ROADMAP.md) – the 7-day plan plus the Week 2 Slack extension.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) – file layout and how the pieces connect.
3. [`docs/FEATURES.md`](docs/FEATURES.md) – one feature spec at a time (F0…F15). Work top to bottom.
4. [`docs/TESTING.md`](docs/TESTING.md) – how everything is verified (what a human tester would do, automated).
5. [`docs/GOLDEN_PRINCIPLES.md`](docs/GOLDEN_PRINCIPLES.md) – the rules that keep the code clean.
6. [`docs/CLEANUP.md`](docs/CLEANUP.md) – the recurring cleanup ritual.
7. [`PROGRESS.md`](PROGRESS.md) – the running log the building agent updates.

## How to work

Tell Claude Code: **"Build the next feature."** It follows [`AGENTS.md`](AGENTS.md) (also `CLAUDE.md`) and the `build-feature` skill in `.claude/skills/`:
pick next unchecked feature → implement → run all tests → run the app like a human → update `PROGRESS.md` → commit.

Tell it **"Run cleanup."** to trigger the `cleanup` skill (weekly, or after every 3 features).

## Stack

Node 22, TypeScript (strict), `vitest`, `zod`, `tsx`. The Anthropic SDK is used in exactly one file (`src/llm/anthropic.ts`), and `@slack/bolt` in exactly one file (`src/slack/boltTransport.ts`, Week 2). No agent frameworks – that's the point.
