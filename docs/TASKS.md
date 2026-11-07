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
- [x] T9 Leads list + filters + detail view (read only).
- [x] T10 Edit allowed fact fields with validation; show reset warning for approved leads (R9).
- [x] T11 Approve / reject / revoke / reopen / archive with confirm dialogs, transactions and audit rows. Bulk reject.

## Phase 3: drafts
- [x] T12 Drafts list + review view (read only) joined to lead facts.
- [x] T13 Edit and save subject/body; show reset-to-pending behaviour (R5).
- [x] T14 Approve with `content_hash` compare-and-set, confirm dialog, conflict handling (R4, R6). Reject and revoke with R8 check against `email_sends`.

## Phase 4: import, history, dashboard
- [x] T15 Excel import per `docs/IMPORT.md` including template download.
- [x] T16 History and audit views (admin audit).
- [x] T17 Dashboard counts.

## Phase 5: quality
- [ ] T18 Tests per `docs/TESTING.md`; fix failures.
- [ ] T19 Rules review: walk `docs/RULES.md` R1 to R27 and note evidence for each in `docs/DECISIONS.md` under "Rules review".
- [x] T20 README for the app repo: setup, env vars, how to apply SQL, how to seed the first admin, how to deploy to Vercel.

T18 and T19 remain open until the database-backed and manual scenarios in `docs/TESTING.md` pass. The current repository test suite covers static contracts and import parsing/template behavior only.

## Out of order work is not allowed
Do not start Phase 3 before Phase 1 is complete (no unauthenticated screens ever, R15).
