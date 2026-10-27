# Progress Log

Append-only: the newest entry goes at the **top** of "Entries". The coding agent writes one entry per finished feature and one per cleanup pass.

## Status
- Current feature: **F6** (not started)
- Last cleanup: 2026-10-27 (after F5; next due after F8)
- Eval pass rate: n/a

## Open issues
_(bugs found but not yet fixed, spec questions for the user)_

## Cleanup backlog
_(leftovers from time-boxed cleanup passes)_
- Import style is mixed: tools import siblings with `.ts` and `.js` extensions, and `{z}` vs `{ z }`. Pick one; a lint rule could enforce it (F11).
- `MS_PER_DAY` is defined in `policy.ts`, `store.ts` and two test files. Not yet three copies in `src/`, so no shared helper (GP-04); revisit if a third appears.
- Mixed 2/4-space indentation in `src/agent/loop.ts` and `src/llm/anthropic.ts`. A formatter would settle it (F11).

---

## Entry template

```md
### YYYY-MM-DD: F<n> <title>  (<commit sha>)
**Summary:** 2–3 sentences, what now works.
**Files:** added/changed (short list).
**Concepts learned:** the ideas behind this layer, explained for a learner.
**Tests:** counts (unit / integration / e2e / eval), `npm run verify` result.
**Human-tester pass:**
- Commands run and what the output showed
- Edge cases tried (bad input / env / model) and results
- Bugs found → fixed in <sha> with regression test | filed in Open issues
**Decisions / deviations from spec:** and why.
**Next:** the next feature and any risk you see.
```

---

## Entries

### 2026-10-27: Cleanup after F3–F5  (f219b21..20a66d6)
**Baseline:** `npm run verify` green, 148 unit + integration, 1 e2e; eval still a stub (output identical before and after).
**Mechanical scan** (grep fallback, F11 checker not built): no `any`, `.only`/`.skip`, orphan TODOs, `console.*` in `src`, or real-clock calls (the `new Date(...)` hits all derive from injected or seed time); each provider SDK is imported only by its adapter; no keys in the repo; no file over 200 lines (largest `store.ts`, 167).
**Violations found → fixed:**
- GP-05 (1): `(err as DomainError)` cast in `store.test.ts` → `instanceof` type guard. (f219b21)
- GP-16 (2): `DEFAULT_MODEL` and `DEFAULT_GEMINI_MODEL` exported but only used in their own files → no longer exported. (ded24ea)
- GP-19 (1): malformed `**/` doc comment on `JsonlTracer` that also left out the `latest.jsonl` copy → fixed. (f67e488)
- GP-20 (1): FEATURES.md F3 named the `ModelError` kinds `server`/`bad_request`; the code uses `server_error`/`invalid_request` → doc updated. (2ac70ba)
- GP-13 (1): `buildSystemPrompt` had no test for the rules F4 requires → 3 tests added, no code changed. (2214ad5)
- Duplication (3 copies): the four-tool registry was built by hand in `registry.test`, `loop.test` and `trace.test` → one `makeRegistry()` next to `makeCtx` in `tests/unit/tools/helpers.ts`. (20a66d6)
**Checked, no violation:** GP-03 (`telemetry/`, `tests/live/`, `scripts/trace.ts` are in ARCHITECTURE.md), GP-06 (zod only at edges: tool input, trace files), GP-08 (`ToolResult`, trace events and `model_call`/`tool_call` are unions on `ok`), GP-09 (refund rules enforced in tools, not only in the prompt), GP-10 (adapters turn provider failures into `ModelError`; the only `throw` left in an adapter is a programmer-bug check), GP-11 (every model and tool call is traced). Exported types used only inside another export's signature (`StopReason`, `TracerOptions`, `ToolRisk`, `OrderItem`, `OrderStatus`, `ModelErrorKind`) are kept: callers need them to type those values.
**Metrics:** source LOC 1172 (`src/`, was 505 after F2); tests 151 unit + integration, 1 e2e, plus 4 opt-in live; eval n/a. Violations: 9 found, 9 fixed.
**Rule improvements:** GP-20 showed up twice since the last pass (`runAgent` vs `runAgentLoop`, then the error kinds), both names in backticks in the docs that no longer exist in `src/`. Proposal for the F11 checker: flag backticked identifiers in FEATURES.md/ARCHITECTURE.md that look like code names (`camelCase(`, `"snake_case"` kinds) and don't appear anywhere in `src/`. GP-19 (stale or wrong comments) also repeated (the "thinking boxes" wording, the wrong `latest.jsonl` reason, the malformed comment), but it needs judgment, so it stays `[review]`.
**Backlog:** unchanged (import style, `MS_PER_DAY`, mixed indentation; a formatter in F11 would settle the last one, which now also covers `anthropic.ts`). `scripts/trace.ts` has no automated test yet; F6's e2e tests are the natural place.
**Next:** F6 CLI.

