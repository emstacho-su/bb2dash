-- bb2dash :: 023_part_range_repair.sql
-- Repairs bb_text_embeddings.part_range where it runs past the end of the unit's text.
--
-- ROOT CAUSE. embed-corpus chunks in JavaScript, where `raw.length` and `raw.slice(a, b)` count
-- UTF-16 code UNITS. part_range is read back in Postgres, where char_length() and substring()
-- count CODE POINTS. The two agree for every character in the Basic Multilingual Plane and
-- disagree by one per astral-plane character, which JS stores as a surrogate PAIR. bb_file_text
-- 276 (GEO 103 syllabus, the "Final Exam ... 😞" page) is the corpus's only astral character
-- today: char_length 111, JS length 112, part_range [0,112).
--
--   select octet_length(text), char_length(text) from bb_file_text where id = 276;
--   -->  114 bytes, 111 chars   (110 one-byte chars + one four-byte U+1F61E)
--
-- The embedding itself is fine: JS slice(0,112) clamps, so the model saw the whole page, and
-- Postgres substring() clamps too, so 021's snippet was never wrong here. What breaks is the
-- audit invariant "the last part ends at char_length(text)" — and, on a MULTI-part unit with an
-- astral character, every part after it would be shifted by one character and the snippet WOULD
-- be off. No such unit exists yet; embed-corpus is fixed in the same PR so none is created.
--
-- REPAIR. Only single-part units can be repaired in SQL: their one range is by definition the
-- whole unit, so clamping the upper bound to char_length(text) is exact, not a guess. A
-- multi-part unit would need re-chunking, which means re-embedding — the migration refuses
-- rather than half-fixing, and the runbook is in docs/planning/51_W10_VERIFICATION.md.
--
-- Idempotent: the update's own predicate (upper > char_length) is false once it has run.

-- Refuse if any MULTI-part unit is affected: those need a re-embed, not a clamp.
do $$
declare
  n_multi int;
begin
  select count(*) into n_multi
    from (
      select distinct e.text_id, e.model
        from bb_text_embeddings e
        join bb_file_text t on t.id = e.text_id
       where upper(e.part_range) > char_length(t.text)
    ) affected
   where (select count(*) from bb_text_embeddings e2
           where e2.text_id = affected.text_id and e2.model = affected.model) > 1;
  if n_multi > 0 then
    raise exception
      'part_range overruns on % multi-part unit(s); a SQL clamp cannot re-chunk them - re-embed those units instead (see docs/planning/51_W10_VERIFICATION.md)', n_multi;
  end if;
end $$;

update bb_text_embeddings e
   set part_range = int4range(lower(e.part_range), char_length(t.text))
  from bb_file_text t
 where t.id = e.text_id
   and upper(e.part_range) > char_length(t.text);

-- Post-condition: no row's range may extend past its unit, and every unit's last part must end
-- exactly at char_length(text).
do $$
declare
  n_over int;
  n_short int;
begin
  select count(*) into n_over
    from bb_text_embeddings e
    join bb_file_text t on t.id = e.text_id
   where upper(e.part_range) > char_length(t.text);

  select count(*) into n_short
    from (
      select e.text_id
        from bb_text_embeddings e
        join bb_file_text t on t.id = e.text_id
       group by e.text_id
      having max(upper(e.part_range)) <> max(char_length(t.text))
    ) x;

  if n_over > 0 then
    raise exception 'part_range still overruns bb_file_text.text on % row(s)', n_over;
  end if;
  if n_short > 0 then
    raise exception 'the last part does not reach the end of the unit on % unit(s)', n_short;
  end if;
end $$;
