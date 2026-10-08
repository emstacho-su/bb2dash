# Phase 22 style tiles: the evidence for the direction

Date 2026-10-08. Brief: `docs/planning/sprint-2/briefs/103_PHASE22_styling.md`, tasks 6 and 7, its
"Freeze record, amendment 2" and its "Freeze record, amendment 3". The decisions are the DECISIONS rows
"Phase 22 direction: tile D (Charcoal)", "Phase 22 refinement pass" and "Phase 22 refinement: Stack's decisions
D-1 to D-5".

**Every name and number in these files is a sample.** No course, score, person or address in them is real.
Each tile says so on the page.

## The files

| File | What it is |
|---|---|
| `tile-a.html` | Tile A, "Nocturne". Today's look, as a style tile. |
| `tile-b.html` | Tile B, "Chalkboard". |
| `tile-c.html` | Tile C, "Orange". |
| `style-pick.html` | The walkthrough page. It showed A, B and C side by side, one step at a time, and saved Stack's pick. A, B and C were shown through this one page, not as three separate published pages. |
| `tile-d.html` | Tile D, "Charcoal", **as the refinement pass left it** (amendment 3). The fourth direction, designed from Stack's pick and his notes, then refined with the ui-ux-pro-max skill. **This is the direction the phase builds.** |
| `tile-d.before-refinement.html` | Tile D as Stack first saw it, before the refinement pass. Kept so the two can be compared. Nothing reads it. |
| `direction-d.json` | Tile D's values. `dark` is the app's `:root` block. `light` is `:root[data-theme='light']`. `fontsHref` is the Google Fonts address. `typeScale` is the work-type urgency rule. Since the pass it also holds `tileOnly` and `refinement`. |
| `component-changes.json` | 106 component-level changes for direction D: the 55 of amendment 2 and 51 from the refinement pass. Each names the app stylesheet (paths are under `web/src`) and the change. Each of the 51 new ones also names an `owner`. |

Each HTML file is a page body without a document shell. The publishing step adds the shell.

## The two page addresses

* The walkthrough, with Stack's saved pick: https://claude.ai/artifact/1BNFChvdcdEbjMTCbWp3rE
* Tile D: https://claude.ai/artifact/DLqDKhRNFNoSxJ8YQqaoTU. The page has two versions. The first is
  `tile-d.before-refinement.html`, with the five taste calls. The second is `tile-d.html`, the refined tile.

## What changed with the refinement pass (amendment 3, 2026-10-08)

Stack asked for a pass with the ui-ux-pro-max skill before the visual build. It was a design pass. No app code
changed. Its write-up is `docs/planning/sprint-2/verification/103b_PHASE22_REFINEMENT.md`.

* **`tile-d.html` was replaced.** Three fragments are new: the window, drawn twice; states (loading, empty,
  switched off and busy, a list that scrolls); and "Proposed, not applied". Every control eases and answers a
  press, there is one focus ring, the scrollbars are in the theme, and the chrome's controls do not select or
  drag. The tile marks five things "needs your word". Stack has since ruled on each (the brief's D-1 to D-5),
  so the marks are history: the brief says what is built.
* **`direction-d.json` grew.** The `dark` map holds 125 names (107 before) and the `light` map 77 (73 before).
  The 18 new names in `dark` are the motion tokens and the scrollbar, press and focus tokens. No value that was
  there changed. `tileOnly.dark` holds three exit names, `--motion-exit`, `--motion-exit-lg` and `--ease-in`.
  The pass held them back from the build. Stack then chose "Panels also animate out", so the build declares
  them too, with these values. The key's name is the pass's and is kept as it wrote it.
* **`component-changes.json` grew** from 55 entries to 106. The first 55 are unchanged. Of the 51 new ones, 35
  are in scope, 7 are out by Stack's or the PM's word, 1 is settled by another entry and 8 change the tile
  only. The brief's second table under "Component changes by owner" says which is which. Where an entry's text
  and a decision differ, the decision wins: several entries still say "needs his word" or "held back".
* **The design system** the skill persists is at `design-system/bb2dash/` in the project root, where the skill
  reads it: `MASTER.md` and `pages/home.md`, `planner.md`, `grades.md`, `inbox.md` and `workspace.md`. It is
  committed as the pass wrote it, before Stack ruled. A line there marked **waits** is read against the
  brief's D-1 to D-5. The brief wins over the design system, and `direction-d.json` wins over both on a value.

## What is the source for task 8

`direction-d.json`. Task 8 writes every name of its `dark` map into `:root` and every name of its `light` map
into `:root[data-theme='light']`, the three names of `tileOnly.dark` into `:root`, and changes the fonts
`@import` to `fontsHref`. `tile-d.html` draws the same values and is what Stack was shown. Where the two
differ, the JSON wins and the difference is reported.

`component-changes.json` is the source for the component-level changes of tasks 8, 16 to 19 and 26 to 38. The
brief's two tables under "Component changes by owner" assign each entry.

## What was checked, and how to check it again

The commands are in the brief's "Named commands" list and read only files in this repository.

* **Tile check**, at the commit that added these files: `a 0 true true true false`, `b 0 true true true false`,
  `c 0 true true true false`, `d 0 true false true false`. Every tile holds all 38 `--color-*` names of
  `globals.css`, says it is a sample, and holds no course id and no university address. A, B and C carry a
  system block, the page rule they were built to. D carries none: it is dark by default. Run again on
  2026-10-08 with the refined `tile-d.html`: the same four lines.
* **Tile contrast**: `a 38 0 38 0`, `b 38 0 38 0`, `c 38 0 38 0`, `d 38 0 38 0`. Each tile's own token blocks
  pass the brief's 38 frozen contrast pairs in dark and in light. Run again with the refined tile: the same.
* **Direction check**, on the tree as it is before task 8: `125 106 77 77 false`. When task 8 is right it
  prints `125 0 77 0 true`.
* **Exit tokens**, before task 8: `3 3`. When task 8 is right: `3 0`.

The designer's own check script is not in this repository. Its recorded results were: A 183 rows, 0 fail,
5 thin margins; B 183 rows, 0 fail; C 183 rows, 0 fail; D 260 rows, 0 fail. It also checked each tile's
work-type colours against the rule that tile was designed to: the five-hue rule for A, B and C, and the
urgency rule for D. In the app that rule is held by `web/test/type-tokens.contrast.test.ts` from task 8 on.
The refinement pass ran the same script on the refined tile: 294 rows, 138 pass, 0 fail, 0 warn. Its other
runs and what each measured are in `103b_PHASE22_REFINEMENT.md`, section 8. The pass's scripts and pictures
are not in this repository.

## Things a reader should know

* **The typefaces of B.** `tile-b.html` on its own names Fira Sans and Fira Mono. The walkthrough page drew B
  in Source Serif 4, Source Sans 3 and Source Code Pro, and that is what Stack saw when he picked B's type.
  Tile D uses the walkthrough's faces.
* **One word that is not a sample.** `style-pick.html` describes direction C's colours with the university's
  name, once. It is a colour description. No other file holds it.
* **The refined tile draws more than the build makes.** It shows still loading rows, an empty-state form, a
  select list drawn by the app, and type under "Proposed" at 11px. Stack did not choose those. The brief's
  "Out of scope" lists each with his answer.
* **Sample course codes.** The tiles use made-up codes that begin `SMP`. No real course code is in any file
  of this folder.