### 2026-10-27: F5 Tracer and trace summarizer  (see commit)
**Summary:** Every run can now be recorded. The loop emits `run_start`, `model_call`, `model_response` and `run_end`; the registry emits `tool_call` for every tool execution, failures included. `MemoryTracer` keeps events for tests, `JsonlTracer` writes one redacted JSON line per event and copies the file to `latest.jsonl` on `run_end`, and `noopTracer` is the default. `npm run trace -- <file>` prints totals and a timeline.
**Files:** added `src/telemetry/{types,tracer,summarize}.ts`, `scripts/trace.ts`, `tests/unit/telemetry/tracer.test.ts`, `tests/integration/agent/trace.test.ts`. Changed `src/agent/loop.ts` (tracing; split into `runAgentLoop`, `loop`, `callModel`), `src/tools/registry.ts` (traces each call; `console.error` replaced by a `detail` field), `src/tools/types.ts` (real `Tracer`), `tests/unit/tools/registry.test.ts`, `package.json` (`trace` script), `docs/ARCHITECTURE.md`.
**Concepts learned:** a trace is the agent's flight recorder: what the model and tools actually did, not what the model claimed; emitting means handing a structured event to whatever tracer is plugged in; the tracer stamps `runId`, `seq` and `ts`, so emitters can't get them wrong; a null object (`noopTracer`) removes `if (tracer)` checks everywhere; one zod schema gives both the TypeScript type and the check for trace files read back from disk (validate at the boundary, GP-06); `DistributiveOmit` (`T extends unknown ? Omit<T, K> : never`) removes fields per union member, where plain `Omit` would merge the members; dates are stored as ISO strings because JSON has no date type; `JSON.stringify` with a replacer redacts secrets by field name and by shape (GP-12); `?.`, `??` (not `||`, which also replaces 0) and the ternary handle missing values; tracing sits outside the tool's `try`, so a tracer failure can't make a real refund look failed.
**Tests:** 148 unit + integration (10 new: tracer/summarize unit 6, trace integration 4; the registry console spy test was rewritten to read the trace), 1 e2e, eval stub; `npm run verify` exits 0.
**Human-tester pass:**
- Wrote a real trace to `traces/` from a scripted refund with a clock advancing 7 ms per reading, and ran `npm run trace -- traces/latest.jsonl`: events in order, `seq` 0–12, totals right (4 steps, 3 tool calls, 1 failed, 3742/123 tokens, 189 ms).
- Planted an `apiKey` field and an `sk-ant-…` string in tool inputs: neither appears in the file.
- `npm run trace` with a missing file prints one clear line and exits 1.
- Bug: a multi-line zod error broke the timeline onto two lines → `shorten` now collapses whitespace; regression test added.
- Bug during the build: `JsonlTracer` copied to `last.jsonl`, not `latest.jsonl`; the round-trip test caught it.
**Decisions / deviations from spec:** `JsonlTracer` appends each event as it happens (no buffer), so a crashed run still leaves a trace; "flush on run_end" is the `latest.jsonl` copy, made with a copy, not a symlink (symlinks need admin rights on Windows). The event schema is written once in zod and the type inferred from it. Redaction also covers Gemini-style keys (`AIza…`). `tools/` now imports `telemetry/` (ARCHITECTURE.md updated). Unexpected tool errors keep their stack in a `detail` field that only the trace sees.
**Next:** the cleanup pass (due after F5), then F6 CLI, which will create a `JsonlTracer` per real run.

