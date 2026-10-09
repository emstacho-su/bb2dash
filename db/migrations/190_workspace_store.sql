-- bb2dash :: db/migrations/190_workspace_store.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 13, and the
-- pgvector store scoped to bb2dash (Stack's answer 17). Worker W-76.
--
-- WHY. The Workspace assistant searches three kinds of content with one search: his course files
-- (`bb_file_text`, `bb_text_embeddings`, which exist), his uploads and what the assistant remembers
-- of a conversation. The last two had no home. This file is their home inside the bb2dash project:
-- the catalog and queue row (`workspace_documents`), the text units (`workspace_document_text`) and
-- the vectors (`workspace_text_embeddings`, a pgvector column with its HNSW cosine index and a model
-- name on every row), the page's read of remembered summaries (`v_workspace_memory`) and the
-- owner's three writes (`workspace_upload_register`, `workspace_upload_retry`,
-- `workspace_document_delete`). Migration 192 adds the search over all three, 193 the ingest worker's
-- login, 196 the memory write.
--
-- WHAT
--   1. workspace_documents, workspace_document_text, workspace_text_embeddings, their keys and
--      indexes, the three CHECKs of the document row
--   2. row security: the owner reads the first two and updates two columns of the first; nobody but
--      a service reads or writes a vector
--   3. v_workspace_memory                (security invoker)
--   4. the owner's three SECURITY DEFINER functions, each refusing anyone else first (42501)
--   5. privileges, then a guard block
--
-- NO FOREIGN KEY POINTS AT `bb_files` OR `bb_file_text`: later strip migrations delete those rows
-- (119, 150), and this store must outlive them. `course_id` and `conversation_id` are keys to app
-- rows, plain ids in a lift-out (the brief's "what would have to change" table).
--
-- A NEW TABLE IN `public` STARTS WITH EVERY COMMAND OPEN TO anon AND authenticated (the project's
-- default ACL), so every table below is revoked first, as 140:331-355 does, and then granted what
-- the browser needs and nothing more:
--   * workspace_documents      select; update (title, course_id), under the owner's policy
--   * workspace_document_text  select, under the owner's policy
--   * workspace_text_embeddings  nothing at all (row security on, no policy)
-- anon holds nothing anywhere. The tables the three functions write give `authenticated` select
-- only, so a signed-in session cannot skip a function's checks by writing a row itself: a direct
-- insert, update or delete raises 42501.
--
-- WHY SECURITY DEFINER. Inside a definer function row security does not apply, which is why each
-- function's FIRST statement refuses (42501) unless auth.uid() is the owner; a null uid is refused
-- too, unlike 170's form, which lets the service role through. `workspace_ask(uuid, text)` stays
-- invoker and frozen (140).
--
-- THE SIGNED LINK. A signed URL at rest is held by a CHECK to this project's host, this bucket's
-- signed path and this row's own storage key (`u/` + the content's SHA-256), then a query string.
-- 191 makes the bucket; the worker checks the link again before it downloads.
--
-- ONE UPLOAD ROW PER CONTENT. A unique index on `sha256` where kind = 'upload', and an upsert in
-- `workspace_upload_register`: the same file sent twice (or from two tabs) is one row. One memory
-- row per conversation, likewise.
--
-- The memory branch of `workspace_document_delete` also sets `memory_opt_out` in
-- `workspace_conversation_state`, a table 195 creates. A plpgsql body is not checked against the
-- catalog when it is created, so this file applies first; that one branch needs 195 before it runs.
--
-- Additive only: no drop, no rename, no existing object changed. No password, key or DSN is in
-- this file.

do $$
begin
  if to_regclass('public.workspace_conversations') is null then
    raise exception '190: table workspace_conversations does not exist; apply 140_workspace_tables first';
  end if;
  if to_regclass('public.courses') is null then
    raise exception '190: table courses does not exist';
  end if;
  if to_regprocedure('public.app_owner()') is null or to_regprocedure('public.set_updated_at()') is null then
    raise exception '190: app_owner() or set_updated_at() does not exist';
  end if;
  if to_regtype('extensions.vector') is null then
    raise exception '190: the vector type is not installed in schema extensions (010_search_layer)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '190: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. The tables
