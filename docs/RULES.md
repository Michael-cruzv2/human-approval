# RULES.md: hard restrictions

Numbered so they can be cited in reviews and tests. "MUST" and "MUST NOT" are absolute.

## Approval and sending safety
- **R1** The app MUST NOT send, queue, schedule or trigger any outreach email. It does not write `email_sends`, `email_attempts` or `suppressions` (except R20 reading). Its only outbound email is the login OTP.
- **R2** Only the exact string `APPROVED` counts as approval. Never treat truthy values, case variants or missing values as approval.
- **R3** A lead approval and a draft approval are separate decisions. Approving a lead never approves its draft.
- **R4** A draft approval covers the exact text shown. The approve action MUST include the `content_hash` the user saw; the server MUST apply the approval only if the current `content_hash` still matches (compare-and-set in one SQL statement). On mismatch, reject with "draft changed, please review again".
- **R5** Any edit to a draft's `subject` or `body_text` resets it to `PENDING` (the DB trigger does this; the app MUST NOT work around it and MUST show the reset to the user).
- **R6** Approve and Reject MUST require an explicit confirmation step showing the final subject and body (drafts) or the key lead facts (leads). No single-click approvals, no bulk approve for drafts. Bulk actions on leads are allowed for **reject** only.
- **R7** Every approval, rejection, revoke and edit records the acting user and time (`human_approved_by`, `human_approved_at`, `audit_log`). The acting user comes from the server-side session, never from request input.
- **R8** Revoking an approval (back to `PENDING`) MUST be possible until sending starts. It MUST be blocked, with a clear message, when an `email_sends` row for the lead exists with status `SENDING` or `SENT`. The app never modifies `email_sends`; LeadMailer re-checks approval before each send.
- **R9** Editing `leads.email` or `leads.domain` of an approved lead resets the lead to `PENDING` (DB trigger). Show this in the UI.
- **R10** The app MUST NOT update `agent_approval`, `agent_reason`, evidence columns, or `contacted`, or access any `ls_*` table. The only insert exception is R20: a new imported lead gets the fixed `agent_approval = 'NEEDS_REVIEW'` and `contacted = false`; uploaded verdicts are ignored. The app never writes `agent_reason` or evidence.

## Data ownership
- **R11** The app writes only the columns listed for it in `docs/DATA_CONTRACT.md`. No `SELECT *`-then-`UPDATE` of whole rows; use explicit column lists.
- **R12** No deletes of leads, drafts, users, audit rows or sessions-in-use except where `docs/DATA_CONTRACT.md` allows (expired OTPs/sessions cleanup). "Remove" in the UI means `archived = true`.
- **R13** `audit_log` is append-only. The app never updates or deletes its rows.
- **R14** All status values and transitions MUST follow `docs/DATA_CONTRACT.md`. Reject anything else server-side, even if the UI would not offer it.

## Access control
- **R15** Every page and every API route requires a valid session except `/login` and the OTP endpoints. No exceptions, no debug backdoors.
- **R16** Only active users in the `users` table can log in. The app never self-registers users. Only an `admin` can add, deactivate or change the role of users, and at most 3 active users exist.
- **R17** Authorisation is checked on the server for every action (role and active flag re-read from the DB per request or per short-lived cache of at most 60 s). Hiding a button is not security.
- **R18** Login responses MUST NOT reveal whether an email is registered (same message, similar timing).
- **R19** OTP codes are stored hashed, single-use, expire in 10 minutes, and are rate-limited (see `docs/AUTH.md`). OTPs are never logged, even in development.

## Import
- **R20** Excel import is allowed for any authenticated active user, subject to `docs/IMPORT.md`. Imported rows are inserted with `INSERT ... ON CONFLICT (domain) DO NOTHING`, always as `human_approval = 'PENDING'` and `agent_approval = 'NEEDS_REVIEW'`. A `human_check`/approval column in a file is ignored.
- **R21** Every cell is sanitised against formula injection on import and on any export (prefix `'` to values starting with `=`, `+`, `-`, `@`, tab or CR).

## Privacy and logging
- **R22** Do not log lead emails, phone numbers, draft bodies, OTPs or tokens. Log IDs and action names only.
- **R23** Do not send lead data to any third-party service. The only external calls are: the database, the OTP email provider.
- **R24** Secrets come from environment variables only. `.env` is git-ignored. The app fails closed at startup if a required variable is missing.

## Process
- **R25** Never guess. Unclear contract means an Open question in `docs/DECISIONS.md`, not an assumption.
- **R26** Do not add features, tables or columns not in this pack. Propose them in `docs/DECISIONS.md` first.
- **R27** Compliance screening (`antispam_tag`) is a screening aid, not legal advice. The UI shows it but MUST NOT present it as a legal clearance.
