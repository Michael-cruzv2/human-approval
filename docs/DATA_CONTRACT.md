# DATA_CONTRACT.md: tables, ownership, transitions

Source of truth for structure: `db/schema.sql` (shared) and `db/002_review_app.sql` (this app's additions).
If this file and the SQL disagree, stop and log an Open question.

## Ownership matrix (W = may write, R = read only, - = no access)

| Table | LeadSearch | Review App | Drafter | LeadMailer |
|---|---|---|---|---|
| `users` | - | R, W (admin only: add/deactivate/role) | - | - |
| `ls_*` tables | W | - | - | - |
| `leads` | W (fact columns, insert only) | W (listed below) | R | R, W (`contacted` only) |
| `drafts` | - | W (listed below) | W (insert new versions) | R |
| `email_sends`, `email_attempts` | - | R | - | W |
| `suppressions` | - | R | - | W |
| `audit_log` | W | W (append) | W | W |
| `settings` | - | R (W by admin for limits only if enabled, see DECISIONS O6) | R | R |
| `auth_otp_codes`, `auth_sessions`, `auth_verify_attempts` | - | W | - | - |

## Review App write list

### `leads`
- Review fields: `human_approval`, `human_approved_by`, `human_approved_at`, `human_note`, `archived`.
- Editable facts (operators may correct): `company_name`, `contact_name`, `email`, `email_type`, `phone`, `country`, `language`, `timezone`, `niche`.
- Insert (Excel import only): the columns in `docs/IMPORT.md`; `agent_approval` is the fixed `NEEDS_REVIEW`, `contacted` is fixed `false`, and `source_run_id` is fixed `NULL` per R20.
- Never update: `id`, `domain` (except insert), `agent_approval`, `agent_reason`, `is_shopify`, `has_mobile_app`, `app_signals`, `evidence`, `confidence`, `source_*`, `contacted`, `added_at`. Import does not write `agent_reason` or evidence; see D16.

### `drafts`
- Fields: `subject`, `body_text`, `last_edited_by`, `human_approval`, `human_approved_by`, `human_approved_at`, `human_note`.
- The app never inserts drafts and never touches `content_hash`/`approved_hash` (trigger-managed), `ai_opener`, `template_version`, `ai_model`, `generation_note`.

### `users`
- Admin only: insert, set `is_active`, set `role`, set `name`. Never delete. The last active admin cannot be deactivated or demoted.

## Allowed transitions

### `leads.human_approval`
```
PENDING  -> APPROVED   (confirm step; lead agent_approval must be VERIFIED or NEEDS_REVIEW, never REJECTED)
PENDING  -> REJECTED   (confirm step; note required)
APPROVED -> PENDING    (revoke; allowed unless an email_sends row is SENDING or SENT, see R8)
REJECTED -> PENDING    (reopen)
```
Leads with `agent_approval = 'REJECTED'` are not shown in the review queue. `APPROVED -> REJECTED` directly is not allowed (revoke first).

### `drafts.human_approval`
```
PENDING  -> APPROVED   (confirm step; compare-and-set on content_hash; parent lead must be APPROVED)
PENDING  -> REJECTED   (confirm step; note required)
APPROVED -> PENDING    (revoke; same rule as R8)
APPROVED -> PENDING    (automatic when text is edited: DB trigger)
REJECTED -> (final)    (a redraft is a new `drafts` row by the Drafter, not a state change)
```
A rejected draft frees the lead for a new version (unique index allows one non-rejected draft per lead).

## Compare-and-set pattern (R4)
```sql
UPDATE drafts
SET human_approval = 'APPROVED', human_approved_by = $user, human_approved_at = now()
WHERE id = $draft_id AND content_hash = $seen_hash AND human_approval = 'PENDING'
RETURNING id;
-- 0 rows => stale; return a conflict error, write nothing else.
```
Do the lead-state check and the `audit_log` insert in the same transaction.

## Queues the UI reads
- **Lead queue**: `human_approval = 'PENDING' AND agent_approval <> 'REJECTED' AND archived = false`, oldest first.
- **Draft queue**: drafts with `human_approval = 'PENDING'` whose lead is `APPROVED`, oldest first.
- **History**: approved/rejected rows with who and when, filterable by user.

## Audit log entries (one per action)
`entity` in (`lead`, `draft`, `user`, `import`), `action` in (`APPROVE`, `REJECT`, `REVOKE`, `REOPEN`, `EDIT`, `ARCHIVE`, `IMPORT`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `USER_ADD`, `USER_ACTIVATE`, `USER_DEACTIVATE`, `ROLE_CHANGE`).
`details` holds IDs, the changed field names, and for draft approvals the approved `content_hash`. Never store lead contact data or draft text in `details`.

The Review App may delete `auth_otp_codes` rows older than one hour, expired `auth_sessions` during session cleanup, and `auth_verify_attempts` rows older than 15 minutes during verification cleanup. No other deletes are allowed from those tables.
