-- bb2dash :: scripts/check-ecn-exam1.sql
-- Optional read-only check (no gate, DECISIONS 2026-09-30): does ECN.304 Exam 1 count toward "graded so far"?
-- ONE read-only statement returning ONE row: state (PASS / PENDING / FAIL) and a plain-language detail.
-- Retroactive by design: bb_gradebook keeps every crawl (append per run), so this can be run any time
-- after the sync, with no Claude session open, and still names the crawl that first carried Exam 1.
--   PENDING  no Exam 1 column in any ECN.304 crawl yet, or the column exists with no score
--   PASS     the scored column is counted under Exams (component 3) in v_grade_model_items
--   FAIL     the scored column is not counted (unlinked, linked elsewhere, or "Not graded")
with exam1_cols as (
  select g.column_id, g.name, g.seen_at, g.sync_run_id
    from bb_gradebook g
   where g.course_id = 'ECN.304'
     and (g.name ~* '^\s*(exam|midterm)\s*#?\s*(1|one)\s*$'
          or g.column_id = (select bb_column_id from assignments where id = 'ECN.304/exam-1'))
),
first_seen as (
  select distinct on (column_id) column_id, name, seen_at, sync_run_id
    from exam1_cols
   order by column_id, seen_at
),
latest as (
  select l.column_id, l.name, l.assignment_id, coalesce(l.display_score, l.effective_score, l.manual_score) as score,
         l.possible, l.seen_at
    from v_gradebook_latest l
   where l.course_id = 'ECN.304' and l.column_id in (select column_id from first_seen)
),
model as (
  select m.column_id, m.component_id, m.excluded, m.score, m.assignment_id, m.link_source
    from v_grade_model_items m
   where m.scheme_course_id = 'ECN.304' and m.column_id in (select column_id from first_seen)
),
verdict as (
  select
    case
      when not exists (select 1 from first_seen) then 'PENDING'
      when not exists (select 1 from latest where score is not null) then 'PENDING'
      when exists (select 1 from model m join latest l using (column_id)
                    where l.score is not null and m.component_id = 3 and not m.excluded and m.score is not null)
        then 'PASS'
      else 'FAIL'
    end as state
)
select v.state,
       case v.state
         when 'PENDING' then coalesce(
           (select format('Exam 1 column %s ("%s") first seen %s (sync run %s) but not scored yet',
                          f.column_id, f.name, f.seen_at, f.sync_run_id) from first_seen f order by f.seen_at limit 1),
           'no Exam 1 column in any ECN.304 crawl yet')
         else
           (select format('column %s ("%s") first seen %s (sync run %s); score %s / %s; bound to %s; model: component %s, excluded %s, link %s',
                          f.column_id, f.name, f.seen_at, f.sync_run_id, l.score, l.possible,
                          coalesce(l.assignment_id, 'no assignment'), coalesce(m.component_id::text, 'none'),
                          coalesce(m.excluded::text, 'n/a'), coalesce(m.link_source, 'n/a'))
              from first_seen f
              join latest l using (column_id)
              left join model m using (column_id)
             where l.score is not null
             order by (m.component_id = 3 and not m.excluded) desc nulls last, f.seen_at
             limit 1)
       end as detail
  from verdict v;
