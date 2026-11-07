import "server-only";

import { randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/server/auth/audit";
import { withTransaction } from "@/lib/server/db";
import type { ParsedWorkbook } from "./xlsx";

export type CommitImportResult =
  | { kind: "OK"; inserted: number; skipped: number }
  | { kind: "NOT_AUTHORIZED" }
  | { kind: "RATE_LIMITED" };

export async function commitImport(
  userId: string,
  parsed: ParsedWorkbook,
  fileHash: string,
  maxUploadsPerHour: number,
): Promise<CommitImportResult> {
  return withTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE id=$1 AND is_active=true FOR UPDATE",
      [userId],
    );
    if (!user.rows[0]) return { kind: "NOT_AUTHORIZED" };

    const recentImports = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM audit_log
        WHERE actor_type='USER' AND actor_id=$1
          AND entity='import' AND action='IMPORT'
          AND created_at >= now() - interval '1 hour'`,
      [userId],
    );
    if ((recentImports.rows[0]?.count ?? 0) >= maxUploadsPerHour) {
      return { kind: "RATE_LIMITED" };
    }

    let inserted = 0;
    let skipped = 0;
    for (const { lead } of parsed.rows) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO leads (
           domain, site_url, company_name, email, email_type, emails_json,
           phone, phones_json, address, country, country_confidence, language,
           currency, contact_page_url, socials, anti_spam_regime, antispam_tag,
           antispam_note, source_query, found_on, agent_approval, human_approval,
           human_approved_by, human_approved_at, source_run_id, archived, contacted
         )
         VALUES (
           $1, $2, $3, $4, $5, $6::jsonb,
           $7, $8::jsonb, $9, $10, $11, $12,
           $13, $14, $15::jsonb, $16, $17,
           $18, $19, $20, 'NEEDS_REVIEW', 'PENDING',
           NULL, NULL, NULL, false, false
         )
         ON CONFLICT (domain) DO NOTHING
         RETURNING id`,
        [
          lead.domain,
          lead.site_url,
          lead.company_name,
          lead.email,
          lead.email_type,
          JSON.stringify(lead.emails_json),
          lead.phone,
          JSON.stringify(lead.phones_json),
          lead.address,
          lead.country,
          lead.country_confidence,
          lead.language,
          lead.currency,
          lead.contact_page_url,
          JSON.stringify(lead.socials),
          lead.anti_spam_regime,
          lead.antispam_tag,
          lead.antispam_note,
          lead.source_query,
          lead.found_on,
        ],
      );
      if (result.rows[0]) inserted += 1;
      else skipped += 1;
    }

    const importId = randomUUID();
    await writeAudit(client, "IMPORT", "import", importId, userId, "USER", {
      file_sha256: fileHash,
      total_rows: parsed.totalRows,
      inserted,
      skipped,
      invalid: parsed.invalidRows.length,
    });
    return { kind: "OK", inserted, skipped };
  });
}
