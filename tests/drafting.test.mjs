import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";

const root = process.cwd();

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
    throw new Error(`Unexpected import ${specifier} in ${relativePath}`);
  };
  const context = { exports, require: moduleRequire, URL, JSON, console, process };
  vm.runInNewContext(compiled.outputText, context, { filename: filePath });
  return exports;
}

const templateModule = await loadTypeScriptModule("src/lib/drafting/template.ts", {
  "node:fs": await import("node:fs"),
  "node:path": await import("node:path"),
  zod: { z },
});
const guards = await loadTypeScriptModule("src/lib/drafting/guards.ts", {
  "./template": templateModule,
});
const factsModule = await loadTypeScriptModule("src/lib/drafting/facts.ts", {
  "./template": templateModule,
});
const promptModule = await loadTypeScriptModule("src/lib/drafting/prompt.ts", {
  "./template": templateModule,
});
const llmModule = await loadTypeScriptModule("src/lib/drafting/llm.ts");
const generateModule = await loadTypeScriptModule("src/lib/drafting/generate.ts", {
  "./facts": factsModule,
  "./guards": guards,
  "./llm": llmModule,
  "./prompt": promptModule,
  "./template": templateModule,
});

const baseTemplate = {
  version: "test-1",
  subjects: [
    { id: "intro", text: "Idea for {company_name}" },
    { id: "short", text: "{company_name|Your store}: a short idea" },
  ],
  sections: [
    { id: "greeting", text: "Hi {contact_name|there}," },
    {
      id: "hook",
      ai: true,
      instruction: "One sentence about {company_name}.",
      fallback: "A short fallback about {company_name}.",
    },
    { id: "signoff", text: "Best regards" },
  ],
  rules: {
    max_words: 60,
    forbidden_phrases: ["guarantee"],
    allow_links: false,
    language: { mode: "match_lead" },
  },
};

const lead = {
  id: "11111111-1111-4111-8111-111111111111",
  company_name: "Acme Store",
  contact_name: "Sam",
  niche: "outdoor gear",
  country: "US",
  language: "en",
  evidence: {
    shopify: { signal: "Uses Shopify checkout", url: "https://acme.test" },
    no_app: { signal: "Contact sam@acme.test or +1 (555) 123-4567", pages_checked: 4 },
  },
};

function modelReply(text, language = "en") {
  return JSON.stringify({ language, text });
}

function createHarness({
  leadRow = lead,
  enabled = true,
  liveExists = false,
  maxVersion = 0,
  lastRejected = null,
  template = baseTemplate,
  reply = () => modelReply("Acme sells outdoor gear."),
} = {}) {
  const calls = [];
  const inserted = [];
  const state = { liveExists, maxVersion, lastRejected };
  const deps = {
    loadTemplate: () => templateModule.parseEmailTemplate(template),
    loadLead: async () => leadRow,
    loadDraftState: async () => ({ ...state }),
    isDraftingEnabled: async () => enabled,
    insertDraft: async (input) => {
      if (state.liveExists) return false;
      inserted.push(input);
      state.liveExists = true;
      state.maxVersion = input.version;
      return true;
    },
    llm: {
      complete: async (messages) => {
        calls.push(messages);
        if (reply instanceof Error) throw reply;
        return reply(messages);
      },
    },
    aiModel: "fake-model",
  };
  return { deps, calls, inserted, state };
}

const actor = { id: null, type: "SYSTEM" };

test("template validation rejects bad shapes, unknown placeholders and stray braces", () => {
  assert.doesNotThrow(() => templateModule.parseEmailTemplate(baseTemplate));

  assert.throws(
    () => templateModule.parseEmailTemplate({ version: "x" }),
    /subjects/,
  );
  assert.throws(
    () =>
      templateModule.parseEmailTemplate({
        ...baseTemplate,
        subjects: [{ id: "a", text: "Hello {secret_field}" }],
      }),
    /unknown placeholder \{secret_field\}/,
  );
  assert.throws(
    () =>
      templateModule.parseEmailTemplate({
        ...baseTemplate,
        sections: [{ id: "broken", text: "Hello {company_name" }],
      }),
    /unclosed or stray brace/,
  );
  assert.throws(
    () =>
      templateModule.parseEmailTemplate({
        ...baseTemplate,
        rules: { ...baseTemplate.rules, language: { mode: "fixed" } },
      }),
    /value/,
  );
  assert.throws(
    () =>
      templateModule.parseEmailTemplate({
        ...baseTemplate,
        sections: [...baseTemplate.sections, baseTemplate.sections[0]],
      }),
    /ids must be unique/,
  );
});

