# UI_SKILL.md: Review App interface guide

Use for any UI work on the Review App. Apply a frontend-design skill or guidance for visual quality, and this file for structure, behaviour and safety. If this file conflicts with `docs/RULES.md` or `docs/DATA_CONTRACT.md`, those win. `docs/UI_SPEC.md` is superseded by this file where they differ; update it to match and log the change in `docs/DECISIONS.md`.

## Feel
- Clean, calm, elegant, like a well-made inbox or editorial tool, not an admin template.
- Generous whitespace, one restrained accent colour, a refined type pairing, subtle motion only where it helps.
- Light and dark mode. Desktop-first, fully usable on a phone.
- Speed and clarity beat decoration: a reviewer should clear 25 items in minutes.

## Three tabs, one job each
1. **Leads**: human verification of customer information. A lead leaves this tab once approved.
2. **Drafts**: review of email text only. Shows only leads that were approved in Leads.
3. **All**: read-only overview of every lead in every state.

Never mix the jobs. A lead approval never approves a draft. Leads screens show no draft content or send status. Drafts screens never edit customer fields.

## Leads tab
- Queue: `human_approval = PENDING`, not archived, agent verdict not `REJECTED`. Approved leads do not appear. A Rejected filter allows reopening.
- Queue state chips are single-select: **Pending** (default), **Needs email**, **Returned**, **Rejected**, **All**. All shows pending and rejected leads in one list, still excluding approved and archived leads. The other filters (agent, country, anti-spam tag, search) stay in "More filters" and apply across chips.
- Master-detail layout (list left, detail right; separate screens on mobile).
- Summary view: company, contact, email and type, phone, country, language, timezone, niche, agent reason, Shopify and no-app evidence snippets with source links.
- Checklist "Ready for drafting": email present and valid, country known, timezone valid, anti-spam tag allowed, agent verdict `VERIFIED`. Failed items are clickable and jump to the field.
- Edit in place (key `e`): `company_name`, `contact_name`, `email`, `email_type`, `phone`, `country`, `language`, `timezone`, `niche`. Explicit Save and Cancel, "Unsaved changes" indicator, inline validation, pickers for country, timezone and language.
- Missing values show an "Add email" style prompt, never a blank. If `emails_json` or `phones_json` hold several values, list them with "Use this one" and "Add".
- Warn before saving an email change on an approved lead: it resets approval to Pending.
- **Email is required to approve.** A lead without a valid email stays here with an "Email required" tag, Approve is disabled with the reason, and the server rejects the approval too (plus a database check, see `docs/DECISIONS.md`).
- Approve and Reject open a confirmation dialog (domain, company, email, country, anti-spam tag). Reject needs a note. Escape never confirms. No bulk approve; bulk reject is allowed.
- After approval show "Approved, moved to Drafts" with undo (revoke) until the next navigation, subject to the send-started rule.
- Full data view (read-only toggle or drawer): Identity, Contact, Location, Compliance, Evidence, Review, Lifecycle, plus the lead's audit timeline. JSON rendered as readable key/value lists with a raw JSON disclosure and copy buttons.

## Drafts tab
- Only leads that are `APPROVED`, have a valid email and have a pending draft. Own queue, counts and header treatment so it feels like a different job.
- Sub-views: To review, Awaiting draft (read-only), Approved (revoke while allowed).
- Draft screen: recipient email read-only; subject and body editable as plain text (content only, never the email or customer fields); `ai_opener` read-only; note "Footer is added automatically when sent."; small read-only lead strip with an Open lead link.
- Approve: confirmation with final subject, full body, recipient, anti-spam tag, and submit the displayed `content_hash` (compare-and-set). Disabled while edits are unsaved. No bulk approve.
- Two rejection options, both need a note:
  - **Reject draft**: draft `REJECTED`, lead stays `APPROVED`, the Drafter writes a new version.
  - **Reject and send lead back to verification**: one transaction sets the draft `REJECTED` and the lead back to `PENDING` (approver fields cleared) with the note on both. The lead reappears in Leads with a "Returned from drafts" tag.
- If the lead changes while a draft is open, show "The lead changed. Review again" and disable Approve until refreshed.
- Revoking or returning is blocked, with the reason shown, once an `email_sends` row for the lead is `SENDING` or `SENT`.

## All tab
- Every lead in every state: domain, company, country, agent verdict, lead status, email present, draft status, send status, last updated. Filters and search.
- Lazy loading: keyset pagination by `(updated_at DESC, id)`, page size 25, an explicit "Load more" button, "Showing n of N", no page numbers. Preserve scroll and filters on back navigation. Use the same pattern in the Leads and Drafts queues.
- Read-only. Rows open the full data view with "Open in Leads" or "Open in Drafts".

## Safety rules the UI must not weaken
- Only the exact value `APPROVED` counts as approval. The acting user comes from the server session.
- Every approval, rejection, revoke, return and edit writes an `audit_log` row in the same transaction, with IDs and field names only, never contact data or draft text.
- Confirm steps for all approvals and rejections. No single-click approval, no keyboard-only approval.
- Render all lead and draft text as plain text, never HTML.
- No deletes in the UI; "remove" means archive.
- Screening tags are shown as aids with a tooltip, never as legal clearance.

## States and accessibility

### Loading, slow, error and empty states
- Placeholders mirror the loaded layout: real labels, tabs, search, filters and buttons render immediately; only values are placeholders, sized like the real content so nothing jumps.
- Timing: show placeholders only if loading takes over 200 ms, then ramp them in over 400 ms so a fast response never flashes and a slower one never snaps into place. At 8 s show "Taking longer than usual. Still trying." with Try again; at 20 s show the error state with a request ID.
- Motion: one light sweep, 1.6 s; under `prefers-reduced-motion` no sweep, flat grey. Spinners only inside buttons and small chips, never over a page.
- Colour: placeholders neutral grey in both jobs; only the active tab line, primary button and spinners use teal (Leads) or plum (Drafts).
- Never optimistic for approve, reject, revoke, return or save: dialog stays open, buttons lock, labels read "Approving…" or "Saving…", and the UI changes only after the server confirms.
- "Harmless" optimistic actions: filters, opening a drawer, switching tabs, and nothing that writes data.
- Load more keeps existing rows, adds placeholder rows, button reads "Loading 25 more…". Background refresh keeps rows in place with a 2 px line and an "Updating…" chip.
- Empty state says why and what happens next. Error state says what failed, what is safe, a request ID and one action.
- Accessibility: `aria-busy` on the loading region, polite "Loading leads" announcement, focus never moves on its own, retry button reachable by keyboard.
- Labelled inputs, visible focus, strong contrast, dialogs trap focus. Shortcuts: `j`/`k` move, `a` opens approve, `r` opens reject, `e` edits, `f` toggles full data. Shortcuts only open dialogs.

## Before finishing
- Each tab does exactly one job; no draft content appears in Leads.
- Approve is blocked without an email in both UI and server.
- The send-back transaction changes both rows or neither.
- Screenshots: loading (Leads and Drafts), Approve in progress, Load more in progress, slow, failed, empty, plus Leads queue with an Email required lead, lead editing, full data view, draft review with both reject options, All tab with Load more, mobile layout. `docs/ui-reference/` shows these screens; docs/RULES.md, DATA_CONTRACT.md and this file win if they differ.
- Log anything unclear in `docs/DECISIONS.md` instead of guessing.