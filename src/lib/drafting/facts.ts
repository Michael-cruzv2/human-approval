import type { LeadFacts } from "./template";

/**
 * The model may only ever see stored lead facts (R31). This module builds that
 * input from an explicit column list; email and phone are never selected.
 */

export type LeadFactsRow = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  niche: string | null;
  country: string | null;
  language: string | null;
  evidence: unknown;
};

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;
const MAX_SNIPPET_CHARS = 200;
const MAX_SNIPPETS = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrub(text: string): string {
  return text.replace(EMAIL_PATTERN, "[redacted]").replace(PHONE_PATTERN, "[redacted]");
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Evidence snippets only: capped length, deduplicated, and contact details scrubbed. */
export function readEvidenceSnippets(evidence: unknown): string[] {
  if (!isRecord(evidence)) return [];
  const candidates: Array<string | null> = [];
  for (const key of ["shopify", "no_app"] as const) {
    const block = evidence[key];
    if (!isRecord(block)) continue;
    candidates.push(readText(block.signal), readText(block.url));
    if (key === "no_app" && typeof block.pages_checked === "number") {
      candidates.push(`${block.pages_checked} pages checked`);
    }
  }
  if (Array.isArray(evidence.snippets)) {
    for (const snippet of evidence.snippets) candidates.push(readText(snippet));
  }

  const snippets: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const clean = scrub(candidate).slice(0, MAX_SNIPPET_CHARS);
    if (!snippets.includes(clean)) snippets.push(clean);
    if (snippets.length >= MAX_SNIPPETS) break;
  }
  return snippets;
}

export function buildLeadFacts(row: LeadFactsRow): LeadFacts {
  return {
    company_name: row.company_name,
    contact_name: row.contact_name,
    niche: row.niche,
    country: row.country,
    language: row.language,
    evidence_snippets: readEvidenceSnippets(row.evidence),
  };
}
