import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "src/lib/server/import/values.ts");
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const importValues = {};
vm.runInNewContext(
  compiled.outputText,
  { exports: importValues, URL },
  { filename: sourcePath },
);

test("import cell values neutralize formulas and control prefixes", () => {
  assert.equal(importValues.sanitizeCellText("=1+1"), "'=1+1");
  assert.equal(importValues.sanitizeCellText("\r=1+1"), "'=1+1");
  assert.equal(
    importValues.sanitizeCellText({ formula: "1+1", result: 2 }),
    "'=1+1",
  );
  assert.equal(importValues.sanitizeCellText(" plain\ttext "), "plaintext");
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        importValues.splitList(
          importValues.rawCellText(["+15551230000", "+15557654321"]),
        ),
      ),
    ),
    ["'+15551230000", "'+15557654321"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(importValues.splitList("single number"))),
    ["single number"],
  );
});

test("import normalization keeps email as the contact and phones as an array", () => {
  const parsed = importValues.parseImportRow(2, {
    domain: "https://WWW.Example.com/contact",
    website_url: "example.com",
    company_name: "Example Store",
    emails: "bad-address;Sales@Example.com;owner@example.com",
    email_types: "invalid;generic;personal",
    phones: "+15551234567; +15557654321",
    country: "us",
    screening_status: "NOT_A_SUPPORTED_TAG",
    shopify_evidence: "not writable",
    review_reasons: "not writable",
  });

  assert.equal(parsed.row.lead.domain, "example.com");
  assert.equal(parsed.row.lead.email, "sales@example.com");
  assert.equal(parsed.row.lead.email_type, "generic");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.row.lead.emails_json)), [
    { address: "sales@example.com", type: "generic" },
    { address: "owner@example.com", type: "personal" },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.row.lead.phones_json)), [
    "'+15551234567",
    "'+15557654321",
  ]);
  assert.equal(parsed.row.lead.phone, "'+15551234567");
  assert.equal(parsed.row.lead.country, "US");
  assert.equal(parsed.row.lead.antispam_tag, "UNKNOWN_REVIEW");
  assert.equal("evidence" in parsed.row.lead, false);
  assert.equal("agent_reason" in parsed.row.lead, false);
});

test("invalid import rows return only a domain and a reason", () => {
  const parsed = importValues.parseImportRow(4, {
    domain: "my-store.myshopify.com",
    website_url: "https://example.com",
    emails: "not-an-email",
    country: "ZZ",
  });
  assert.equal(parsed.error.reason, "BAD_DOMAIN");
  assert.equal(parsed.error.rowNumber, 4);
  assert.equal("email" in parsed.error, false);
});
