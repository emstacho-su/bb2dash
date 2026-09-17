# 80h — W-31 (grades) verification note

Phase 12b, branch `fix/page-pass-12b-grades`, worktree `bb2dash-wt-12b-grades`.
Rows from §Item task list of `80c_PHASE12B_page_pass.md`: **G-0** (gate), then the
method-independent rows **G-3, G-4, G-5, G-6** and the collapsible half of **G-2**.
**G-1 and the header-figure half of G-2 are not started** — they wait on Stack's pick.

Baseline on the branch before any of this work: **87 test files, 1342 tests, all passing.**

---

## G-0 — grade-method comparison suite (P-grades-3, P-grades-1 method) — **done, gate open**

### What was built

| file | what it is |
|---|---|
| `web/src/lib/grade-so-far.ts` | the two new pure functions, `pointsRatio` and `weightedSoFar`, over one input shape (latest gradebook rows + `grade_components` + column → part links). No I/O, no clock, no mutation. |
| `web/test/grade-method-comparison/types.ts` | the fixture shape, declared locally so the fixtures survive whatever G-1 deletes |
| `web/test/grade-method-comparison/builders.ts` | terse fixture builders |
| `web/test/grade-method-comparison/fixtures/01…17-*.ts` | **17 fixtures**, one file each, every one carrying its hand-written derivation as a comment |
| `web/test/grade-method-comparison/methods.ts` | the three methods behind one signature, plus one measured variant; the **only** file that imports `grade-model/` |
| `web/test/grade-method-comparison/report.ts` | scoring and the markdown |
| `web/test/grade-method-comparison/comparison.test.ts` | the run; writes `docs/planning/80e_GRADE_METHOD_COMPARISON.md` |

### Executable check (the brief's: "≥ 12 fixtures, each asserts its hand-derived truth")

```
$ npx vitest run test/grade-method-comparison
 Test Files  1 passed (1)
      Tests  106 passed (106)
```

17 fixtures ≥ 12. Each one is asserted three ways:

1. `%s states a truth its own written-out arithmetic reproduces` — the fixture's `derivation()`
   is the arithmetic of the comment written out in TypeScript, calling **none** of the three
   implementations, and it must reproduce the declared `truth.pct` to ten decimal places. A
   fixture whose truth does not follow from its own arithmetic cannot pass.
2. `%s is labelled dummy data…` — every fixture's `courseId` must start `DUMMY.`, so no figure
   in this suite can be mistaken for Blackboard's. Nothing here renders anywhere.
3. every method × fixture returns a well-formed outcome.

### Fixture coverage against the brief's list

| the brief asks for | fixture |
|---|---|
| weighted scheme | F01 |
| points scheme | F02 |
| drop-lowest | F03 |
| zero-point completion columns | F04 |
| extra credit (score > possible) | F05 |
| one part wholly ungraded | F06 |
| an unlinked column | F07 |
| an exempt item | F08 |
| a course with nothing graded | F09 |
| mixed point scales inside one part | F10 |
| a rank-weighted exam part | F11 (the engine supports `rank_weighted`) |
| one modelled on each real course's scheme shape | F12 ECN.304 · F13 GEO.103 · F14 IST.352 · F15 IST.323 · F16 IST.466 · F17 IST.471 |

### Headline result (full table in `80e_GRADE_METHOD_COMPARISON.md`)

| method | stated a number | mean abs error | max abs error | invented a grade | refused a real grade |
|---|---|---|---|---|---|
| Points ratio | 15 of 15 | 4.1739 | 20.4545 (F10) | F17 | none |
| Weighted so far | 15 of 15 | 3.2363 | 20.4545 (F10) | none | none |
| 10b engine | 12 of 15 | 0.1250 | 1.5000 (F16) | none | F12, F13, F14 |
| 10b engine, gates off | 15 of 15 | 0.0000 | 0.0000 | none | none |

The fourth row is **a variant of the third, not a fourth candidate**: the same engine with its
two silencing rules bypassed — the unsure-link muting side-stepped by confirming the links in
the *input*, the unscored-hand-graded gate by calling `evaluateModel`, the engine's own ungated
entry point (the same door Phase 10b's L4 test uses). **No engine code was changed.** It is in
the report because the table shows those two rules are the only places the engine's arithmetic
parts company with a hand-derived grade, and the decision is better made knowing what fixing
them is worth.

Fixtures that separate the methods:

* **F03** (drop-lowest) and **F10** (mixed point scales in one part) split the engine from both
  slim methods by 15 and 20.5 points.
* **F07** (unlinked column, 7 points) and **F15** (IST.323's normalised category, 13.5 vs 7.8)
  split the points ratio from the weighted calculation.
* **F12, F13, F14** split the engine from both the other way: it says nothing at all where a
  true grade exists, which is what the preview does on three of the six real course shapes.
* **F16** is the engine's only wrong number: muting an unsure link drops a graded 135/150.
* **F17** is the points ratio's disqualifier: it prints 100 % for a qualitatively graded course.

### Honesty

No fabricated numbers: every fixture is invented data on a real *scheme shape*, labelled DUMMY
in its own file and asserted to be so by the suite. Nothing in `web/test/grade-method-comparison/`
is imported by any component. `80e` is generated, deterministic (no clock, no randomness) and
carries a "do not edit by hand" line.

### Note for whoever runs G-1

`ScoreHistory` must survive in every outcome (the desktop poller reads `v_gradebook_history`).
It currently depends on three 10b modules: `grade-model-format.ts` (`HISTORY_LABEL`,
`historyText`), `grade-model-input.ts` (`GradebookHistoryRow`) and `grade-model-view.ts`
(`columnItemKey`, `historyByColumn`). If the engine's query layer is retired, those four
symbols move to `queries.grades.ts` rather than being deleted with it.

**Nothing has been deleted. Stack reads `80e` and picks; the PM resumes this worker with the
pick.**