test("the shipped example template validates and an invalid JSON file blocks drafting", async () => {
  assert.doesNotThrow(() => templateModule.loadEmailTemplate());
  assert.equal(templateModule.checkEmailTemplate().ok, true);

  const directory = await mkdtemp(path.join(tmpdir(), "draft-template-"));
  const file = path.join(directory, "template.json");
  await writeFile(file, "{ not json", "utf8");
  assert.throws(() => templateModule.loadEmailTemplate(file), /not valid JSON/);
  assert.equal(templateModule.checkEmailTemplate().ok, true);
});

test("placeholders fill facts, defaults and empty values", () => {
  const values = { company_name: "Acme", contact_name: null, niche: null, country: null, language: null, evidence_snippets: [] };
  assert.equal(
    templateModule.fillPlaceholders("Hi {contact_name|there}, about {company_name}.", values),
    "Hi there, about Acme.",
  );
  assert.equal(templateModule.fillPlaceholders("Note: {niche}.", values), "Note: .");
  assert.equal(templateModule.findUnfilledPlaceholders("x {company_name} y").join(","), "{company_name}");
});

test("each guard reports its code and allowed links pass", () => {
  const rules = templateModule.parseEmailTemplate(baseTemplate).rules;
  const base = { rules, expectedLanguage: "en", reportedLanguage: "en" };

  assert.equal(
    guards.checkSectionText({ ...base, text: "About {company_name}" }).join(","),
    "PLACEHOLDER",
  );
  assert.ok(guards.checkSectionText({ ...base, text: "We guarantee results" }).includes("FORBIDDEN_PHRASE"));
  assert.ok(guards.checkSectionText({ ...base, text: "See https://example.test" }).includes("LINK"));
  assert.ok(
    guards.checkDraft({
      ...base,
      subject: "Hi",
      body: Array.from({ length: 80 }, () => "word").join(" "),
    }).includes("TOO_LONG"),
  );
  assert.ok(
    guards.checkDraft({
      ...base,
      subject: "Hi",
      body: "Hello there",
      expectedLanguage: "de",
      reportedLanguage: "en",
    }).includes("LANGUAGE"),
  );
  assert.equal(guards.languageMatches("en-US", "en"), true);

  const allowLinks = templateModule.parseEmailTemplate({
    ...baseTemplate,
    rules: { ...baseTemplate.rules, allow_links: true },
  }).rules;
  assert.equal(
    guards.checkSectionText({ rules: allowLinks, expectedLanguage: "en", reportedLanguage: "en", text: "See https://example.test" }).length,
    0,
  );
});

test("the model payload never contains the lead email or phone", async () => {
  const harness = createHarness();
  const result = await generateModule.generateDraft(harness.deps, { leadId: lead.id, actor });
  assert.equal(result.status, "GENERATED");

  const payload = JSON.stringify(harness.calls);
  assert.ok(payload.includes("Acme Store"));
  assert.ok(!payload.includes("sam@acme.test"));
  assert.ok(!payload.includes("555"));
  assert.ok(!payload.includes("123-4567"));
  assert.ok(payload.includes("[redacted]"));
});

test("approval never fails when the model fails: fallback is used and the reason is recorded", async () => {
  const harness = createHarness({ reply: new Error("network down") });
  const result = await generateModule.generateDraft(harness.deps, { leadId: lead.id, actor });

  assert.equal(result.status, "GENERATED");
  assert.equal(result.usedFallback, true);
  assert.match(result.note, /MODEL_/);
  assert.equal(harness.inserted.length, 1);
  assert.match(harness.inserted[0].bodyText, /A short fallback about Acme Store\./);
  assert.equal(harness.inserted[0].templateVersion, "test-1");
  assert.equal(harness.inserted[0].aiModel, "fake-model");
});

