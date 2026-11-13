import { buildLeadFacts, type LeadFactsRow } from "./facts";
import { checkDraft, checkSectionText } from "./guards";
import { LlmError, parseSectionResponse, type LlmClient } from "./llm";
import { buildSectionMessages, expectedLanguage, trimFeedback } from "./prompt";
import { fillPlaceholders, type EmailTemplate, type LeadFacts } from "./template";

/**
 * Pure orchestration for one draft generation. Everything with side effects is
 * injected so the acceptance tests run offline with a fake model and repository.
 */

export type DraftState = {
  liveExists: boolean;
  maxVersion: number;
  lastRejected: { version: number; note: string | null } | null;
};

export type DraftInsertInput = {
  leadId: string;
  version: number;
  subject: string;
  bodyText: string;
  aiOpener: string | null;
  templateVersion: string;
  aiModel: string;
  generationNote: string | null;
  regeneratedFrom: number | null;
};

export type DraftActor = { id: string | null; type: "USER" | "SYSTEM" };

export type DraftingDeps = {
  loadTemplate: () => EmailTemplate;
  loadLead: (leadId: string) => Promise<LeadFactsRow | null>;
  loadDraftState: (leadId: string) => Promise<DraftState>;
  isDraftingEnabled: () => Promise<boolean>;
  insertDraft: (input: DraftInsertInput, actor: DraftActor) => Promise<boolean>;
  llm: LlmClient;
  aiModel: string;
};

export type GenerateDraftResult =
  | { status: "GENERATED"; version: number; usedFallback: boolean; note: string | null }
  | { status: "SKIPPED"; reason: "DISABLED" | "NOT_ELIGIBLE" | "LIVE_DRAFT_EXISTS" }
  | { status: "FAILED"; reason: "TEMPLATE_INVALID" | "CHECKS_FAILED"; message: string };

type RenderedSection = {
  ai: boolean;
  text: string;
  fallbackText: string | null;
  usedFallback: boolean;
  reason: string | null;
  language: string | null;
};

async function renderAiSection(
  section: { instruction: string; fallback: string },
  facts: LeadFacts,
  template: EmailTemplate,
  language: string | null,
  feedback: string | null,
  llm: LlmClient,
): Promise<Pick<RenderedSection, "text" | "usedFallback" | "reason" | "language">> {
  const fallbackText = fillPlaceholders(section.fallback, facts);
  try {
    const raw = await llm.complete(
      buildSectionMessages(facts, { instruction: section.instruction, language, feedback }),
    );
    const parsed = parseSectionResponse(raw);
    const codes = checkSectionText({
      text: parsed.text,
      rules: template.rules,
      expectedLanguage: language,
      reportedLanguage: parsed.language,
    });
    if (codes.length > 0) {
      return { text: fallbackText, usedFallback: true, reason: codes.join("+"), language: null };
    }
    return { text: parsed.text, usedFallback: false, reason: null, language: parsed.language };
  } catch (error) {
    const reason = error instanceof LlmError ? error.message : "MODEL_ERROR";
    return { text: fallbackText, usedFallback: true, reason, language: null };
  }
}

export async function generateDraft(
  deps: DraftingDeps,
  input: { leadId: string; actor: DraftActor },
): Promise<GenerateDraftResult> {
  if (!(await deps.isDraftingEnabled())) return { status: "SKIPPED", reason: "DISABLED" };

  const lead = await deps.loadLead(input.leadId);
  if (!lead) return { status: "SKIPPED", reason: "NOT_ELIGIBLE" };

  const state = await deps.loadDraftState(input.leadId);
  if (state.liveExists) return { status: "SKIPPED", reason: "LIVE_DRAFT_EXISTS" };

  let template: EmailTemplate;
  try {
    template = deps.loadTemplate();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "config/email_template.json is invalid.";
    return { status: "FAILED", reason: "TEMPLATE_INVALID", message };
  }

  const facts = buildLeadFacts(lead);
  const language = expectedLanguage(facts, template.rules);
  const feedback = trimFeedback(state.lastRejected?.note);
  const version = state.maxVersion + 1;

  const subjectTemplate = template.subjects[(version - 1) % template.subjects.length];
  const subject = fillPlaceholders(subjectTemplate.text, facts);

  const rendered: RenderedSection[] = [];
  for (const section of template.sections) {
    if ("ai" in section) {
      const result = await renderAiSection(section, facts, template, language, feedback, deps.llm);
      rendered.push({
        ai: true,
        fallbackText: fillPlaceholders(section.fallback, facts),
        ...result,
      });
    } else {
      rendered.push({
        ai: false,
        text: fillPlaceholders(section.text, facts),
        fallbackText: null,
        usedFallback: false,
        reason: null,
        language: null,
      });
    }
  }

  function bodyFor(forceFallback: boolean): string {
    return rendered
      .map((section) => {
        if (section.ai && section.fallbackText && (section.usedFallback || forceFallback)) {
          return section.fallbackText;
        }
        return section.text;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  const acceptedAi = rendered.find((section) => section.ai && !section.usedFallback);
  let body = bodyFor(false);
  let usedForcedFallback = false;
  let codes = checkDraft({
    subject,
    body,
    rules: template.rules,
    expectedLanguage: language,
    reportedLanguage: acceptedAi?.language ?? language,
  });

  if (codes.length > 0 && acceptedAi) {
    body = bodyFor(true);
    usedForcedFallback = true;
    codes = checkDraft({
      subject,
      body,
      rules: template.rules,
      expectedLanguage: language,
      reportedLanguage: language,
    });
  }

  if (codes.length > 0) {
    return {
      status: "FAILED",
      reason: "CHECKS_FAILED",
      message: `Draft checks failed: ${Array.from(new Set(codes)).join(", ")}.`,
    };
  }

  const notes = rendered.flatMap((section, index) =>
    section.reason ? [`${template.sections[index].id}: ${section.reason}`] : [],
  );
  if (usedForcedFallback) notes.push("final: FALLBACK_SECTIONS");
  const generationNote = notes.length > 0 ? notes.join("; ").slice(0, 500) : null;

  const inserted = await deps.insertDraft(
    {
      leadId: input.leadId,
      version,
      subject,
      bodyText: body,
      aiOpener: usedForcedFallback ? null : (acceptedAi?.text ?? null),
      templateVersion: template.version,
      aiModel: deps.aiModel,
      generationNote,
      regeneratedFrom: state.lastRejected?.version ?? null,
    },
    input.actor,
  );

  if (!inserted) return { status: "SKIPPED", reason: "LIVE_DRAFT_EXISTS" };

  return {
    status: "GENERATED",
    version,
    usedFallback: usedForcedFallback || rendered.some((section) => section.ai && section.usedFallback),
    note: generationNote,
  };
}
