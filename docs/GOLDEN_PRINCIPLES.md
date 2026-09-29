# Golden Principles

These rules stay in the repo permanently. They exist so that the recurring cleanup ([`CLEANUP.md`](CLEANUP.md)) has a fixed yardstick: **cleanup = find violations of these principles and remove them.**

Tags:
- **[mechanical]** – checked by `scripts/check-principles.ts` (built in F11). Violations fail `npm run verify`.
- **[review]** – needs judgment; checked during the cleanup pass and code review.

Each principle has an ID so commits, reviews and the checker can cite it (e.g. `fix(GP-07): …`).

---

## A. Structure

**GP-01 Layers only point downward.** [mechanical]
Imports follow the dependency diagram in `ARCHITECTURE.md`. `domain/` and `telemetry/` import nothing else from `src/`. Only `src/llm/anthropic.ts` imports `@anthropic-ai/sdk`.

**GP-02 One concept per file; files stay small.** [mechanical]
Max 200 lines per source file, 60 lines per function. If you hit the limit, the file is doing two things.

**GP-03 Put code where the architecture says it goes.** [review]
A new folder or top-level file requires updating `ARCHITECTURE.md` in the same commit.

**GP-04 No speculative code.** [review]
Don't build for features not in `FEATURES.md`. No "just in case" options, generic plugin systems, or unused parameters. Three concrete copies before an abstraction.

## B. Types and data

**GP-05 No `any`, no non-null `!`, no unchecked casts.** [mechanical]
Use `unknown` + zod at the boundary. `as` is allowed only for `as const`.

**GP-06 Validate at boundaries, trust inside.** [review]
Model output, tool input, CLI args, env vars and eval files are parsed with zod once, at the edge. Internal code takes already-typed values and does not re-check them.

**GP-07 Money is integer cents; time is injected.** [mechanical]
No floats for money. No `Date.now()` / `new Date()` outside `cli/` and the default clock in one place.

**GP-08 Make illegal states unrepresentable.** [review]
Prefer discriminated unions (`{ok:true,data}|{ok:false,error}`) over optional-field soup.

## C. Behavior and safety

**GP-09 Prompts advise, code enforces.** [review]
Any rule that matters (limits, ownership, no duplicates) lives in a guardrail with a test, not only in the system prompt.

**GP-10 Expected failures are values, not exceptions.** [review]
Tools and the loop return error results for anything the model can cause. Exceptions are for programmer bugs and are caught at the loop boundary.

**GP-11 Every side effect is a traced tool call.** [review]
If it changes state or talks to the outside world, it goes through a tool and shows up in the trace.

**GP-12 Never log secrets or full customer PII.** [mechanical for key patterns, review otherwise]

## D. Tests

**GP-13 Every behavior has a test; every bug fix has a regression test.** [review]

**GP-14 Tests are deterministic and offline.** [mechanical]
No network, no real clock, no unseeded randomness, no `.only` / `.skip` committed.

**GP-15 Evals grade world state, not wording.** [review]

## E. Hygiene

**GP-16 No dead code.** [mechanical]
No unused exports, unused files, commented-out code blocks, or unused dependencies.

**GP-17 No orphan TODOs.** [mechanical]
`TODO` must be `TODO(F<n>|#<issue>): …` pointing at a planned feature or issue.

**GP-18 `console.*` only in `cli/` and `scripts/`.** [mechanical]
Everything else reports through return values or the tracer.

**GP-19 Names say what, comments say why.** [review]
No comments that restate code. A comment explains a non-obvious reason, constraint or link to a spec/ADR.

**GP-20 Docs match code.** [review]
If `ARCHITECTURE.md`, `FEATURES.md` or `README.md` describe something that no longer exists, fix the doc or the code in the same change.

**GP-21 Small, descriptive commits.** [review]
One feature or one cleanup theme per commit. Conventional-commit style (see `AGENTS.md`).

---

## Changing the principles
Principles change only through a commit titled `docs(principles): …` that explains why, and (if mechanical) updates `check-principles.ts` and its fixtures in the same commit.
