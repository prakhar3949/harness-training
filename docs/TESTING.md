# Testing: everything a human tester would do, automated

The building agent must verify its own work the way a careful human would: **read the spec, run the code, poke the edges, look at the output.** "The tests pass" is necessary, not sufficient.

## The test pyramid for this repo

| Level | Where | Speed | What it proves |
|---|---|---|---|
| Unit | `tests/unit/**` mirrors `src/**` | ms | Pure functions, tools, guardrail rules, schema edges |
| Integration | `tests/integration/**` | < 1s each | Loop + tools + guardrails + context + tracer with `ScriptedModel` |
| Eval | `evals/` (`npm run eval`) | seconds | Behavior on realistic scenarios, graded on world state |
| E2E | `tests/e2e/**` spawns `node`/`tsx src/cli/main.ts` | seconds | The real binary: flags, exit codes, stdout, trace files |
| Human-tester pass | manual commands the agent runs and inspects | minutes | Things tests didn't think of |

All of it (except live evals) runs **offline and deterministically**. No test may call the network. The clock is injected; tests use a fixed `now`.

## Human-tester pass (the agent does this after every feature)

Before committing, the agent runs and **reads the output** of:

1. `npm run verify` – full green.
2. **Happy path by hand**: run the CLI (`npm run chat -- --scripted <scenario> --once "…"`) for the feature's main scenario. Read stdout. Does it make sense to a customer?
3. **Break it on purpose** (at least 3):
   - Bad input: empty message, huge message (10k chars), unicode/emoji, order id with spaces, negative/float amounts.
   - Bad environment: missing API key, unwritable trace path, unknown flag.
   - Bad model: scripted model returns garbage tool name / invalid JSON args / never stops.
4. **Inspect artifacts**: open the trace (`npm run trace -- traces/latest.jsonl`). Are events in order? Any secret leaked? Anything surprising?
5. **Regression sweep**: re-run the previous feature's main scenario.
6. **Mutation spot-check** (from F7 on): temporarily break one line in the feature (e.g. flip a `>` to `>=`), confirm a test fails, revert. If nothing failed, write the missing test.

Record the pass in `PROGRESS.md` under "Human-tester pass": commands run, what you saw, bugs found (and fixed or filed).

If a manual check finds a bug, **first write a failing test that reproduces it**, then fix.

## Rules for writing tests

- Test behavior through public interfaces, not private helpers.
- Name tests as sentences: `it("denies a refund on another customer's order")`.
- Table-driven tests for rules and boundaries.
- One `ScriptedModel` scenario per behavior; share builders from `tests/helpers/`, not copy-paste.
- Assert on **state** (store contents, trace events, stop reason) before asserting on text.
- No sleeps, no real timers, no network, no randomness without a seed.
- Never `.skip` or `.only` in committed code (enforced in F11).
- A bug fix always comes with a regression test.

## Commands

```bash
npm run typecheck
npm run lint
npm test                 # unit + integration
npm run test:e2e
npm run eval             # offline evals vs baseline
npm run eval -- --live   # optional, needs ANTHROPIC_API_KEY
npm run verify           # all of the above (except live) in order
```
