---
name: cleanup
description: Run the recurring cleanup pass defined in docs/CLEANUP.md against docs/GOLDEN_PRINCIPLES.md. Use when the user says "run cleanup", after every 3 features, or at week's end.
---

# Cleanup pass

Follow `docs/CLEANUP.md` exactly. Summary:

1. `npm run verify` green; save `npm run eval` output as the baseline for this pass.
2. Mechanical scan: `npm run check:principles -- --fix-list` (or the grep fallback in CLEANUP.md before F11).
3. Review scan over files changed since the last `cleanup-*` tag using the checklist in CLEANUP.md.
4. Fix one principle at a time. Each gets its own `chore(cleanup): GP-xx …` commit. **No behavior changes.** A found bug becomes a separate `fix:` commit with a regression test.
5. Re-run verify; eval output must match step 1.
6. Add a "Cleanup" entry to PROGRESS.md: violations found/fixed by GP id, LOC and test counts, backlog. Update "Last cleanup".
7. If a `[review]` violation repeated, propose making it `[mechanical]`.
8. `git tag cleanup-YYYY-MM-DD`, push the branch and the tag.

Time box: 60 minutes of work; put leftovers in the "Cleanup backlog".
