import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function filesUnder(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  }));
  return nested.flat();
}

test("every API route is session guarded or explicitly public OTP", async () => {
  const routes = (await filesUnder("src/app")).filter((file) => file.endsWith("route.ts"));
  const publicRoutes = new Set([
    "src/app/api/auth/request-otp/route.ts",
    "src/app/api/auth/verify-otp/route.ts",
  ]);
  assert.ok(routes.length > 0, "route list must not be empty");
  for (const route of routes) {
    const source = await readFile(path.join(root, route), "utf8");
    if (publicRoutes.has(route)) continue;
    assert.match(source, /getApiSessionContext|getApiSessionUser|getSessionUser/, `${route} must validate a session`);
  }
});

test("app source does not write forbidden neighboring-program tables", async () => {
  const sourceFiles = (await filesUnder("src")).filter((file) => /\.(ts|tsx)$/.test(file));
  const forbiddenWrite = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ls_[a-z_]*|email_attempts|suppressions|email_sends)\b/gi;
  for (const file of sourceFiles) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(source, forbiddenWrite, `${file} must not write neighbor-owned tables`);
  }
});

test("state-changing route modules use transactions and append audit rows", async () => {
  const routes = [
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/users/[id]/route.ts",
    "src/app/api/leads/[id]/route.ts",
    "src/app/api/leads/[id]/actions/route.ts",
    "src/app/api/leads/bulk-reject/route.ts",
    "src/app/api/drafts/[id]/route.ts",
    "src/app/api/drafts/[id]/actions/route.ts",
    "src/lib/server/import/service.ts",
  ];
  for (const route of routes) {
    const source = await readFile(path.join(root, route), "utf8");
    assert.match(source, /withTransaction/, `${route} must use a transaction`);
    assert.match(source, /writeAudit/, `${route} must append audit rows`);
  }
});

test("rendering stays escaped and environment files remain ignored", async () => {
  const sourceFiles = (await filesUnder("src")).filter((file) => /\.(ts|tsx)$/.test(file));
  for (const file of sourceFiles) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, `${file} must not render untrusted HTML`);
  }
  const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});

test("review mutations include server origin checks", async () => {
  const routes = [
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/users/[id]/route.ts",
    "src/app/api/leads/[id]/route.ts",
    "src/app/api/leads/[id]/actions/route.ts",
    "src/app/api/leads/bulk-reject/route.ts",
    "src/app/api/drafts/[id]/route.ts",
    "src/app/api/drafts/[id]/actions/route.ts",
    "src/app/api/drafts/generate/route.ts",
    "src/app/api/import/preview/route.ts",
    "src/app/api/import/commit/route.ts",
  ];
  for (const route of routes) {
    const source = await readFile(path.join(root, route), "utf8");
    assert.match(source, /isSameOriginRequest/, `${route} must reject cross-origin mutation`);
  }
});