-- =============================================================================================
create table public.workspace_documents (
  id                    bigint generated always as identity primary key,
  kind                  text not null
                        constraint workspace_documents_kind_known
                        check (kind in ('upload', 'memory')),
  title                 text not null
                        constraint workspace_documents_title_length
                        check (char_length(title) between 1 and 200),
  course_id             text references public.courses (id) on delete set null,
  conversation_id       uuid references public.workspace_conversations (id) on delete cascade,
  storage_key           text
                        constraint workspace_documents_storage_key_charset
                        check (storage_key ~ '^[a-z0-9/._-]+$'),
  mime                  text
                        constraint workspace_documents_mime_known
                        check (mime in ('application/pdf',
                                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        'text/plain', 'text/markdown')),
  byte_size             bigint
                        constraint workspace_documents_byte_size_range
                        check (byte_size between 1 and 20971520),
  sha256                text,
  state                 text not null default 'stored'
                        constraint workspace_documents_state_known
                        check (state in ('stored', 'reading', 'text_ready', 'indexed', 'failed', 'deleting')),
  error_code            text
                        constraint workspace_documents_error_code_known
                        check (error_code in ('too_large', 'bad_type', 'bad_bytes', 'no_text', 'extract_timeout',
                                              'extract_failed', 'too_many_units', 'link_expired',
                                              'download_failed', 'embed_failed')),
  attempts              integer not null default 0
                        constraint workspace_documents_attempts_range
                        check (attempts between 0 and 3),
  signed_url            text,
  signed_url_expires_at timestamptz,
  claimed_at            timestamptz,
  claimed_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- CHECK 1 of 3: a storage key needs no encoding, ever (see storage_key_charset above), and an
  -- upload's key is made from its content, never from the file's own name.
  -- CHECK 2 of 3: the signed link, when there is one, is this project's host, this bucket's signed
  -- path, then THIS ROW'S storage key, then a query string with no white space in the link.
  constraint workspace_documents_signed_url_shape
    check (signed_url is null
           or (storage_key is not null
               and signed_url !~ '[[:space:]]'
               and char_length(signed_url)
                   > char_length('https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/'
                                 || storage_key) + 1
               and left(signed_url,
                        char_length('https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/'
                                    || storage_key) + 1)
                   = 'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/'
                     || storage_key || '?')),
  -- CHECK 3 of 3: an upload's hash is 64 lower-case hex characters and its key is `u/` + the hash;
  -- a memory row has neither. `coalesce` because a CHECK that evaluates to null passes.
  constraint workspace_documents_upload_hash_key
    check ((kind = 'upload'
            and coalesce(sha256 ~ '^[0-9a-f]{64}$', false)
            and coalesce(storage_key = 'u/' || sha256, false))
           or (kind = 'memory' and sha256 is null and storage_key is null)),
  -- The rest of the row's shape: an upload has its bytes' facts and no conversation, a memory row
  -- has its conversation and no bytes, no type and no link.
  constraint workspace_documents_kind_shape
    check ((kind = 'upload' and mime is not null and byte_size is not null and conversation_id is null)
           or (kind = 'memory' and conversation_id is not null and mime is null and byte_size is null
               and signed_url is null)),
  -- The link and its expiry are written and cleared together.
  constraint workspace_documents_url_expiry_pair
    check ((signed_url is null) = (signed_url_expires_at is null))
);

comment on table public.workspace_documents is
  'One row for each upload and each remembered item: the catalog row and the ingest queue row '
  '(migration 190). kind upload: a file from his device, identified by the SHA-256 of its bytes '
  '(unique among uploads), stored in the bucket workspace-uploads under u/<hash>. kind memory: the '
  'assistant''s summary of one conversation (one row for each conversation), with no bytes. state: '
  'stored, reading, text_ready, indexed, failed, deleting. Owner-only through RLS; the browser may '
  'update title and course_id and nothing else; every other write goes through a function.';
