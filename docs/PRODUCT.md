# PRODUCT.md

## Purpose
One place where a human does the two approvals that gate all outreach:
1. **Lead review (step 2):** is this store worth contacting? Approve or reject.
2. **Draft review (step 3):** is this exact email text good to send? Edit, approve or reject.

## Users
Up to 3 people: 1 admin (the owner) and operators. Login by emailed code. See `docs/AUTH.md`.

## In scope
- Email-OTP login, sessions, logout.
- **Leads tab**: queue, detail view, edit allowed facts, approve / reject / revoke / reopen, add a note, bulk reject.
- **Drafts tab**: queue of pending drafts for approved leads, side-by-side lead facts and draft, edit subject/body, approve / reject / revoke, add a note.
- **Import**: optional Excel upload (any authenticated user) to add leads from outside LeadSearch.
- **History**: who approved or rejected what and when; filter by user and date.
- **Admin**: manage users (max 3 active), view audit log, see system switches read-only (sending enabled, dry run, daily ceiling).
- Dashboard counts: pending leads, pending drafts, approved and waiting for send, sent, needs-human (from `email_sends`, read only).

## Out of scope (do not build)
- Sending email, scheduling, retries, bounce handling (LeadMailer).
- Finding or verifying leads (LeadSearch). Writing drafts with AI (Drafter).
- Templates editor, CRM features, reporting beyond the counts above.
- Public pages, sign-up, passwords, social login.
- Notifications other than the login OTP email.

## Key behaviours
- A lead must be `APPROVED` before its drafts appear in the Drafts tab.
- Rejecting a lead hides its drafts. Revoking a lead approval also marks its pending drafts as hidden from the queue (the queue query already requires the lead to be approved; do not modify drafts).
- Approving a draft requires the confirm dialog showing the final subject and body, the recipient email, and the lead's `antispam_tag`.
- The recipient email and the footer: the footer is added by LeadMailer at send time. Show a read-only note "Footer is added automatically when sent" under the body.
- Everything is visible to all active users (small trusted team), but every action is attributed.

## Success criteria
- An operator can clear a queue of 25 leads and 25 drafts quickly, without ever approving text that changed under them.
- The owner can see who approved every sent email.
- A person not in `users` cannot get past the login page.
