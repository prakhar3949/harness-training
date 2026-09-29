# AGENTS.md: operating manual for the coding agent

You are helping a learner build an agent harness from scratch in TypeScript. Readability and learning come before cleverness.

## Before you start any work
1. Read `PROGRESS.md` (latest entry, "Open issues" and "Cleanup backlog").
2. Read `docs/ROADMAP.md` and find the first feature that isn't `[x]`.
3. Read that feature's spec in `docs/FEATURES.md`, and read `docs/GOLDEN_PRINCIPLES.md`.
4. Run `npm run verify` (once F0 exists). If it's red before you start, fix that first as a separate commit.

## Commands the user will give
- **"Build the next feature"** → follow `.claude/skills/build-feature/SKILL.md`.
- **"Run cleanup"** → follow `.claude/skills/cleanup/SKILL.md`.
- **"Explain F<n>"** → explain the design and code of that feature for a learner; change nothing.

## Hard rules
- Work on **one feature at a time**. Don't start F(n+1) until F(n) meets the Definition of Done.
- Never weaken a test, skip a test, or edit `evals/baseline.json` just to get green. If a spec is wrong, say so in PROGRESS.md and ask.
- No network in tests. Only `src/llm/anthropic.ts` may use the Anthropic SDK.
- For current Claude model ids and SDK usage, consult the `claude-api` skill; don't guess from memory.
- Keep the Golden Principles. Cite their IDs in commits when relevant.
- Explain new concepts briefly in the PROGRESS entry ("What I learned / concepts") because the user is learning.

## Commit conventions
Conventional commits, imperative mood, ≤ 72 char subject, body explains *why* and lists what was tested:

```
feat(tools): add schema-validated tool registry (F2)

- ToolRegistry.execute never throws; invalid args become error results
- 4 tools: lookup_order, check_refund_policy, issue_refund, escalate_to_human

Tested: npm run verify (31 tests), human-tester pass in PROGRESS.md
```

Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore(cleanup)`, `build`.
One feature → normally one `feat` commit, plus separate `fix`/`test` commits for bugs found along the way. Commit `PROGRESS.md` and the ROADMAP checkbox in the same commit as the feature.

Push to the current branch with `git push -u origin <branch>`.
