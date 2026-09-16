-- bb2dash :: 064_calendar_secrets.sql
-- Phase 11 (docs/planning/69_PHASE11_planner.md, Contract "Migrations", 064). Worker W-21.
--
--   calendar_secret_set(name, value)   write one of the four Google secrets into Supabase Vault
--   calendar_secrets()                 read all four back, for the edge function only
--
-- ---------------------------------------------------------------------------------------------
-- WHY THESE TWO FUNCTIONS EXIST AT ALL
-- ---------------------------------------------------------------------------------------------
-- Four secrets have to get from Stack's machine into the push and never touch anything else:
--   google_client_id        the OAuth desktop client
--   google_client_secret    "
--   google_refresh_token    the long-lived grant the consent script obtains once
--   calendar_push_secret    the shared secret calendar_push_tick puts in x-push-secret, which is
--                           the only thing standing in front of a verify_jwt = false function
-- Vault is where they live: encrypted at rest, invisible to PostgREST, invisible to the browser
-- bundle, invisible to the repo. But the vault schema itself is not exposed over the API, so a
-- Node script cannot write to it and an edge function cannot read from it without a door. These
-- two SECURITY DEFINER functions in public are that door, and it is exactly two clients wide:
--   - scripts/google-consent.mjs calls calendar_secret_set four times with the SERVICE key
--   - supabase/functions/calendar-push calls calendar_secrets() with the SERVICE role
-- EXECUTE is granted to service_role and to nobody else. anon and authenticated are revoked
-- explicitly, so no JWT a browser can hold - not even the owner's - can read or write a secret;
-- 038 already established that rule for the transform functions and it matters far more here.
-- The Supabase MCP session (postgres) can still call them, which is how the PM checks that four
-- rows exist without ever seeing a value.
--
-- NAMES ARE A CLOSED SET. calendar_secret_set refuses anything outside the four above, so a typo
-- in the consent script writes nothing instead of quietly creating google_refresh_tokn and
-- leaving the push to fail at 02:00 with an unhelpful message. An empty value is refused for the
-- same reason. Neither error message ever contains the value.
--
-- create_secret vs update_secret: vault.create_secret raises on a duplicate name, so re-running
-- the consent script (a re-consent after a revoked token, which WILL happen) has to take the
-- update path. Looking the id up by name first is what makes the script idempotent.

-- ---------------------------------------------------------------------------------------------
-- 1. calendar_secret_set - the write door
-- ---------------------------------------------------------------------------------------------
create or replace function calendar_secret_set(p_name text, p_value text) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_names constant text[] := array['google_client_id', 'google_client_secret',
                                   'google_refresh_token', 'calendar_push_secret'];
  c_desc  constant text   := 'bb2dash Google Calendar push (migration 064)';
  v_id    uuid;
begin
  if p_name is null or not (p_name = any (c_names)) then
    raise exception 'calendar_secret_set: % is not one of the four calendar secrets', p_name;
  end if;
  -- The value is never named in an error. A secret in a Postgres log is a secret on disk.
  if coalesce(btrim(p_value), '') = '' then
    raise exception 'calendar_secret_set: % may not be empty', p_name;
  end if;

  select s.id into v_id from vault.secrets s where s.name = p_name;

  if v_id is null then
    perform vault.create_secret(p_value, p_name, c_desc);
  else
    perform vault.update_secret(v_id, p_value, p_name, c_desc);
  end if;
end $$;

comment on function calendar_secret_set(text, text) is
  'Store one of the four Google Calendar secrets (google_client_id, google_client_secret, '
  'google_refresh_token, calendar_push_secret) in Supabase Vault, creating or updating by name '
  'so re-running scripts/google-consent.mjs after a re-consent is safe. Any other name, or an '
  'empty value, is refused. EXECUTE is granted to service_role only: this is the only write path '
  'into the Vault entries the calendar push depends on, and no browser JWT can reach it.';

-- ---------------------------------------------------------------------------------------------
-- 2. calendar_secrets - the read door
-- ---------------------------------------------------------------------------------------------
create or replace function calendar_secrets() returns table(name text, secret text)
  language sql security definer set search_path = public, pg_temp as $$
  select s.name::text, s.decrypted_secret::text
    from vault.decrypted_secrets s
   where s.name in ('google_client_id', 'google_client_secret',
                    'google_refresh_token', 'calendar_push_secret')
$$;

comment on function calendar_secrets() is
  'Return the four Google Calendar secrets as (name, secret) rows. Called once per run by the '
  'calendar-push edge function with the service role and by nothing else; EXECUTE is revoked '
  'from public, anon and authenticated. It deliberately returns only these four names, so it can '
  'never be used as a general reader of the Vault.';

-- ---------------------------------------------------------------------------------------------
-- 3. Privileges. The tightest grants in the project, and the reason the Contract calls this out.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.calendar_secret_set(text, text) from public, anon, authenticated;
grant execute on function public.calendar_secret_set(text, text) to service_role;

revoke all on function public.calendar_secrets() from public, anon, authenticated;
grant execute on function public.calendar_secrets() to service_role;
