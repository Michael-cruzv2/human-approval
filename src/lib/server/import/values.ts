export const IMPORT_HEADERS = [
  "domain",
  "website_url",
  "company_name",
  "emails",
  "email_types",
  "phones",
  "address",
  "country",
  "country_confidence",
  "language",
  "currency",
  "contact_page_url",
  "socials",
  "shopify_evidence",
  "no_app_evidence",
  "anti_spam_regime",
  "screening_status",
  "screening_notes",
  "source_query",
  "found_on",
  "review_reasons",
  "status",
  "human_check",
  "run_id",
  "created_at",
  "lead_id",
  "exported_at",
] as const;

const ISO_ALPHA2_CODES = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  ),
);

const SCREENING_TAGS = new Set([
  "OPT_OUT_REGIME",
  "CONDITIONAL",
  "CONSENT_REQUIRED",
  "VARIES_REVIEW",
  "UNKNOWN_REVIEW",
]);

export type ImportedLead = {
  domain: string;
  site_url: string;
  company_name: string | null;
  email: string | null;
  email_type: string | null;
  emails_json: { address: string; type: string | null }[];
  phone: string | null;
  phones_json: string[];
  address: string | null;
  country: string | null;
  country_confidence: string | null;
  language: string | null;
  currency: string | null;
  contact_page_url: string | null;
  socials: Record<string, string>;
  anti_spam_regime: string | null;
  antispam_tag: string;
  antispam_note: string | null;
  source_query: string | null;
  found_on: string | null;
};

export type ImportRowError = {
  rowNumber: number;
  domain: string | null;
  reason:
    | "MISSING_DOMAIN"
    | "BAD_DOMAIN"
    | "MISSING_WEBSITE_URL"
    | "BAD_WEBSITE_URL"
    | "BAD_EMAIL"
    | "BAD_COUNTRY"
    | "PHONE_TOO_LONG";
};

export type ParsedImportRow = {
  rowNumber: number;
  lead: ImportedLead;
};

export function rawCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value.map(rawCellText).filter(Boolean).join("; ");
  if (typeof value !== "object") return "";

  if ("formula" in value && typeof value.formula === "string")
    return `=${value.formula}`;
  if ("sharedFormula" in value && typeof value.sharedFormula === "string")
    return `=${value.sharedFormula}`;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText
      .map((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }
        return "";
      })
      .join("");
  }
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("error" in value && typeof value.error === "string") return value.error;
  return "";
}

export function sanitizeCellText(value: unknown, maxChars = 2000): string {
  const raw = rawCellText(value);
  const mustPrefix = /^[=+\-@\t\r]/.test(raw);
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const safe = mustPrefix || /^[=+\-@]/.test(text) ? `'${text}` : text;
  return Array.from(safe).slice(0, maxChars).join("");
}

export function splitList(value: string): string[] {
  return value
    .split(";")
    .map((item) => sanitizeCellText(item))
    .filter(Boolean);
}

export function normalizeDomain(value: string): string | null {
  const input = value.trim().toLowerCase();
  if (!input) return null;

  let url: URL;
  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input))
      return null;
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;
  const domain = url.hostname.toLowerCase().replace(/^www\./, "");
  if (domain.startsWith("[") || domain.includes(":") || isIpv4(domain))
    return null;
  if (domain === "localhost" || domain.endsWith(".localhost")) return null;
  if (domain === "myshopify.com" || domain.endsWith(".myshopify.com"))
    return null;
  if (domain.length > 253 || !domain.includes(".")) return null;

  const labels = domain.split(".");
  if (
    labels.some(
      (label) =>
        !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(label) || label.length > 63,
    )
  ) {
    return null;
  }
  const topLevelDomain = labels.at(-1)!;
  if (
    topLevelDomain.length < 2 ||
    (!/^[a-z]{2,}$/.test(topLevelDomain) &&
      !/^xn--[a-z\d-]+$/.test(topLevelDomain))
  ) {
    return null;
  }
  return domain;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const number = Number(part);
      return number >= 0 && number <= 255;
    })
  );
}

function normalizeWebsiteUrl(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:\/\//i.test(input))
      return null;
    const url = new URL(
      /^https?:\/\//i.test(input) ? input : `https://${input}`,
    );
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function nullable(value: string): string | null {
  return value || null;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/i.test(
    value,
  );
}

export function parseImportRow(
  rowNumber: number,
  cells: Record<string, string>,
): { row?: ParsedImportRow; error?: ImportRowError } {
  const rawDomain = cells.domain ?? "";
  const displayDomain = rawDomain || null;
  const domain = normalizeDomain(rawDomain);
  if (!rawDomain)
    return { error: { rowNumber, domain: null, reason: "MISSING_DOMAIN" } };
  if (!domain)
    return {
      error: { rowNumber, domain: displayDomain, reason: "BAD_DOMAIN" },
    };

  const websiteUrl = normalizeWebsiteUrl(cells.website_url ?? "");
  if (!cells.website_url)
    return { error: { rowNumber, domain, reason: "MISSING_WEBSITE_URL" } };
  if (!websiteUrl)
    return { error: { rowNumber, domain, reason: "BAD_WEBSITE_URL" } };

  const emailCells = splitList(cells.emails ?? "");
  const typeCells = splitList(cells.email_types ?? "");
  const validEmails = emailCells.flatMap((address, index) => {
    const normalized = sanitizeCellText(address, 320).toLowerCase();
    return isEmail(normalized)
      ? [
          {
            address: normalized,
            type: typeCells[index]
              ? sanitizeCellText(typeCells[index], 100)
              : null,
          },
        ]
      : [];
  });
  if (emailCells.length > 0 && validEmails.length === 0) {
    return { error: { rowNumber, domain, reason: "BAD_EMAIL" } };
  }

  const phoneCells = splitList(cells.phones ?? "");
  if (phoneCells.some((phone) => Array.from(phone).length > 40)) {
    return { error: { rowNumber, domain, reason: "PHONE_TOO_LONG" } };
  }

  const rawCountry = (cells.country ?? "").trim().toUpperCase();
  if (rawCountry && !ISO_ALPHA2_CODES.has(rawCountry)) {
    return { error: { rowNumber, domain, reason: "BAD_COUNTRY" } };
  }

  const screening = (
    cells.screening_status ||
    cells.antispam_tag ||
    ""
  ).toUpperCase();
  const antispamTag = SCREENING_TAGS.has(screening)
    ? screening
    : "UNKNOWN_REVIEW";
  const socials: Record<string, string> = cells.socials
    ? { raw: cells.socials }
    : {};

  return {
    row: {
      rowNumber,
      lead: {
        domain,
        site_url: websiteUrl,
        company_name: nullable(cells.company_name ?? ""),
        email: validEmails[0]?.address ?? null,
        email_type: validEmails[0]?.type ?? null,
        emails_json: validEmails,
        phone: phoneCells[0] ?? null,
        phones_json: phoneCells,
        address: nullable(cells.address ?? ""),
        country: rawCountry || null,
        country_confidence: nullable(cells.country_confidence ?? ""),
        language: nullable(cells.language ?? ""),
        currency: nullable(cells.currency ?? ""),
        contact_page_url: nullable(cells.contact_page_url ?? ""),
        socials,
        anti_spam_regime: nullable(cells.anti_spam_regime ?? ""),
        antispam_tag: antispamTag,
        antispam_note: nullable(cells.screening_notes ?? ""),
        source_query: nullable(cells.source_query ?? ""),
        found_on: nullable(cells.found_on ?? ""),
      },
    },
  };
}
