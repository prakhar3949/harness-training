---
name: build-feature
description: Build the next unfinished feature from docs/ROADMAP.md end to end - implement, test like a human, log progress, commit. Use when the user says "build the next feature" or "build F<n>".
---

# Build one feature

1. **Orient.** Read `PROGRESS.md`, `docs/ROADMAP.md`, the target feature in `docs/FEATURES.md`, `docs/GOLDEN_PRINCIPLES.md`, `docs/TESTING.md`. Run `npm run verify` (if it exists) and confirm it's green.
2. **Mark in progress.** Set the feature to `[~]` in ROADMAP and update "Current feature" in PROGRESS.md.
3. **Plan briefly.** List the files you'll touch and map every acceptance criterion to a test name. Put it in the task list.
4. **Test first where practical.** Write failing tests for the acceptance criteria, then implement until they pass. Keep files small (GP-02).
5. **Verify.** `npm run verify` must be green.
6. **Human-tester pass.** Do every step in `docs/TESTING.md` → "Human-tester pass". Actually run the commands and read the output. For each bug: write a failing test, fix, re-verify.
7. **Self-review.** Read your own diff (`git diff`) against the Golden Principles checklist. Remove dead code, stray logs, TODOs without an ID, and comments that restate code.
8. **Docs.** Update ARCHITECTURE.md if structure changed; mark the feature `[x]` in ROADMAP.
9. **Log.** Add a PROGRESS.md entry using the template (include the concepts learned, the tests and the human-tester findings). Update the Status block.
10. **Commit and push** using the conventions in `AGENTS.md`. Leave the sha out of the PROGRESS entry (git log links them); don't amend pushed commits.
11. **Report** to the user: what was built, how it was tested, what they should read to learn it (2–4 files), and whether cleanup is due (every 3 features).

Stop and ask the user instead of guessing if the spec is ambiguous or an acceptance criterion seems wrong.
