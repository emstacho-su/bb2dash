-- bb2dash :: 001_schema.sql
-- Academic data warehouse for Blackboard Ultra exports (Syracuse, Fall 2026).
-- Design rules:
--   * Text slugs as primary keys where a human will read/write them (courses, assignments).
--   * Source-of-truth facts (from syllabus / Blackboard / iCal) are separated from
--     user planner state (assignment_progress) so re-syncs never clobber your own tracking.
--   * Every fact row carries `source` + `confidence` so reconciliation against Blackboard
--     knows what it is allowed to overwrite.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type course_kind        as enum ('lecture','recitation','lab','seminar','internship','online');
create type syllabus_status    as enum ('complete','partial','missing');
create type staff_role         as enum ('instructor','ta','coordinator','faculty_sponsor','site_supervisor','guest');
create type grading_method     as enum ('weighted_pct','points','qualitative','unknown');
create type aggregation_rule   as enum ('sum','average','average_drop_lowest','rank_weighted','normalized','single','manual','unknown');
create type assignment_type    as enum (
  'exam','final_exam','quiz','lab','homework','reading','presentation','group_presentation',
  'project','paper','discussion_post','form','checkpoint','meeting','evaluation',
  'activity','attendance','participation','other'
);
create type recurrence_kind    as enum ('one_off','recurring');
create type submission_channel as enum ('blackboard','in_class','email','external_site','discussion_board','none','unknown');
create type data_source        as enum ('syllabus','course_deck','blackboard','ical','manual','inferred');
create type confidence_level   as enum ('confirmed','tentative','inferred');
create type session_kind       as enum ('lecture','exam','lab','presentation','practice','guest','no_class','discussion','other');
create type progress_status    as enum (
  'not_started','planned','in_progress','submitted','graded','missed','excused','not_applicable','waived'
);
create type priority_level     as enum ('low','normal','high','critical');

-- ---------------------------------------------------------------------------
-- Reference: terms
-- ---------------------------------------------------------------------------
create table terms (
  id          text primary key,                 -- 'FALL26'
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  notes       text
);

