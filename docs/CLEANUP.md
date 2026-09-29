# Recurring Cleanup Process

Garbage accumulates when code is written fast (by humans or agents). This ritual removes it on a schedule, measured against [`GOLDEN_PRINCIPLES.md`](GOLDEN_PRINCIPLES.md).

## When
- After every **3 completed features**, and
- at the end of every week, and
- whenever `check-principles` reports ≥ 5 violations.

Trigger it by telling the agent **"Run cleanup"** (runs `.claude/skills/cleanup/SKILL.md`).

## Rules of the cleanup pass
- **No behavior changes.** Tests and eval baseline must be identical before and after. If a cleanup reveals a bug, stop, file it in `PROGRESS.md` "Open issues", fix it in a separate `fix:` commit with a regression test.
- **One principle per commit** (`chore(cleanup): GP-16 remove unused exports`), so each is easy to review/revert.
- **Time-boxed**: 60 minutes. Leftovers go into the "Cleanup backlog" section of `PROGRESS.md`.

## Steps

1. **Baseline.** `npm run verify` must be green. Save `npm run eval` output.
2. **Mechanical scan.** `npm run check:principles -- --fix-list` (before F11 exists: run `tsc --noEmit`, `eslint`, and `grep -rn "TODO\|console\.\|any\b\|\.only\|\.skip" src tests`).
3. **Review scan** – walk the checklist below for files changed since the last cleanup (`git diff --stat <last-cleanup-tag>..HEAD`).
4. **Fix**, one principle at a time, commit each.
5. **Re-verify.** `npm run verify` green; eval output identical to step 1.
6. **Record.** Add a "Cleanup" entry to `PROGRESS.md` (violations found/fixed per GP id, backlog). Tag: `git tag cleanup-YYYY-MM-DD`.
7. **Improve the rules.** If the same `[review]` violation showed up twice, try to make it `[mechanical]` (add to the checker) or add a lint rule.

## Review checklist (the `[review]` principles)

- [ ] GP-03 Any new folder/file not reflected in ARCHITECTURE.md?
- [ ] GP-04 Unused options, parameters, generic abstractions with one user?
- [ ] GP-06 Duplicate validation inside the core? Missing validation at an edge?
- [ ] GP-08 Optional-field objects that should be unions?
- [ ] GP-09 Rules only in the prompt?
- [ ] GP-10 `throw` for model-caused failures?
- [ ] GP-11 Side effects outside tools / missing trace events?
- [ ] GP-13 Behaviors without tests? Weak tests (asserting only "no throw")?
- [ ] GP-15 Eval cases that only check wording?
- [ ] GP-19 Comments restating code? Misleading names?
- [ ] GP-20 Docs describing things that don't exist?
- [ ] Duplication: same helper written twice? Test builders copy-pasted?

## Metrics to track in PROGRESS.md
Violations by GP id, total source LOC, test count, eval pass rate. The trend should be flat or improving.
