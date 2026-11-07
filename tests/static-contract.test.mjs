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
    "src/app/api/import/preview/route.ts",
    "src/app/api/import/commit/route.ts",
  ];
  for (const route of routes) {
    const source = await readFile(path.join(root, route), "utf8");
    assert.match(source, /isSameOriginRequest/, `${route} must reject cross-origin mutation`);
  }
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
