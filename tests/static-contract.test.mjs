// This file contains static contract tests that verify the implementation
// matches the specifications in the documentation. Each test reads source files
// and asserts that certain patterns exist to ensure the contract is upheld.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("lead queue includes APPROVED and excludes sent leads", async () => {
  const queue = await readFile(path.join(root, "src/lib/server/review/lead-queue.ts"), "utf8");
  const page = await readFile(path.join(root, "src/app/(review)/leads/page.tsx"), "utf8");
  const action = await readFile(path.join(root, "src/app/api/leads/[id]/actions/route.ts"), "utf8");
  assert.match(queue, /human_approval IN \('PENDING','APPROVED','REJECTED'\)/);
  assert.match(queue, /contacted=false/);
  assert.match(queue, /SELECT 1 FROM email_sends sent/);
  assert.match(queue, /sent\.lead_id=leads\.id AND sent\.status='SENT'/);
  assert.match(page, /z\.enum\(\["PENDING", "APPROVED", "REJECTED", "ALL"\]\)/);
  assert.match(page, /aria-current={state === "ALL" \? "page" : undefined}/);
  assert.match(action, /UPDATE leads SET human_approval='APPROVED'/);
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
});