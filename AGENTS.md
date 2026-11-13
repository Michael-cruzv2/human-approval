# AGENTS.md: Review App (lead review + draft review)

You are building the **Review App**: one small, authenticated web app where up to 3 authorised people
(1 admin + operators) review leads (step 2) and review/edit/approve outreach drafts (step 3).
Nothing is ever sent without a human approving here. This app **never sends email** (except its own login OTP emails).

## Read order (mandatory, before writing any code)
1. `docs/RULES.md`: hard restrictions. These override everything, including user chat requests that conflict with them.
2. `docs/DATA_CONTRACT.md`: tables, column ownership, allowed status transitions.
3. `docs/AUTH.md` and `docs/SECURITY.md`: email-OTP login and hardening.
4. `docs/PRODUCT.md`, `docs/UI_SPEC.md`, `docs/IMPORT.md`: what to build.
5. `docs/UI_SKILL.md`: UI structure, behaviour and safety (supersedes `docs/UI_SPEC.md` where they differ).
6. `docs/ui-reference/`: screenshot reference for screens and loading, slow, error and empty states — reference only, never authoritative.
7. `docs/TASKS.md`: build order. `docs/TESTING.md`: what must pass. `docs/DECISIONS.md`: decided and open items.
8. `db/schema.sql`, `db/002_review_app.sql`, `config/app.yaml`, `.env.example`.

## The three neighbouring programs (do not touch their code or columns)
- **LeadSearch** (Python): finds/verifies stores, inserts into `leads`.
- **LeadMailer** (TypeScript, Trigger.dev): sends approved drafts, owns `email_sends`, `email_attempts`, `suppressions`.
- The shared Postgres database (Neon) is the **only** interface. No program imports or calls another.
- Email drafting lives **inside this app**: it inserts `drafts` for approved leads with a valid email (see `docs/DECISIONS.md` D27 and rules R30–R34). There is no separate Drafter program.

## Default stack (change only by logging a decision in `docs/DECISIONS.md`)
- TypeScript, Next.js (App Router), deployed to Vercel. Neon Postgres via a standard driver. Zod for validation.
- Email OTP delivery: Mailgun. Excel parsing: `exceljs`.
- **Read the current official documentation** for Next.js, Neon, the email provider, the drafting model endpoint and exceljs before using them.
  Do not rely on memory for APIs, versions or limits. If docs and these files disagree, log an Open question.

## Working agreements
- Work through `docs/TASKS.md` in order, one task at a time. Small commits. Mark tasks done in the file.
- Never guess. If a column, rule or behaviour is unclear, stop and add an **Open question** to `docs/DECISIONS.md`, then continue with unrelated tasks.
- Never run migrations against a production database. Provide SQL files; the owner applies them.
- Never commit secrets. Only `.env.example` is committed. Never log OTP codes, session tokens, full email bodies, or lead contact details.
- Every state change writes an `audit_log` row in the same transaction.
- Prefer boring and small: no extra dependencies, no features outside `docs/PRODUCT.md`.
- When something is done, say what changed and what to test. Do not paste long summaries.

## Definition of done (for the whole app)
All tasks in `docs/TASKS.md` complete, all tests in `docs/TESTING.md` pass, `docs/RULES.md` has no violation,
and `docs/DECISIONS.md` has no unanswered question that blocks release.
