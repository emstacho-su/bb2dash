-- bb2dash :: 007_text_anon_insert.sql
-- Backfilled 2026-09-09 from live migration 20260903200912.
-- Extraction runs in the cloud workspace with the publishable key: insert-only, no read/update.
create policy bb_file_text_anon_insert on bb_file_text for insert to anon with check (true);