### 2026-10-19: F4 Agent loop  (see commit)
**Summary:** `runAgentLoop` runs the ReAct loop: call the model, run every requested tool through the registry, append one assistant message and one user message of matching `tool_result`s, and repeat until the model answers in text (`final_answer`), the step budget runs out (`max_steps`), or the model fails (`model_error`). `buildSystemPrompt()` gives the model its role, the policy and the working rules.
**Files:** added `src/agent/{types,loop,prompt}.ts`, `tests/integration/agent/loop.test.ts`. Changed `src/domain/store.ts` (`listRefunds()`, needed to check "exactly one refund" and later by evals) and `tests/unit/domain/store.test.ts`.
**Concepts learned:** the loop only knows `ModelClient`, so it works with `ScriptedModel`, Claude or Gemini unchanged; copy the input array (`[...config.messages]`) so the caller's history is never mutated, and a shallow copy is enough because messages are only appended; keep the model's whole reply, thinking blocks included; answer every `tool_use` of one turn in a single user message, in order, run sequentially so writes are predictable; tool failures are values (`isError: true`) the model can read and recover from, while only `ModelError` is caught, so real bugs fail loudly; a required `messages` field (not `messages?`) moves the work into the loop instead of every caller (GP-08); `Extract<Union, {...}>` names one member of a union; TypeScript 5.5+ infers type predicates in `filter`; the clock and store are injected, so integration tests are deterministic.
**Tests:** 138 unit + integration (9 new loop tests covering all 6 acceptance cases plus thinking-block retention, usage totals and the empty reply, 1 new store test), 1 e2e, eval stub; `npm run verify` exits 0.
**Human-tester pass:** ran the loop from a scratch script with scripted models and read every message:
- Happy refund: 4 steps, ids match across each `tool_use`/`tool_result` pair, one refund in the store.
- Another customer's order: the tool answers "not found" (no leak), and the run ends normally.
- The same refund twice: the second call gets `FULLY_REFUNDED` as an error result; one refund recorded. No lookup was required first; that guardrail comes in F7.
- Unknown tool name: error result listing the real tools, no crash.
- `maxSteps: 0`: `max_steps` with 0 steps and the input unchanged.
- Empty model reply: first ended as `final_answer` with empty text, leaving an empty assistant message that real APIs reject on the next call → fixed: a reply with no text and no tool call now stops with `model_error` and stays out of the history (regression test added).
**Decisions / deviations from spec:** the function is named `runAgentLoop`; FEATURES.md and ARCHITECTURE.md were updated to match. Tools in one turn run sequentially, not in parallel; the spec only requires all to be executed and answered. `max_tokens` replies with text only are treated as `final_answer`. `prompt.ts` reads the window from `REFUND_WINDOW_DAYS` so the prompt can't drift from the policy.
**Next:** F5 tracer and trace summarizer, then the cleanup pass (due after F5).

### 2026-10-18: F3 follow-up: Gemini adapter and live tests  (see commit)
**Summary:** A second `ModelClient`, `GeminiModel`, backed by `@google/genai` (default model `gemini-3.8-flash`). Added opt-in live tests for both adapters in `tests/live/`, run with `npm run test:live` and never by `verify`.
**Files:** added `src/llm/gemini.ts`, `tests/unit/llm/gemini.test.ts`, `tests/live/{anthropic,gemini}.live.test.ts`, `vitest.live.config.ts`. Renamed `anthorpic.test.ts` → `anthropic.test.ts`. Changed `package.json` (`@google/genai`, `test:live`), `.env.example`, `docs/{ARCHITECTURE,TESTING}.md`.
**Concepts learned:** the adapter pattern paid off; a second provider is one new file, and nothing outside `src/llm/` changed. Gemini differs in shape (`model` role, `parts`, `functionResponse` answered by name, `thoughtSignature` on the next part, `STOP` even on tool calls, optional call ids), and the adapter hides all of it behind our types. Offline fake tests check every branch of our translation deterministically; live tests check our assumptions about the real API (only a real call can say whether Gemini accepts the schema or the signature round trip). Env var names are case-sensitive, and Vitest doesn't load `.env` on its own, so `test:live` uses `node --env-file-if-exists`.
**Tests:** 128 unit (16 new for Gemini), 1 e2e, eval stub; `npm run verify` exits 0. Live: Gemini 2/2 passed (text reply and a tool-call round trip, including the signature); Anthropic fails with a 400 "credit balance too low" (no credit on the account).
**Human-tester pass:**
- Live tests were skipped at first: `.env` held `GOOGLE_API_key` (wrong name and case) → renamed to `GEMINI_API_KEY`.
- `vitest.live.config.ts` was first placed in `tests/live/` → moved to the repo root, where the script looks.
- `npm run test:live` runs every live file; `npm run test:live -- gemini` runs only Gemini.
**Decisions / deviations from spec:** F3 lists multiple providers as out of scope; added at the user's request because the Anthropic account has no credit. GP-01 now also limits `@google/genai` to `src/llm/gemini.ts` (separate `docs(principles)` commit). Gemini's `thoughtSignature` is carried in our existing `thinking` block, so `ContentBlock` didn't change. An invalid Gemini key may arrive as HTTP 400 and map to `bad_request`, not `auth` (no message matching). Nothing chooses a provider yet; that happens in F4/F6 wiring.
**Next:** F4 agent loop.

