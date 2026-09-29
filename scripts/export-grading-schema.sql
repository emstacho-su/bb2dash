-- bb2dash :: scripts/export-grading-schema.sql
-- The V-1 grading schema export body (brief 96 §Contract "V-1 tooling", P-74; R-35).
-- ONE read-only statement returning ONE text value: sections `## 0. Counts` .. `## 5. grade_column_links`.
-- The PM runs it with execute_sql (a read), saves the value as
-- docs/planning/sprint-2/evidence/96a_GRADING_SCHEMA_EXPORT_<YYYY-MM-DD>.md, adds a header naming this
-- file's git blob hash and the generation time, and appends `## 6. Open questions` by hand.
--
-- Cells: NULL prints as an em dash; `|` is escaped and line breaks are folded, so every row stays
-- one markdown table row. Due day = the America/New_York day of due_at, else due_date (089's rule).
-- Syllabus file = the end of the superseded_by chain from the bb_files row whose course_id is the
-- course and whose file_name is the last path segment of courses.syllabus_path.
with recursive
syllabus_start as (
  select c.id as course_id, f.id as file_id, f.superseded_by, 0 as depth
  from courses c
  join bb_files f
    on f.course_id = c.id
   and f.file_name = regexp_replace(c.syllabus_path, '^.*[/\\]', '')
  where c.syllabus_path is not null
),
syllabus_chain as (
  select course_id, file_id, superseded_by, depth from syllabus_start
  union all
  select sc.course_id, f.id, f.superseded_by, sc.depth + 1
  from syllabus_chain sc
  join bb_files f on f.id = sc.superseded_by
  where sc.depth < 50
),
syllabus_end as (
  select course_id, string_agg(distinct 'bb_file:' || file_id, ', ' order by 'bb_file:' || file_id) as files
  from syllabus_chain
  where superseded_by is null
  group by course_id
),
sections as (
  -- 0. Counts
  select 0 as ord, concat_ws(E'\n',
    '## 0. Counts',
    '',
    '| table | rows |',
    '|---|---|',
    '| grading_schemes | ' || (select count(*) from grading_schemes) || ' |',
    '| grade_components | ' || (select count(*) from grade_components) || ' |',
    '| assignments | ' || (select count(*) from assignments) || ' |',
    '| grade_column_links | ' || (select count(*) from grade_column_links) || ' |',
    '| v_gradebook_latest (gradebook columns) | ' || (select count(*) from v_gradebook_latest) || ' |'
  ) as body

  union all
  -- 1. Schemes
  select 1, concat_ws(E'\n',
    '## 1. Schemes',
    '',
    '| course_id | method | total_points | graded_out_of | letter_scale | ai_policy | notes | confidence | syllabus file |',
    '|---|---|---|---|---|---|---|---|---|',
    coalesce((
      select string_agg(concat_ws(' | ',
          '| ' || s.course_id,
          coalesce(s.method::text, '—'),
          coalesce(s.total_points::text, '—'),
          coalesce(s.graded_out_of::text, '—'),
          coalesce(replace(regexp_replace(s.letter_scale::text, '\s*[\r\n]+\s*', ' ', 'g'), '|', '\|'), '—'),
          coalesce(replace(regexp_replace(s.ai_policy, '\s*[\r\n]+\s*', ' ', 'g'), '|', '\|'), '—'),
          coalesce(replace(regexp_replace(s.notes, '\s*[\r\n]+\s*', ' ', 'g'), '|', '\|'), '—'),
          coalesce(s.confidence::text, '—'),
          coalesce(se.files, '—') || ' |'), E'\n' order by s.course_id)
      from grading_schemes s
      left join syllabus_end se on se.course_id = s.course_id
    ), '_(no rows)_')
  )

  union all
  -- 2. Components
  select 2, concat_ws(E'\n',
    '## 2. Components',
    '',
    '| id | course_id | code | name | weight_pct | points | count_expected | aggregation | drop_lowest | rank_weights | normalize_to | is_extra_credit | parent_id | notes | confidence |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    coalesce((
      select string_agg(concat_ws(' | ',
          '| ' || g.id,
          g.course_id,
          coalesce(replace(g.code, '|', '\|'), '—'),
          coalesce(replace(regexp_replace(g.name, '\s*[\r\n]+\s*', ' ', 'g'), '|', '\|'), '—'),
          coalesce(g.weight_pct::text, '—'),
          coalesce(g.points::text, '—'),
          coalesce(g.count_expected::text, '—'),
          coalesce(g.aggregation::text, '—'),
          coalesce(g.drop_lowest::text, '—'),
          coalesce(g.rank_weights::text, '—'),
          coalesce(g.normalize_to::text, '—'),
          coalesce(g.is_extra_credit::text, '—'),
          coalesce(g.parent_id::text, '—'),
          coalesce(replace(regexp_replace(g.notes, '\s*[\r\n]+\s*', ' ', 'g'), '|', '\|'), '—'),
          coalesce(g.confidence::text, '—') || ' |'), E'\n' order by g.course_id, g.id)
      from grade_components g
    ), '_(no rows)_')
  )

  union all
  -- 3. Assignments
  select 3, concat_ws(E'\n',
    '## 3. Assignments',
    '',
    '| id | title | component_id | points_possible | bb_column_id | due day (America/New_York) | confidence | source_ref |',
    '|---|---|---|---|---|---|---|---|',
    coalesce((
      select string_agg(concat_ws(' | ',
          '| ' || replace(a.id, '|', '\|'),
          coalesce(replace(regexp_replace(a.title, '\s*[\r\n]+\s*', ' ', 'g'), '|', '\|'), '—'),
          coalesce(a.component_id::text, '—'),
          coalesce(a.points_possible::text, '—'),
          coalesce(a.bb_column_id, '—'),
          coalesce(coalesce((a.due_at at time zone 'America/New_York')::date, a.due_date)::text, '—'),
          coalesce(a.confidence::text, '—'),
          coalesce(replace(regexp_replace(a.source_ref, '\s*[\r\n]+\s*', ' ', 'g'), '|', '\|'), '—') || ' |'),
          E'\n' order by a.course_id, a.id)
      from assignments a
    ), '_(no rows)_')
  )

  union all
  -- 4. Gradebook columns
  select 4, concat_ws(E'\n',
    '## 4. Gradebook columns',
    '',
    '| course_id | column_id | name | possible | column_kind | linked_assignments | counts_toward_grade |',
    '|---|---|---|---|---|---|---|',
    coalesce((
      select string_agg(concat_ws(' | ',
          '| ' || v.course_id,
          v.column_id,
          coalesce(replace(regexp_replace(v.name, '\s*[\r\n]+\s*', ' ', 'g'), '|', '\|'), '—'),
          coalesce(v.possible::text, '—'),
          coalesce(v.column_kind, '—'),
          coalesce(v.linked_assignments::text, '—'),
          coalesce(v.counts_toward_grade::text, '—') || ' |'), E'\n' order by v.course_id, v.position, v.column_id)
      from v_gradebook_latest v
    ), '_(no rows)_')
  )

  union all
  -- 5. grade_column_links
  select 5, concat_ws(E'\n',
    '## 5. grade_column_links',
    '',
    '| course_id | column_id | component_id | excluded |',
    '|---|---|---|---|',
    coalesce((
      select string_agg(concat_ws(' | ',
          '| ' || l.course_id,
          l.column_id,
          coalesce(l.component_id::text, '—'),
          l.excluded::text || ' |'), E'\n' order by l.course_id, l.column_id)
      from grade_column_links l
    ), '_(no rows)_')
  )
)
select string_agg(body, E'\n\n' order by ord) || E'\n' as export
from sections;