comment on column public.workspace_documents.sha256 is
  'An upload''s content hash: 64 lower-case hex characters. The browser takes it first; the ingest '
  'worker hashes the bytes it downloaded and fails the row (bad_bytes) on a difference. Null on a '
  'memory row.';
comment on column public.workspace_documents.storage_key is
  'u/<sha256> for an upload (lower-case letters, digits, / . _ - only, so it needs no encoding); '
  'null on a memory row. Kept while the row is in state deleting: it is the handle for removing the '
  'object.';
comment on column public.workspace_documents.signed_url is
  'The 7-day signed link the ingest worker downloads from, or null. Held by a CHECK to this '
  'project''s host, this bucket and this row''s storage_key. Cleared when the row is indexed, '
  'failed or deleting.';
comment on column public.workspace_documents.claimed_by is
  'The ingest runner that holds the row, with claimed_at its 10-minute lease (migration 193).';

create trigger workspace_documents_updated_at
  before update on public.workspace_documents
  for each row execute function public.set_updated_at();

-- One upload row for each content, in any state; one memory row for each conversation.
create unique index workspace_documents_upload_sha256_key
  on public.workspace_documents (sha256) where kind = 'upload';
create unique index workspace_documents_memory_conversation_key
  on public.workspace_documents (conversation_id) where kind = 'memory';
-- The ingest claim reads by state, oldest first.
create index workspace_documents_state_idx on public.workspace_documents (state, created_at, id);

create table public.workspace_document_text (
  id          bigint generated always as identity primary key,
  document_id bigint not null references public.workspace_documents (id) on delete cascade,
  unit_kind   text not null
              constraint workspace_document_text_unit_kind_length
              check (char_length(unit_kind) between 1 and 40),
  unit_no     integer not null default 1
              constraint workspace_document_text_unit_no_positive
              check (unit_no >= 1),
  text        text not null,
  fts         tsvector generated always as (to_tsvector('english', text)) stored,
  embedded_at timestamptz,
  -- As bb_file_text is unique on its three (005_file_corpus.sql:40): one set of units for a document.
  constraint workspace_document_text_key unique (document_id, unit_kind, unit_no)
);

comment on table public.workspace_document_text is
  'The text units of an upload (page, slide, sheet or doc) or of a remembered item (one unit, kind '
  'doc, number 1) (migration 190). embedded_at is null until the unit''s vector is stored. The owner '
  'reads it; nothing writes it but the ingest functions (193) and workspace_job_finish (196).';

create index workspace_document_text_fts_idx on public.workspace_document_text using gin (fts);

create table public.workspace_text_embeddings (
  id          bigint generated always as identity primary key,
  text_id     bigint not null references public.workspace_document_text (id) on delete cascade,
  part_no     integer not null default 1,      -- more than 1 when a long unit is split before embedding
  part_range  int4range,                       -- character offsets into the unit's text when split
  model       text not null,                   -- e.g. 'gte-small': a re-embed is rows, not schema
  embedding   extensions.vector(384) not null,
  embedded_at timestamptz not null default now(),
  -- The shape of 010:46-57 after 011: the model is part of the key, so vectors of two models can
  -- stand side by side for one part, and a second insert of the same part is 23505.
  constraint workspace_text_embeddings_key unique (text_id, model, part_no)
);

comment on table public.workspace_text_embeddings is
  'One vector for each part of a workspace_document_text unit, with its model (migration 190). The '
  'twin of bb_text_embeddings; 384 dimensions (gte-small). Written only by the edge function '
  'workspace-embed (service role). No grant and no policy for the browser: it is never read directly.';

-- HNSW on the cosine operator class with pgvector's default build settings, as 011:47-48.
create index workspace_text_embeddings_hnsw
  on public.workspace_text_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- =============================================================================================
-- 2. Row security: the owner, in 076's initplan form
-- =============================================================================================
alter table public.workspace_documents       enable row level security;
alter table public.workspace_document_text   enable row level security;
alter table public.workspace_text_embeddings enable row level security;

