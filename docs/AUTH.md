# AUTH.md: email OTP login

Goal: only people listed in `users` (active) can get in. Login = email + one-time code. No passwords.

## Flow
1. `/login`: user enters email. `POST /api/auth/request-otp`.
2. Server normalises the email (trim, lowercase). If an active user exists, create an OTP and email it. **Either way** respond with the same generic message ("If this email is authorised, a code has been sent") and add a small random delay (100 to 300 ms) so timing does not leak.
3. `/login/verify`: user enters the 6-digit code. `POST /api/auth/verify-otp`.
4. On success: mark the OTP consumed, create a session, set the cookie, redirect to `/`.
5. `POST /api/auth/logout` revokes the session.

## OTP rules
- 6 digits from a cryptographically secure RNG (not `Math.random`). Leading zeros kept.
- Store only `HMAC-SHA256(code, OTP_PEPPER)` in `auth_otp_codes.code_hash`. Compare in constant time.
- Expires after 10 minutes. Single use. Max 5 wrong attempts per OTP, then it is invalidated.
- A new request invalidates earlier unused OTPs for that email.
- Resend cooldown: 60 seconds per email. Max 5 OTP requests per email per hour and 20 per IP per hour (count from `auth_otp_codes`; return the generic message even when throttled, but do not send).
- Failed verifications are counted per email and per IP in `auth_verify_attempts`; email identifiers are stored as HMACs. After 10 failures in 15 minutes, return HTTP 429 for 15 minutes. Expired attempt rows may be cleaned up after the 15-minute window.
- Never log the code. In development use a local mail catcher or the provider's test mode; there is no "print OTP to console" option.

## Sessions
- Opaque random token (32 bytes, base64url). Store only its SHA-256 in `auth_sessions.token_hash`.
- Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, name `__Host-session`. No token in URLs or local storage.
- Idle timeout 8 hours (`last_seen_at`), absolute lifetime 7 days. Rotate the token at login.
- Every request: look up the session, check not expired/revoked, join `users`, require `is_active = true`. Deactivating a user must end access immediately (their sessions fail the active check).
- "Log out everywhere" revokes all sessions for the user (offer it in the user menu; admin can do it for others).

## CSRF and abuse
- All state-changing requests are POST/PATCH/DELETE with a CSRF defence: SameSite cookies **plus** an Origin/Host check on the server (reject mismatches). If using server actions, rely on the framework's built-in protection after reading its current docs.
- Add `Cache-Control: no-store` to authenticated responses.

## Roles
- `admin`: everything an operator can do, plus manage users (add, deactivate, change role) and view the audit log for all users.
- `operator`: review leads and drafts, import Excel, edit allowed fields, view history.
- Max 3 active users (DB trigger and app check). Adding a fourth shows a clear error. The last active admin cannot be deactivated or demoted.

## First admin
No self-registration. The owner inserts the first admin with `db/seed.example.sql` (copy, edit the email, run manually). The app never creates users except through the admin screen.

## Email provider
Mailgun sends OTP messages through its domain messages API. Configure a domain-specific Mailgun sending key, the exact Mailgun sending domain, its region (`US` or `EU`), and a sender address authorised for that domain. The OTP email contains only the code, validity time, and a "ignore if you did not request this" line. No links with tokens.
