-- bb2dash :: db/migrations/194_workspace_ask_options.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 17. Worker W-76.
--
-- WHY. A question may now carry a course scope, a depth, a routine, an output format and up to five
-- attached files. The new page (24b) asks with `workspace_ask_with`; today's page keeps calling
-- `workspace_ask(uuid, text)`, which stays invoker and frozen (140). A request with no options row
-- means: depth auto, no scope, no routine, no attachment, format plain.
--
-- WHAT
--   1. workspace_routines            named instruction sets, as data: six rows, wording frozen here
--   2. workspace_request_options     one row for each request asked with options
--   3. workspace_request_attachments up to five files or uploads for each request
--   4. row security: the owner reads all three; nobody writes them but the function below
--   5. workspace_ask_with()          SECURITY DEFINER, the owner check first (42501); calls the frozen
--                                    workspace_ask and stores the options in the same transaction
--   6. privileges, then a guard block
--
-- THE BROWSER WRITES NONE OF THE THREE TABLES. `authenticated` gets select only, so a signed-in
-- session cannot skip the function's checks (the cap of five, an upload in `deleting`, a routine's
-- `needs`) by writing a row itself: a direct insert, update or delete raises 42501. Every policy on
-- the three names app_owner() in 140's initplan form, which phase21_140's unit requires of every
-- policy on a `workspace_` table.
--
-- ROUTINES ARE DATA, NOT CODE. The runner reads the chosen routine's `instructions` through
-- `workspace_turn_context` (196) and appends them to the system prompt. A routine id is a key in a
-- table and never becomes a path. The six rows below are the PM's wording, frozen with this file
-- (workspace/test/fixtures/contract24/seed/routines.json is the source; the text is copied exactly).
--
-- ATTACHMENTS are numbered files first, in array order, then uploads, in array order. A file's id is
-- bb_files.id (no foreign key: later strip migrations delete those rows); an upload's is
-- workspace_documents.id, with `on delete set null`, so a deleted upload leaves its slot and the
-- runner reads it as missing.
--
-- REFUSALS. 42501: not the owner. 22023: the question's length and nothing else about the options
-- (workspace_ask's, as today). 23505: a second open request in the conversation (as today). 23503:
-- an unknown routine, file id or upload id. 23514: a bad depth or format, an unknown course display
-- id, a key that is not one of the six, a sixth attachment, an upload in `deleting`, a routine whose
-- `needs` is not met. The whole call is one transaction: a refusal stores nothing.
--
-- Additive only: no drop, no rename, no existing object changed. No password, key or DSN is here.

do $$
begin
  if to_regclass('public.workspace_requests') is null then
    raise exception '194: table workspace_requests does not exist; apply 140_workspace_tables first';
  end if;
  if to_regclass('public.workspace_documents') is null then
    raise exception '194: table workspace_documents does not exist; apply 190_workspace_store first';
  end if;
  if to_regclass('public.v_course_display') is null then
    raise exception '194: view v_course_display does not exist (017_course_display)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '194: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1 to 3. The tables
-- =============================================================================================
create table public.workspace_routines (
  id           text primary key
               constraint workspace_routines_id_shape
               check (id ~ '^[a-z][a-z0-9-]{0,39}$'),
  grp          text not null
               constraint workspace_routines_grp_length
               check (char_length(grp) between 1 and 40),
  title        text not null
               constraint workspace_routines_title_length
               check (char_length(title) between 1 and 80),
  description  text not null,
  needs        text not null
               constraint workspace_routines_needs_known
               check (needs in ('nothing', 'file', 'course_or_file')),
  sort         integer not null default 100,
  enabled      boolean not null default true,
  instructions text not null
               constraint workspace_routines_instructions_length
               check (char_length(instructions) between 1 and 4000)
);

comment on table public.workspace_routines is
  'Named instruction sets (migration 194): data, not code. grp groups them in the menu, needs says '
  'what a request must carry (nothing, file: at least one attachment, course_or_file: a course or an '
  'attachment), instructions is appended to the system prompt by the runner. Six rows, wording '
  'frozen with the migration. Owner-only through RLS; written by the migration alone.';

create table public.workspace_request_options (
  request_id        bigint primary key
                    references public.workspace_requests (id) on delete cascade,
  course_display_id text,
  course_ids        text[],
  depth             text not null default 'auto'
                    constraint workspace_request_options_depth_known
                    check (depth in ('auto', 'quick', 'standard', 'deep')),
  routine_id        text references public.workspace_routines (id),
  format            text not null default 'plain'
                    constraint workspace_request_options_format_known
                    check (format in ('plain', 'rich'))
);

comment on table public.workspace_request_options is
  'What a question was asked with (migration 194), written by workspace_ask_with only. '
  'course_display_id is a display id of v_course_display; course_ids is the shell ids it expands to '
  'at the time of asking. A request with no row here means depth auto, no scope, no routine, '
  'format plain.';

create table public.workspace_request_attachments (
  request_id  bigint not null
              references public.workspace_requests (id) on delete cascade,
  ord         smallint not null
              constraint workspace_request_attachments_ord_range check (ord between 1 and 5),
  kind        text not null
              constraint workspace_request_attachments_kind_known check (kind in ('file', 'upload')),
  file_id     bigint,
  document_id bigint references public.workspace_documents (id) on delete set null,
  primary key (request_id, ord),
  -- A file names a course file by id and no document; an upload names a document (null once that
  -- upload was deleted) and no file.
  constraint workspace_request_attachments_shape
    check ((kind = 'file' and file_id is not null and document_id is null)
           or (kind = 'upload' and file_id is null))
);

comment on table public.workspace_request_attachments is
  'The files attached to a question, at most five, numbered files first then uploads (migration 194), '
  'written by workspace_ask_with only. file_id is bb_files.id (no foreign key); document_id is '
  'workspace_documents.id, set null when that upload is deleted.';

-- The six routines. The wording is the PM's and is copied exactly from the frozen fixture.
insert into public.workspace_routines (id, grp, title, description, needs, sort, enabled, instructions)
values
  ('quiz',
   'study',
   'Quiz me',
   'One question at a time from a course or a file, with your answer checked.',
   'course_or_file',
   10,
   true,
   'Run a quiz for him on the scoped course or the attached file. Ask one question at a time, drawn only from the passages and the attached text in this prompt, and wait for his answer before you ask the next. When he answers, say whether it is right, give the correct answer in one or two sentences, and name the file and the page, slide or sheet it came from. Vary the form: recall, a short explanation, a small application. Ask nothing the material in this prompt does not cover; when the material is too thin for another question, say so. Keep no score unless he asks for one, and never turn a score into a grade.'),
  ('study-guide',
   'study',
   'Study guide',
   'An outline of a course or a file, with where each point comes from.',
   'course_or_file',
   20,
   true,
   'Write a study guide for the scoped course or the attached file. Build an outline from the passages and the attached text in this prompt: the main topics in the order the material gives them and, under each, the key terms with a one-line meaning and the points worth remembering, each with the file and the page, slide or sheet it came from. Use only what the material says. End with a short section headed "What the material did not cover", listing the topics his question named that no passage in this prompt supports.'),
  ('explain-file',
   'study',
   'Explain this file',
   'A plain-words walk through an attached file, page by page or slide by slide.',
   'file',
   30,
   true,
   'Explain the attached file in plain words. Walk it in its own order, page by page or slide by slide, naming each page or slide as you reach it. For each one, say what it is about, explain any term a first-time reader would not know, and say how it connects to the one before. Where a point comes from a slide''s speaker notes, say that it is from the speaker notes. If the file was read in part, say which part you covered. Add nothing from outside the file except to explain a term, and say so when you do.'),
  ('summarise-reading',
   'study',
   'Summarise a reading',
   'Summary, main claims, terms and check questions for an attached reading.',
   'file',
   40,
   true,
   'Summarise the attached reading. Give, in this order: a summary of five to eight sentences; the main claims, each in one sentence with the page it is on; the key terms, each with a one-line meaning; and three to five check questions he can test himself with, without their answers unless he asks. Use only the attached text. If it was read in part, say which part the summary covers.'),
  ('plan-week',
   'plan',
   'Plan my week',
   'The next seven days from your planner, in a suggested order.',
   'nothing',
   50,
   true,
   'Plan his next seven days from the planner block in this prompt. First list what is due, day by day from today, each item by its title and its due date exactly as the planner block shows them. Then suggest an order of work: what to start first and why, one line each. Count only items the planner block shows, and leave out an item whose status shows it is finished unless he asks for it. Do no arithmetic on points or grades, and do not estimate how long anything takes unless he asks. If the planner block shows nothing due in the seven days, say so.'),
  ('draft-help',
   'write',
   'Drafting help',
   'Drafts or rewrites text for an assignment from your words and its instructions.',
   'nothing',
   60,
   true,
   'Help him draft or rewrite text for an assignment, from his own words, his draft and the assignment''s instructions. If he gave a draft, improve it: keep his meaning and his voice, mend the structure and the clarity, and say in two or three lines what you changed. If he gave only notes or a prompt, write a first draft he can edit, in plain prose, at the length the instructions ask for when they give one. Use the assignment''s instructions when they are among the passages or the attached text in this prompt, and name the requirement you are following. Do not invent a fact, a quotation or a source: where the draft needs one he has not given, mark the place in square brackets with what is missing.');

-- =============================================================================================
-- 4. Row security: the owner, in 076's initplan form
-- =============================================================================================
alter table public.workspace_routines            enable row level security;
alter table public.workspace_request_options     enable row level security;
alter table public.workspace_request_attachments enable row level security;

create policy workspace_routines_owner_select on public.workspace_routines
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
create policy workspace_request_options_owner_select on public.workspace_request_options
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
create policy workspace_request_attachments_owner_select on public.workspace_request_attachments
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

-- =============================================================================================
-- 5. workspace_ask_with
-- =============================================================================================
create or replace function public.workspace_ask_with(
    p_conversation_id uuid, p_text text, p_options jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_keys    constant text[]  := array['course', 'depth', 'routine', 'format', 'files', 'uploads'];
  c_max_att constant integer := 5;
  v_opts    jsonb := coalesce(p_options, '{}'::jsonb);
  v_key     text;
  v_el      jsonb;
  v_course  text;
  v_depth   text;
  v_routine text;
  v_format  text;
  v_files   bigint[] := '{}';
  v_uploads bigint[] := '{}';
  v_shells  text[];
  v_needs   text;
  v_id      bigint;
  v_state   text;
  v_ord     integer := 0;
  v_out     jsonb;
  v_req     bigint;
begin
  -- The owner check, first. A null uid is refused too.
  if auth.uid() is null or auth.uid() is distinct from public.app_owner() then
    raise exception 'workspace_ask_with: only the owner may ask' using errcode = '42501';
  end if;

  -- The options: an object whose keys are among the six; null means absent.
  if jsonb_typeof(v_opts) <> 'object' then
    raise exception 'workspace_ask_with: p_options must be a json object' using errcode = '23514';
  end if;
  for v_key in select jsonb_object_keys(v_opts) loop
    if not (v_key = any (c_keys)) then
      raise exception 'workspace_ask_with: % is not one of the six option keys', v_key using errcode = '23514';
    end if;
  end loop;
  foreach v_key in array array['course', 'depth', 'routine', 'format'] loop
    if jsonb_typeof(v_opts->v_key) not in ('string', 'null') then
      raise exception 'workspace_ask_with: % must be text', v_key using errcode = '23514';
    end if;
  end loop;
  foreach v_key in array array['files', 'uploads'] loop
    if jsonb_typeof(v_opts->v_key) not in ('array', 'null') then
      raise exception 'workspace_ask_with: % must be a list of ids', v_key using errcode = '23514';
    end if;
  end loop;

  v_course  := nullif(btrim(v_opts->>'course'), '');
  v_depth   := coalesce(v_opts->>'depth', 'auto');
  v_routine := nullif(btrim(v_opts->>'routine'), '');
  v_format  := coalesce(v_opts->>'format', 'plain');
  if v_depth not in ('auto', 'quick', 'standard', 'deep') then
    raise exception 'workspace_ask_with: depth must be auto, quick, standard or deep, not %', v_depth
      using errcode = '23514';
  end if;
  if v_format not in ('plain', 'rich') then
    raise exception 'workspace_ask_with: format must be plain or rich, not %', v_format
      using errcode = '23514';
  end if;

  -- The attachment lists: whole numbers only, at most five in all.
  for v_el in select * from jsonb_array_elements(
                case when jsonb_typeof(v_opts->'files') = 'array' then v_opts->'files' else '[]'::jsonb end) loop
    if jsonb_typeof(v_el) <> 'number' or (v_el #>> '{}') !~ '^[0-9]{1,18}$' then
      raise exception 'workspace_ask_with: files holds whole numbers only' using errcode = '23514';
    end if;
    v_files := v_files || (v_el #>> '{}')::bigint;
  end loop;
  for v_el in select * from jsonb_array_elements(
                case when jsonb_typeof(v_opts->'uploads') = 'array' then v_opts->'uploads' else '[]'::jsonb end) loop
    if jsonb_typeof(v_el) <> 'number' or (v_el #>> '{}') !~ '^[0-9]{1,18}$' then
      raise exception 'workspace_ask_with: uploads holds whole numbers only' using errcode = '23514';
    end if;
    v_uploads := v_uploads || (v_el #>> '{}')::bigint;
  end loop;
  if cardinality(v_files) + cardinality(v_uploads) > c_max_att then
    raise exception 'workspace_ask_with: at most % attachments, not %', c_max_att,
      cardinality(v_files) + cardinality(v_uploads) using errcode = '23514';
  end if;

  -- The course: a display id of v_course_display, expanded to its shells.
  if v_course is not null then
    select d.shell_ids into v_shells from v_course_display d where d.display_id = v_course;
    if not found then
      raise exception 'workspace_ask_with: % is not a course display id', v_course using errcode = '23514';
    end if;
  end if;

  -- The routine, and what it needs.
  if v_routine is not null then
    select r.needs into v_needs from workspace_routines r where r.id = v_routine and r.enabled;
    if not found then
      raise exception 'workspace_ask_with: % is not a routine', v_routine using errcode = '23503';
    end if;
  end if;

  -- The files and uploads must be there; an upload being deleted cannot be attached.
  foreach v_id in array v_files loop
    if not exists (select 1 from bb_files f where f.id = v_id) then
      raise exception 'workspace_ask_with: file % does not exist', v_id using errcode = '23503';
    end if;
  end loop;
  foreach v_id in array v_uploads loop
    select d.state into v_state from workspace_documents d where d.id = v_id and d.kind = 'upload';
    if not found then
      raise exception 'workspace_ask_with: upload % does not exist', v_id using errcode = '23503';
    end if;
    if v_state = 'deleting' then
      raise exception 'workspace_ask_with: upload % is being deleted', v_id using errcode = '23514';
    end if;
  end loop;

  if v_needs = 'file' and cardinality(v_files) + cardinality(v_uploads) < 1 then
    raise exception 'workspace_ask_with: the routine % needs an attached file', v_routine using errcode = '23514';
  end if;
  if v_needs = 'course_or_file' and v_course is null and cardinality(v_files) + cardinality(v_uploads) < 1 then
    raise exception 'workspace_ask_with: the routine % needs a course or an attached file', v_routine
      using errcode = '23514';
  end if;

  -- The frozen question function: the text's length (22023), the open request (23505), the three ids.
  v_out := public.workspace_ask(p_conversation_id, p_text);
  v_req := (v_out->>'request_id')::bigint;

  insert into workspace_request_options (request_id, course_display_id, course_ids, depth, routine_id, format)
  values (v_req, v_course, v_shells, v_depth, v_routine, v_format);

  foreach v_id in array v_files loop
    v_ord := v_ord + 1;
    insert into workspace_request_attachments (request_id, ord, kind, file_id)
    values (v_req, v_ord, 'file', v_id);
  end loop;
  foreach v_id in array v_uploads loop
    v_ord := v_ord + 1;
    insert into workspace_request_attachments (request_id, ord, kind, document_id)
    values (v_req, v_ord, 'upload', v_id);
  end loop;

  return v_out;
end $$;

comment on function public.workspace_ask_with(uuid, text, jsonb) is
  'Asks one Workspace question with options (194), in one transaction: the owner check first (42501), '
  'then workspace_ask(p_conversation_id, p_text) and the options row and the attachments. p_options '
  'keys (all optional, null is absent): course (a display id of v_course_display, expanded to its '
  'shell ids), depth (auto, quick, standard, deep), routine, format (plain, rich), files (bb_files '
  'ids), uploads (workspace_documents ids). Attachments are numbered files first, then uploads. '
  'Returns workspace_ask''s {conversation_id, message_id, request_id}. 22023 for the question''s '
  'length and 23505 for a second open request, as workspace_ask; 23503 for an unknown routine, '
  'file or upload; 23514 for a bad value, an unknown course, a key off the six, a sixth '
  'attachment, an upload in deleting, or a routine whose needs are not met. SECURITY DEFINER. '
  'authenticated only.';

-- =============================================================================================
-- 6. Privileges
-- =============================================================================================
revoke all on
  public.workspace_routines,
  public.workspace_request_options,
  public.workspace_request_attachments
from public, anon, authenticated;

grant select on
  public.workspace_routines,
  public.workspace_request_options,
  public.workspace_request_attachments
to authenticated;

-- Phase 15's runner writes the units' setup rows (brief 95).
grant insert, update, delete on
  public.workspace_routines,
  public.workspace_request_options,
  public.workspace_request_attachments
to db_test_runner;

revoke all on function public.workspace_ask_with(uuid, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.workspace_ask_with(uuid, text, jsonb) to authenticated;

-- =============================================================================================
-- 7. Guard
-- =============================================================================================
do $$
declare
  v_bad text;
  v_got text;
  t     text;
begin
  -- (a) Row security on; anon holds nothing; authenticated holds select and no write, on a table or
  --     a column.
  foreach t in array array['workspace_routines', 'workspace_request_options', 'workspace_request_attachments'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then
      raise exception 'FAIL 194: row security is off on %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('anon', 'public.' || t, 'select, insert, update, references') then
      raise exception 'FAIL 194: anon holds a privilege on %', t;
    end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('authenticated', 'public.' || t, 'insert, update, references') then
      raise exception 'FAIL 194: authenticated does not hold select alone on %', t;
    end if;
  end loop;

  -- (b) Every policy on the three names app_owner().
  select string_agg(p.policyname, ', ' order by p.policyname) into v_bad
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('workspace_routines', 'workspace_request_options', 'workspace_request_attachments')
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') not like '%app_owner()%';
  if v_bad is not null then
    raise exception 'FAIL 194: these policies do not name app_owner(): %', v_bad;
  end if;

  -- (c) Six routines, and the three each routine needs.
  select string_agg(r.id || ':' || r.needs, ',' order by r.sort) into v_got from workspace_routines r;
  if v_got is distinct from
     'quiz:course_or_file,study-guide:course_or_file,explain-file:file,summarise-reading:file,plan-week:nothing,draft-help:nothing' then
    raise exception 'FAIL 194: the routines are [%]', v_got;
  end if;

  -- (d) The function is SECURITY DEFINER with a pinned path, executable by authenticated alone.
  if not exists (select 1 from pg_proc p
                  where p.oid = 'public.workspace_ask_with(uuid, text, jsonb)'::regprocedure
                    and p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']
                    and has_function_privilege('authenticated', p.oid, 'execute')
                    and not has_function_privilege('anon', p.oid, 'execute')
                    and not has_function_privilege('public', p.oid, 'execute')
                    and not has_function_privilege('service_role', p.oid, 'execute')) then
    raise exception 'FAIL 194: workspace_ask_with is not security definer with a pinned path, executable by authenticated alone';
  end if;
  -- workspace_ask itself is still invoker and unchanged in its signature.
  if (select p.prosecdef from pg_proc p where p.oid = 'public.workspace_ask(uuid, text)'::regprocedure) then
    raise exception 'FAIL 194: workspace_ask(uuid, text) is no longer security invoker';
  end if;
end $$;