create policy workspace_documents_owner_select on public.workspace_documents
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
-- The two columns the owner edits (the column grant below holds the list).
create policy workspace_documents_owner_update on public.workspace_documents
  for update to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));

create policy workspace_document_text_owner_select on public.workspace_document_text
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

-- workspace_text_embeddings: row security on, no policy, no grant.

-- =============================================================================================
-- 3. v_workspace_memory
-- =============================================================================================
-- The page's read of remembered summaries. Security invoker: the owner's select policy on the two
-- tables decides, so anyone else gets no row. One row for each remembered item; the summary is its
-- one unit's text (null for the moments between a delete and a rewrite).
create view public.v_workspace_memory
  with (security_invoker = true) as
select d.id               as document_id,
       d.conversation_id,
       d.state,
       d.created_at,
       d.updated_at,
       t.text             as summary
  from public.workspace_documents d
  left join public.workspace_document_text t
         on t.document_id = d.id and t.unit_kind = 'doc' and t.unit_no = 1
 where d.kind = 'memory';

comment on view public.v_workspace_memory is
  'The remembered items (migration 190): document_id, conversation_id, state, created_at, '
  'updated_at and the summary text. security_invoker with anon revoked, as 036 requires. Written by '
  'workspace_job_finish (196); deleted through workspace_document_delete.';

-- =============================================================================================
-- 4. The owner's three functions. The owner check is each one's first statement.
-- =============================================================================================
create or replace function public.workspace_upload_register(
    p_sha256 text, p_title text, p_mime text, p_byte_size bigint,
    p_signed_url text, p_signed_url_expires_at timestamptz, p_course_id text default null)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_prefix    constant text   := 'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/';
  c_max_bytes constant bigint := 20971520;
  c_mimes     constant text[] := array['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/markdown'];
  v_id    bigint;
  v_state text;
  v_key   text;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if auth.uid() is null or auth.uid() is distinct from public.app_owner() then
    raise exception 'workspace_upload_register: only the owner may register an upload'
      using errcode = '42501';
  end if;

  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'workspace_upload_register: a hash is 64 lower-case hex characters'
      using errcode = '23514';
  end if;

  -- The same bytes again, in any state: nothing is written, the row that holds the hash comes back.
  select d.id, d.state into v_id, v_state
    from workspace_documents d
   where d.kind = 'upload' and d.sha256 = p_sha256;
  if found then
    return jsonb_build_object('id', v_id, 'state', v_state, 'existing', true);
  end if;

  if p_mime is null or not (p_mime = any (c_mimes)) then
    raise exception 'workspace_upload_register: % is not one of the six accepted types', coalesce(p_mime, 'null')
      using errcode = '23514';
  end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > c_max_bytes then
    raise exception 'workspace_upload_register: a file is 1 to % bytes, not %', c_max_bytes,
      coalesce(p_byte_size::text, 'null') using errcode = '23514';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception 'workspace_upload_register: a title is 1 to 200 characters, not %', char_length(v_title)
      using errcode = '23514';
  end if;

  v_key := 'u/' || p_sha256;
  if p_signed_url is null or p_signed_url_expires_at is null
     or p_signed_url ~ '[[:space:]]'
     or char_length(p_signed_url) <= char_length(c_prefix || v_key) + 1
     or left(p_signed_url, char_length(c_prefix || v_key) + 1) <> c_prefix || v_key || '?' then
    raise exception 'workspace_upload_register: the link must be this project''s signed link for this bucket and this file''s own key, with its expiry'
      using errcode = '23514';
  end if;

  if p_course_id is not null and not exists (select 1 from courses c where c.id = p_course_id) then
    raise exception 'workspace_upload_register: % is not a course', p_course_id using errcode = '23503';
  end if;

  insert into workspace_documents as d
         (kind, title, course_id, storage_key, mime, byte_size, sha256, state, signed_url, signed_url_expires_at)
  values ('upload', v_title, p_course_id, v_key, p_mime, p_byte_size, p_sha256, 'stored',
          p_signed_url, p_signed_url_expires_at)
  on conflict (sha256) where kind = 'upload' do nothing
  returning d.id into v_id;

  if v_id is null then
    -- Another tab registered the same bytes between the lookup above and the insert.
    select d.id, d.state into v_id, v_state
      from workspace_documents d
     where d.kind = 'upload' and d.sha256 = p_sha256;
    return jsonb_build_object('id', v_id, 'state', v_state, 'existing', true);
  end if;
  return jsonb_build_object('id', v_id, 'state', 'stored', 'existing', false);
