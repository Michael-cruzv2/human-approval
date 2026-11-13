import { findUnfilledPlaceholders, type TemplateRules } from "./template";

export type DraftCheckCode =
  | "PLACEHOLDER"
  | "TOO_LONG"
  | "FORBIDDEN_PHRASE"
  | "LINK"
  | "LANGUAGE";

const LINK_PATTERN = /https?:\/\/|www\./i;

export function languageMatches(expected: string, reported: string): boolean {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return normalize(expected) === normalize(reported);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function findForbiddenPhrase(text: string, phrases: readonly string[]): string | null {
  const haystack = text.toLowerCase();
  for (const phrase of phrases) {
    if (phrase && haystack.includes(phrase.toLowerCase())) return phrase;
  }
  return null;
}

type CheckInput = {
  text: string;
  rules: TemplateRules;
  expectedLanguage: string | null;
  reportedLanguage: string | null;
};

/** Checks that apply to a single generated section. */
export function checkSectionText({ text, rules, expectedLanguage, reportedLanguage }: CheckInput): DraftCheckCode[] {
  const codes: DraftCheckCode[] = [];
  if (findUnfilledPlaceholders(text).length > 0) codes.push("PLACEHOLDER");
  if (findForbiddenPhrase(text, rules.forbidden_phrases)) codes.push("FORBIDDEN_PHRASE");
  if (!rules.allow_links && LINK_PATTERN.test(text)) codes.push("LINK");
  if (expectedLanguage && reportedLanguage && !languageMatches(expectedLanguage, reportedLanguage)) {
    codes.push("LANGUAGE");
  }
  return codes;
}

/** Checks that apply to the assembled subject and body. */
export function checkDraft({
  subject,
  body,
  rules,
  expectedLanguage,
  reportedLanguage,
}: Omit<CheckInput, "text"> & { subject: string; body: string }): DraftCheckCode[] {
  const codes = checkSectionText({
    text: `${subject}\n${body}`,
    rules,
    expectedLanguage,
    reportedLanguage,
  });
  if (countWords(body) > rules.max_words) codes.push("TOO_LONG");
  return codes;
}
