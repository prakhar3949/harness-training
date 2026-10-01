# Progress Log

Append-only: the newest entry goes at the **top** of "Entries". The coding agent writes one entry per finished feature and one per cleanup pass.

## Status
- Current feature: **F2** (not started)
- Last cleanup: none
- Eval pass rate: n/a

## Open issues
_(bugs found but not yet fixed, spec questions for the user)_
## Cleanup backlog
_(leftovers from time-boxed cleanup passes)_

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