end $$;

comment on function public.workspace_upload_register(text, text, text, bigint, text, timestamptz, text) is
  'The owner''s upload comes in (190). An upsert on the content hash: when an upload row already '
  'holds p_sha256, in any state, nothing is written and that row''s {id, state, existing: true} '
  'comes back; otherwise the upload is recorded in state stored with storage_key u/<hash> and '
  '{id, state: stored, existing: false} comes back. 42501 unless the caller is the owner; 23514 for '
  'a hash that is not 64 lower-case hex characters, a type outside the six, a size outside 1 to '
  '20971520, a title outside 1 to 200 characters, or a link that is not this project''s signed link '
  'for this bucket and this file''s own key; 23503 for an unknown course. SECURITY DEFINER. '
  'authenticated only.';

create or replace function public.workspace_upload_retry(
    p_document_id bigint, p_signed_url text, p_signed_url_expires_at timestamptz)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_prefix constant text := 'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/';
  v_kind  text;
  v_state text;
  v_key   text;
begin
  if auth.uid() is null or auth.uid() is distinct from public.app_owner() then
    raise exception 'workspace_upload_retry: only the owner may retry an upload' using errcode = '42501';
  end if;

  select d.kind, d.state, d.storage_key into v_kind, v_state, v_key
    from workspace_documents d
   where d.id = p_document_id
     for update;
  if not found then
    raise exception 'workspace_upload_retry: document % does not exist', p_document_id using errcode = '22023';
  end if;
  if v_kind <> 'upload' or v_state <> 'failed' then
    raise exception 'workspace_upload_retry: document % is not a failed upload (it is a % in state %)',
      p_document_id, v_kind, v_state using errcode = '22023';
  end if;

  if p_signed_url is null or p_signed_url_expires_at is null
     or p_signed_url ~ '[[:space:]]'
     or char_length(p_signed_url) <= char_length(c_prefix || v_key) + 1
     or left(p_signed_url, char_length(c_prefix || v_key) + 1) <> c_prefix || v_key || '?' then
    raise exception 'workspace_upload_retry: the link must be this project''s signed link for this bucket and this file''s own key, with its expiry'
      using errcode = '23514';
  end if;

  update workspace_documents d
     set state = 'stored', attempts = 0, error_code = null,
         signed_url = p_signed_url, signed_url_expires_at = p_signed_url_expires_at,
         claimed_at = null, claimed_by = null
   where d.id = p_document_id;
  return jsonb_build_object('id', p_document_id, 'state', 'stored');
end $$;

comment on function public.workspace_upload_retry(bigint, text, timestamptz) is
  'Try again (190): a failed upload, and only a failed one, goes back to stored with attempts 0, '
  'error_code null and a fresh signed link under the same rule as the register call. Returns {id, '
  'state}. 42501 unless the caller is the owner; 22023 for any other row; 23514 for a link of the '
  'wrong shape. SECURITY DEFINER. authenticated only.';

create or replace function public.workspace_document_delete(
    p_document_id bigint, p_object_removed boolean)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind  text;
  v_state text;
  v_key   text;
  v_conv  uuid;
