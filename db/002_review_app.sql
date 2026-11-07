-- Review App additions. Apply AFTER db/schema.sql. Owner applies manually.
-- Adds: email-OTP auth tables, max-active-users guard, lead approval reset on email/domain change.

BEGIN;

-- ---------------------------------------------------------------
-- OTP codes (owner: Review App)
-- ---------------------------------------------------------------
CREATE TABLE auth_otp_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,                 -- normalised lowercase, even if no such user (for rate limiting)
  user_id       uuid REFERENCES users(id),     -- NULL when the email is not an active user (no email is sent then)
  code_hash     text,                          -- HMAC-SHA256(code, OTP_PEPPER); NULL when no email was sent
  attempts      smallint NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  invalidated_at timestamptz,
  request_ip    inet,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_otp_email_lower CHECK (email = lower(email))
);
CREATE INDEX ix_otp_email_created ON auth_otp_codes (email, created_at DESC);
CREATE INDEX ix_otp_ip_created    ON auth_otp_codes (request_ip, created_at DESC);

-- Failed OTP verification events. Email is stored as an HMAC, not plaintext.
-- Rows are retained for the 15-minute lockout window and cleaned opportunistically.
CREATE TABLE auth_verify_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash          text NOT NULL,
  request_ip          inet,
  attempted_at        timestamptz NOT NULL DEFAULT now(),
  email_locked_until  timestamptz,
  ip_locked_until     timestamptz
);
CREATE INDEX ix_auth_verify_email_time ON auth_verify_attempts (email_hash, attempted_at DESC);
CREATE INDEX ix_auth_verify_ip_time ON auth_verify_attempts (request_ip, attempted_at DESC);

-- ---------------------------------------------------------------
-- Sessions (owner: Review App)
-- ---------------------------------------------------------------
CREATE TABLE auth_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  token_hash    text NOT NULL UNIQUE,          -- SHA-256 of the opaque cookie token
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,          -- absolute lifetime (7 days)
  revoked_at    timestamptz,
  ip            inet,
  user_agent    text
);
CREATE INDEX ix_sessions_user ON auth_sessions (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------
-- Guard: at most 3 active users
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION users_max_active() RETURNS trigger AS $$
BEGIN
  IF NEW.is_active AND (SELECT count(*) FROM users WHERE is_active AND id <> NEW.id) >= 3 THEN
    RAISE EXCEPTION 'At most 3 active users are allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_users_max_active BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_max_active();

-- ---------------------------------------------------------------
-- Guard: changing email or domain of an approved lead resets its approval (R9)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION leads_reset_approval() RETURNS trigger AS $$
BEGIN
  IF OLD.human_approval = 'APPROVED' AND NEW.human_approval = 'APPROVED'
     AND (NEW.email IS DISTINCT FROM OLD.email OR NEW.domain IS DISTINCT FROM OLD.domain) THEN
    NEW.human_approval    := 'PENDING';
    NEW.human_approved_by := NULL;
    NEW.human_approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_leads_reset_approval BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_reset_approval();

COMMIT;
