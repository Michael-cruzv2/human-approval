# TASKS.md: build order

Mark each task `[x]` when done. Keep tasks small. If blocked, log an Open question in `docs/DECISIONS.md` and move on.

## Phase 0: setup
- [x] T1 Scaffold the project (stack in `AGENTS.md`), lint, format, strict TypeScript, lockfile, `.gitignore` (`.env*` except `.env.example`).
- [x] T2 Config loader: read env vars (`.env.example`) and `config/app.yaml`, validate with Zod, fail closed at startup (R24).
- [x] T3 DB layer: connection, parameterised query helper, transaction helper, typed row mappers. Add a startup check that required tables/columns from `db/schema.sql` and `db/002_review_app.sql` exist; if not, stop with a clear message (never auto-migrate production).

## Phase 1: auth
- [x] T4 OTP request/verify endpoints per `docs/AUTH.md` (hashing, expiry, attempts, cooldown, rate limits, generic responses).
- [x] T5 OTP email sending via the provider (plain text, code only). Provider adapter behind an interface so tests use a fake.
- [x] T6 Sessions: create, validate, idle/absolute timeout, logout, logout everywhere; cookie flags; request guard used by every route (R15, R17).
- [x] T7 Roles and user admin screen (add, deactivate, role change, max 3 active, last-admin protection).
- [x] T8 Security headers, Origin check, `no-store`, error pages with request ID.

## Phase 2: leads
- [x] T9 Leads queue + filters + detail view, with email-required approval and 25-row keyset loading.
- [x] T10 Edit allowed fact fields with validation; show reset warning for approved leads (R9).
- [x] T11 Approve / reject / revoke / reopen / archive with confirm dialogs, transactions and audit rows. Bulk reject.

## Phase 3: drafts
- [x] T12 Drafts subviews and review view joined to approved, email-valid lead facts.
- [x] T13 Edit and save subject/body; show reset-to-pending behaviour (R5).
- [x] T14 Approve with `content_hash` compare-and-set, confirm dialog, conflict handling (R4, R6); reject, send-back, and revoke with R8 checks.

## Phase 4: import, history, dashboard
- [x] T15 Excel import per `docs/IMPORT.md` including template download.
- [x] T16 History and audit views (admin audit).
- [x] T17 Dashboard counts (superseded by the All overview in the revised UI contract).
- [x] T21 Read-only All overview with filters, full-data view, and 25-row keyset Load more.
- [x] T22 UI states: loading, slow (8 s), error (20 s with request ID), empty states per docs/UI_SKILL.md; screenshots in docs/ui-reference/. (Complete: all state components implemented; loading, slow at 8s, error at 20s with request ID, empty states with descriptions and retry actions.)
- [x] T23 Page transition loading: skeleton removed from LeadDetailView; data arrives via server props, no client-side loading skeleton needed. (Complete: loading skeleton removed; LeadDetailView renders directly with server data.)
- [x] T24 Queue filter + loading fixes (D25, D26): Leads chips are single-select with an All chip, queue state resets on filter change, and Leads/Drafts/All load rows inside per-pane Suspense with row-shaped skeletons. (Complete: chip filters narrow the left list, All shows pending + rejected, badges and lists show placeholders while fetching.)

## Phase 5: quality
- [ ] T18 Tests per `docs/TESTING.md`; fix failures.
- [ ] T19 Rules review: walk `docs/RULES.md` R1 to R29 and note evidence for each in `docs/DECISIONS.md` under "Rules review".
- [x] T20 README for the app repo: setup, env vars, how to apply SQL, how to seed the first admin, how to deploy to Vercel.

## Phase 6: drafting inside the app (DECISIONS D27)
- [x] T25 Update the contract docs and rules for in-app drafting (D27, R30–R34).
- [x] T26 `config/email_template.json` plus a Zod template loader; invalid template blocks drafting and writes nothing.
- [x] T27 `lib/drafting`: facts-only model input, guarded generation, fallback + `generation_note`, `DRAFT_GENERATE` audit, one live draft per lead.
- [ ] T28 Generate in the background after lead approval commits, never blocking or failing the approval.
- [ ] T29 Drafts > Awaiting draft: failure reasons, Generate per lead, Generate all (≤5), Regenerate with the rejection note as feedback.
- [ ] T30 `db/004_drafting_settings.sql` (`drafting_enabled` false) and the grants list for the owner.
- [ ] T31 `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` in `.env.example`, the startup check and the README.
- [ ] T32 Offline drafting tests with a fake model.

T18 and T19 remain open until the database-backed and manual scenarios in `docs/TESTING.md` pass. The current repository test suite covers static contracts and import parsing/template behavior only.

## Out of order work is not allowed
Do not start Phase 3 before Phase 1 is complete (no unauthenticated screens ever, R15).