begin
  if auth.uid() is null or auth.uid() is distinct from public.app_owner() then
    raise exception 'workspace_document_delete: only the owner may delete a document'
      using errcode = '42501';
  end if;
  if p_object_removed is null then
    raise exception 'workspace_document_delete: p_object_removed is required' using errcode = '22023';
  end if;

  select d.kind, d.state, d.storage_key, d.conversation_id into v_kind, v_state, v_key, v_conv
    from workspace_documents d
   where d.id = p_document_id
     for update;
  if not found then
    raise exception 'workspace_document_delete: document % does not exist', p_document_id
      using errcode = '22023';
  end if;

  if v_kind = 'memory' then
    -- A remembered item goes whole, at once, in this transaction: its vectors, its unit, its row.
    -- The conversation is then never summarised again.
    delete from workspace_text_embeddings e
     using workspace_document_text t
     where t.document_id = p_document_id and e.text_id = t.id;
    delete from workspace_document_text t where t.document_id = p_document_id;
    delete from workspace_documents d where d.id = p_document_id;
    insert into workspace_conversation_state (conversation_id, memory_opt_out)
    values (v_conv, true)
    on conflict (conversation_id) do update set memory_opt_out = true;
    return jsonb_build_object('id', p_document_id, 'kind', 'memory', 'state', 'deleted',
                              'storage_key', null);
  end if;

  if not p_object_removed then
    -- Step one: cut retrieval now. The units and their vectors go in this transaction, the link is
    -- cleared, the lease is freed, and the row stays in `deleting` with its key, which is the handle
    -- for removing the object. Repeatable: a second call returns the same key.
    delete from workspace_text_embeddings e
     using workspace_document_text t
     where t.document_id = p_document_id and e.text_id = t.id;
    delete from workspace_document_text t where t.document_id = p_document_id;
    update workspace_documents d
       set state = 'deleting', signed_url = null, signed_url_expires_at = null,
           claimed_at = null, claimed_by = null
     where d.id = p_document_id;
    return jsonb_build_object('id', p_document_id, 'kind', v_kind, 'state', 'deleting',
                              'storage_key', v_key);
  end if;

  -- Step two, on the browser's word that the object is gone: only a row in `deleting`.
  if v_state <> 'deleting' then
    raise exception 'workspace_document_delete: document % is in state %, not deleting; make the first call first',
      p_document_id, v_state using errcode = '22023';
  end if;
  delete from workspace_documents d where d.id = p_document_id;
  return jsonb_build_object('id', p_document_id, 'kind', v_kind, 'state', 'deleted',
                            'storage_key', v_key);
end $$;

comment on function public.workspace_document_delete(bigint, boolean) is
  'Delete (190). A remembered item: its vectors, unit and row go in this transaction and '
  'memory_opt_out is set for its conversation (needs 195); state deleted, storage_key null. An '
  'upload, p_object_removed false: its units and vectors go, the link is cleared, the row stays in '
  'state deleting and its storage_key comes back (repeatable). An upload, p_object_removed true: '
  'the row is dropped, and only a row in deleting is accepted (22023 otherwise). 42501 unless the '
  'caller is the owner; 22023 for a missing row. SECURITY DEFINER. authenticated only.';

-- =============================================================================================
-- 5. Privileges
-- =============================================================================================
revoke all on
  public.workspace_documents,
  public.workspace_document_text,
  public.workspace_text_embeddings,
  public.v_workspace_memory
from public, anon, authenticated;

revoke all on sequence
  public.workspace_documents_id_seq,
  public.workspace_document_text_id_seq,
  public.workspace_text_embeddings_id_seq
from public, anon, authenticated;

grant select on
  public.workspace_documents,
  public.workspace_document_text,
  public.v_workspace_memory
to authenticated;

-- The owner edits an upload's title and its course, and nothing else, directly.
grant update (title, course_id) on public.workspace_documents to authenticated;

-- The services that read and write these tables as the service role say so outright, so the
-- search (192) and the two embedders do not rest on a default.
grant select on public.workspace_documents to service_role;
grant select, update on public.workspace_document_text to service_role;
grant select, insert, delete on public.workspace_text_embeddings to service_role;

-- Phase 15's runner writes the units' setup rows (brief 95, "The role db_test_runner"). It reads
-- the three through 100's default privilege.
grant insert, update, delete on
  public.workspace_documents,
  public.workspace_document_text,
  public.workspace_text_embeddings
to db_test_runner;

