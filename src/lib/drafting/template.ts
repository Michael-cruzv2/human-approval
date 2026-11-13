import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { z } from "zod";

/**
 * Draft templates are plain JSON so the owner can edit copy without code.
 * Every generation reads and validates the file again (D27); an invalid file
 * blocks drafting and writes nothing.
 */

export const DEFAULT_TEMPLATE_PATH = "config/email_template.json";

export const LEAD_FACT_KEYS = [
  "company_name",
  "contact_name",
  "niche",
  "country",
  "language",
] as const;

export type LeadFactKey = (typeof LEAD_FACT_KEYS)[number];

export type LeadFacts = Record<LeadFactKey, string | null> & {
  evidence_snippets: string[];
};

const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;
const PLACEHOLDER_BODY_PATTERN = /^([a-z][a-z0-9_]*)(?:\|([^{}|\n]{1,60}))?$/;

const PlaceholderText = z.string().min(1).max(5000);

const SubjectSchema = z
  .object({
    id: z.string().min(1).max(60).optional(),
    text: PlaceholderText,
  })
  .strict();

const StaticSectionSchema = z
  .object({
    id: z.string().min(1).max(60),
    text: PlaceholderText,
  })
  .strict();

const AiSectionSchema = z
  .object({
    id: z.string().min(1).max(60),
    ai: z.literal(true),
    instruction: z.string().min(1).max(2000),
    fallback: z.string().min(1).max(2000),
  })
  .strict();

const SectionSchema = z.union([StaticSectionSchema, AiSectionSchema]);

const LanguageRuleSchema = z
  .object({
    mode: z.enum(["match_lead", "fixed"]),
    value: z.string().min(2).max(20).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "fixed" && !value.value) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "is required when language.mode is fixed",
      });
    }
  });

export const EmailTemplateSchema = z
  .object({
    note: z.string().max(1000).optional(),
    version: z.string().min(1).max(100),
    subjects: z.array(SubjectSchema).min(1).max(10),
    sections: z.array(SectionSchema).min(1).max(30),
    rules: z
      .object({
        max_words: z.number().int().min(10).max(2000),
        forbidden_phrases: z.array(z.string().min(1).max(100)).max(50).default([]),
        allow_links: z.boolean().default(false),
        language: LanguageRuleSchema,
      })
      .strict(),
  })
  .strict();

export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;
export type TemplateSection = z.infer<typeof SectionSchema>;
export type TemplateRules = EmailTemplate["rules"];

export class TemplateValidationError extends Error {}

function validatePlaceholders(text: string, path: string): void {
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const body = match[1] ?? "";
    const parsed = PLACEHOLDER_BODY_PATTERN.exec(body);
    if (!parsed) {
      throw new TemplateValidationError(
        `${path} has an unsupported placeholder {${body}}. Use {fact|default} where fact is one of ${LEAD_FACT_KEYS.join(", ")}.`,
      );
    }
    const key = parsed[1] as LeadFactKey;
    if (!LEAD_FACT_KEYS.includes(key)) {
      throw new TemplateValidationError(
        `${path} uses unknown placeholder {${key}}. Allowed facts: ${LEAD_FACT_KEYS.join(", ")}.`,
      );
    }
  }
  const withoutPlaceholders = text.replace(PLACEHOLDER_PATTERN, "");
  if (/[{}]/.test(withoutPlaceholders)) {
    throw new TemplateValidationError(`${path} has an unclosed or stray brace.`);
  }
}

export function parseEmailTemplate(raw: unknown): EmailTemplate {
  const result = EmailTemplateSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "template";
    throw new TemplateValidationError(`${path}: ${issue?.message ?? "invalid template"}`);
  }
  const template = result.data;

  template.subjects.forEach((subject, index) => {
    validatePlaceholders(subject.text, `subjects[${index}].text`);
  });
  template.sections.forEach((section, index) => {
    if ("ai" in section) {
      validatePlaceholders(section.instruction, `sections[${index}].instruction`);
      validatePlaceholders(section.fallback, `sections[${index}].fallback`);
    } else {
      validatePlaceholders(section.text, `sections[${index}].text`);
    }
  });

  const subjectIds = template.subjects.flatMap((subject) => (subject.id ? [subject.id] : []));
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw new TemplateValidationError("subjects: ids must be unique");
  }
  const sectionIds = template.sections.map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) {
    throw new TemplateValidationError("sections: ids must be unique");
  }

  return template;
}

export function loadEmailTemplate(
  filePath: string = resolve(process.cwd(), DEFAULT_TEMPLATE_PATH),
): EmailTemplate {
  const label = relative(process.cwd(), filePath) || filePath;
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    throw new TemplateValidationError(`${label} could not be read.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new TemplateValidationError(`${label} is not valid JSON.`);
  }
  try {
    return parseEmailTemplate(raw);
  } catch (error) {
    if (error instanceof TemplateValidationError) {
      throw new TemplateValidationError(`${label}: ${error.message}`);
    }
    throw error;
  }
}

/** Fills {fact} and {fact|default}. Missing facts use the default or empty text. */
export function fillPlaceholders(text: string, facts: LeadFacts): string {
  return text
    .replace(PLACEHOLDER_PATTERN, (_match, body: string) => {
      const parsed = PLACEHOLDER_BODY_PATTERN.exec(body);
      if (!parsed) return "";
      const key = parsed[1] as LeadFactKey;
      const value = facts[key];
      const trimmed = typeof value === "string" ? value.trim() : "";
      return trimmed || parsed[2] || "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findUnfilledPlaceholders(text: string): string[] {
  return Array.from(text.matchAll(PLACEHOLDER_PATTERN), (match) => match[0]);
}

export function allowedFactText(facts: LeadFacts): Record<LeadFactKey, string> {
  return {
    company_name: facts.company_name ?? "",
    contact_name: facts.contact_name ?? "",
    niche: facts.niche ?? "",
    country: facts.country ?? "",
    language: facts.language ?? "",
  };
}
