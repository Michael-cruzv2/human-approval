import "server-only";

import { writeAudit } from "@/lib/server/auth/audit";
import { query, withTransaction } from "@/lib/server/db";
import type { DraftActor, DraftInsertInput, DraftState } from "./generate";
import type { LeadFactsRow } from "./facts";

/** Only these columns ever reach the model path; email and phone are not selected. */
export async function loadGenerationLead(leadId: string): Promise<LeadFactsRow | null> {
  const result = await query<LeadFactsRow>(
    `SELECT id, company_name, contact_name, niche, country, language, evidence
       FROM leads
      WHERE id = $1
        AND human_approval = 'APPROVED'
        AND archived = false
        AND email IS NOT NULL AND email = lower(email)
        AND email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$'`,
    [leadId],
  );
  return result.rows[0] ?? null;
}

export async function loadDraftState(leadId: string): Promise<DraftState> {
  const result = await query<{
    live_exists: boolean;
    max_version: number;
    last_rejected_version: number | null;
    last_rejected_note: string | null;
  }>(
    `SELECT EXISTS(
              SELECT 1 FROM drafts d WHERE d.lead_id = $1 AND d.human_approval <> 'REJECTED'
            ) AS live_exists,
            COALESCE(m.max_version, 0)::int AS max_version,
            last.version AS last_rejected_version,
            last.human_note AS last_rejected_note
       FROM (SELECT max(version) AS max_version FROM drafts WHERE lead_id = $1) m
       LEFT JOIN LATERAL (
            SELECT d.version, d.human_note
              FROM drafts d
             WHERE d.lead_id = $1 AND d.human_approval = 'REJECTED'
             ORDER BY d.version DESC
             LIMIT 1
       ) last ON true`,
    [leadId],
  );
  const row = result.rows[0];
  return {
    liveExists: Boolean(row?.live_exists),
    maxVersion: row?.max_version ?? 0,
    lastRejected:
      row?.last_rejected_version !== null && row?.last_rejected_version !== undefined
        ? { version: row.last_rejected_version, note: row.last_rejected_note }
        : null,
  };
}

export async function isDraftingEnabled(): Promise<boolean> {
  const result = await query<{ value: unknown }>(
    "SELECT value FROM settings WHERE key = 'drafting_enabled'",
  );
  return result.rows[0]?.value === true;
}

/**
 * Inserts one generated version and its audit row in a single transaction.
 * Eligibility and the switch are re-checked here so a queued generation cannot
 * write after the lead moved on. The one-live-draft index is the final guard.
 */
export async function insertGeneratedDraft(
  input: DraftInsertInput,
  actor: DraftActor,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const enabled = await client.query<{ value: unknown }>(
      "SELECT value FROM settings WHERE key = 'drafting_enabled'",
    );
    if (enabled.rows[0]?.value !== true) return false;

    const eligible = await client.query<{ id: string }>(
      `SELECT id FROM leads
        WHERE id = $1
          AND human_approval = 'APPROVED'
          AND archived = false
          AND email IS NOT NULL AND email = lower(email)
          AND email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$'`,
      [input.leadId],
    );
    if (eligible.rowCount !== 1) return false;

    const inserted = await client.query<{ id: string; version: number }>(
      `INSERT INTO drafts (lead_id, version, subject, body_text, ai_opener, template_version, ai_model, generation_note)
       SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3, $4, $5, $6, $7
         FROM drafts
        WHERE lead_id = $1
       ON CONFLICT DO NOTHING
       RETURNING id, version`,
      [
        input.leadId,
        input.subject,
        input.bodyText,
        input.aiOpener,
        input.templateVersion,
        input.aiModel,
        input.generationNote,
      ],
    );
    const draft = inserted.rows[0];
    if (!draft) return false;

    await writeAudit(client, "DRAFT_GENERATE", "draft", draft.id, actor.id, actor.type, {
      lead_id: input.leadId,
      version: draft.version,
      ...(input.regeneratedFrom ? { regenerated_from: input.regeneratedFrom } : {}),
    });
    return true;
  });
}