revoke all on function
  public.workspace_upload_register(text, text, text, bigint, text, timestamptz, text),
  public.workspace_upload_retry(bigint, text, timestamptz),
  public.workspace_document_delete(bigint, boolean)
from public, anon, authenticated, service_role;

grant execute on function
  public.workspace_upload_register(text, text, text, bigint, text, timestamptz, text),
  public.workspace_upload_retry(bigint, text, timestamptz),
  public.workspace_document_delete(bigint, boolean)
to authenticated;

-- =============================================================================================
-- 6. Guard
-- =============================================================================================
do $$
declare
  v_bad text;
  v_got text;
  t     text;
begin
  -- (a) Row security is on for all three.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('workspace_documents', 'workspace_document_text', 'workspace_text_embeddings')
     and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'FAIL 190: row security is off on %', v_bad;
  end if;

  -- (b) anon holds nothing, on a table or on a column; authenticated holds no table-level write and
  --     no truncate; and nothing at all on the vector table.
  foreach t in array array['workspace_documents', 'workspace_document_text', 'workspace_text_embeddings',
                           'v_workspace_memory'] loop
    if has_table_privilege('anon', 'public.' || t,
                           'select, insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('anon', 'public.' || t, 'select, insert, update, references') then
      raise exception 'FAIL 190: anon holds a privilege on %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert, update, delete, truncate, references, trigger') then
      raise exception 'FAIL 190: authenticated holds a table-level write on %', t;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.workspace_text_embeddings', 'select')
     or has_any_column_privilege('authenticated', 'public.workspace_text_embeddings',
                                 'select, insert, update, references') then
    raise exception 'FAIL 190: authenticated holds a privilege on workspace_text_embeddings';
  end if;

  -- (c) The vector column is vector(384) and not null; the index is HNSW on the cosine class.
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.workspace_text_embeddings'::regclass
                    and a.attname = 'embedding' and not a.attisdropped
                    and a.atttypid = 'extensions.vector'::regtype
                    and a.atttypmod = 384 and a.attnotnull) then
    raise exception 'FAIL 190: workspace_text_embeddings.embedding is not vector(384) not null';
  end if;
  if not exists (select 1
                   from pg_index i
                   join pg_class ic on ic.oid = i.indexrelid
                   join pg_am am on am.oid = ic.relam
                   join pg_opclass oc on oc.oid = i.indclass[0]
                  where i.indrelid = 'public.workspace_text_embeddings'::regclass
                    and ic.relname = 'workspace_text_embeddings_hnsw'
                    and am.amname = 'hnsw' and oc.opcname = 'vector_cosine_ops' and i.indisvalid) then
    raise exception 'FAIL 190: workspace_text_embeddings_hnsw is not a valid hnsw vector_cosine_ops index';
  end if;

  -- (d) The three keys of the store.
  select string_agg(pg_get_constraintdef(c.oid), '; ' order by c.conname) into v_got
    from pg_constraint c
   where c.conrelid in ('public.workspace_text_embeddings'::regclass,
                        'public.workspace_document_text'::regclass)
     and c.contype = 'u';
  if v_got is distinct from 'UNIQUE (document_id, unit_kind, unit_no); UNIQUE (text_id, model, part_no)' then
    raise exception 'FAIL 190: the unique keys are [%]', v_got;
  end if;

  -- (e) The view runs as its caller.
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_memory'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    raise exception 'FAIL 190: v_workspace_memory is not security_invoker';
  end if;

  -- (f) The three functions are SECURITY DEFINER with a pinned path, executable by authenticated
  --     and by nobody else (anon, PUBLIC and service_role included).
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
   where p.oid in ('public.workspace_upload_register(text, text, text, bigint, text, timestamptz, text)'::regprocedure,
                   'public.workspace_upload_retry(bigint, text, timestamptz)'::regprocedure,
                   'public.workspace_document_delete(bigint, boolean)'::regprocedure)
     and (not p.prosecdef
          or not coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']
          or not has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'FAIL 190: not security definer with a pinned path, or open beyond authenticated: %', v_bad;
  end if;
end $$;
