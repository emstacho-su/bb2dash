# Phase 22 style tiles: the evidence for the direction

Date 2026-10-08. Brief: `docs/planning/sprint-2/briefs/103_PHASE22_styling.md`, tasks 6 and 7, and its
"Freeze record, amendment 2". The decision is the DECISIONS row "Phase 22 direction: tile D (Charcoal)".

**Every name and number in these files is a sample.** No course, score, person or address in them is real.
Each tile says so on the page.

## The files

| File | What it is |
|---|---|
| `tile-a.html` | Tile A, "Nocturne". Today's look, as a style tile. |
| `tile-b.html` | Tile B, "Chalkboard". |
| `tile-c.html` | Tile C, "Orange". |
| `style-pick.html` | The walkthrough page. It showed A, B and C side by side, one step at a time, and saved Stack's pick. A, B and C were shown through this one page, not as three separate published pages. |
| `tile-d.html` | Tile D, "Charcoal". The fourth direction, designed from Stack's pick and his notes. **This is the direction the phase builds.** |
| `direction-d.json` | Tile D's values. `dark` is the app's `:root` block. `light` is `:root[data-theme='light']`. `fontsHref` is the Google Fonts address. `typeScale` is the work-type urgency rule. |
| `component-changes.json` | 55 component-level changes for direction D. Each names the app stylesheet (paths are under `web/src`) and the change. |

Each HTML file is a page body without a document shell. The publishing step adds the shell.

## The two page addresses

* The walkthrough, with Stack's saved pick: https://claude.ai/artifact/1BNFChvdcdEbjMTCbWp3rE
* Tile D, with the five taste calls: https://claude.ai/artifact/DLqDKhRNFNoSxJ8YQqaoTU

## What is the source for task 8

`direction-d.json`. Task 8 writes every name of its `dark` map into `:root` and every name of its `light` map
into `:root[data-theme='light']`, and changes the fonts `@import` to `fontsHref`. `tile-d.html` draws the same
values and is what Stack was shown. Where the two differ, the JSON wins and the difference is reported.

`component-changes.json` is the source for the component-level changes of tasks 16 to 19. The brief's table
"Component changes by owner" assigns each entry.

## What was checked, and how to check it again

Both commands are in the brief's "Named commands" list and read only files in this repository.

* **Tile check**, at the commit that added these files: `a 0 true true true false`, `b 0 true true true false`,
  `c 0 true true true false`, `d 0 true false true false`. Every tile holds all 38 `--color-*` names of
  `globals.css`, says it is a sample, and holds no course id and no university address. A, B and C carry a
  system block, the page rule they were built to. D carries none: it is dark by default.
* **Tile contrast**: `a 38 0 38 0`, `b 38 0 38 0`, `c 38 0 38 0`, `d 38 0 38 0`. Each tile's own token blocks
  pass the brief's 38 frozen contrast pairs in dark and in light.

The designer's own check script is not in this repository. Its recorded results were: A 183 rows, 0 fail,
5 thin margins; B 183 rows, 0 fail; C 183 rows, 0 fail; D 260 rows, 0 fail. It also checked each tile's
work-type colours against the rule that tile was designed to: the five-hue rule for A, B and C, and the
urgency rule for D. In the app that rule is held by `web/test/type-tokens.contrast.test.ts` from task 8 on.

## Two things a reader should know

* **The typefaces of B.** `tile-b.html` on its own names Fira Sans and Fira Mono. The walkthrough page drew B
  in Source Serif 4, Source Sans 3 and Source Code Pro, and that is what Stack saw when he picked B's type.
  Tile D uses the walkthrough's faces.
* **One word that is not a sample.** `style-pick.html` describes direction C's colours with the university's
  name, once. It is a colour description. No other file holds it.
