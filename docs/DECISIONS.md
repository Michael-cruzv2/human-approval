# DECISIONS.md

Agents: add Open questions here, never guess. The owner answers; move answered items to Decided.

## Decided
- D1 The review app has three review tabs with separate jobs: Leads (human verification), Drafts (email text), and All (read-only overview). Excel upload remains an optional utility.
- D2 Several operators: at most 3 active users, owner is `admin`. Actions are attributed to a user from a `users` table.
- D3 Login by email one-time code only. Authorised people only (active rows in `users`).
- D4 State lives in the shared Neon Postgres; this app only writes its own columns (`docs/DATA_CONTRACT.md`). Owner sets per-program roles and row/column permissions in Neon.
- D5 The Review App never sends outreach email. LeadMailer (Trigger.dev, Gmail API) does, later.
- D6 Draft approval covers the exact text via `content_hash`; edits after approval reset it.
- D7 Limits relevant to display only: 5 per batch, 20 per day ceiling, 3 tries (LeadMailer enforces).
- D8 The shared schema is authoritative (`db/schema.sql`): UUID ids, `site_url`, `agent_approval`, `human_approval`, `human_note`, `antispam_tag` (status) and `anti_spam_regime` (law name).
- D9 Default stack: TypeScript, Next.js on Vercel, Neon, Mailgun for OTP, exceljs. Verify current docs before use.
- D10 OTP verification failures use the Review App-owned `auth_verify_attempts` table. The normalized email is stored as an HMAC, and rows are retained for the 15-minute lockout window.
- D11 An OTP is invalidated on the 5th wrong code.
- D12 Use the child Neon branch URL in local `.env` for testing. Keep the main branch URL for production, and switch only after the child branch passes the schema and app checks. Never include either URL in source or chat.
- D13 Use Mailgun instead of Resend for OTP delivery, as requested by the owner. Configure the Mailgun sending domain and region in environment variables; use a domain-scoped sending key.
- D14 Import requires an explicit preview and commit. The server parses the file in both phases, stores no uploaded file, and rejects commits without a current-session proof or matching SHA-256.
- D15 Imported `phones_json` values are an array of strings in workbook order; `phone` is the first value. The lead-review contact display uses the email address only.
- D16 R10 takes precedence over conflicting import mappings: ignore `shopify_evidence`, `no_app_evidence`, and `review_reasons`; do not write `evidence` or `agent_reason`. R20 still requires the constant `agent_approval = 'NEEDS_REVIEW'` on new imports.
- D17 The former dashboard is superseded by the read-only All tab; the app opens on Leads and has no separate dashboard route.
- D18 Email is the only contact value shown on Leads and Drafts lists/details. Importing a lead without email remains allowed; it is not contactable through the mailer's ready-to-queue view. The All tab's read-only full-data view may show all stored lead facts.
- D19 A lead cannot be approved without a valid-looking lowercase email matching `[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}`. The UI, server mutation and additive database check enforce this. `db/003_approval_requires_email.sql` is owner-applied and must be applied only after reconciling any existing approved rows that fail the check.
- D20 Draft review has two required-note rejection transitions: reject the draft only, or atomically reject the draft and return the lead to verification. Returning is blocked once sending is SENDING or SENT and writes `DRAFT_REJECT` plus `LEAD_RETURNED` audit actions.
- D21 The Drafter must create drafts only for leads whose exact `human_approval` is `APPROVED` and whose email is valid. The Drafts tab likewise excludes any other lead.
- D22 Leads, Drafts and All lists use keyset Load more pages of 25; All is ordered by `(updated_at DESC, id ASC)`.
- D23 The Review App visual direction is cool neutral and editorial: teal for Leads, purple for Drafts, restrained neutral All surfaces, serif headings, subtle flat panels, and light/dark themes. Leads and Drafts use master-detail layouts; All details open in a read-only drawer.

## Open questions (owner to answer)
- O1 `NEEDS_REVIEW` leads: the mailer's view requires `agent_approval = 'VERIFIED'`. Should a human be able to override this (needs a new human-owned column, e.g. `human_verified`), or must NEEDS_REVIEW leads be fixed by LeadSearch re-verification? Default until answered: humans may edit and approve them, the UI warns they are not sendable, and nothing else changes.
- O2 Hosting for the Review App: Vercel assumed. Confirm or change.
- O4 Should operators see all users' history, or only their own? Default: everyone sees everything.
- O5 Should a rejected lead be re-openable by operators or admin only? Default: any user.
- O6 Should the admin be able to change `settings` (sending switches, ceilings) from this app? Default: read-only display; the owner changes them directly in the database or Trigger.dev.
- O7 Draft redraft flow: a rejected draft needs the Drafter to create a new version. Should the Review App have a "request redraft" action? Default: no; the Drafter picks up approved leads with no live draft.
- O8 The repository does not define which anti-spam tags are allowed for drafting. The Leads readiness checklist marks this as needing policy confirmation and does not infer an allowlist; decide the allowed tags before treating the checklist as a complete readiness gate.
- O11 The design mocks show `country`, `language` and `timezone` as select menus in the lead detail form, but the repository has no allowed-value lists and `docs/DATA_CONTRACT.md` treats them as free-text editable facts. They stay text inputs with the existing trimming and length validation. Confirm whether fixed lists exist (and where they live) before switching the controls to selects.

