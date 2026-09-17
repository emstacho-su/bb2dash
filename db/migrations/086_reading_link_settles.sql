-- bb2dash :: 086_reading_link_settles.sql
-- Phase 12b round 3, code-review finding CR-2 against migration 074 (M-2 / P-materials-2).
-- Worker W-30. 074 stays frozen; this is a create-or-replace of `link_reading_files` only.
--
-- THE BUG. 074's link step asks Stack a question it can never be told the answer to. When a
-- `readings`-bucket file matches more than one reading it raises
--     kind = 'stack_must_confirm', entity = 'bb_file',
--     ref  = 'reading_link/<file id>', field = 'reading_id', to_value = [candidate reading ids]
-- and then nothing in the system can close the loop:
--   * `apply_resolutions()` (042) only ever writes `assignments` rows, and only for
--     `entity = 'assignment'`. It has no branch that could set `bb_files.reading_id`.
--   * `raise_attention` (041) refuses to re-ask exactly two things: a `missing` / `data_gap` key
--     that already has a closed row (`attention_answered`), and a `conflict` settled with "Keep
--     mine" whose value has not moved (`attention_keep_stands`). `stack_must_confirm` is in
--     neither list.
--   * The dedupe index is partial - `where state = 'open'` - so the moment Stack resolves or
--     dismisses the row it stops matching, and the next `stage_files` run inserts a brand new
--     open one.
-- `transform_tick` drains a transform request every two minutes and each one folds the newest
-- crawl, so the question would come back every two minutes, for ever. That is precisely the
-- failure migration 041 was written to stop, reintroduced by a new raiser.
--
-- THE FIX, entirely inside the one function that raises it. The link step becomes its own apply
-- path, which is the honest place for it: it is the only code that knows what the candidates were.
-- Before raising, it looks for the newest CLOSED row for that exact question and compares the
-- candidate set it was asked about (`to_value`) with the candidates now.
--
--   same candidates, answer names one of them   -> set bb_files.reading_id, say nothing  (applied)
--   same candidates, "none of these" / dismissed -> say nothing                          (settled)
--   the candidate set has changed                -> ask once, about the new set          (raised)
--
-- Once a file is linked it is out of the loop's `reading_id is null` filter altogether, so an
-- answered question cannot come back by any route.
--
-- HOW TO ANSWER ONE. Write `resolution` as `{"reading_id": <id>}` to pick a reading, or
-- `{"accept": "none"}` for "none of these"; dismissing the row means the same as "none of these".
-- An answer naming a reading that is not in the candidate set is treated as "none of these"
-- rather than obeyed - the set is what the question offered.
--
-- No data changes: prod has zero ambiguous reading-link rows today (074's backfill found two
-- files, each with exactly one candidate). This is the behaviour for the next one.

