-- bb2dash :: 029_stage_content_grants.sql
-- Phase 8 (W-12). Follow-up to 026, applied after reading the security advisors.
--
-- 026 granted EXECUTE on stage_content to `authenticated`, which raised a NEW advisor finding:
--   authenticated_security_definer_function_executable (WARN) -
--   "public.stage_content(p_run_id uuid) can be executed by the authenticated role as a
--    SECURITY DEFINER function via /rest/v1/rpc/stage_content".
-- The in-function owner guard already refuses a non-owner JWT, so the finding was not a hole;
-- but the grant is not needed either, and an unnecessary SECURITY DEFINER writer on the public
-- REST surface is worth removing rather than explaining.
--
-- Nothing loses a capability. Phase 9's driver (`run_transform`, migration 035) reaches
-- stage_content from inside its own SECURITY DEFINER body and from pg_cron, both of which
-- execute as the function owner, not as the caller; the app enqueues an `agent_requests` row
-- rather than calling this RPC itself (62_PHASE9_sync_loop.md §Migration 035). If W-15 does
-- end up needing a caller-executed path under the owner's JWT, the fix is one GRANT in a
-- Phase 9 migration - and the owner guard inside stage_content still applies either way.
--
-- bb_content_detail_merge is an internal helper of stage_content, pure and data-free, but there
-- is no reason for it to appear on the REST surface either.

revoke execute on function public.stage_content(uuid) from authenticated;
revoke execute on function public.bb_content_detail_merge(jsonb, jsonb, text, text)
  from authenticated;

-- service_role (and the postgres owner) keep EXECUTE, which is what the driver and pg_cron use.
grant execute on function public.stage_content(uuid) to service_role;
grant execute on function public.bb_content_detail_merge(jsonb, jsonb, text, text) to service_role;
