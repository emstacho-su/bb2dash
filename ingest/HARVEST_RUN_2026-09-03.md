# Harvest run, 2026-09-03 (six Opus subagents in parallel + orchestrator on IST 352)

Result: all 7 course shells harvested. 61 bb_files rows (60 Blackboard files + 1 hand-placed OCR'd bio), all
stored in `bb-files/<course>/<bucket>/<assignment|week>/<file>` and mirrored under `course context/`,
`v_file_layout.needs_move = 0` everywhere, text in `bb_file_text` for every distinct file.

| Course | files | notable |
|---|---|---|
| IST.466 | 26 | 10 HBR case PDFs found via embed refresh; grading now confirmed points/1020 from syllabus |
| IST.323 | 13 | grading re-verified vs syllabus v1.3.1; SitN groups not yet published (groups endpoint empty) |
| GEO.103.lecture | 6 | Kristof URL resolved; discussion questions live per-week inside modules |
| GEO.103.recitation | 1 | section room corrected: Maxwell 140 (seed said 108); TA office hours captured |
| ECN.304 | 3 | topic-folder → week map recorded; readings 38/38 verified |
| IST.471 | 4 | 3 of 4 files were attachments inside assessment bodies (invisible to the crawl) |
| IST.352 | 8 | groups + attempts endpoints probed; bio PDF OCR'd; attempt feedback captured |

Lessons folded into bb-course-pull
1. Under concurrency the built-in browser leaves downloads as `<uuid>.tmp`; claim by size + magic bytes +
   text signature (size/order alone mis-filed two files before the text check caught it).
2. Storage keys reject `#` and curly quotes; sanitize `file_name` and keep the display name in notes.
3. Refresh embeds on EVERY content item, including assessment test-links, not just Ultra documents.
4. Each agent must open its own browser tab (`preview_start`); shared Downloads is workable with the claim rule.
5. Session-scoped `/sessions/...` embed URLs must be replaced by the durable bbcswebdav URL.

Orphaned Storage objects (need an authenticated delete): 5 pre-layout IST.352 keys + `GEO.103.lecture/_probe_does_not_exist_.bin`.