-- ---------------------------------------------------------------------------
-- Courses (one row per Blackboard course shell; recitation links to its lecture)
-- ---------------------------------------------------------------------------
create table courses (
  id               text primary key,              -- 'ECN.304', 'GEO.103.lecture', 'GEO.103.recitation'
  term_id          text not null references terms(id),
  bb_course_id     text not null unique,          -- 'ECN.304.M001.FALL26'
  subject          text not null,                 -- 'ECN'
  number           text not null,                 -- '304'
  section          text not null,                 -- 'M001'
  title_bb         text not null,                 -- title as shown in Blackboard
  title_short      text not null,                 -- your preferred display name
  kind             course_kind not null default 'lecture',
  parent_course_id text references courses(id),   -- recitation -> lecture
  credits          numeric(3,1),
  location         text,
  bb_url           text,
  syllabus_path    text,                          -- relative to bb2dash/course context
  syllabus_status  syllabus_status not null default 'missing',
  group_notes      text,                          -- e.g. 'Ethics Case Group #2; Major Case Group #3'
  notes            text,
  source           data_source not null default 'manual',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table course_staff (
  id           bigint generated always as identity primary key,
  course_id    text not null references courses(id) on delete cascade,
  name         text not null,
  role         staff_role not null,
  email        text,
  office       text,
  office_hours text,
  phone        text,
  notes        text,
  source       data_source not null default 'syllabus'
);

-- Weekly meeting pattern (0=Sun .. 6=Sat)
create table meetings (
  id          bigint generated always as identity primary key,
  course_id   text not null references courses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time  time,
  end_time    time,
  location    text,
  starts_on   date,
  ends_on     date,
  confidence  confidence_level not null default 'confirmed',
  source      data_source not null default 'syllabus'
);

-- Dated class sessions from the syllabus calendar (topic-by-date)
create table sessions (
  id           bigint generated always as identity primary key,
  course_id    text not null references courses(id) on delete cascade,
  session_date date not null,
  week_no      smallint,
  kind         session_kind not null default 'lecture',
  topic        text,
  counts_attendance boolean,                      -- IST 466 marks specific dates with *
  notes        text,
  source       data_source not null default 'syllabus',
  confidence   confidence_level not null default 'confirmed',
  unique (course_id, session_date, topic)
);

-- ---------------------------------------------------------------------------
-- Grading model (declarative so forecasting code can interpret it)
-- ---------------------------------------------------------------------------
create table grading_schemes (
  course_id      text primary key references courses(id) on delete cascade,
  method         grading_method not null default 'unknown',
  total_points   numeric(7,2),                    -- points-based only (IST 323 = 104)
  graded_out_of  numeric(7,2),                    -- IST 323 = 100
  letter_scale   jsonb,                           -- [{"letter":"A","min":93}, ...] descending
  late_policy    text,
  ai_policy      text,
  notes          text,
  source         data_source not null default 'syllabus',
  confidence     confidence_level not null default 'confirmed'
);

create table grade_components (
  id              bigint generated always as identity primary key,
  course_id       text not null references courses(id) on delete cascade,
  code            text not null,                  -- 'exams','quizzes','participation'
  name            text not null,
  parent_id       bigint references grade_components(id),  -- sub-components (IST 323 final project)
  weight_pct      numeric(5,2),                   -- weighted_pct schemes
  points          numeric(7,2),                   -- points schemes
  count_expected  smallint,                       -- how many graded items feed this bucket
  aggregation     aggregation_rule not null default 'unknown',
  drop_lowest     smallint not null default 0,
  rank_weights    jsonb,                          -- ECN 304 exams: [30,25,20] highest->lowest
  normalize_to    numeric(7,2),                   -- IST 323 quizzes normalized to 5 pts
  is_extra_credit boolean not null default false,
  notes           text,
  source          data_source not null default 'syllabus',
  confidence      confidence_level not null default 'confirmed',
  unique (course_id, code)
);

-- ---------------------------------------------------------------------------
-- Assignments: every gradeable or required deliverable/event
-- ---------------------------------------------------------------------------
create table assignments (
  id               text primary key,              -- 'IST.323/quiz-03'
  course_id        text not null references courses(id) on delete cascade,
  component_id     bigint references grade_components(id),
  title            text not null,
  type             assignment_type not null,
  recurrence       recurrence_kind not null default 'one_off',
  series_key       text,                          -- 'IST.323/quiz' groups recurring instances
  sequence_no      smallint,                      -- 3 for quiz-03
  due_at           timestamptz,                   -- authoritative when known (America/New_York)
  due_date         date,                          -- when only the day is known
  due_rule         text,                          -- 'before class', '24h before presenting'
  available_from   timestamptz,
  event_start      timestamptz,                   -- exams/presentations happen at a time
  event_end        timestamptz,
  points_possible  numeric(7,2),
  is_extra_credit  boolean not null default false,
  is_group         boolean not null default false,
  group_key        text,                          -- 'Ethics Group #2'
  submission       submission_channel not null default 'unknown',
  submission_format text,                         -- '.docx single file, 1in margins, TNR 12'
  description      text,
  bb_item_id       text,                          -- Blackboard content/gradebook id once captured
  bb_url           text,
  source           data_source not null default 'syllabus',
  source_ref       text,                          -- file name / slide / BB path
  confidence       confidence_level not null default 'confirmed',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index assignments_course_due_idx on assignments (course_id, due_at);
create index assignments_series_idx on assignments (series_key, sequence_no);

-- Planner / progress state. User-owned; sync jobs only touch score fields when Blackboard reports a grade.
create table assignment_progress (
  assignment_id   text primary key references assignments(id) on delete cascade,
  status          progress_status not null default 'not_started',
  priority        priority_level not null default 'normal',
  planned_start   date,
  planned_finish  date,
  est_minutes     integer,
  submitted_at    timestamptz,
  graded_at       timestamptz,
  score           numeric(7,2),
  score_max       numeric(7,2),
  letter          text,
  feedback        text,
  notes           text,
  updated_at      timestamptz not null default now()
);

-- Readings (kept separate: they are workload, rarely graded directly)
create table readings (
  id          bigint generated always as identity primary key,
  course_id   text not null references courses(id) on delete cascade,
  for_date    date,                               -- class date the reading supports
  week_no     smallint,
  topic       text,
  citation    text not null,
  url         text,
  required    boolean not null default true,
  on_blackboard boolean not null default false,   -- '(BB)' in syllabus
  notes       text,
  source      data_source not null default 'syllabus',
  confidence  confidence_level not null default 'confirmed'
);
create index readings_course_date_idx on readings (course_id, for_date);

create table reading_progress (
  reading_id  bigint primary key references readings(id) on delete cascade,
  status      progress_status not null default 'not_started',
  notes       text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Blackboard capture (phase 2+)
-- ---------------------------------------------------------------------------
create table announcements (
  id          bigint generated always as identity primary key,
  course_id   text not null references courses(id) on delete cascade,
  posted_at   timestamptz,
  title       text,
  body        text,
  bb_item_id  text,
  captured_at timestamptz not null default now(),
  unique (course_id, bb_item_id)
);

-- Content tree as the student perceives it in Blackboard (folders/items)
create table bb_content (
  id          bigint generated always as identity primary key,
  course_id   text not null references courses(id) on delete cascade,
  parent_id   bigint references bb_content(id),
  bb_item_id  text,
  title       text not null,
  item_kind   text,                               -- folder, document, assignment, test, link, file
  path        text,                               -- 'Assignments/Labs/Instructions...'
  url         text,
  assignment_id text references assignments(id),
  captured_at timestamptz not null default now(),
  unique (course_id, path)
);

create table sync_runs (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),
  source      data_source not null,
  scope       text,                               -- 'all' | course id
  summary     jsonb,
  notes       text
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger courses_updated_at before update on courses for each row execute function set_updated_at();
create trigger assignments_updated_at before update on assignments for each row execute function set_updated_at();
create trigger assignment_progress_updated_at before update on assignment_progress for each row execute function set_updated_at();
create trigger reading_progress_updated_at before update on reading_progress for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Convenience views
-- ---------------------------------------------------------------------------
create view v_upcoming as
select a.id, a.course_id, c.title_short, a.title, a.type, a.due_at, a.due_date, a.due_rule,
       a.points_possible, a.confidence, coalesce(p.status,'not_started') as status, p.priority
from assignments a
join courses c on c.id = a.course_id
left join assignment_progress p on p.assignment_id = a.id
where coalesce(a.due_at::date, a.due_date) >= current_date
  and coalesce(p.status,'not_started') not in ('submitted','graded','excused','not_applicable','waived')
order by coalesce(a.due_at, a.due_date::timestamptz);

create view v_overdue as
select a.id, a.course_id, c.title_short, a.title, a.type, a.due_at, a.due_date,
       coalesce(p.status,'not_started') as status
from assignments a
join courses c on c.id = a.course_id
left join assignment_progress p on p.assignment_id = a.id
where coalesce(a.due_at::date, a.due_date) < current_date
  and coalesce(p.status,'not_started') in ('not_started','planned','in_progress');

-- ---------------------------------------------------------------------------
-- RLS: single-owner warehouse. Service role bypasses RLS; authenticated users get full access.
-- Tighten to auth.uid() checks if this ever becomes multi-user.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array['terms','courses','course_staff','meetings','sessions','grading_schemes',
                               'grade_components','assignments','assignment_progress','readings',
                               'reading_progress','announcements','bb_content','sync_runs'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t||'_owner_all', t);
  end loop;
end $$;
