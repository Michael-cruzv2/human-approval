import { fillPlaceholders, type LeadFacts, type TemplateRules } from "./template";

export type ChatMessage = { role: "system" | "user"; content: string };

const MAX_FEEDBACK_CHARS = 500;

export function expectedLanguage(facts: LeadFacts, rules: TemplateRules): string | null {
  if (rules.language.mode === "fixed") return rules.language.value ?? null;
  return facts.language;
}

export function trimFeedback(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed.slice(0, MAX_FEEDBACK_CHARS) : null;
}

/**
 * The payload holds the five allowed lead facts and scrubbed evidence snippets.
 * There is no email, phone, domain or raw row spread anywhere in this input.
 */
export function buildSectionMessages(
  facts: LeadFacts,
  options: { instruction: string; language: string | null; feedback: string | null },
): ChatMessage[] {
  const factPayload = {
    company_name: facts.company_name,
    contact_name: facts.contact_name,
    niche: facts.niche,
    country: facts.country,
    language: facts.language,
    evidence_snippets: facts.evidence_snippets,
  };
  const target = options.language ?? "the language named in the instruction";

  const system = [
    "You write one section of a B2B outreach email.",
    "Use only the facts and evidence provided. Never invent details.",
    "Do not promise results, do not pressure the reader, and do not include links, email addresses or phone numbers.",
    "Return only JSON with exactly two string keys: language (the ISO 639-1 code you wrote in) and text (the section, plain text, no greeting or signature unless asked).",
  ].join(" ");

  const userParts = [
    `Instruction: ${fillPlaceholders(options.instruction, facts)}`,
    `Write in this language: ${target}.`,
    `Lead facts (JSON): ${JSON.stringify(factPayload)}`,
  ];
  if (options.feedback) {
    userParts.push(`A reviewer rejected the previous draft. Feedback to address: ${options.feedback}`);
  }

  return [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n") },
  ];
}
