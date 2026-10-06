# Roadmap: 7 days, one layer at a time

Rule of thumb: **~3–4 focused hours/day.** If a feature takes longer, cut scope from its "Stretch" list, never from its acceptance criteria. Full specs live in [`FEATURES.md`](FEATURES.md).

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done. The building agent updates these boxes.

## Day 1 – Foundations + Tools (Layer 1)
Goal: a typed, tested set of tools you can call by hand. No LLM yet.
- [x] **F0** Project scaffold, tooling, `verify.sh`
- [x] **F1** Fake domain (orders, store, refund policy)
- [x] **F2** Tool layer: schema-validated tools + registry

✅ End of day: `npm run verify` is green; you can call every tool from a unit test.

## Day 2 – The model boundary + Orchestration (Layer 2)
Goal: an agent that completes a refund end-to-end against a scripted model.
- [ ] **F3** Model interface, `ScriptedModel`, Anthropic adapter
- [ ] **F4** Agent loop (ReAct, stop conditions, step budget)

✅ End of day: integration test "refund small order" passes deterministically.

## Day 3 – Observability (Layer 6) + CLI
Goal: see everything the agent did. Do this *before* guardrails/context so you can debug them.
- [ ] **F5** Tracer + trace summarizer
- [ ] **F6** CLI (`npm run chat`, `--scripted` offline mode)

✅ End of day: run the CLI, then `npm run trace -- traces/latest.jsonl` prints a timeline.

## Day 4 – Guardrails (Layer 4)
Goal: the agent can't do something dumb, even if the model tries.
- [ ] **F7** Guardrails, approval flow, repair/retry

✅ End of day: a scripted model that tries a $500 refund is stopped and asks for approval.

## Day 5 – Context management (Layer 3)
Goal: long conversations and huge tool outputs don't break the agent.
- [ ] **F8** Budgeting, truncation, compaction

✅ End of day: a 60-turn scripted conversation completes under a token budget.

## Day 6 – Evaluation harness (Layer 5)
Goal: a number that tells you whether a change made the agent better or worse.
- [ ] **F9** Eval cases, graders, runner, baseline
- [ ] **F10** Live-model eval mode (optional, needs `ANTHROPIC_API_KEY`)

✅ End of day: `npm run eval` prints a pass-rate table and fails on regression.

## Day 7 – Clean up + Retrospective
Goal: make the repo stay clean without you.
- [ ] **F11** `check-principles.ts` mechanical enforcement + first cleanup pass
- [ ] **F12** Retrospective: write `docs/decisions/` ADRs, update ARCHITECTURE, list "what I'd do next"

✅ End of day: `npm run verify` includes the principles check; PROGRESS.md tells the whole story.

---

## Week 2 – Days 8–10: Slack channel (humans and agents in one room)
Goal: the same agent core now lives in a shared Slack channel. Support reps talk to the agents in threads, and refund approvals happen with Approve/Deny buttons in the thread. Nothing in `agent/`, `tools/`, `guardrails/` changes. Only a new front door is added, next to the CLI.
- [ ] **F13** Chat transport abstraction + in-memory `FakeSlack` (offline, fully testable), plus `OrderStore.listTickets` for ticket ownership checks
- [ ] **F14** Real Slack adapter (Bolt, Socket Mode), thread conversations, button approvals
- [ ] **F15** Second agent in the channel: an "Auditor" agent that reviews each approval request before the human decides

✅ End of Day 10: in a test Slack workspace, a rep writes `@refund-desk customer:C1 refund order 1004`, the Auditor posts a recommendation, an approver clicks **Approve**, and the refund shows in the store and the trace. The same flow passes offline in `npm run verify` through `FakeSlack`.

---

## After Week 2 (menu, pick one)
- Add a second specialist sub-agent (e.g. "fraud check") and a planner that hands off to it.
- Swap `ScriptedModel` evals for LLM-as-judge on the free-text reply quality.
- Add durable sessions (save/resume conversations to disk) – compare with `pi-durable`.
- Read `pi-agent-core` and diff its loop design against yours.

## Cutting scope if you fall behind
Drop in this order: F10 → F8 compaction (keep truncation) → F12 → F6 interactive REPL (keep `--scripted`). Never drop F5, F7, F9.
In Week 2, F15 is the one to drop. F14 needs a Slack workspace where you can install an app; without one, stop after F13 (the fake covers the whole flow).
