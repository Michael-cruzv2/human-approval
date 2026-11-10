# UI_SPEC.md

Follow [UI_SKILL.md](./UI_SKILL.md) for all interface structure, behaviour and safety; it supersedes this file where they differ. Clean, calm, fast, keyboard-friendly, desktop-first (usable on a phone), with light and dark mode.

## Navigation
Top bar: **Leads · Drafts · All · Import · History** and (admin only) **Users · Audit**. The app opens on Leads; All is the overview. User menu: name, role, log out, log out everywhere.

## `/login` and `/login/verify`
- Email field, "Send code". Generic confirmation message (R18). Then a 6-digit code field with a resend button (disabled during the 60 s cooldown). Clear, non-technical errors: "Code incorrect or expired."

## Leads tab
- Leads review customer information only. Default queue is pending; a Rejected filter supports reopening. Approved leads leave this tab. The pending queue excludes archived and agent-rejected leads.
- Edit the allowed fact fields in `docs/DATA_CONTRACT.md`, with explicit Save/Cancel and inline validation. A valid lowercase email is required to approve; without one show "Email required", disable Approve with reason "Add an email to approve", and provide a jump to the email field. The server and database enforce the same rule.
- Approval confirmation summarizes the key lead facts. Success says "Approved, moved to Drafts" and offers Undo (revoke) until navigation, subject to R8.
- Do not show draft content or send status anywhere in Leads.
- Use 25-row keyset pagination and explicit Load more.

## Drafts tab
- Only approved, non-archived leads with valid email and pending drafts appear in To review.
- Sub-views: To review, read-only Awaiting draft (approved leads with no live draft), and Approved (approved drafts awaiting send, revoke subject to R8).
- Draft review has recipient email read-only, subject/body plain-text editable, `ai_opener` read-only, footer note and a compact company/domain/country/anti-spam strip with Open lead. Never edit email or customer fields here.
- Approve confirmation displays final subject/body, recipient and anti-spam tag, and submits the displayed `content_hash`. Disable approval when edits are unsaved.
- Both "Reject draft" and "Reject and send lead back to verification" require a note. The latter is atomic, writes the note to both records, and returns the lead to Leads.
- Show "The lead changed. Review again" and disable approval when lead status or email changes while the draft is open.
- Use 25-row keyset pagination and explicit Load more.

## All tab
- Read-only overview of every lead: domain, company, country, agent verdict, lead status, email presence, draft status, send status, last updated.
- Filter by status, country, anti-spam tag, email presence, draft status and text.
- Keyset pagination `(updated_at DESC, id ASC)`, 25 rows, Load more and "Showing n of N". Preserve filters and scroll when opening/backing out of a row.
- Row opens a read-only full-data view and offers Open in Leads or Open in Drafts according to state. No edits or approval actions.

## Import tab
Upload area (`.xlsx` only), "Download template" link, and the preview/commit flow in `docs/IMPORT.md`. Show the result: inserted, skipped (duplicate), invalid (with row numbers and reason, no contact data echoed beyond the domain).

## History
Table of approvals/rejections/returns/revokes/edits: time, user, entity, action, domain/company. Filters: user, action, date range. Export is not required.

## Users (admin)
List with role and active state; add user (email, name, role); deactivate/reactivate; change role. Show "3 of 3 active users" and disable adding when full. Last-admin protections (see AUTH.md).

## Audit (admin)
Read-only table of `audit_log` with filters. No edit or delete controls.

## States and errors
Every list has skeleton loading, empty ("Nothing to review") and error states with retry. Conflicts, rate limits and permission errors get a clear one-line message and no raw error text.

## Accessibility
Labels on all inputs, visible focus, sufficient contrast, confirm dialogs trap focus and close with Escape (Escape never confirms).