### 2026-10-13: F3 Model interface, ScriptedModel, Anthropic adapter  (see commit)
**Summary:** The model boundary. `ModelClient` is a one-method contract (`complete(request)`) with our own `Message`/`ContentBlock` types. `ScriptedModel` replays canned responses offline and records every request. `AnthropicModel` translates our types to and from the SDK and maps SDK errors to a typed `ModelError`.
**Files:** added `src/llm/{types,scripted,anthropic}.ts`, `tests/unit/llm/{scripted,anthorpic}.test.ts`. Changed `package.json`/lock (`@anthropic-ai/sdk`), `docs/ARCHITECTURE.md` (`thinking` block).
**Concepts learned:** an adapter is a translator at the edge, so the rest of the code never sees provider names and swapping providers means writing one new file; `interface` is the contract and `implements` makes the compiler check a class against it; the system prompt is a separate field on the request, not a message role; `ContentBlock` is a discriminated union, and a `switch` over `block.type` fails to compile until every variant is handled; dependency injection (`SdkClient`, `ModelClient`) lets tests pass fakes; `structuredClone` snapshots the request, because the agent mutates its messages array after each call; a thinking block carries a `signature` and must be sent back unchanged in tool loops; only SDK errors are mapped to `ModelError`, anything else is a bug and propagates.
**Tests:** 112 unit (13 new: ScriptedModel 4, adapter 9), 1 e2e, eval stub; `npm run verify` exits 0.
**Human-tester pass:**
- Adding `thinking` to `ContentBlock` made `tsc` fail with "lacks ending return statement" in `toSdkBlock` until the case was added (exhaustiveness check working as intended).
- Fake SDK replies are typed against the real SDK types, so a missing `caller` on `tool_use` was caught at compile time (fixed in the test).
- A new thinking test failed with `content: []` because the incoming loop dropped thinking blocks → fixed by adding the branch.
- No real API call was made; the optional live check is not written yet.
**Decisions / deviations from spec:** added a `thinking` variant to `ContentBlock` (not in the spec) so the signature survives tool loops on thinking models. `redacted_thinking`, images and server-tool blocks are left out (GP-04). Default model id `claude-opus-5-5` taken from the `claude-api` skill. Unsupported stop reasons (`refusal`, `pause_turn`, `stop_sequence`) become `ModelError("bad_request")` until the loop handles them. The test file is named `anthorpic.test.ts` (typo).
**Next:** F4 agent loop. It must append the model's whole `content` as the assistant message, keeping thinking blocks. Cleanup is due after F5.

