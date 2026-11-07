import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ExcelJS from "exceljs";
import ts from "typescript";

const root = process.cwd();
const require = createRequire(import.meta.url);

async function loadTypeScriptModule(relativePath, dependencies = {}) {
  const filePath = path.join(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const exports = {};
  const moduleRequire = (specifier) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    return require(specifier);
  };
  vm.runInNewContext(
    compiled.outputText,
    { exports, require: moduleRequire, URL },
    { filename: filePath },
  );
  return exports;
}

const values = await loadTypeScriptModule("src/lib/server/import/values.ts");
const xlsx = await loadTypeScriptModule("src/lib/server/import/xlsx.ts", {
  "./values": values,
});
const proof = await loadTypeScriptModule("src/lib/server/import/proof.ts", {
  "server-only": {},
  "node:buffer": require("node:buffer"),
  "node:crypto": require("node:crypto"),
});

test("XLSX parser selects Leads, normalizes columns, and never uses formula results", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook
    .addWorksheet("Other")
    .addRow(["domain", "website_url", "company_name"]);
  workbook
    .getWorksheet("Other")
    .addRow(["wrong.example", "https://wrong.example", "Wrong sheet"]);
  const sheet = workbook.addWorksheet("Leads");
  sheet.addRow([
    " Domain ",
    "WEBSITE_URL",
    "Company_Name",
    "Emails",
    "Phones",
    "human_check",
  ]);
  sheet.addRow([
    "https://www.example.com/path",
    "example.com",
    { formula: "1+1", result: "Safe" },
    "A@EXAMPLE.COM",
    "+15551230000; +15551230001",
    "APPROVED",
  ]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await xlsx.parseXlsxWorkbook(buffer, 10, 2000);

  assert.equal(parsed.totalRows, 1);
  assert.equal(
    parsed.invalidRows.length,
    0,
    JSON.stringify(parsed.invalidRows),
  );
  assert.equal(parsed.rows[0].lead.domain, "example.com");
  assert.equal(parsed.rows[0].lead.company_name, "'=1+1");
  assert.equal(parsed.rows[0].lead.email, "a@example.com");
  assert.deepEqual(
    JSON.parse(JSON.stringify(parsed.rows[0].lead.phones_json)),
    ["'+15551230000", "'+15551230001"],
  );
  assert.equal("human_approval" in parsed.rows[0].lead, false);
  assert.equal(parsed.invalidRows.length, 0);
});

test("XLSX template contains the expected header and a marked example row", async () => {
  const buffer = Buffer.from(await xlsx.createImportTemplate());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(
    workbook.getWorksheet("Leads").getRow(1).getCell(1).value,
    "domain",
  );
  const parsed = await xlsx.parseXlsxWorkbook(buffer, 10, 2000);
  assert.equal(parsed.rows.length, 1);
  assert.equal(
    parsed.rows[0].lead.company_name,
    "EXAMPLE ROW - REPLACE OR DELETE",
  );
  assert.equal(parsed.rows[0].lead.email, "contact@example.com");
});

test("XLSX parser rejects missing headers and row-limit overflow", async () => {
  const badWorkbook = new ExcelJS.Workbook();
  badWorkbook.addWorksheet("Leads").addRow(["company_name"]);
  const missingHeaders = Buffer.from(await badWorkbook.xlsx.writeBuffer());
  await assert.rejects(
    xlsx.parseXlsxWorkbook(missingHeaders, 10, 2000),
    /header row must include domain and website_url/,
  );

  const largeWorkbook = new ExcelJS.Workbook();
  const sheet = largeWorkbook.addWorksheet("Leads");
  sheet.addRow(["domain", "website_url"]);
  sheet.addRow(["one.example", "https://one.example"]);
  sheet.addRow(["two.example", "https://two.example"]);
  const tooManyRows = Buffer.from(await largeWorkbook.xlsx.writeBuffer());
  await assert.rejects(
    xlsx.parseXlsxWorkbook(tooManyRows, 1, 2000),
    /exceeds the 1-row limit/,
  );
});

test("import preview proof is bound to the session, user, and file hash", () => {
  const token = "opaque-session-token";
  const userId = "user-id";
  const hash = "a".repeat(64);
  const signature = proof.createImportPreviewProof(token, userId, hash);
  assert.equal(
    proof.isValidImportPreviewProof(signature, token, userId, hash),
    true,
  );
  assert.equal(
    proof.isValidImportPreviewProof(signature, token, userId, "b".repeat(64)),
    false,
  );
  assert.equal(
    proof.isValidImportPreviewProof(signature, token, "other-user", hash),
    false,
  );
});