test("only one live draft is kept per lead", async () => {
  const harness = createHarness();
  const first = await generateModule.generateDraft(harness.deps, { leadId: lead.id, actor });
  const second = await generateModule.generateDraft(harness.deps, { leadId: lead.id, actor });

  assert.equal(first.status, "GENERATED");
  assert.equal(second.status, "SKIPPED");
  assert.equal(second.reason, "LIVE_DRAFT_EXISTS");
  assert.equal(harness.inserted.length, 1);

  const repository = await readFile(path.join(root, "src/lib/drafting/repository.ts"), "utf8");
  const insert = repository.slice(repository.indexOf("INSERT INTO drafts"), repository.indexOf("RETURNING id, version"));
  assert.match(insert, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(insert, /human_approval/);
});

test("regenerate creates version + 1 and passes the trimmed rejection note", async () => {
  const harness = createHarness({
    maxVersion: 2,
    lastRejected: { version: 2, note: "  too salesy, mention the checkout  " },
  });
  const result = await generateModule.generateDraft(harness.deps, { leadId: lead.id, actor });

  assert.equal(result.status, "GENERATED");
  assert.equal(result.version, 3);
  assert.equal(harness.inserted[0].version, 3);
  assert.equal(harness.inserted[0].regeneratedFrom, 2);
  assert.match(JSON.stringify(harness.calls), /too salesy, mention the checkout/);
  assert.doesNotMatch(harness.inserted[0].generationNote ?? "", /too salesy/);
});

test("drafting is skipped when disabled, without a valid lead, or with a live draft", async () => {
  const disabled = createHarness({ enabled: false });
  const disabledResult = await generateModule.generateDraft(disabled.deps, { leadId: lead.id, actor });
  assert.equal(disabledResult.status, "SKIPPED");
  assert.equal(disabledResult.reason, "DISABLED");
  assert.equal(disabled.calls.length, 0);

  const ineligible = createHarness({ leadRow: null });
  const ineligibleResult = await generateModule.generateDraft(ineligible.deps, { leadId: lead.id, actor });
  assert.equal(ineligibleResult.status, "SKIPPED");
  assert.equal(ineligibleResult.reason, "NOT_ELIGIBLE");

  const live = createHarness({ liveExists: true });
  const liveResult = await generateModule.generateDraft(live.deps, { leadId: lead.id, actor });
  assert.equal(liveResult.status, "SKIPPED");
  assert.equal(liveResult.reason, "LIVE_DRAFT_EXISTS");

  const repository = await readFile(path.join(root, "src/lib/drafting/repository.ts"), "utf8");
  assert.match(repository, /human_approval = 'APPROVED'/);
  assert.match(repository, /email = lower\(email\)/);
});

test("an invalid template or a failed final check writes nothing", async () => {
  const invalidTemplate = createHarness({ template: { version: "bad" } });
  const invalid = await generateModule.generateDraft(invalidTemplate.deps, { leadId: lead.id, actor });
  assert.equal(invalid.status, "FAILED");
  assert.equal(invalid.reason, "TEMPLATE_INVALID");
  assert.equal(invalidTemplate.inserted.length, 0);

  const tooLongFallback = createHarness({
    reply: () => modelReply(Array.from({ length: 30 }, () => "word").join(" ")),
    template: {
      ...baseTemplate,
      rules: { ...baseTemplate.rules, max_words: 10 },
      sections: baseTemplate.sections.map((section) =>
        "ai" in section ? { ...section, fallback: "one two three four five six seven eight nine ten eleven twelve" } : section,
      ),
    },
  });
  const failed = await generateModule.generateDraft(tooLongFallback.deps, { leadId: lead.id, actor });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.reason, "CHECKS_FAILED");
  assert.equal(tooLongFallback.inserted.length, 0);
});

test("the approval route schedules generation after the transaction commits", async () => {
  const route = await readFile(path.join(root, "src/app/api/leads/[id]/actions/route.ts"), "utf8");
  assert.match(route, /after\(\(\) => generateDraftAfterApproval\(id\)\)/);
  assert.ok(
    route.indexOf("after(") > route.indexOf("withTransaction"),
    "generation must be scheduled after the approval transaction",
  );

  const service = await loadTypeScriptModule("src/lib/drafting/service.ts", {
    "server-only": {},
    "@/lib/server/config": { getAppConfig: () => ({ env: { LLM_BASE_URL: "http://llm.test", LLM_API_KEY: "k", LLM_MODEL: "m" } }) },
    "./generate": {
      generateDraft: async () => {
        throw new Error("model exploded");
      },
    },
    "./llm": { createChatClient: () => ({ complete: async () => "" }) },
    "./repository": {},
    "./template": { loadEmailTemplate: () => ({}) },
  });
  await assert.doesNotReject(() => service.generateDraftAfterApproval(lead.id));
});