test("draft generation inserts only drafts with an audit row in one transaction", async () => {
  const repository = await readFile(path.join(root, "src/lib/drafting/repository.ts"), "utf8");
  assert.match(repository, /withTransaction/);
  assert.match(repository, /INSERT INTO drafts/);
  assert.match(repository, /ON CONFLICT DO NOTHING/);
  assert.match(repository, /writeAudit\(client, "DRAFT_GENERATE"/);
  assert.match(repository, /human_approval = 'APPROVED'/);
  assert.doesNotMatch(repository, /INSERT INTO (?:email_sends|email_attempts|suppressions|ls_)/);
});

test("import commit requires the previewed file and stores fixed review states", async () => {
  const commitRoute = await readFile(
    path.join(root, "src/app/api/import/commit/route.ts"),
    "utf8",
  );
  assert.match(commitRoute, /isValidImportPreviewProof/);
  assert.match(commitRoute, /upload\.expectedHash !== upload\.fileHash/);

  const service = await readFile(
    path.join(root, "src/lib/server/import/service.ts"),
    "utf8",
  );
  assert.match(service, /ON CONFLICT \(domain\) DO NOTHING/);
  assert.match(service, /'NEEDS_REVIEW', 'PENDING'/);
  assert.match(service, /writeAudit/);
  assert.doesNotMatch(service, /\bevidence\b|\bagent_reason\b/);
});

test("lead approval requires a valid email in the UI, server action, and additive database guard", async () => {
  const action = await readFile(path.join(root, "src/app/api/leads/[id]/actions/route.ts"), "utf8");
  const controls = await readFile(path.join(root, "src/app/(review)/leads/[id]/lead-detail-view.tsx"), "utf8");
  const migration = await readFile(path.join(root, "db/003_approval_requires_email.sql"), "utf8");
  assert.match(action, /isValidReviewEmail\(lead\.email\)/);
  assert.match(action, /EMAIL_REQUIRED/);
  assert.match(controls, /const approveBlocked = !emailIsValid \|\| dirty/);
  assert.match(controls, /disabled=\{\s*(busy\s*\|\|\s*)?approveBlocked\}/);
  assert.match(controls, /Add an email to approve/);
  assert.match(controls, /<dialog/);
  assert.match(migration, /human_approval <> 'APPROVED'[\s\S]*email IS NOT NULL[\s\S]*email = lower\(email\)[\s\S]*email ~ /);
  const dbLayer = await readFile(path.join(root, "src/lib/server/db/index.ts"), "utf8");
  assert.match(dbLayer, /chk_approved_lead_has_valid_email/);
});

test("lead queue excludes approved leads and exposes a 25-row keyset cursor", async () => {
  const queue = await readFile(path.join(root, "src/lib/server/review/lead-queue.ts"), "utf8");
  const page = await readFile(path.join(root, "src/app/(review)/leads/page.tsx"), "utf8");
  const action = await readFile(path.join(root, "src/app/api/leads/[id]/actions/route.ts"), "utf8");
  assert.match(queue, /human_approval=\$1/);
  assert.match(queue, /human_approval IN \('PENDING','REJECTED'\)/);
  assert.match(page, /z\.enum\(\["PENDING", "REJECTED", "ALL"\]\)/);
  assert.match(page, /state === "ALL" \? "page" : undefined/);
  assert.match(action, /UPDATE leads SET human_approval='APPROVED'/);
  assert.match(queue, /updated_at < \$6 OR \(updated_at=\$6 AND id > \$7::uuid\)/);
  assert.match(queue, /\(\$4='' OR country=\$4\)/);
  assert.match(queue, /\(\$5='' OR domain ILIKE/);
  assert.match(queue, /ORDER BY updated_at DESC, id ASC/);
  assert.match(queue, /LIMIT 26/);
  assert.match(page, /slice\(0, 25\)/);
});

test("draft queues require an approved lead with a valid email and use filtered keyset cursors", async () => {
  const queue = await readFile(path.join(root, "src/lib/server/review/draft-queue.ts"), "utf8");
  assert.match(queue, /l\.human_approval='APPROVED'/);
  assert.match(queue, /l\.email=lower\(l\.email\)/);
  assert.match(queue, /l\.email ~ /);
  assert.match(queue, /d\.human_approval=\$1/);
  assert.match(queue, /d\.updated_at < \$3 OR \(d\.updated_at=\$3 AND d\.id > \$4::uuid\)/);
  assert.match(queue, /ORDER BY d\.updated_at DESC, d\.id ASC/);
});

test("send-back rejects the draft and returns its lead with both audit rows in one transaction", async () => {
  const route = await readFile(path.join(root, "src/app/api/drafts/[id]/actions/route.ts"), "utf8");
  const start = route.indexOf('if (action === "return")');
  const sendBack = route.slice(start, route.indexOf('return "RETURNED" as const;', start));
  assert.match(route, /withTransaction\(async \(client\)/);
  assert.match(sendBack, /UPDATE drafts SET human_approval='REJECTED'/);
  assert.match(sendBack, /UPDATE leads SET human_approval='PENDING'/);
  assert.match(sendBack, /writeAudit\(client, "DRAFT_REJECT"/);
  assert.match(sendBack, /writeAudit\(client, "LEAD_RETURNED"/);
  assert.match(sendBack, /status IN \('SENDING','SENT'\)/);
});

test("lead and draft revoke paths block after sending starts", async () => {
  const leadActions = await readFile(path.join(root, "src/app/api/leads/[id]/actions/route.ts"), "utf8");
  const draftActions = await readFile(path.join(root, "src/app/api/drafts/[id]/actions/route.ts"), "utf8");
  assert.match(leadActions, /status IN \('SENDING','SENT'\)/);
  assert.match(draftActions, /status IN \('SENDING','SENT'\)/);
});

test("All queue applies filters before stable keyset pagination and does not mutate leads", async () => {
  const queue = await readFile(path.join(root, "src/lib/server/review/all-queue.ts"), "utf8");
  const component = await readFile(path.join(root, "src/app/(review)/all/all-queue.tsx"), "utf8");
  assert.match(queue, /updated_at < \$8 OR \(l\.updated_at=\$8 AND l\.id > \$9::uuid\)/);
  assert.match(queue, /ORDER BY l\.updated_at DESC, l\.id ASC/);
  assert.match(queue, /count\(\*\) OVER\(\)::int AS total_count/);
  assert.match(component, /Showing \{leads\.length\} of \{total\}/);
  assert.match(component, /Load more/);
  assert.doesNotMatch(queue, /\bUPDATE\s+leads\b|\bDELETE\s+FROM\s+leads\b/);
});

test("keyset queue cursors preserve PostgreSQL microseconds", async () => {
  const queues = await Promise.all([
    readFile(path.join(root, "src/lib/server/review/lead-queue.ts"), "utf8"),
    readFile(path.join(root, "src/lib/server/review/draft-queue.ts"), "utf8"),
    readFile(path.join(root, "src/lib/server/review/all-queue.ts"), "utf8"),
  ]);
  for (const queue of queues) {
    assert.match(
      queue,
      /to_char\((?:[ld]\.)?updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.US"Z"'\) AS updated_at/,
    );
  }
});