### 2026-10-06: Cleanup after F0–F2  (481dc64..ef95f47)
**Baseline:** `npm run verify` green, 99 unit + 1 e2e; eval not implemented yet (stub output identical before and after).
**Mechanical scan** (grep fallback, F11 checker not built): no `any`, `.only`/`.skip`, orphan TODOs or real-clock calls in `src`; no file over 200 lines (largest `store.ts`, 162).
**Violations found → fixed:**
- GP-03/GP-20 (1): tools lived in root `tools/`, outside `src/` and outside ARCHITECTURE.md → moved to `src/tools/`; ARCHITECTURE now lists the real snake_case file names and `order_access.ts`. (481dc64)
- GP-05 (1): `tool as AnyTool` cast in `register` was unnecessary → removed. (e833796)
- GP-16 (11): tool-local input schemas and input/output types were exported but unused elsewhere → no longer exported. (b191099)
- GP-19 (2): stale comment pointing at a "note below" that didn't exist, and a comment restating the code → removed. (81488f5)
- GP-18 (1, deferred): `console.error` in the registry is the planned F5 hand-off → marked `TODO(F5)`, kept in backlog. (ef95f47)
**Checked, no violation:** GP-06 (validation happens once, in `registry.execute`), GP-08 (`ToolResult` is a union), GP-09/GP-10 (ownership and policy are enforced in code; tools throw `DomainError` and the registry turns it into an error value), GP-13 (every tool has happy-path, invalid-input and domain-error tests). A suspected stale `lookup_order` description was already fixed in the F2 commit.
**Metrics:** source LOC 505 (`src/`); tests 99 unit, 1 e2e; eval n/a. Violations: 16 found, 15 fixed, 1 deferred to F5.
**Rule improvements:** none yet; each `[review]` violation appeared once. GP-16 (unused exports) is a candidate for the F11 checker.
**Next:** F3.

### 2026-10-06: F2 Tool layer  (not yet committed)
**Summary:** The agent's whole action surface: four zod-validated tools (`lookup_order`, `check_refund_policy` read; `issue_refund`, `escalate_to_human` write) and a `ToolRegistry` that validates input, runs tools, and turns every failure into `{ ok: false, error }` without ever throwing. `toModelSchemas()` converts the zod schemas to the JSON Schema the model sees.
**Files:** added `tools/{types,registry,order_access,lookup_order,check_refund_policy,issue_refund,escalate_to_human}.ts`, `tests/unit/tools/*.test.ts` + `helpers.ts` + registry snapshot. Changed `src/domain/types.ts` (`Ticket`, `REFUND_NOT_ELIGIBLE`), `store.ts` (`createTicket`), `policy.ts` (`FULLY_REFUNDED` reason), `policy.test.ts`.
**Concepts learned:** the LLM decides *when* and *with what* to call a tool, and the tool only does the work; `name`/`description`/`.describe()` are written for the model, which only sees `toModelSchemas()` output; each tool enforces its own preconditions (ownership, policy) because the model is an untrusted caller that can skip tools or pass made-up data; write tools re-check policy at the moment of acting (time-of-check vs time-of-use); "not eligible" is a normal result for a read tool but an error for a write tool; `safeParse` + discriminated-union results keep the registry from throwing; `DomainError` messages are safe for the model, unexpected errors get a generic message and are logged; a fresh store per test (`makeCtx`) keeps tests independent of order.
**Tests:** 98 unit (policy 20, store 18, tools 60: registry 15, check_refund_policy 13, issue_refund 13, lookup_order 7, escalate_to_human 7, order_access 5), 1 e2e, eval stub; `npm run verify` exits 0.
**Human-tester pass:**
- tsx probe through `registry.execute` on a seeded store: `check_refund_policy ord_partial_refund` → eligible, max 4500; `issue_refund ord_small 2499` → `ref_1`; the same refund again → `ok:false` "FULLY_REFUNDED. Max refundable: 0 cents."
- Bad input: `issue_refund {orderId: 42}` → `ok:false` listing all three field problems (orderId, refundCents, reason); unknown tool `refund_all` → `ok:false` listing the four real tools. Nothing threw.
- `lookup_order ord_other_customer` → same "not found" message as a missing order; `escalate_to_human` with an extra `customerId: "cust_2"` → ticket created, extra key ignored.
- Bugs found during the build and fixed before commit: refund input field named `totalCents` (model could copy the order total) → renamed `refundCents`, and `.int()` added; empty `Tracer {}` interface failed lint → minimal `emit(event)` shape.
**Decisions / deviations from spec:** ownership is checked in the tools via `getOwnedOrder` (spec puts authorization in F7; kept as defense in depth next to the F7 `ownerMatches` guardrail). Missing and not-owned orders give the same `ORDER_NOT_FOUND` so IDs can't be probed. `check_refund_policy.requestedCents` is optional and defaults to the remaining balance. Added `FULLY_REFUNDED` policy reason (checked before the amount checks). `issue_refund` takes only `orderId`/`refundCents`/`reason` and recomputes eligibility itself rather than trusting an earlier check. Ticket ownership can't be read back yet; `OrderStore.listTickets` is scheduled in F13.
**Next:** cleanup pass (due after 3 features), then F3 model interface + `ScriptedModel` + Anthropic adapter. Risk: mapping our `ToolSchema` to the SDK's `input_schema` and back.

