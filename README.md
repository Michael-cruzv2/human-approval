# Lead Review

An authenticated review app for lead approvals and outreach-draft approvals. It never sends outreach messages. Its only outbound email is the sign-in OTP through Mailgun.

## Requirements

- Node.js 20.9 or newer
- Access to the Neon child/test branch for local development
- A Mailgun sending domain and key for real OTP delivery

## Local setup

```sh
npm ci
cp .env.example .env
```

Fill `.env` locally. Do not paste secrets into source files or commit `.env`.

- Set `DATABASE_TARGET=child` and put the child branch connection URL in `DATABASE_CHILD_URL`.
- Keep the main connection URL in `DATABASE_URL`; local development selects the child URL.
- Set `SESSION_SECRET` and `OTP_PEPPER` to different random values of at least 32 characters.
- Set `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION` (`US` or `EU`), and `EMAIL_FROM` to the matching Mailgun configuration.
- Set `APP_ORIGIN` to the app origin used in the browser, such as `http://localhost:3000`.

Start the local app:

```sh
npm run dev
```

At runtime, startup checks the configured environment and the required database schema. It does not apply migrations.

## Database setup

The owner applies SQL manually to a **throwaway child/test branch**, in this order:

1. `db/schema.sql`
2. `db/002_review_app.sql`
3. Before applying `db/003_approval_requires_email.sql`, reconcile approved lead rows with invalid or missing email.
4. `db/003_approval_requires_email.sql`
5. Copy `db/seed.example.sql` to a private SQL file, replace the example email/name, and insert the first admin once.

Never run these setup scripts against the main/production branch as part of local testing. Keep the seed file with the real admin details out of version control. The app uses the child URL for local work and does not migrate databases automatically.

## Environment variables

See `.env.example` for the complete list. In production, set `DATABASE_TARGET=main` and configure `DATABASE_URL` with the main branch URL in the deployment environment. Do not configure the production app to use the child branch. Local `.env` should stay at `DATABASE_TARGET=child` until all child-branch checks pass.

Mailgun supports a US or EU API region. The configured sending domain must be the domain used in the Mailgun messages API path, and `EMAIL_FROM` must be authorised for it. Use a domain-scoped sending key. The app logs only provider status and failure categories, never email addresses or OTPs.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

`npm test` runs repository-level security and ownership checks. The behavioral scenarios in `docs/TESTING.md` still require a disposable Postgres database and fake OTP sender; never use the main database for them.

## Deployment

Deploy the Next.js app to Vercel. Configure all required environment variables in the Vercel project settings, including `DATABASE_TARGET=main`. Confirm the main database schema was applied by the owner before enabling the deployment. The app fails startup if required configuration or schema objects are missing.

## Ownership and safety

- LeadSearch and LeadMailer remain separate programs; the Review App also generates drafts for approved leads (see `docs/DECISIONS.md` D27). Postgres is the only integration surface.
- The app only writes Review App-owned fields and audit rows as defined in `docs/DATA_CONTRACT.md`.
- Lead and draft approval requires explicit confirmation. Draft approval uses the exact `content_hash` reviewed.
- `email_sends`, `email_attempts`, and `suppressions` are never written by this app.