create or replace function link_reading_files(p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_examined int := 0; v_linked int := 0; v_ambiguous int := 0; v_raised int := 0;
  v_applied int := 0; v_settled int := 0;
  f        record;
  v_ids    bigint[];
  v_cites  text;
  v_cover  numeric;
  v_answer record;
  v_pick   bigint;
begin
  for f in
    select bf.id,
           bf.course_id,
           bf.file_name,
           coalesce((select c.parent_course_id from courses c where c.id = bf.course_id),
                    bf.course_id) as scheme_course_id,
           -- The file's title: name without its extension and without a " (2)" download marker.
           reading_match_tokens(
             regexp_replace(regexp_replace(bf.file_name, '\.[A-Za-z0-9]{1,5}$', ''),
                            '\s*\(\d+\)\s*$', '')) as toks
      from bb_files bf
     where bf.bucket = 'readings'
       and bf.reading_id is null
       and bf.superseded_by is null
     order by bf.id
  loop
    continue when cardinality(f.toks) = 0;
    v_examined := v_examined + 1;

    select array_agg(m.reading_id order by m.reading_id),
           string_agg(m.citation, ' / ' order by m.reading_id),
           max(round(m.hits::numeric / m.rtoks, 2))
      into v_ids, v_cites, v_cover
      from (select rd.id as reading_id,
                   rd.citation,
                   cardinality(array(select unnest(f.toks)
                                     intersect
                                     select unnest(reading_match_tokens(rd.citation)))) as hits,
                   cardinality(reading_match_tokens(rd.citation))                       as rtoks
              from readings rd
             where coalesce((select c.parent_course_id from courses c where c.id = rd.course_id),
                            rd.course_id) = f.scheme_course_id) m
     where m.rtoks > 0
       and m.hits >= 2
       and m.hits::numeric / m.rtoks >= 0.5;

    if v_ids is null then
      -- No candidate. The reading has no harvested file; stage_gaps already says so.
      null;
    elsif cardinality(v_ids) = 1 then
      update bb_files
         set reading_id      = v_ids[1],
             link_confidence = v_cover,
             notes           = btrim(coalesce(notes || ' | ', '') ||
                               'reading_id linked by link_reading_files, token coverage ' || v_cover::text)
       where id = f.id;
      v_linked := v_linked + 1;
    else
      -- CR-2: has Stack already settled this question? The newest closed row for this exact file
      -- is the answer, and `to_value` is the candidate set it was asked about.
      select ai.state, ai.resolution, ai.to_value
        into v_answer
        from attention_items ai
       where ai.kind = 'stack_must_confirm'
         and ai.entity = 'bb_file'
         and ai.ref = 'reading_link/' || f.id::text
         and ai.field = 'reading_id'
         and ai.state in ('resolved', 'dismissed')
       order by coalesce(ai.resolved_at, ai.raised_at) desc, ai.id desc
       limit 1;

      if found and v_answer.to_value is not distinct from to_jsonb(v_ids) then
        -- Same question, already answered. Obey it, or stay quiet - never ask again.
        v_pick := null;
        begin
          v_pick := nullif(v_answer.resolution->>'reading_id', '')::bigint;
        exception when others then
          v_pick := null;
        end;

        if v_pick is not null and v_pick = any (v_ids) then
          update bb_files
             set reading_id      = v_pick,
                 link_confidence = v_cover,
                 notes           = btrim(coalesce(notes || ' | ', '') ||
                                   'reading_id set from Stack''s Inbox answer (086)')
           where id = f.id;
          v_applied := v_applied + 1;
        else
          -- "none of these", a dismissal, or an answer naming something the question did not
          -- offer. All three mean: leave this file unlinked and do not raise it again.
          v_settled := v_settled + 1;
        end if;
        continue;
      end if;

      -- Never asked, or the candidates have moved since he answered: ask (once - raise_attention
      -- upserts the one open row).
      v_ambiguous := v_ambiguous + 1;
      if raise_attention(p_sync_run_id, 'stack_must_confirm', f.course_id, 'bb_file',
           'reading_link/' || f.id::text, 'reading_id', null, to_jsonb(v_ids),
           format('%s: the file "%s" matches %s readings equally well (%s). Pick the one it belongs to, or say it is not a reading.',
                  f.course_id, f.file_name, cardinality(v_ids), v_cites),
           jsonb_build_object('source', 'link_reading_files', 'file_id', f.id,
                              'candidates', to_jsonb(v_ids), 'citations', v_cites,
                              'answer_with', '{"reading_id": <one of candidates>} or {"accept": "none"}'))
      then v_raised := v_raised + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('files_examined', v_examined, 'linked', v_linked,
                            'applied', v_applied, 'settled', v_settled,
                            'ambiguous', v_ambiguous, 'attention_raised', v_raised);
end $fn$;

comment on function link_reading_files(bigint) is
  'Bind unlinked `readings`-bucket files to the reading they are a copy of (Phase 12b M-2), and '
  'settle the question when it has to ask one (086, CR-2). A reading is a candidate when at least '
  '2 of its reading_match_tokens appear in the file name and they cover at least half of the '
  'reading''s tokens, within the same scheme course. Exactly one candidate links. Several: if '
  'Stack has already closed a stack_must_confirm row for that file AND the candidate set is '
  'unchanged, his answer is applied (resolution {"reading_id": n} sets bb_files.reading_id) or '
  'silently respected ("none of these", a dismissal, or a reading the question did not offer) - '
  'the question is never re-asked, which is what stops the two-minute transform tick raising it '
  'for ever. A changed candidate set is a new question and is asked once. None: nothing happens. '
  'Never overwrites an existing reading_id and never touches a superseded row, so a replay writes '
  'no links and raises no new questions.';

revoke all on function public.link_reading_files(bigint) from public, anon, authenticated;
grant execute on function public.link_reading_files(bigint) to service_role;
