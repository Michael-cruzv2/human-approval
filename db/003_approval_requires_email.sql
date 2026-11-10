-- Additive guard for the Review App's lead-approval requirement.
-- Owner applies manually after db/schema.sql and db/002_review_app.sql.
-- This does not update existing rows; application fails if existing approved
-- leads do not satisfy the constraint, so reconcile those rows before applying.

BEGIN;

ALTER TABLE leads
  ADD CONSTRAINT chk_approved_lead_has_valid_email
  CHECK (
    human_approval <> 'APPROVED'
    OR (
      email IS NOT NULL
      AND email = lower(email)
      AND email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
    )
  );

COMMIT;
