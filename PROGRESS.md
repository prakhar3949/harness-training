# Progress Log

Append-only: the newest entry goes at the **top** of "Entries". The coding agent writes one entry per finished feature and one per cleanup pass.

## Status
- Current feature: **F1** (not started)
- Last cleanup: none
- Eval pass rate: n/a

## Open issues
_(bugs found but not yet fixed, spec questions for the user)_
- `.env.example` has `ANTHROPIC_API_key =`; F0 spec says `ANTHROPIC_API_KEY=`. Fix the casing before F3 reads the key.

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

### 2026-09-29: F0 Project scaffold  (f4e6aa8)
**Summary:** TypeScript ESM project with strict typechecking, ESLint, and vitest unit + e2e configs. `npm run verify` runs typecheck → lint → test → eval → e2e and stops on the first failure.
**Files:** `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `vitest.e2e.config.ts`, `scripts/verify.sh`, `src/index.ts`, `tests/smoke.test.ts`, `tests/e2e/smoke.e2e.test.ts`, `.env.example`.
**Concepts learned:** a single `verify` gate gives fast, trustworthy feedback; `eval`/`chat`/`trace` are stubs so later features plug into existing scripts.
**Tests:** 1 unit, 1 e2e, eval stub; `npm run verify` exits 0. `git check-ignore` confirms `.env` and `traces/` are ignored and `.env.example` is not.
**Decisions / deviations from spec:** `.env.example` key casing differs from spec (see Open issues).
**Next:** F1 fake domain (orders, store, refund policy).

### 2026-09-29: Planning docs: Week 2 Slack channel
**Summary:** Added F13–F15. The agent joins a shared Slack channel where reps talk to it in threads, a read-only Auditor agent reviews refunds that need approval, and approvers decide with Approve/Deny buttons. Built behind a `ChatTransport` interface with an in-memory `FakeSlack`, so it stays testable offline.
**Next:** unchanged (F0).

### 2026-09-29: Planning docs
**Summary:** Set up the learning plan: Refund Desk Agent use case, architecture, 7-day roadmap, feature specs F0–F12, testing strategy, golden principles, cleanup process, agent manual and skills. No code yet.
**Next:** F0 project scaffold.
