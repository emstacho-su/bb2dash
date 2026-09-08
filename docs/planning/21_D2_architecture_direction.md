# D2. Technical architecture direction: a GUI that can trust its data, and an agent layer beside it

Date: 2026-09-08. Agent: D2 (direction). Inputs read in full: `docs/planning/10_R1_gui_binding_audit.md`,
`11_R2_data_inventory.md`, `12_R3_pipeline_and_runtime.md`, `ingest/bb_crawler.js`,
`ingest/CADENCE_RUNBOOK.md`, `db/migrations/001..009`, `skills/bb-course-map/SKILL.md`,
`skills/bb-course-pull/SKILL.md`, `gui research context/gui/README.md`, `NOTES.md`, `CLAUDE.md`,
`.env.example`.

R3 did the runtime analysis and I take most of it as input. Where I disagree or where I think R3
underweighted something, I say so in the section and I own the outcome. Everything labelled verified
was read in this repo today; everything labelled inference is my judgment with a named test.

The organizing idea of this document is one sentence. The GUI can trust its data only if every fact
it shows has exactly one writer, a recorded time of writing, and a visible way to say "this is old or
this is disputed"; and the agent layer can work beside it only if the seam between them is a table
with a lifecycle rather than a convention in prose.

---

## 0. Runtime components and data ownership

```
   Stack (NetID + Duo, phone)                      Stack (keyboard, mouse)
            |                                                |
            v                                                v
   +----------------------+                        +------------------------+
   | Claude browser tab    |   bb_raw (insert)     |  bb2dash.exe (Electron)|
   |  ingest/bb_crawler.js |---------------+       |                        |
   +----------------------+                |       |  main process (Node)   |
            ^                              |       |   OneDrive mirror + fs |
            | injected / driven by         |       |   watch, open, reveal  |
   +----------------------+                |       |   spawn `claude`       |
   | Claude Code CLI       |               |       |   safeStorage session  |
   |  skills/bb-*          |               |       |   (phase B: BB webview)|
   |  ingest/transform/    |               |       |                        |
   +----------------------+               |       |  preload bridge        |
            |  typed facts, bb_gradebook, |       |     window.bb2         |
            |  sync_runs, sync_stage_runs, |       |                        |
            |  attention_items             |       |  renderer (React+Vite) |
            v                              v       |   supabase-js + RQ     |
   +--------------------------------------------------------------+        |
   |                        Supabase  goultdzqcavefcgnifdy         |<-------+
   |   RLS on, one authenticated user, publishable key in both     |  reads views
   |                                                                |  writes planner
   +--------------------------------------------------------------+
            ^                                        |
            | agent_requests: app inserts,           | attention_items.state,
            | agent claims and closes                | assignment_progress,
            |                                        v reading_progress, read_at
   OneDrive `course context/`  <---- read-only to the app, written only by the harvest
```

Ownership, restated as a table because it is a matrix:

| Data | Sole writer | Read by | Enforcement |
|---|---|---|---|
| `bb_raw` | crawler (anon insert) | transform | RLS: anon insert-only, `002_raw_landing.sql` line 16 |
| `bb_files`, `bb_file_text`, storage `bb-files` | harvest (anon insert) + agent updates | app, transform | RLS insert-only for anon; authenticated full |
| `bb_gradebook` (new), `bb_content`, typed facts (`courses`, `meetings`, `sessions`, `readings`, `assignments`, `grading_schemes`, `grade_components`, `announcements`) | transform, per the reconciliation rule | app | convention, see the honesty note below |
| `sync_runs`, `sync_stage_runs` | whatever job is running | app | convention |
| `attention_items` | agent raises, app resolves | both | split by column: agent owns the row, app owns `state`/`resolved_at`/`resolution` |
| `agent_requests` | app inserts, agent claims and closes | both | split by column: app owns the row, agent owns `state`/`result` |
| `assignment_progress`, `reading_progress`, `announcements.read_at`, later `session_notes` and `internship_hours` | app only | agent reads, never writes | convention, and the transform has no code path that touches them |

Honesty note, and it matters. Both the app and the agent authenticate as the same Postgres role
(`authenticated`) under the same permissive `*_owner_all` policies from `001_schema.sql` lines
303-313. So none of the ownership above is enforced by the database. It is enforced by there being
exactly one code path per table and by the transform never importing a writer for planner tables. For
one user that is the right trade; enforcing it would mean two auth users and per-table policies, which
is real work to protect Stack from himself. Flagged for Stack as an open question rather than decided
silently.

---

## 1. Shell, layout, renderer, data layer, main process

### 1.1 Electron. Committed.

I agree with R3's conclusion and disagree with part of its reasoning, which changes what the decision
rests on.

R3's strongest stated argument is that `webContents.executeJavaScript` returns a value to the main
process while Tauri's `eval` does not, which makes an in-app crawl clean in Electron and a
capability-plumbing exercise in Tauri. That argument is only load-bearing if the app hosts the crawl,
and section 5 decides it does not in v1. So it should be struck from the case, not counted.

R3 also lists as a flip condition that WebView2 might pass Entra and Duo where Electron's Chromium
fails. I would go further than R3 did: WebView2 is Edge, and Microsoft's own direction is to move
Entra sign-in flows onto WebView2, which means the a priori odds favour Tauri on that one axis, not
Electron. That is the single genuine technical argument for Tauri here and it deserves to be stated
plainly rather than buried in a list.

What decides it anyway:

1. Everything the app does outside its window is Node work, and the OneDrive mirror watcher (T-13) is
   the largest piece of it. `chokidar` over a folder that OneDrive rewrites in the background is a
   known quantity.
2. The transform (section 4) must run in three places: the CLI, a Claude Code session, and
   optionally the app. Electron is the only shell where that is literally the same file with no
   second runtime and no IPC-to-a-sidecar design.
3. The developer here is Claude Code. A single-language project halves the surface where the agent
   makes mistakes, and a Rust compile is a slow feedback loop for an agent that iterates by running
   the thing.
4. A point R3 did not make, and it is the one I weight second highest. `CLAUDE.md` requires that
   anything visual runs on a local port and waits for Stack's OK. That means the renderer must run
   standalone in an ordinary browser, which forces a strict boundary: the renderer is a plain web app,
   every native capability goes through one narrow preload bridge, and the bridge has a mock
   implementation for browser mode. Electron's preload plus `contextBridge` is the well-worn version
   of that pattern. This constraint is worth more than it looks, because it also means the app can
   never accidentally couple a screen to the filesystem.

What would still flip it, in one line: the section 5 spike showing that Tauri's WebView2 completes a
Syracuse NetID plus Duo login and Electron's window does not. That finding alone outweighs items 1
through 4, because it is the difference between deleting half the file-harvest procedure and not.

Rejected explicitly: a hosted web app (decision 1 in the 00 brief already rules it out, and the file
Open affordance in `03-lecture.dc.html` is the reason); a PWA; Tauri v2 for v1.

### 1.2 Project layout

Monorepo, npm workspaces with one workspace (`app/`) plus plain scripts elsewhere. Nothing in
`ingest/`, `db/`, `skills/`, `maps/` moves; the app is additive.

```
bb2dash/
  app/                          # new. the desktop client
    package.json                # workspace root scripts live here
    electron.vite.config.ts     # main / preload / renderer builds
    src/
      main/                     # Electron main, TypeScript, Node APIs allowed
        index.ts                # window, single-instance, menu
        ipc/                    # one module per bridge namespace
        mirror.ts               # OneDrive root resolve, stat, sha256, chokidar watch
        files.ts                # shell.openPath / showItemInFolder / openExternal
        agent.ts                # spawn wt.exe|cmd with `claude "/skill <id>"`, clipboard fallback
        session.ts              # safeStorage-backed Supabase session store
        transform.ts            # fork ingest/transform/run.js  (phase A2)
        bb/                     # PHASE B ONLY. BrowserView, will-download, crawler injection
      preload/index.ts          # contextBridge -> window.bb2, typed, no Node leaked
      renderer/                 # React 18 + Vite + TypeScript
        main.tsx  routes/  features/  components/
        lib/supabase.ts         # client, auth storage adapter over the bridge
        lib/db.types.ts         # GENERATED. never hand-edited
        lib/queries/            # one named function per GUI binding
        lib/bridge.ts           # window.bb2 when present, mock when running in a browser
        lib/effort.ts           # the ONE effort/category map (R1 gap 8)
        styles/tokens.css       # CSS custom properties; skin swaps here
      shared/                   # types imported by main and renderer
        bridge.ts  envelopes.ts # sync summary envelope, attention item, agent request
  ingest/
    bb_crawler.js               # unchanged shape; three fixes in section 5.3
    extract_text.py             # unchanged
    transform/                  # NEW. see section 4
      run.js  index.ts  stages/  sql/  fixtures/
  db/migrations/                # 010..019 added, section 3
  db/seed/
  skills/                       # bb-course-map, bb-course-pull + 6 new, section 7
  docs/planning/                # this round
  docs/gui/                     # the artboards, copied per the GUI README instruction
  maps/
```

