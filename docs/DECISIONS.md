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
- D21 Drafts are created only for leads whose exact `human_approval` is `APPROVED` and whose email is valid. The Drafts tab likewise excludes any other lead.
- D22 Leads, Drafts and All lists use keyset Load more pages of 25; All is ordered by `(updated_at DESC, id ASC)`.
- D23 The Review App visual direction is cool neutral and editorial: teal for Leads, purple for Drafts, restrained neutral All surfaces, serif headings, subtle flat panels, and light/dark themes. Leads and Drafts use master-detail layouts; All details open in a read-only drawer.
- D24 `/` redirects to `/leads` through `next.config.ts` (307) rather than a server component `redirect()`. The RSC redirect triggered a Next.js 16 development-only Performance API error (`ReviewHomePage cannot have a negative time stamp`), and routing-layer redirects avoid that instrumentation path. The proxy still sends unauthenticated visitors to `/login`.
- D25 The Leads queue adds a single-select **All** chip next to Pending, Needs email, Returned and Rejected. All shows pending and rejected leads in one list and never shows `APPROVED` or archived leads, so `UI_SKILL.md` ("a lead leaves this tab once approved") and the separate All tab stay true. Chip params reset each other (`status`, `email`, `returned`); agent, country, anti-spam tag and search remain in "More filters" and apply across chips. `status=ALL` is accepted by `/api/leads/queue`. Lists read keyset rows through a request-scoped React `cache` so the count badge, queue and detail pane share one query.
- D26 Queue data now loads inside per-pane `<Suspense>` boundaries instead of a route `loading.tsx`: the queue header, search, chips and filters render immediately, and only list rows, counts and the detail pane are placeholders. A fallback cannot hold itself after unmount, so the "keep at least 400 ms" rule is implemented as a 200 ms delay plus a 400 ms fade-in: slow loads ramp in, fast loads never flash. Queue components are keyed by their filter set, which also fixes stale rows surviving a chip change.
- D27 Email drafting lives inside the Review App; there is no separate Drafter program. `config/email_template.json` defines subject variants, static sections, AI sections with fallbacks, and rules. Every generation validates the template with Zod (an invalid file blocks drafting with a clear error and writes nothing), builds the model input from stored lead facts only (company name, contact name, niche, country, language, scrubbed evidence snippets; never the contact's email or phone), and calls an env-configured OpenAI-compatible chat-completions endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) with a short timeout. Generated rows are always inserted as `PENDING`, only for a lead that is `APPROVED` with a valid email, using `ON CONFLICT DO NOTHING` so the one-live-draft-per-lead index still applies. The approval transaction never waits for or depends on the model call; generation starts only after the approval commits, through the platform's after-response mechanism. The compliance footer stays with LeadMailer and is never part of `body_text`. Checks before insert cover unfilled placeholders, `max_words`, forbidden phrases, links unless allowed, and language match; on a failed check or model error the section's fallback is used and the reason is recorded in `generation_note`. A `DRAFT_GENERATE` audit row is written in the same transaction as the insert (IDs only). Drafting is off unless `settings.drafting_enabled` is `true` (default `false`, owner-applied `db/004_drafting_settings.sql`). Regeneration after a draft rejection creates `version + 1` and passes the trimmed rejection note to the model as feedback; the note is never logged or stored by drafting.

## Open questions (owner to answer)
- O1 `NEEDS_REVIEW` leads: the mailer's view requires `agent_approval = 'VERIFIED'`. Should a human be able to override this (needs a new human-owned column, e.g. `human_verified`), or must NEEDS_REVIEW leads be fixed by LeadSearch re-verification? Default until answered: humans may edit and approve them, the UI warns they are not sendable, and nothing else changes.
- O2 Hosting for the Review App: Vercel assumed. Confirm or change.
- O4 Should operators see all users' history, or only their own? Default: everyone sees everything.
- O5 Should a rejected lead be re-openable by operators or admin only? Default: any user.
- O6 Should the admin be able to change `settings` (sending switches, ceilings) from this app? Default: read-only display; the owner changes them directly in the database or Trigger.dev.
- O8 The repository does not define which anti-spam tags are allowed for drafting. The Leads readiness checklist marks this as needing policy confirmation and does not infer an allowlist; decide the allowed tags before treating the checklist as a complete readiness gate.
- O11 The design mocks show `country`, `language` and `timezone` as select menus in the lead detail form, but the repository has no allowed-value lists and `docs/DATA_CONTRACT.md` treats them as free-text editable facts. They stay text inputs with the existing trimming and length validation. Confirm whether fixed lists exist (and where they live) before switching the controls to selects.
- O12 Automatic generation failures that leave no draft (invalid template, or a guard failure that persists after the fallback) have no Review-App-owned column to store a reason. Default: Drafts > Awaiting draft shows the template error and any manual Generate error; automatic failures are only logged as IDs and action names (R22). Confirm whether a persisted failure reason is wanted (it would need an approved column or table).

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
- 2026-11-11: Kept the Leads and Drafts workspace as the mock's fixed master-detail shell. The queue list and the selected record are separate scroll regions, so opening a record scrolls the record pane from the top and leaves the queue in place; the queue header/footer and the action bar stay pinned.

## Open implementation questions
- O10 `SESSION_SECRET` is required by `docs/SECURITY.md`, but the auth contract defines opaque random sessions stored as SHA-256 hashes and does not define a use for this secret. Keep validating it at startup; clarify before using it for another purpose.
