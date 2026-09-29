# Progress Log

Append-only: the newest entry goes at the **top** of "Entries". The coding agent writes one entry per finished feature and one per cleanup pass.

## Status
- Current feature: **F0** (not started)
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

### 2026-09-29: Planning docs
**Summary:** Set up the learning plan: Refund Desk Agent use case, architecture, 7-day roadmap, feature specs F0–F12, testing strategy, golden principles, cleanup process, agent manual and skills. No code yet.
**Next:** F0 project scaffold.