Two placement decisions worth naming. `ingest/transform/` sits in `ingest/`, not in `app/`, because
its primary caller is the Claude Code CLI and the app is the optional second caller; putting it under
`app/` would make the agent depend on the app being built. And `lib/effort.ts` exists as a file
because R1 found the effort and glyph maps duplicated and divergent across `13-home-v2.dc.html` and
`14-course-v2.dc.html`; the map is also a database table (migration 015) and the TypeScript module
reads the table rather than restating it.

### 1.3 Renderer stack

React 18 plus Vite plus TypeScript, as briefed. No deviation on those three. Around them:

Routing: `react-router` in hash mode. Hash because a file-protocol Electron build has no server to
rewrite paths, and because it costs nothing in browser dev mode.

State: the URL is the state container for anything a person would want to return to, which after
reading the artboards means course id, week rail mode and selected week (`14-course-v2.dc.html`
Current versus Show weeks 1-16), selected tracker day (`13-home-v2.dc.html` `selItems`), and which
popout is open. One small Zustand store for genuinely ephemeral UI (pop-down open, bell open). No
Redux, no context tree.

Data: `@supabase/supabase-js` v2 directly, with types generated from the live schema, wrapped in a
thin query layer. Not an ORM, not a bespoke local query language. The wrapper is `lib/queries/*.ts`,
one exported async function per GUI binding, named after the binding (`getWorkItems({from, to,
courseId})`, `getCourseCards()`, `getAttention()`, `getFreshness()`). Reasons for the wrapper rather
than PostgREST calls inline in components: R1's matrices are effectively a list of these functions,
so the wrapper is the place where "this binding is PARTIAL because 26 of 66 rows lack
`points_possible`" gets handled once instead of per screen; and it is the seam where a screen can be
tested against a fixture.

TanStack Query v5: yes. R3 recommended fetch-on-open plus an in-memory store plus a JSON snapshot,
which is exactly what TanStack Query is, with invalidation and a persister included. Three concrete
payoffs here. First, the freshness table in R3 section 2 maps directly onto per-query cache policy,
so staleness stops being a UI afterthought:

| Data class | Query keys | staleTime | refetchOnWindowFocus |
|---|---|---|---|
| gradebook, submission status | `['grades', courseId]`, `['work-items', ...]` | 60 s | yes |
| announcements | `['announcements']` | 60 s | yes |
| assignments and due dates | `['work-items', range]` | 5 min | yes |
| attention, sync freshness | `['attention']`, `['freshness']` | 30 s | yes |
| files and text | `['files', courseId]` | 1 h | no |
| sessions, meetings, staff, schemes, terms | `['course-static', courseId]` | Infinity | no |

Second, the status quick-edit (T-06) that appears on Home, the course page and both popouts needs
optimistic updates against one cache, or the same row shows two different statuses on two surfaces.
Third, `persistQueryClient` with the localStorage persister gives cold start and offline for free; if
that proves too small, the same persister can write through the bridge to a JSON file in
`app.getPath('userData')`. Start with localStorage.

Styling: CSS custom properties as the token layer plus CSS Modules per component. Not Tailwind. The
reason is specific to this project rather than general: the artboards are self-contained HTML whose
markup is the spec (`gui research context/gui/README.md`), the skin is explicitly a placeholder
(Nocturne, to be replaced after a styling pass), and porting an artboard to CSS Modules keeps the
mapping one to one so the next person can diff a screen against its artboard. A utility framework
would dissolve that mapping at exactly the moment the design is still moving. Flagged as a
non-obvious decision.

No SSR, no Next.js, no component library. Charts: none needed by the current artboards; the effort
tracker is divs with computed heights (`d.segs`, `h = eff * 7`).

### 1.4 Main-process responsibilities

The complete list, and nothing else goes here:

1. OneDrive mirror. Resolve the root once (config, defaulting to `%OneDrive%\.fall2026\.projects2026\bb2dash\course context`), then `stat` per `bb_files.local_path`, sha256 on demand for the health screen, and a `chokidar` watcher that emits `mirror:changed` to the renderer. This is T-13 and it is the only reason the renderer ever needs to know a path exists.
2. Open and reveal. `shell.openPath` for a local file, `shell.showItemInFolder` for Locate folder, `shell.openExternal` for `courses.bb_url` and `bb_files.source_url`.
3. Agent launch. Spawn a terminal with `claude` and a short prompt; clipboard fallback. Section 7.
4. Secure session. `safeStorage.encryptString` of the Supabase session into `userData/session.enc`, exposed to the renderer as a three-method storage adapter. Section 2.
5. Transform runner, phase A2. `child_process.fork` of `ingest/transform/run.js`, streaming its log lines to the renderer. Only for the browser-free stages; it never needs Blackboard.
6. App config. A small JSON in `userData` for the mirror root, the repo path (for spawning `claude`), and the dev flags. Not secrets.
7. Phase B only, and behind a flag that defaults off: a `BrowserView` on `partition: 'persist:blackboard'` with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, no preload that exposes anything, `will-download` plus `item.setSavePath()`, and crawler injection by `executeJavaScript`. The Supabase client must never exist on that origin's window.

Explicitly not in main: any Supabase secret key, any SQL, any business logic. Main is a capability
provider. If a feature can be done with PostgREST from the renderer, it is done there.

---

## 2. Data access and auth

Decision: Supabase Auth, email plus password, one user, publishable key in the binary, session
encrypted at rest by the OS. This is R3's option A and I have nothing to add against it; options B
(shared secret in a header policy) and C (secret key in main) are both worse in every dimension R3
named and I endorse rejecting them.

What ships in the binary: `SUPABASE_URL` and the publishable key
`sb_publishable_DCtdYptOILBVKsKv-aHNAg_ruNCH_fe`, which is already committed on purpose in
`ingest/AGENT_BRIEF.md` and is safe by design (it resolves to `anon` unsigned and `authenticated`
when a user is signed in, and reaches only what RLS allows). No secret key exists anywhere in the
app, the repo, or the transform. `.env.example` already has `SUPABASE_SERVICE_KEY=` empty and it
stays empty.

