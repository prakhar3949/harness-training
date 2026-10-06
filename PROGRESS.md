# Progress Log

Append-only: the newest entry goes at the **top** of "Entries". The coding agent writes one entry per finished feature and one per cleanup pass.

## Status
- Current feature: **F3** (not started)
- Last cleanup: 2026-10-06 (after F2; next due after F5)
- Eval pass rate: n/a

## Open issues
_(bugs found but not yet fixed, spec questions for the user)_

## Cleanup backlog
_(leftovers from time-boxed cleanup passes)_
- GP-18: `ToolRegistry.execute` logs unexpected errors with `console.error` (marked `TODO(F5)`); replace with a tracer event in F5.
- Import style is mixed: tools import siblings with `.ts` and `.js` extensions, and `{z}` vs `{ z }`. Pick one; a lint rule could enforce it (F11).
- `MS_PER_DAY` is defined in `policy.ts`, `store.ts` and two test files. Not yet three copies in `src/`, so no shared helper (GP-04); revisit if a third appears.

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