## Rules review evidence (T19 in progress)
- R1: OTP-only Mailgun adapter in `src/lib/server/auth/email.ts`; app source scan rejects writes to `email_sends`, `email_attempts`, and `suppressions` (`tests/static-contract.test.mjs`).
- R2–R3: lead and draft actions use exact status strings in their APIs; lead and draft approval endpoints are separate.
- R4: `src/app/api/drafts/[id]/actions/route.ts` compares the submitted `contentHash` in the approval `UPDATE`; stale hashes return 409.
- R5: `db/schema.sql` owns the draft text reset trigger; app edits only `subject`, `body_text`, and `last_edited_by`, then reports the reset.
- R6: `lead-detail-view.tsx`, `lead-queue-table.tsx`, and `draft-review.tsx` use explicit native confirmation dialogs; only lead rejection has a bulk route.
- R7: state changes use `writeAudit` within `withTransaction`; acting user comes from `getApiSessionUser`.
- R8: lead and draft revoke endpoints read `email_sends` and block `SENDING`/`SENT`; they never write that table.
- R9: `db/002_review_app.sql` has the approved-lead reset trigger; the edit view warns about email changes.
- R10: no app update route changes agent verdict; R20 imports only insert the fixed `NEEDS_REVIEW` value. No route writes `agent_reason`, evidence, contacted, or `ls_*`; protected import columns are ignored per D16.
- R11–R14: explicit column lists, no whole-row updates, no application deletes of owned review data, transaction/status guards, and append-only audit inserts are in the route modules.
- R15–R19: proxy and server session checks protect routes; admin endpoints re-check role; OTP responses stay generic; OTP hashes, single use, limits, sessions, and cookie flags are implemented in `src/lib/server/auth`.
- R20–R21: import validation and insert behavior are in `src/lib/server/import` and `/api/import`; commit inserts fixed `NEEDS_REVIEW` / `PENDING` values, ignores uploaded approval fields, sanitizes cells, and has no export feature.
- R22: provider and suppression logs omit addresses, codes, tokens, and message contents; mutation audit details use IDs/field names. Static checks cover unsafe HTML and table ownership.
- R23–R24: external integrations are Postgres and Mailgun; secrets are loaded and validated from env; `.env` is ignored.
- R25–R26: contract ambiguities are logged here; no new database tables/columns were introduced beyond the approved auth migration.
- R27: lead and draft screens label screening tags as aids, not legal clearance.
- R28: lead detail disables approval without a valid lowercase email; `/api/leads/[id]/actions` checks the same rule; the additive constraint is `db/003_approval_requires_email.sql` and startup verifies it.
- R29: `/api/drafts/[id]/actions` performs both send-back updates and both audit inserts inside one transaction, after checking `email_sends` for `SENDING`/`SENT`.

T19 remains open until the database-backed and manual scenarios in `docs/TESTING.md` pass.

## UI contract change log
- 2026-11-10: Adopted `docs/UI_SKILL.md` as the controlling UI brief. Replaced the prior two-tab model with Leads, Drafts and All; added email-gated lead approval, draft send-back, and keyset pagination. Updated `RULES.md`, `DATA_CONTRACT.md`, and `UI_SPEC.md` accordingly.
- 2026-11-10: Applied the visual system in `docs/UI_SKILL.md`: neutral editorial surfaces, job-specific accents, responsive master-detail queues, a read-only All drawer, and light/dark themes.
- 2026-11-10: Aligned the built UI to the mocks in `design/` end to end (Leads queue and detail, Drafts workspace, All, Import, History, Audit, Users, login, phones and dark mode). Leads and Drafts now share one compact two-column queue row, Drafts sub-views use an outlined plum chip, the phone top bar keeps only Leads/Drafts/All with the utility links in the user menu, and the pipeline rail plus table scrolling are replaced on phones. Functionality the mocks omit (bulk reject, admin links, advanced lead filters, native confirmation dialogs) is kept, since the product contract requires it.

## Open implementation questions
- O10 `SESSION_SECRET` is required by `docs/SECURITY.md`, but the auth contract defines opaque random sessions stored as SHA-256 hashes and does not define a use for this secret. Keep validating it at startup; clarify before using it for another purpose.