Session storage. supabase-js is created with `persistSession: true`, `autoRefreshToken: true`,
`detectSessionInUrl: false`, and a custom `auth.storage` adapter whose three methods proxy over the
preload bridge to main, where `safeStorage` (DPAPI on Windows, bound to Stack's Windows account)
encrypts to `userData/session.enc`. In browser dev mode the mock bridge falls back to
`localStorage`, which is fine for a machine Stack is already sitting at.

RLS changes required for v1: none for the existing tables. Verified: every typed table already has
`create policy <t>_owner_all ... for all to authenticated using (true) with check (true)`
(`001_schema.sql` lines 303-313, and the same pattern repeated in 002, 003, 005, 006). Two specific
claims in R3 need correcting or confirming here:

- R3 says signing in "can finally delete the 6 orphaned Storage objects that anon cannot touch". That
  is already true without any change: `003_bb_files_bucket.sql` line 4 creates
  `bb_files_auth_all on storage.objects for all to authenticated`. The orphans are deletable the
  moment anyone signs in. Verified by reading the migration.
- Every migration in section 3 that creates a table must repeat the `enable row level security` plus
  `_owner_all` pattern, or the app silently cannot read it. Stated as a rule so nobody forgets.

One hole neither R1, R2 nor R3 named, and it is the reason this section is not simply "do option A".
The policies grant everything to any signed-in user, and Supabase projects have email signup enabled
by default. Combined with a publishable key that is committed to a repo which phase 4 of `NOTES.md`
plans to make public, that means a stranger could create an account and read and write the entire
database. The fix is a settings toggle, not code: disable public signups on the project (Auth,
Providers, Email, "Allow new users to sign up" off) and create Stack's user from the dashboard. That
must happen before the first `signInWithPassword` line is written, and it must happen before the repo
goes public regardless of the app. If Stack would rather have belt and braces, the stronger version
is a `public.app_owner()` helper returning a fixed uid and policies of the form
`using (auth.uid() = app_owner())`, which is one migration and would also enforce the ownership table
in section 0 if a second user ever existed. I recommend the toggle for v1 and the policies later.

The anon insert policies stay for now, because the browser crawler holds nothing better. They become
droppable only if the crawl moves into an authenticated context, which is section 5's phase B. Before
the repo is public, the committed publishable key plus those policies is a world-writable append
endpoint into `bb_raw`, `bb_files`, `bb_file_text` and the storage bucket; nothing is readable
through it, so it is a spam and quota risk rather than a leak. Open question 6, carried forward from
R3, still needs Stack's answer.

---

## 3. Schema changes as a numbered migration list

Rules for all of them. Every new table gets `enable row level security` plus an `_owner_all` policy
for `authenticated`. Every migration file lands in `db/migrations/NNN_name.sql` before it is applied,
and the file name matches the name given to the Supabase MCP `apply_migration`. Nothing here is
destructive in v1; the one destructive change (dropping the legacy grade columns from
`assignment_progress`) is deferred to 025 on purpose.

### 010. Sync contract: `sync_runs` columns, per-stage rows, freshness view

Owner: whatever job is running (crawler, transform, harvest skill). Why: `sync_runs` today is
`(id, ran_at, source, scope, summary, notes)` written after the fact, so a run that dies leaves
nothing behind, and `summary` has had at least five different shapes across 12 rows (R2 section 5).
GUI depends: the "last sync today 09:14" line in `13-home-v2.dc.html`, the whole needs-attention
row's credibility, and T-04.

```sql
alter table sync_runs
  add column run_id       uuid,                    -- ties to bb_raw.run_id for a crawl
  add column status       text not null default 'ok'
      check (status in ('running','ok','partial','failed')),
  add column started_at   timestamptz,
  add column finished_at  timestamptz,
  add column trigger      text check (trigger in ('manual','scheduled','app_request')),
  add column request_id   bigint;                  -- fk added in 012, after agent_requests exists
update sync_runs set started_at = ran_at, finished_at = ran_at where finished_at is null;
create index sync_runs_status_idx on sync_runs (status, finished_at desc);

-- the envelope. old rows are grandfathered by NOT VALID.
alter table sync_runs add constraint sync_runs_summary_envelope
  check (summary is null or (summary ? 'counts' and summary ? 'changes' and summary ? 'errors'))
  not valid;

create table sync_stage_runs (
  id           bigint generated always as identity primary key,
  sync_run_id  bigint not null references sync_runs(id) on delete cascade,
  stage        text not null,     -- 'crawl'|'gradebook'|'announcements'|'assignments'|'content'|'files'|'text'|'classify'
  course_id    text references courses(id),
  status       text not null check (status in ('running','ok','partial','failed','skipped')),
  counts       jsonb not null default '{}',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text
);
create index sync_stage_runs_stage_idx on sync_stage_runs (stage, finished_at desc);

create view v_data_freshness as
select stage,
       max(finished_at) filter (where status = 'ok')      as fresh_as_of,
       max(finished_at)                                    as last_attempt_at,
       (max(finished_at) filter (where status = 'ok')) is distinct from max(finished_at) as last_attempt_failed
from sync_stage_runs group by stage;
```

`sync_stage_runs` is my addition, not R3's, and it is the direct answer to "how does the GUI read
last sync per data class". One `sync_runs` row per crawl cannot say that grades are two hours old
while files are three days old, and R3's own freshness table (section 2) says those two surfaces need
different treatment. One query, `select * from v_data_freshness`, feeds every staleness indicator in
the app, and each surface declares which stage it belongs to. Reaping rule, since nothing else does
it: a `running` row with `started_at` older than 30 minutes is presumed dead, rendered as
"interrupted", and marked `failed` by the next run's first statement.

The summary envelope is exactly R3 section 4.4's three-array shape (`counts`, `changes`, `errors`),
typed in `app/src/shared/envelopes.ts` and in `ingest/transform/index.ts` so both sides compile
against it.

### 011. `attention_items`

Owner: agent raises, app resolves. Why: R1's deep dive 6 and R2 section 5 both conclude independently
that `sync_runs.summary` cannot back a needs-attention row, because the shape varies per run and a
jsonb blob has no lifecycle. GUI depends: the collapsed needs-attention row and its typed counts
(decision 5a), the expanded rows, the Resolve link, and most of T-04.

```sql
create table attention_items (
  id           bigint generated always as identity primary key,
  raised_at    timestamptz not null default now(),
  raised_by    bigint references sync_runs(id),
  kind         text not null
      check (kind in ('conflict','missing','stack_must_confirm','deadline','data_gap')),
  course_id    text references courses(id) on delete cascade,
  entity       text,                       -- 'assignment'|'bb_file'|'session'|'course'|'reading'
  ref          text,                       -- assignments.id, bb_files.id::text, ...
  field        text,                       -- 'due_at' when the item is a field-level conflict
  from_value   jsonb,                      -- what we had
  to_value     jsonb,                      -- what Blackboard says
  question     text not null,
  suggested    jsonb,
  state        text not null default 'open'
      check (state in ('open','resolved','dismissed')),
  resolved_at  timestamptz,
  resolution   jsonb,
  unique (kind, coalesce(course_id,''), coalesce(ref,''), coalesce(field,''), state)
);
create index attention_open_idx on attention_items (state, kind);
```

The unique key is what makes re-running the transform safe: the same unresolved conflict raised twice
is one row, not two, and a resolved one can be raised again if it recurs. Note `overdue` is
deliberately not a kind: overdue is a query over `v_work_items`, not a raised item, and duplicating
it here would give two sources for one count. R3's draft included it; I am dropping it.

### 012. `agent_requests`

Owner: app inserts, agent claims and closes. Why: it is the app-to-agent direction and the only
durable one, since the app cannot run a Claude session and Stack may close the app between asking and
answering. GUI depends: every action button that is really a request (Sync now, Pull course, Resolve
this conflict for me, Re-run transform).

```sql
create table agent_requests (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  kind         text not null
      check (kind in ('sync','pull_course','map_course','transform','classify_files',
                      'grade_snapshot','resolve','triage','freeform')),
  scope        text,                        -- course id, assignment id, or 'all'
  params       jsonb not null default '{}',
  note         text,                        -- what Stack typed, for 'freeform'
  state        text not null default 'queued'
      check (state in ('queued','claimed','done','failed','cancelled')),
  claimed_at   timestamptz,
  claimed_by   text,                        -- session label, free text
  finished_at  timestamptz,
  sync_run_id  bigint references sync_runs(id),
  result       jsonb
);
create index agent_requests_queue_idx on agent_requests (state, created_at);
alter table sync_runs add constraint sync_runs_request_fk
  foreign key (request_id) references agent_requests(id);
```

### 013. `bb_gradebook`, and the three views that finally give the GUI a grade

Owner: transform. Why: R2's ranked finding number one. There are 37 live gradebook columns per run
sitting in `bb_raw` and five hand-written score rows in `assignment_progress` standing in for them,
and `score` is null on all 37 (the value lives in `effectiveScore` and `displayGrade.score`). This is
also the cheap close on R1's number one gap: Blackboard already computes the course total.
GUI depends: the Grade field on all seven course cards, the whole Grades destination, the assignment
popout's score and feedback, the lecture lane's "quiz #1 graded 10/10" tag, and a feedback inbox that
does not exist yet but should.

```sql
create table bb_gradebook (
  id            bigint generated always as identity primary key,
  run_id        uuid not null,
  captured_at   timestamptz not null default now(),
  course_id     text not null references courses(id) on delete cascade,
  column_id     text not null,
  name          text,
  content_id    text,
  category_id   text,
  possible      numeric(9,2),
  due           timestamptz,
  is_calc       boolean not null default false,
  calc_type     text,                 -- column.calculationType
  aggregation   text,
  effective_score numeric(9,2),       -- READ THIS, not `score`
  manual_score  numeric(9,2),
  display_grade jsonb,                -- {"score": N, "isOverride": bool}
  is_override   boolean generated always as ((display_grade->>'isOverride')::boolean) stored,
  is_exempt     boolean not null default false,
  submission_status text,
  feedback      text,
  last_attempt  jsonb,                -- {status, created, submitted, score}
  attempts_left integer,
  visible       boolean,
  grades_released boolean,
  position      integer,
  unique (run_id, course_id, column_id)
);
create index bb_gradebook_col_idx on bb_gradebook (course_id, column_id, captured_at desc);

create view v_gradebook_latest as
select distinct on (course_id, column_id) * from bb_gradebook
order by course_id, column_id, captured_at desc;

-- per-assignment grade, preferring Blackboard, falling back to the 5 legacy hand-written rows
create view v_assignment_grade as
select a.id as assignment_id, a.course_id,
       coalesce(g.effective_score, p.score)                         as score,
       coalesce(g.possible, p.score_max)                            as score_max,
       p.letter,
       coalesce((g.last_attempt->>'submitted')::timestamptz, p.submitted_at) as submitted_at,
       coalesce(g.feedback, p.feedback)                             as feedback,
       g.submission_status, g.is_override, g.is_exempt,
       g.captured_at                                                as grade_seen_at,
       (g.column_id is not null)                                    as from_blackboard
from assignments a
left join v_gradebook_latest g on g.column_id = a.bb_column_id and g.course_id = a.course_id
left join assignment_progress p on p.assignment_id = a.id;

-- Blackboard's own calculated total. keeps the name the artboards already bind to.
create view v_course_grade as
select course_id,
       max(effective_score) filter (where is_calc)  as bb_total_score,
       max(possible)        filter (where is_calc)  as bb_total_possible,
       max(name)            filter (where is_calc)  as bb_total_label,
       max(captured_at)                             as as_of,
       count(*) filter (where effective_score is not null and not is_calc) as graded_items
from v_gradebook_latest group by course_id;
```

Three notes on this one because it carries the most risk. The table is append-per-run rather than
latest-only, which costs nothing at 37 rows per course per run and buys grade history for free, so
"Quiz 1 went from ungraded to 9/10 today" becomes a query rather than a lost event. It keeps the view
name `v_course_grade` that `gui research context/gui/README.md` already binds to, so the GUI contract
does not move. And it deliberately does not implement the `grade_components` engine: R2 and R1 agree
that Blackboard's own calculated column is authoritative and one transform away, while the engine
(rank-weighted, drop-lowest, normalize-to-5, plus four `manual` components with no item rows) is
weeks of work. The engine stays a T-07 what-if layer on top. The attendance trap R2 found is real and
belongs here as a flag: ECN.304 Attendance reads 100/100 and GEO.103.recitation reads 0/100, and
neither is a grade. Add `bb_gradebook.is_attendance boolean` set by the transform on a name match and
let the GUI exclude it, or accept a course card that says 0 percent for GEO. I recommend the column.

### 014. Planner-owned columns

Owner: app (except `announcements.author`, which is the transform). Why: T-15 needs a manual override
that does not exist; the bell badge cannot use `announcements.is_read` because the crawler writes it
from Blackboard's `readStatus.isRead` (`bb_crawler.js` line 85) and would overwrite Stack's own read
state on every sync; and the bell row binds an author field that has no column. GUI depends: the
tracker bar heights and the assignment popout's effort control, the bell badge and its rows.

```sql
alter table assignment_progress
  add column effort_override numeric(4,2);   -- NOT est_minutes; both are wanted (R1 deep dive 1)

alter table announcements
  add column read_at timestamptz,            -- app-owned. the badge counts read_at is null
  add column author  text;                   -- transform-owned, needs a crawler change first
```

`is_read` stays as the read-only Blackboard mirror. The badge predicate is `read_at is null`, which
means an announcement Stack read inside Blackboard still shows unread in bb2dash until he clears it
there too. That is the honest planner behaviour and it is R3's recommendation; it is also open
question 5 for Stack.

### 015. Effort primitives

Owner: schema (the table is reference data, seeded once, editable by Stack). Why: R1 gap 8, the
effort and glyph map is incomplete and duplicated per artboard, with 7 of 66 rows scoring `undefined`
today. GUI depends: every bar height and glyph on both trackers, the suggested start date, the
per-day and per-week effort rollups.

```sql
create table effort_base (
  type      assignment_type primary key,
  base      numeric(4,2) not null,
  category  text not null,            -- 'reading'|'assignment'|'quiz'|'project'|'exam' (the 5 glyphs)
  glyph     text not null
);
-- all 18 enum values, no exceptions. unmapped types are a bug, not a default.
insert into effort_base (type, base, category, glyph) values
 ('reading',1,'reading','R'), ('form',1,'assignment','A'), ('discussion_post',1.5,'assignment','A'),
 ('homework',2,'assignment','A'), ('activity',2,'assignment','A'), ('quiz',3,'quiz','Q'),
 ('lab',4,'assignment','A'), ('presentation',4,'project','P'), ('group_presentation',6,'project','P'),
 ('project',6,'project','P'), ('paper',6,'project','P'), ('exam',8,'exam','E'),
 ('final_exam',10,'exam','E'), ('checkpoint',1.5,'assignment','A'), ('meeting',1,'assignment','A'),
 ('evaluation',2,'assignment','A'), ('attendance',0.5,'assignment','A'),
 ('participation',0.5,'assignment','A'), ('other',2,'assignment','A');

create view v_course_points_median as
select course_id, percentile_cont(0.5) within group (order by points_possible) as med,
       count(points_possible) as n
from assignments where points_possible is not null and points_possible > 0
group by course_id;                       -- n < 3 means DO NOT apply the multiplier

create view v_assignment_effort as
select a.id, a.course_id, b.category, b.glyph,
       coalesce(p.effort_override,
         b.base * case when m.n >= 3 and a.points_possible > 0
                       then least(2.0, greatest(0.5, a.points_possible / m.med)) else 1 end) as effort,
       (p.effort_override is not null)                     as is_override,
       (m.n >= 3 and coalesce(a.points_possible,0) > 0)    as multiplier_applied
from assignments a
join effort_base b on b.type = a.type
left join v_course_points_median m on m.course_id = a.course_id
left join assignment_progress p on p.assignment_id = a.id;
```

`multiplier_applied` is not decoration. R1 deep dive 1 found the multiplier is usable for four of
seven shells, degenerate for ECN.304 (one points value) and impossible for both GEO shells (zero), so
the UI must be able to say when it did not apply rather than implying it did.

### 016. `v_work_items`: the one view every planner surface reads

Owner: schema. Why: R1's gap 4 and deep dive 10, which is the highest-leverage small change in that
audit. There are 86 readings against 66 assignments, the tracker legend leads with "R reading", and
`v_upcoming` reads `assignments` only, so seven of the fifteen sample rows in the artboards are
readings that cannot render. Separately, `v_upcoming` and `v_overdue` both key on
`coalesce(due_at::date, due_date)`, so the nine assignments with neither appear in neither view and
are silently invisible everywhere. GUI depends: the tracker on Home and on every course page, the day
detail panel, per-week rollups, the M-F dots, "Open = items due this week", the week rail rings, and
T-08.

```sql
create view v_work_items as
select 'assignment'::text as item_kind, a.id::text as item_id, a.course_id,
       a.title, a.type::text as type, e.category, e.glyph,
       a.due_at, coalesce(a.due_at::date, a.due_date) as due_on, a.due_rule,
       a.points_possible, a.submission::text, a.series_key, a.sequence_no,
       coalesce(p.status,'not_started')::text as status, p.priority::text,
       e.effort, e.is_override, e.multiplier_applied,
       (coalesce(a.due_at::date, a.due_date) is null) as undated,
       a.confidence::text
from assignments a
join v_assignment_effort e on e.id = a.id
left join assignment_progress p on p.assignment_id = a.id
union all
select 'reading', r.id::text, r.course_id,
       r.citation, 'reading', 'reading', 'R',
       null::timestamptz, r.for_date, null,
       null::numeric, null, null, null,
       coalesce(rp.status,'not_started')::text, null,
       case when r.required then 1.0 else 0.5 end, false, false,
       (r.for_date is null),
       r.confidence::text
from readings r
left join reading_progress rp on rp.reading_id = r.id;
```

`v_upcoming` and `v_overdue` stay untouched for compatibility, but the app reads `v_work_items` and
filters. That is deliberate: a calendar strip needs completed and missed items to remain visible as
done rather than vanish (R1 note on section B3), and the `undated` flag gives the artboards an
undated lane instead of silent loss. Open question 6 in R2 asks whether Stack wants the undated
placeholders rendered or hidden; the view supports both, the screen decides.

### 017. `v_course_display`: the GEO merge, solved once

Owner: schema. Why: GEO.103 is two shells and the pop-down, the course card, the course sub-bar and
the M-F strip each need the union of them. R1 deep dive 5 says solve it once in a view; solving it
four times in components is how the room conflict (`meetings.location` says Maxwell Hall 140,
`courses.location` says 108) becomes four different answers. GUI depends: Matrix A pop-down, B6 course
cards, C1 sub-bar, the M-F strip.

```sql
create view v_course_display as
with shells as (
  select coalesce(c.parent_course_id, c.id) as display_id, c.id as shell_id, c.*
  from courses c
)
select s.display_id,
       min(s.subject) || ' ' || min(s.number)      as code,
       min(s.title_short) filter (where s.shell_id = s.display_id) as title,
       array_agg(distinct s.shell_id)              as shell_ids,
       jsonb_agg(distinct jsonb_build_object('day', m.day_of_week, 'start', m.start_time,
                                             'end', m.end_time, 'room', m.location))
         filter (where m.id is not null)           as meetings,
       bool_or(m.location is distinct from s.location) as room_disputed,
       min(s.bb_url)                               as bb_url
from shells s left join meetings m on m.course_id = s.shell_id
group by s.display_id;
```

`room_disputed` exists so the card can surface the conflict rather than pick silently, which is what
R1 asked for.

### 018. `bb_files.superseded_by` and a current-files view

Owner: agent (bb-classify-files). Why: R2 punch list 12. Five stale IST.466 documents (`bb_files` 16,
40, 58 schedules, 35 roster) are marked superseded only in the `notes` prose, so a Materials list on
day one shows four schedule versions and two rosters. GUI depends: T-02 Materials library, the
lecture and assignment popout material lists.

```sql
alter table bb_files
  add column superseded_by bigint references bb_files(id),
  add column link_confidence numeric(3,2);   -- for week_no/session_id set by the classify pass
create view v_bb_files_current as
  select * from bb_files where superseded_by is null;
```

Note that no schema change is needed for the `bb_files.week_no` and `session_id` backfill R1 ranks as
gap 2 (2 of 64 and 16 of 64 today). Both columns already exist from `005_file_corpus.sql`. That work
is a transform stage, not a migration, and it is described in section 4.

### 019. Full text over the corpus

Owner: schema. Why: `bb_file_text` is 534 units and roughly 949,000 characters, referenced zero times
by any artboard, and it is R2's ranked asset number two. GUI depends: T-12 command palette, Materials
search, and inline reading of a deck in the lecture popout.

```sql
alter table bb_file_text
  add column tsv tsvector generated always as (to_tsvector('english', text)) stored;
create index bb_file_text_tsv_idx on bb_file_text using gin (tsv);

create function search_corpus(q text, p_course text default null, p_limit int default 30)
returns table (file_id bigint, course_id text, file_name text, bucket file_bucket,
               unit_kind text, unit_no int, rank real, snippet text)
language sql stable as $$
  select t.file_id, f.course_id, f.file_name, f.bucket, t.unit_kind, t.unit_no,
         ts_rank(t.tsv, websearch_to_tsquery('english', q)) as rank,
         ts_headline('english', t.text, websearch_to_tsquery('english', q),
                     'MaxFragments=2,MinWords=8,MaxWords=24')
  from bb_file_text t join bb_files f on f.id = t.file_id
  where t.tsv @@ websearch_to_tsquery('english', q)
    and (p_course is null or f.course_id = p_course)
    and f.superseded_by is null
  order by rank desc limit p_limit
$$;
```

One caution carried from R2 that belongs in the UI, not the SQL: pptx extraction includes the
professor's speaker notes inline with a `[notes]` marker, so a snippet can surface private
instructor commentary as if it were slide text. The renderer should strip or label `[notes]` blocks
in snippets. R2's open question 10 asks Stack whether this is acceptable at all.

### Priority within v1

010, 011, 012 are the trust and seam layer and nothing else should start before them. 013, 015, 016
are what turn three broken counters and an empty Grade column into real numbers, and R1's handoff
warns that if the app phase is scheduled UI-first, Home ships with a working tracker, a working bell
and three broken counters. 014 is one line each and can ride with anything. 017, 018, 019 are
per-screen and land with the screen that needs them.

### Later, numbered so they have a place

| # | What | Owner | Unblocks |
|---|---|---|---|
| 020 | `session_notes(session_id, body, updated_at)` | app | T-10 running log in the lecture popout |
| 021 | `internship_hours(id, date, hours, activity, notes)` | app | T-09, and the IST.471 card's "0 / 150 hrs" slot |
| 022 | `course_groups(course_id, set_id, group_id, title, description)` | transform | R2 8b: IST.466 has two groups from two sets and `courses.bb_group_id` is single-valued |
| 023 | `bb_content.session_id`, `sessions.source_ref` | transform | R1 gap 6, the lecture popout's provenance line and Linked assignments |
| 024 | `pgvector` on `bb_file_text` | agent | semantic search and agent grounding |
| 025 | drop `assignment_progress.score/score_max/letter/graded_at/submitted_at/feedback` | schema | makes the ownership rule a table boundary, once `v_assignment_grade` is proven in the UI |

025 is R3's `assignment_grades` proposal arriving by a safer route. R3 wanted the split now; I want
the read path moved first and the columns dropped after, because `assignment_progress` is a table
Stack has been treating as his and there are five hand-written score rows in it that predate any
transform. Nothing is lost by waiting one release, and a botched data move on the one table with
human-entered content is the worst possible first migration.

---

## 4. The transform layer

R3's finding stands and is the most important sentence in this planning round: there is no
`bb_raw` to typed transform code anywhere in this repo, and `ingest/classify_rules.sql`, cited by
`ingest/FILE_HARVEST_SPEC.md` section 4, does not exist. What exists is `classify_bb_file()` in
`005_file_corpus.sql` line 46, which ran once at migration time. Every fold from `bb_raw` into typed
tables has been a person and a model doing it carefully by hand, per `CADENCE_RUNBOOK.md` step 3.

### 4.1 Where it lives, and why not the other two places

Decision: a Node package at `ingest/transform/`, plain ESM with TypeScript types, driving a set of
single-statement SQL files in `ingest/transform/sql/`. Callable three ways, one implementation:

```
node ingest/transform/run.js --run-id <uuid> [--course IST.323] [--stage gradebook] [--dry-run]
```

from a Claude Code session (the `bb-transform` skill is a thin wrapper over that command), from the
Electron main process by `child_process.fork`, and from a future headless `claude -p`.

Not SQL functions in the database. They are genuinely attractive here: idempotent by construction,
they run where the data is, and `CADENCE_RUNBOOK` could call one `select transform_run(...)` through
the MCP. Three reasons against. Migrations become the deploy channel for logic, so a bug fix in title
matching becomes a schema version. Claude Code cannot run plpgsql locally, so every iteration is a
round trip against the live database, which is the opposite of what you want for the one component
that can corrupt everything. And the judgment-adjacent parts (matching a new gradebook column to an
existing assignment by title, deciding that a re-created content item is the same assignment) want
real string handling and unit tests over fixtures.

Not Python, even though `extract_text.py` is Python. The app cannot run it without shipping a Python
runtime, and adding a third language to a project whose crawler is JavaScript and whose app is
TypeScript costs more than the one file it would share.

The hybrid matters though: set-based work stays in SQL. Upserting 37 gradebook rows out of a jsonb
payload is one `insert ... select ... from jsonb_array_elements(...) on conflict`, not a loop in
Node, and the week-number regex already exists in `005_file_corpus.sql` line 61. Node orchestrates,
sequences, diffs, and decides; SQL does the bulk writes.

Credentials: the transform signs in to Supabase Auth with the same single user as the app, using
credentials from the gitignored `.env`. No service key, anywhere, ever. This gives one auth model
across the app, the CLI and the agent, and it means the transform is subject to exactly the same RLS
the app is, so a policy mistake cannot be invisible on one side only.

### 4.2 The contract

Idempotent. Running the same `run_id` twice leaves the database identical and produces a second
`sync_runs` row whose `changes` array is empty. This is the acceptance test, and it is written as a
test: run the transform twice against a fixture payload, assert the second summary has zero changes.

Keyed by `run_id`. Every stage reads `bb_raw where run_id = $1`. Nothing reads "the latest run",
because "latest" is what makes a partial crawl look like a complete one.

Writes only where it is allowed to. The reconciliation rule that currently lives as prose in four
places (`NOTES.md` caveat 6, `DATA_SYNTAX.md`, `CADENCE_RUNBOOK.md`, both SKILL.md files) becomes one
predicate used by every stage:

```
allowed := row.confidence in ('tentative','inferred')  OR  row.<field> is null
```

Anything else is a diff, not a write. Never touches `assignment_progress`, `reading_progress`,
`announcements.read_at`, or any `bb_files` row with `classified_by = 'stack'`.

Records everything. Each stage returns counts, a `changes[]` array and an `attention[]` array. The
driver folds them into the `sync_runs.summary` envelope and inserts `attention_items` with the
conflict-key uniqueness from migration 011, so a conflict raised on three consecutive runs is one
open row. Each stage also writes its own `sync_stage_runs` row, which is what feeds
`v_data_freshness`.

Fails loudly. `sync_runs.status = 'running'` is written before the first read, each stage is wrapped,
a stage failure marks the run `partial` and continues, and an unhandled error marks it `failed`. A
crashed process leaves a `running` row that the GUI renders as interrupted, which is strictly better
than today's nothing.

### 4.3 Signatures

```ts
// ingest/transform/index.ts
export type TransformOpts = {
  runId: string;                        // bb_raw.run_id
  courses?: string[];                   // default: every course in the run
  stages?: StageName[];                 // default: all
  dryRun?: boolean;                     // computes changes, writes only the sync_runs row
  trigger: 'manual' | 'scheduled' | 'app_request';
  requestId?: number | null;            // agent_requests.id, closed on completion
};

export type Change = {
  kind: string;                         // 'grade_posted' | 'due_moved' | 'item_recreated' | 'file_new' | ...
  course_id: string | null; ref: string | null; field?: string;
  from?: unknown; to?: unknown; label: string;
};
export type Attention = {
  kind: 'conflict' | 'missing' | 'stack_must_confirm' | 'deadline' | 'data_gap';
  course_id: string | null; entity?: string; ref?: string; field?: string;
  from_value?: unknown; to_value?: unknown; question: string; suggested?: unknown;
};
export type StageResult = {
  counts: Record<string, number>; changes: Change[]; attention: Attention[]; errors: string[];
};
export type Ctx = {
  db: SupabaseClient<Database>; runId: string; syncRunId: number;
  dryRun: boolean; log: (line: string) => void;
};

export async function transformRun(o: TransformOpts): Promise<{ syncRunId: number; summary: Summary }>;

// stages. each is independently runnable, idempotent, and writes its own sync_stage_runs row.
export type StageName = 'courses'|'content'|'gradebook'|'announcements'|'assignments'|'files'|'classify';
export function stageCourses      (c: Ctx, p: CoursePayload): Promise<StageResult>;
export function stageContent      (c: Ctx, p: CoursePayload): Promise<StageResult>;
export function stageGradebook    (c: Ctx, p: CoursePayload): Promise<StageResult>;
export function stageAnnouncements(c: Ctx, p: CoursePayload): Promise<StageResult>;
export function stageAssignments  (c: Ctx, p: CoursePayload): Promise<StageResult>;
export function stageFiles        (c: Ctx, p: CoursePayload): Promise<StageResult>;
export function stageClassify     (c: Ctx, courseId: string): Promise<StageResult>;  // no payload; offline

// the primitive every stage uses. this is where the reconciliation rule lives, once.
export function reconcile<T extends Record<string, unknown>>(args: {
  table: string;
  key: Record<string, unknown>;
  existing: T | null;
  incoming: Partial<T>;
  guarded: (keyof T)[];        // fields a sync may never overwrite on a confirmed row
  confidenceOf: (row: T) => 'confirmed' | 'tentative' | 'inferred';
}): { writes: Partial<T>; changes: Change[]; attention: Attention[] };
```

Stage responsibilities worth naming because they are where the current manual judgment sits:

`stageGradebook` is the highest-value one. It writes `bb_gradebook` from `payload->'gradebook'`,
reading `effectiveScore` and `displayGrade->>'score'`, never `score` (null on all 37 columns,
verified by R2). It matches new columns to `assignments.bb_column_id`, and when a column has no
assignment it tries a title match and raises `stack_must_confirm` with the match as `suggested`
rather than guessing. It stamps `assignments.bb_last_seen`, which today is stale on 29 rows and null
on 32.

`stageAssignments` handles the re-created-item case (IST.352 Project 1A got a new content id
`_13195312_1` and column `_3607154_1` between two runs) by matching on `(course_id, title, type)`
when `bb_item_id` no longer resolves, and re-pointing rather than inserting a duplicate. A due-date
change on a `confirmed` row is an `attention_items` conflict with `from_value` and `to_value`, which
is exactly what the expanded needs-attention row needs to render "due moved 9/2 to 9/9".

`stageContent` should be checked against a live payload before it is written. R2 reports that
`bb_content.detail` holds only `file` and `url` keys and concludes `dueDate`, `points`,
`gradebookColumnId` and `attemptsAllowed` are "dropped before insert". Reading `bb_crawler.js` line
55, `slim()` explicitly keeps all four, and line 57 also carries `dueDate` at the top level of every
item. So either those keys are absent from `contentDetail` at that path in the live payload, or the
loss happened in the hand-written insert rather than in the crawler. Verify before changing the
crawler; the fix may be free.

`stageClassify` is the `bb_files.week_no` and `session_id` backfill, R1's gap 2. It needs no
Blackboard access at all: week from path and filename (the regex in `005_file_corpus.sql` line 61
already works), then `session_id` from `(course_id, week_no, bucket in
('lecture_slides','readings'))`, then `superseded_by` from the provenance already hand-written into
`bb_files.notes` on 45 of 64 rows. It writes `link_confidence` and never touches
`classified_by = 'stack'`.

Not in the transform, on purpose: parsing announcement prose into assignment rows. That is genuine
language work, it belongs to the `bb-announce-extract` skill, and its output lands in
`attention_items.suggested` for Stack to accept rather than straight into `assignments`.

---

## 5. The crawl in the desktop era

### 5.1 Decision

Option (c), with the emphasis inverted from how it was posed. The crawl stays in Claude's browser for
v1 and forever as the fallback (a); the in-app webview (b) is a phase B module behind a flag, built
only if the spike passes. The app is a read and plan surface that requests crawls, never a browser
that performs them, until proven otherwise.

The reason is Duo, and it is not a shell problem. Every Blackboard endpoint the crawler uses is
authorized by a session cookie obtained through NetID plus a Duo push that Stack approves on his
phone, and `NOTES.md` caveat 11 says Claude never enters credentials. No shell changes that. Hosting
the login inside the app moves where the cookie lives; it does not remove the human.

What (b) would buy, and it is not small: `will-download` plus `item.setSavePath()` deletes
`CADENCE_RUNBOOK` step 4 outright, which means the `<uuid>.tmp` claim heuristic (size plus magic
bytes plus a text signature, `HARVEST_RUN_2026-09-03.md` lesson 1), the `(1)` collision reasoning,
the shared-Downloads folder, and the mandatory PowerShell `Move-Item`. That is the largest single
simplification available to this project, and it is why the spike is worth ninety minutes even though
the answer is probably no.

### 5.2 SPIKE-BB-WEBVIEW

Time box 90 minutes. Stack must be present, because Duo. Throwaway code, deleted after, findings
written to `docs/planning/`.

Build two disposable windows, not one: an Electron `BrowserWindow` with
`partition: 'persist:bbspike'`, and a Tauri v2 `WebviewWindow` (WebView2). Both load
`https://blackboard.syracuse.edu`. Building both is the point, because the shell decision in section
1 has exactly one condition that would flip it and this is the test for it.

Four criteria. All four must pass for (b) to be built:

1. Login completes. NetID, then `microsoftonline`, then the Duo push, then the Ultra course list,
   with no conditional-access block and no "your device is not recognized" dead end.
2. Page-context fetch works: `await fetch('/learn/api/v1/users/_21025199_1/memberships?limit=5',
   {credentials:'include'}).then(r => r.status)` returns 200 and the body parses as JSON.
3. Download interception works: trigger one `bbcswebdav` URL, confirm the download handler fires,
   the file lands at a path the app chose, and its sha256 matches the same file downloaded through
   Chrome.
4. The session survives an app restart, so at least one crawl per day does not require a fresh
   login inside the app.

Fail any one and (b) is dead for v1; record the exact failure with a screenshot and the error code,
and the app stays a read surface. Partial pass (1 through 3 but not 4) is still worth building,
because re-logging in daily is what Stack already does and the download win survives intact. Pass 1
in Tauri and fail 1 in Electron, and the shell decision flips to Tauri and section 1 is rewritten.

Inference, flagged: I expect criterion 1 to be the one that fails, on the basis of the WebView2
conditional-access reports R3 cited and Microsoft's general steer away from third-party embedded
webviews for Entra. I would not plan a single sprint around (b) succeeding.

### 5.3 Crawler changes that ship regardless

These are independent of the spike and they are prerequisites for any freshness indicator being
believable. All three are in `ingest/bb_crawler.js`.

Self-reporting runs. Today `runAll` returns a `log` array of post statuses (lines 93 to 95) that is
never persisted, `crawl()` has no try/catch, and a session that expires mid-run returns an HTML login
page so `r.json()` rejects and the whole run aborts after some courses have already posted. The
result is a partial `run_id` that is indistinguishable from a complete one. Fix: open a `sync_runs`
row with `status = 'running'` and a `sync_stage_runs` row per course before the first fetch, wrap
each course, record per-course status, close the run.

Empty-term guard. `runAll` filters memberships by exact string equality on `termName` (line 92). If
Syracuse renames the term, `mine` is empty and the run posts memberships and calendar and reports
success with zero courses. Fix: throw when `mine.length === 0`.

Config, not call-site constants. `termName`, the calendar window `2026-08-01` to `2027-01-15` (line
91) and `userId` move into a config object read from `.env`. `.env.example` already has `BB_USER_ID`
and `BB_BASE`; add `BB_TERM_NAME` and the calendar window.

The calendar endpoint itself: R2 verified all 23 items are gradebook echoes with null locations and
some `startDate` values that are column creation timestamps. Keep posting it (it is one call and it
costs nothing) but nothing should be built on it. The iCal feed is a different thing and is still
worth capturing.

---

## 6. Scheduling and freshness

Three lanes, and only one of them is genuinely unattended.

Lane 1, unattended, no browser. The Blackboard Ultra iCal feed, fetched by a Supabase Edge Function
on a `pg_cron` schedule, daily. It writes a `sync_runs` row with `source = 'ical'` and updates
`assignments.due_at` and `due_date` only where the reconciliation predicate allows. This is the only
data path in the whole project that does not need Stack, and it is blocked on one thing: the feed URL
has never been captured (`PHASE2_FINDINGS.md` open item 6, `.env.example` has `BB_ICAL_FEED_URL=`
empty). It costs one visit to the Blackboard calendar share settings. It is the single highest
leverage item on Stack's list.

Lane 2, attended, needs Duo. A Claude scheduled task on the weekly plus per-class-day cadence.
Suggested times, to be confirmed: 07:30 and 16:30 on Monday through Thursday, plus a longer Sunday
run that includes the file harvest. Its first three actions in order:

1. Drain the queue: `select * from agent_requests where state = 'queued' order by created_at`.
2. Login check, exactly as `CADENCE_RUNBOOK.md` opens: if the tab is on NetID or `microsoftonline`,
   stop.
3. On SESSION EXPIRED, do not just report to a transcript nobody reads. Write an `attention_items`
   row with `kind = 'stack_must_confirm'` and a question of "Blackboard session expired, log in and
   re-run", and close any queued requests as still queued. This is the change that makes a failed
   scheduled run visible in the GUI instead of invisible, and it is the difference between a cadence
   Stack trusts and one he stops looking at.

Lane 3, the app. No daemon, no autostart, no background window. On launch and on window focus the app
reads `v_data_freshness` and shows the age of each data class where a surface depends on it; when the
gradebook or announcements class is older than a threshold (start at 12 hours, tune) it shows a Sync
now action. Sync now inserts an `agent_requests` row and, if a terminal can be spawned, opens one
with the command prefilled. That is honest, needs nothing running in the background, and it is
identical in either shell.

Rejected: Windows Task Scheduler. It can start a process on a schedule but it cannot pass Duo, so all
it buys is a launched app that then has to ask Stack for the same thing the app already asks for on
launch. It adds an install-time step and a failure mode with no upside.

`sync_runs` lifecycle, stated once so every writer agrees:

```
agent_requests.queued
   -> claimed (compare-and-swap, section 7)
   -> sync_runs insert (status='running', started_at, trigger, request_id, run_id)
   -> per stage: sync_stage_runs insert running -> update ok|partial|failed
   -> sync_runs update (status = ok|partial|failed, finished_at, summary envelope)
   -> agent_requests update (state='done'|'failed', finished_at, sync_run_id, result)
```

Anything needing a human leaves the envelope entirely and becomes an `attention_items` row, because
the envelope has no way to record that it was dealt with.

How the GUI reads last sync per data class: `select * from v_data_freshness`, one query, cached with
a 30 second staleTime. Every freshness-sensitive surface in R3's section 2 table declares its stage
and renders the age; every static surface (meetings, staff, grading schemes, terms) renders no
indicator at all, because showing a sync badge on data that changes once a term trains Stack to
ignore all of them.

---

## 7. The Claude Code integration contract

### 7.1 What a skill needs

Four things, and they are all rows.

An invocation carrying a request id and nothing else. The app spawns `claude "/bb-sync 42"`, not a
paragraph. The prompt is short because Windows Terminal argument quoting is genuinely fiddly (`wt.exe`
treats `;` as a pane separator) and because everything the skill needs is already in the row.

A claim that cannot double-fire:

```sql
update agent_requests
   set state = 'claimed', claimed_at = now(), claimed_by = $2
 where id = $1 and state = 'queued'
returning *;
```

Zero rows back means someone else has it, and the skill stops. This matters because a scheduled task
and an interactive session can be running at the same time.

A place to write results: `sync_runs` opened with `status = 'running'` per section 6, the envelope
closed at the end, `agent_requests.result` and `state` set, and anything needing Stack in
`attention_items`.

A rule it must not break: it never writes `assignment_progress`, `reading_progress`,
`announcements.read_at`, or a `bb_files` row with `classified_by = 'stack'`. Every skill states this
in its own SKILL.md, because skills are read in isolation.

### 7.2 How the app launches a session, and what is realistic on Windows today

Primary, always: insert the `agent_requests` row. Durable, survives the app closing, survives Stack
going to class, and it is the record of intent even if the session never starts.

Secondary, best effort: spawn a terminal.

```
wt.exe -d C:\Users\estac\projects\bb2dash cmd /k claude "/bb-sync 42"
      fallback: cmd /c start "" cmd /k cd /d <repo> ^&^& claude "/bb-sync 42"
```

Detached, `windowsHide: false`, and the spawn failure is not an error condition, it just falls
through.

Tertiary: copy the exact command to the clipboard and show a toast with it. This is the path that
always works and it is the one to build first.

Not realistic in v1: the app running `claude -p` headlessly and rendering the result. It needs
Stack's Claude auth in a context he did not open, it produces no visible progress in a UI that has
nowhere to put it, and the two skills that matter most on a class day both need the browser and Duo
anyway. Worth revisiting in phase B for exactly the three browser-free skills (`bb-transform`,
`bb-classify-files`, `bb-grade-snapshot`), which genuinely could run unattended from the app, and
where `claude -p` returning a summary into `agent_requests.result` would work.

### 7.3 The skills roster at the end of the plan

Browser-bound skills need a logged-in tab and cannot be automated past Duo. DB-only skills need
nothing but credentials and are candidates for headless invocation later.

| Skill | Status | Browser | One-line contract |
|---|---|---|---|
| `bb-course-map` | exists, unchanged | yes | Reads one course's syllabus, tree, gradebook and announcements and writes a versioned `course_maps` row; downloads nothing. |
| `bb-course-pull` | exists, amended | yes | Executes the latest map for one course: refresh embeds, one batch download, store, extract, link; must now open a `sync_runs` row with the 010 envelope and route unresolved decisions to `attention_items` instead of prose. |
| `bb-sync` | new | yes | The per-class-day crawl: drain `agent_requests`, login check, `bb.runAll`, post `bb_raw`, invoke `bb-transform`, report; owns the `running` `sync_runs` row and writes a `stack_must_confirm` attention item on SESSION EXPIRED. |
| `bb-transform` | new | no | Runs `node ingest/transform/run.js --run-id X`; the only writer of typed facts from `bb_raw`; idempotent, reconciliation-rule-bound, diffs to the envelope and `attention_items`. |
| `bb-classify-files` | new | no | Offline pass over the existing corpus setting `bb_files.week_no`, `session_id`, `assignment_id`, `bucket` and `superseded_by` from path, filename and `bb_file_text`; never touches `classified_by = 'stack'`. |
| `bb-grade-snapshot` | new | no | Lifts the calculated gradebook columns from the latest run into `bb_gradebook`, flags attendance-style columns as non-grade signals, and reports what changed since the previous snapshot. |
| `bb-announce-extract` | new | no | Reads unparsed `announcements.body` for dated obligations ("Quiz 2 on Thursday 9/10") and writes `attention_items` with a suggested assignment row; never inserts into `assignments` directly. |
| `planner-triage` | new | no | Reads open `attention_items` plus `v_work_items` and proposes statuses, planned dates and effort overrides as `suggested` payloads; writes planner tables only through an accepted attention item, never on its own judgment. |

No `agent-queue` skill. Draining `agent_requests` is step 0 of `bb-sync` and of the scheduled task; a
skill whose only body is a loop is a skill nobody invokes.

---

## 8. Dev workflow on Windows with Claude Code

Branches, per `CLAUDE.md` and unchanged: `feat/`, `fix/`, `chore/`, never main. One branch per
coherent unit, which here means `chore/migrations-010-012` (the trust layer),
`feat/app-shell` (Electron plus preload plus auth plus the browser-mode mock),
`feat/transform` (`ingest/transform/`), then one branch per screen. Every session ends at "ready to
push when you say so", never at a push.

Migrations get the same rule as main, and this is a proposal Stack has not made yet: a migration is
applied to the live Supabase project only when he says so in that conversation. A `git revert` does
not un-apply DDL, and 010 through 019 touch the tables the GUI reads. The mechanic is: write
`db/migrations/NNN_name.sql` in the branch first, show him the DDL, and apply only on his word.

Apply path: the Supabase MCP `apply_migration`, with the migration name matching the file name
exactly. Not the Supabase CLI. The CLI would want a project link, the database password, and Docker
for the full local loop, which is a real install on Stack's machine to replace something that already
works from any Claude session. Before 010 is applied, run `list_migrations` and compare with
`ls db/migrations`; 001 through 009 may or may not be registered, and knowing which is a one-minute
check that avoids a duplicate-name failure at the worst moment.

Types: `generate_typescript_types` from the same MCP, written to
`app/src/renderer/lib/db.types.ts`, wired as `npm run types`. The rule that keeps it honest is that
types are regenerated in the same commit as the migration that changed the schema. A project with no
CI rots at exactly this seam.

Local dev and visual review. `npm run dev` in `app/` starts Vite on a pinned port (5174, pinned so
the URL Claude hands Stack is always the same one), and `npm run dev:electron` starts the shell
pointed at it. For review, the deliverable is `http://localhost:5174` in his own browser, which is
why `lib/bridge.ts` must have a working mock: in browser mode, file-open becomes a toast, the mirror
watcher reports everything as present, and spawning `claude` copies to the clipboard. Without that
mock, half the screens throw on load in the review path and the CLAUDE.md workflow stops working.

One consequence of the auth decision that will bite on day one if it is not planned for: reads
require a signed-in session, so browser dev mode needs the same email and password sign-in screen, or
Stack opens localhost and sees an empty app. Build the sign-in screen first, not last.

Environment. `app/.env.local` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, both
safe to bundle. Repo-root `.env` holds `BB_USER_ID`, `BB_BASE`, `BB_TERM_NAME`,
`BB_ICAL_FEED_URL` and the transform's Supabase Auth credentials. `.gitignore` already covers `.env`
and `.env.*`. `SUPABASE_SERVICE_KEY` stays empty in `.env.example` and is never filled.

Testing. No test framework is mandated for the UI, and I would not add one in v1. One thing does get
tests: the transform, with `node --test` over two or three real `bb_raw` payloads copied into
`ingest/transform/fixtures/`. The double-run idempotency assertion is the important one. This is the
only component where a silent wrong answer corrupts the database rather than misdrawing a box.

Definition of done for a screen, so that "done" is not a judgment call: it renders against the live
database with no sample rows, it degrades honestly on the known holes (the nine undated assignments,
GEO's absent points median, IST.471's absent sessions and meetings, GEO.103.recitation's absent
grading scheme), its freshness class is wired to `v_data_freshness`, and every write it performs goes
through `lib/queries` rather than an inline PostgREST call.

---

## Open questions for Stack

1. Public signup is on by default for Supabase projects, and the publishable key is committed. That
   means anyone who finds the repo after phase 4 can create an account and read and write the whole
   database, because every policy is `to authenticated using (true)`. May I disable email signups on
   the project and create your user from the dashboard? This is a settings toggle and it should
   happen before the app reads anything.
2. Can you capture the Blackboard calendar iCal share URL this week? It is the only unattended data
   path in the entire architecture and it costs one visit to the calendar settings gear.
3. Are you willing to sign in inside the app with a Supabase email and password? Every alternative is
   worse, and this one needs zero RLS changes.
4. Do you want to spend 90 minutes with me on SPIKE-BB-WEBVIEW (section 5.2)? You have to be there
   for the Duo push. If it passes, the file harvest loses its worst three steps; if it fails, we know
   and stop wondering. If you would rather not, I will build the app as a pure read surface and never
   raise it again.
5. Migrations: may I apply the same rule to schema changes that you apply to main, meaning I write
   the DDL in the branch and apply it to Supabase only when you say so in that conversation?
6. Grade display: is it acceptable for v1 to show Blackboard's own calculated Total on the course
   cards and the Grades screen, with the `grade_components` engine reserved for the T-07 what-if
   forecaster? That is one transform versus several weeks. Same question R1 asked; the architecture
   in migration 013 assumes yes.
7. `announcements`: my proposal is that `is_read` stays Blackboard's mirror and a new app-owned
   `read_at` drives the bell badge, which means you clear an announcement twice if you read it in
   Blackboard first. Acceptable?
8. `assignment_progress`: I am moving the read path for scores and feedback to a view now
   (`v_assignment_grade`) and proposing we drop the fact columns later in migration 025, rather than
   splitting the table immediately as R3 suggested. Do you want the columns gone sooner?
9. How often do you actually want the scheduled task to fire? I have guessed 07:30 and 16:30 Monday
   through Thursday plus a longer Sunday run. It determines how often the app nags.
10. Do you want Rust in this project for its own sake? If yes, say so and I will re-argue section 1
    for Tauri honestly rather than treating it as a tiebreaker I already resolved.
11. When the repo goes public, do you want the publishable key rotated and the anon insert policies
    dropped, or is an append-only public endpoint into `bb_raw` and `bb_files` an acceptable risk?
12. The ownership table in section 0 is enforced by convention, not by the database, because both the
    app and the agent sign in as the same user. Do you want it enforced with a second auth user and
    per-table policies, or is one user with disciplined code paths right for a tool only you use?

---

## Handoff notes

For the planners and for whoever writes the build sequence.

The trust layer comes first and it is three migrations, not a phase. Nothing in the GUI is honest
until 010, 011 and 012 exist, because until then "last sync" is a timestamp with no lifecycle, "needs
attention" has no resolvable rows, and "run a sync" has nowhere to record that it was asked for.
Scheduling any screen before those three produces R1's outcome: a working tracker, a working bell,
and three broken counters.

There is no transform. Any plan that assumes `bb_raw` folds into typed tables today is wrong, and
`ingest/classify_rules.sql` does not exist despite being cited by `ingest/FILE_HARVEST_SPEC.md`.
`ingest/transform/` is new construction and it is the single largest piece of work in this document.

`sync_stage_runs` is my addition and it is load-bearing. Without it there is no honest answer to
"how old is this number", because one run row cannot say grades are two hours old and files are three
days old. Do not drop it as scope.

The reconciliation rule becomes one predicate in one function. It currently exists as prose in four
files. If it ends up restated in three stages, the next person will change one of them.

`v_work_items` replaces `v_upcoming` as the thing the app reads, and the old views stay for
compatibility. Anything built directly on `v_upcoming` will silently omit 86 readings and the nine
assignments with no date at all.

The spike decides the shell, not just the feature. Section 1 commits to Electron with one named
condition that reverses it, and section 5.2 is that condition. Run the spike before `feat/app-shell`
merges, not after.

The renderer must run in a plain browser. That is not a nice-to-have, it is how Stack reviews visual
work per `CLAUDE.md`, and it means `lib/bridge.ts` needs its mock on day one and the sign-in screen
needs to exist before any screen that reads data.

`v_course_grade` keeps its name on purpose. `gui research context/gui/README.md` already binds course
cards to it, so migration 013 creates it rather than inventing a new name and editing the GUI
contract.

The publishable key plus open signups is a live hole today, before any app exists. It is the one
thing in this document worth doing this week regardless of what gets built.
