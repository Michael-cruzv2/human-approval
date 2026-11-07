# SECURITY.md

## Threat model (short)
- Outsider guessing or brute-forcing login: covered by OTP rules and rate limits in `docs/AUTH.md`.
- Insider mistake (approving the wrong or changed text): covered by R4 to R8 (confirm step, hash compare-and-set, revoke).
- Malicious or messy upload: covered by `docs/IMPORT.md` limits and R21.
- Leaked database URL: separate Postgres role for this app with column-level grants (owner configures); the app never needs superuser.
- Leaked logs: R22 (no contact data, no OTPs, no tokens in logs).

## Database access
- Use one connection string `DATABASE_URL` for a **role dedicated to this app**. Recommended grants (owner applies in Neon, the app does not create roles):
  - `SELECT` on `leads`, `drafts`, `users`, `email_sends`, `suppressions`, `settings`, and `auth_otp_codes`, `auth_sessions`, `auth_verify_attempts`.
  - `UPDATE` only on the columns in `docs/DATA_CONTRACT.md`; `UPDATE` on app-owned `auth_*` rows; `INSERT` on `leads` (import), `audit_log`, and `auth_*`.
  - `DELETE` only for expired OTP, session, and verification-attempt cleanup described in `docs/DATA_CONTRACT.md`.
  - For local testing, `DATABASE_URL` must point to the child/test branch. Use the main branch URL only for production after the test branch passes the schema and app checks. Keep both URLs in environment configuration only.
- Use parameterised queries only. No string-built SQL. Validate every input with Zod, including query params and import cells.
- Use transactions for any multi-statement action (state change + audit row).

## Web hardening
- Security headers: `Content-Security-Policy` (no inline scripts unless nonce-based), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, HSTS (production).
- Render draft text as plain text, never as HTML. Escape everything. No `dangerouslySetInnerHTML`.
- No third-party analytics, fonts or scripts that receive page content.
- Error pages show a short message and a request ID, never stack traces or SQL.

## Secrets (all env vars; see `.env.example`)
`DATABASE_TARGET`, `DATABASE_CHILD_URL`, `DATABASE_URL`, `SESSION_SECRET`, `OTP_PEPPER`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION`, `EMAIL_FROM`, `APP_ORIGIN`. Missing or too-short secrets (under 32 chars for the two secrets) stop startup. Local development defaults to the child URL; production defaults to the main URL.

## Dependency hygiene
- Pin versions, commit the lockfile, run the package manager's audit in CI. Keep dependencies minimal.
- Do not add an auth library without logging a decision; if one is used, it must still satisfy every rule in `docs/AUTH.md`.

## Disclaimer
This pack describes screening aids and engineering safeguards, not legal advice. A lawyer should review outbound-email compliance before live sending (handled by LeadMailer, not this app).