### 2026-10-01: F1 Fake domain  (see commit)
**Summary:** The "company system" the agent will act on: typed orders with integer cents, an `InMemoryOrderStore` that guards data invariants and throws `DomainError`, 9 seed orders covering every spec case, and a pure `evaluateRefund(order, cents, now)` with the clock injected.
**Files:** `src/domain/{types,store,policy}.ts` (prior commit d5cc99b); added `tests/unit/domain/{policy,store}.test.ts`; `vitest.config.ts` now runs `tests/unit` + `tests/integration` (it was pointing at e2e); removed placeholder `tests/smoke.test.ts`.
**Concepts learned:** pure functions + injected clock make policy deterministic to test; table-driven tests (`it.each`) put one case per row; boundary tests (day 30 vs 31, last minute of day 30) catch `>` vs `>=` bugs; `structuredClone` deep copies keep stores from sharing state by reference; data invariants (store) vs time-based policy (`evaluateRefund`) live in separate places.
**Tests:** 37 unit (policy 19, store 18), 1 e2e, eval stub; `npm run verify` exits 0.
**Human-tester pass:**
- Ran a tsx probe against a fresh seeded store: `ord_small` 2499c → eligible; `ord_day31` → `OUTSIDE_WINDOW`, max 0; refund 1000c on `ord_small` → `ref_1`.
- Bad input: 1500c after that refund → `OVER_REFUND`; 0.5c → `INVALID_AMOUNT`; unknown id → `ORDER_NOT_FOUND`; shipped order → `ORDER_NOT_DELIVERED`. All are `DomainError`s, nothing else thrown.
- `src/domain` has no `TODO`, no `any`, and no `Date.now()` calls.
- Bugs found: none.
**Decisions / deviations from spec:** seed has 9 orders (day-30 and day-31 boundaries split into two). `evaluateRefund` ignores ownership on purpose; that is the F7 `ownerMatches` guardrail. The store also refuses non-delivered orders (`ORDER_NOT_DELIVERED`) as a data invariant.
**Next:** F2 tool layer (schemas + registry). Risk: zod → JSON Schema conversion for `toModelSchemas()`.

### 2026-09-29: F0 Project scaffold  (f4e6aa8)
**Summary:** TypeScript ESM project with strict typechecking, ESLint, and vitest unit + e2e configs. `npm run verify` runs typecheck → lint → test → eval → e2e and stops on the first failure.
**Files:** `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `vitest.e2e.config.ts`, `scripts/verify.sh`, `src/index.ts`, `tests/smoke.test.ts`, `tests/e2e/smoke.e2e.test.ts`, `.env.example`.
**Concepts learned:** a single `verify` gate gives fast, trustworthy feedback; `eval`/`chat`/`trace` are stubs so later features plug into existing scripts.
**Tests:** 1 unit, 1 e2e, eval stub; `npm run verify` exits 0. `git check-ignore` confirms `.env` and `traces/` are ignored and `.env.example` is not.
**Decisions / deviations from spec:** none (`.env.example` key casing fixed after review).
**Next:** F1 fake domain (orders, store, refund policy).

### 2026-09-29: Planning docs: Week 2 Slack channel
**Summary:** Added F13–F15. The agent joins a shared Slack channel where reps talk to it in threads, a read-only Auditor agent reviews refunds that need approval, and approvers decide with Approve/Deny buttons. Built behind a `ChatTransport` interface with an in-memory `FakeSlack`, so it stays testable offline.
**Next:** unchanged (F0).

### 2026-09-29: Planning docs
**Summary:** Set up the learning plan: Refund Desk Agent use case, architecture, 7-day roadmap, feature specs F0–F12, testing strategy, golden principles, cleanup process, agent manual and skills. No code yet.
**Next:** F0 project scaffold.
