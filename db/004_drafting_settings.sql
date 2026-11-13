-- 004_drafting_settings.sql
-- Owner-applied only. Never run this against production from the app.
-- Adds the drafting switch; it defaults to false, so no draft is generated
-- until the owner sets it to true (DECISIONS D27). Safe to re-run.
BEGIN;

INSERT INTO settings (key, value)
VALUES ('drafting_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- Review App database role grants (owner-run once, outside this file).
-- Replace review_app with the role used by the Review App's DATABASE_URL.
--
-- Existing grants already cover SELECT/UPDATE on drafts and INSERT on
-- audit_log. Drafting inserts drafts rows for the first time, so add:
--
--   GRANT INSERT ON TABLE drafts TO review_app;
--   GRANT SELECT ON TABLE settings TO review_app;
--
-- No sequence grant is needed for drafts.id (uuid default). Drafting never
-- writes email_sends, email_attempts, suppressions or any ls_* table.
-- ---------------------------------------------------------------------------
