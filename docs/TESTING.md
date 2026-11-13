# TESTING.md

Tests run against a **throwaway Postgres** (local container or a disposable Neon branch) created from `db/schema.sql` + `db/002_review_app.sql` + `db/003_approval_requires_email.sql`. Never against production. Use a fake email provider.

Run `npm test` for repository-level route-guard, ownership, audit-transaction, origin-check, escaping, secret-ignore, import parsing, and template checks. These checks supplement the database-backed scenarios below; they do not replace them.

## Must-pass tests

### Auth
- Unknown email and known email get identical response bodies and similar status codes.
- OTP: correct code works once; reuse fails; wrong code increments attempts; 5th wrong code invalidates the OTP; expired code fails; new request invalidates the old code.
- Rate limits: cooldown, per-email and per-IP hourly caps, failed-verification lockout.
- Deactivated user: existing session stops working on the next request; new OTP is not sent.
- Session: idle and absolute timeouts; logout revokes; cookie flags set; token stored only as a hash.
- Every route (including API and import) returns 401/redirect without a session. Maintain a route list test that fails when a new route is not covered.
- Role checks: operator cannot call user-admin or audit endpoints; 4th active user rejected; last admin cannot be deactivated or demoted.
- Origin/CSRF: cross-origin POST rejected.

### Leads
- Approve/reject/revoke/reopen follow the transitions in `docs/DATA_CONTRACT.md`; illegal transitions return 409/422 and write nothing.
- Lead with `agent_approval = 'REJECTED'` cannot be approved and never appears in the queue.
- Approval stores the session user and a timestamp, never a client-supplied user.
- Editing `email` on an approved lead resets it to `PENDING` (trigger) and the response says so.
- Approve is disabled with the stated reason for a missing/invalid email, and the server rejects an approval even when called directly; the database rejects a direct approved update without a valid lowercase email.
- After approval, the lead stays in Leads with an Approved badge, and a pending draft appears in Drafts only if its lead is approved and has a valid email. It leaves Leads when it is sent (`contacted = true` or `email_sends.status = 'SENT'`) and is still listed in All.
- An approved lead in Leads is read-only apart from revoke, archive and fact edits; Approve and Reject are only offered while it is Pending.
- All lists every lead ever recorded, including sent and archived leads, with no send or archive exclusion.
- Returning a draft to Leads changes the draft and lead in one transaction or changes neither; both notes and both audit entries are written. A return is blocked if sending has started.
- Lead, Drafts and All Load more cursors neither repeat nor skip rows across pages and preserve active filters.
- Bulk reject works; there is no bulk approve endpoint.

### Drafts
- Approve with the correct `content_hash` succeeds; with a stale hash returns conflict and changes nothing.
- Editing text of an approved draft resets approval and clears `approved_hash` (trigger).
- Draft cannot be approved when its lead is not `APPROVED`.
- Revoke is blocked when an `email_sends` row for the lead is `SENDING` or `SENT`; allowed when `QUEUED`/`RETRY_WAIT`/none.
- Draft rejection has separate reject-only and reject-and-return actions; both require a note.
- Rejected draft cannot be re-approved (final); Regenerate creates version + 1 and passes the trimmed rejection note to the fake model.
- Drafting is skipped when `settings.drafting_enabled` is false or the lead has no valid email; the approval succeeds even when the model fails.
- The model payload contains no email address or phone number; the one-live-draft index holds across concurrent generations; an invalid template writes nothing.
- Draft text containing HTML or `<script>` is displayed as text.

### Import
- Valid file inserts rows with `NEEDS_REVIEW` / `PENDING`, ignoring any `human_check` or `status` column.
- Duplicate domain is skipped, existing row untouched.
- Formula cells are treated as formula text, not cached results; values starting with `=`, `+`, `-`, `@`, tab, or CR are neutralised.
- Preview then commit accepts only the same file hash; a changed file conflicts with no inserts. The file is not stored.
- `phones_json` is an array of phone strings, and the lead's primary `email` is the first valid email.
- `shopify_evidence`, `no_app_evidence`, and `review_reasons` are ignored, as required by R10.
- Oversized file, too many rows, wrong type, missing required column, >50% invalid rows are all rejected with no inserts.
- Unauthenticated upload is rejected.

### Ownership and audit
- A test scans the codebase for SQL touching forbidden tables/columns (`ls_*`, `email_sends` writes, and `agent_approval` updates; only the fixed R20 import insert is allowed).
- Every state transition has its corresponding `audit_log` row in the same transaction; send-back writes `DRAFT_REJECT` and `LEAD_RETURNED` for the two changed entities. `details` contains no emails, phones or draft text.
- No log line contains an OTP, token or email address (test with a log capture).

### Startup
- Missing or short secrets stop startup. Missing required tables/columns stop startup with a clear message.

## Manual checks before release
- Walk the confirm dialogs on a phone-width screen.
- Try to approve a draft in two browser tabs at once; the second must conflict.
- Try logging in with an unlisted email and confirm no email is sent.
