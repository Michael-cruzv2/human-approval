# UI_SPEC.md

Plain, fast, keyboard-friendly, desktop-first (usable on a phone). No design system required; keep it clean and consistent. Light and dark mode via system preference.

## Navigation
Top bar: **Dashboard · Leads · Drafts · Import · History** and (admin only) **Users · Audit**. User menu: name, role, log out, log out everywhere.

## `/login` and `/login/verify`
- Email field, "Send code". Generic confirmation message (R18). Then a 6-digit code field with a resend button (disabled during the 60 s cooldown). Clear, non-technical errors: "Code incorrect or expired."

## Dashboard
Counts only, each linking to the relevant list: pending leads, pending drafts, approved leads without a draft, approved drafts waiting to send, sent, needs-human (from `email_sends.status = 'NEEDS_HUMAN'`, read only). Show read-only system flags: sending enabled, dry run.

## Leads tab
- **List** (default filter: pending): domain, company, country, `agent_approval` badge, `antispam_tag` badge, contact email (or "No email address"), added date. Filters: status, `agent_approval`, `antispam_tag`, country, search by domain/company. Sort by oldest.
- **Detail panel** (side drawer or page): all facts, with email as the only displayed contact value; evidence snippets (shopify / no_app), links to site and contact page (open in new tab with `rel="noopener noreferrer"`), `agent_reason`, notes.
- **Edit** the allowed fact fields (see `docs/DATA_CONTRACT.md`). Show a warning if the lead is approved: "Changing the email resets approval."
- **Actions**: Approve, Reject (note required), Revoke (if approved), Reopen (if rejected), Archive. Each opens a confirm dialog summarising domain, company, email, country, `antispam_tag`.
- `NEEDS_REVIEW` leads show a banner explaining what is missing (from `agent_reason`) and a notice "Not sendable until the agent verdict is VERIFIED" (see DECISIONS O1).
- **Bulk**: select multiple pending leads and bulk **reject** (with one note). No bulk approve (R6).
- Keyboard: `j/k` next/previous, `a` opens approve confirm, `r` opens reject confirm. Never approve on keypress alone; the confirm dialog needs a second explicit action.

## Drafts tab
- **List**: lead company/domain, recipient email, version, created date, who last edited. Default filter pending.
- **Review view**: left side lead facts (company, country, `antispam_tag`, evidence); right side the draft: recipient email (read only), subject (editable), body (editable plain-text, monospace-friendly), `ai_opener` shown read-only above for reference, `template_version`, `ai_model`. Under the body: "Footer is added automatically when sent."
- **Dirty state**: unsaved edits show "Unsaved changes". **Save** writes `subject`/`body_text` and `last_edited_by`. If the draft was approved, saving resets it to `PENDING` and the UI says so.
- **Approve** is disabled while there are unsaved edits. The confirm dialog shows the final subject, full body, recipient, `antispam_tag`, and a character count. It submits the `content_hash` that was displayed (R4). On conflict show "This draft changed while you were reviewing. Review the new text."
- **Reject** needs a note. **Revoke** available when approved and allowed by R8; if blocked, show why.
- Plain text only. Show line breaks as they will be sent. No rich text editor.

## Import tab
Upload area (`.xlsx` only), "Download template" link, and the preview/commit flow in `docs/IMPORT.md`. Show the result: inserted, skipped (duplicate), invalid (with row numbers and reason, no contact data echoed beyond the domain).

## History
Table of approvals/rejections/revokes/edits: time, user, entity, action, domain/company. Filters: user, action, date range. Export is not required.

## Users (admin)
List with role and active state; add user (email, name, role); deactivate/reactivate; change role. Show "3 of 3 active users" and disable adding when full. Last-admin protections (see AUTH.md).

## Audit (admin)
Read-only table of `audit_log` with filters. No edit or delete controls.

## States and errors
Every list has loading, empty ("Nothing to review") and error states. Conflicts, rate limits and permission errors get a clear one-line message and no raw error text.

## Accessibility
Labels on all inputs, visible focus, sufficient contrast, confirm dialogs trap focus and close with Escape (Escape never confirms).
