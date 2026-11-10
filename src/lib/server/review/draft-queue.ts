import { query } from "@/lib/server/db";

export type DraftQueueView = "to-review" | "awaiting-draft" | "approved";

export type DraftQueueRow = {
  id: string;
  lead_id: string;
  draft_id: string | null;
  domain: string;
  company_name: string | null;
  country: string | null;
  email: string;
  version: number | null;
  human_approval: string;
  updated_at: string;
  editor_name: string | null;
  total_count: number;
};

const VALID_EMAIL =
  "l.email IS NOT NULL AND l.email=lower(l.email) AND l.email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$'";

export async function getDraftQueuePage(
  view: DraftQueueView,
  search: string,
  cursor?: { updatedAt: string; id: string },
) {
  if (view === "awaiting-draft") {
    return query<DraftQueueRow>(
      `SELECT l.id, l.id AS lead_id, NULL::uuid AS draft_id, l.domain, l.company_name, l.country, l.email,
              NULL::integer AS version, 'AWAITING_DRAFT' AS human_approval,
              to_char(l.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
              NULL::text AS editor_name, count(*) OVER()::int AS total_count
         FROM leads l
        WHERE l.human_approval='APPROVED' AND l.archived=false AND ${VALID_EMAIL}
          AND NOT EXISTS (SELECT 1 FROM drafts d WHERE d.lead_id=l.id AND d.human_approval <> 'REJECTED')
          AND ($1='' OR l.domain ILIKE '%' || $1 || '%' OR l.company_name ILIKE '%' || $1 || '%')
          AND ($2::timestamptz IS NULL OR l.updated_at < $2 OR (l.updated_at=$2 AND l.id > $3::uuid))
        ORDER BY l.updated_at DESC, l.id ASC LIMIT 26`,
      [search, cursor?.updatedAt ?? null, cursor?.id ?? null],
    );
  }
  const approval = view === "approved" ? "APPROVED" : "PENDING";
  return query<DraftQueueRow>(
    `SELECT d.id, d.lead_id, d.id AS draft_id, l.domain, l.company_name, l.country, l.email, d.version,
            d.human_approval,
            to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
            u.name AS editor_name, count(*) OVER()::int AS total_count
       FROM drafts d JOIN leads l ON l.id=d.lead_id
       LEFT JOIN users u ON u.id=d.last_edited_by
      WHERE d.human_approval=$1 AND l.human_approval='APPROVED' AND l.archived=false AND ${VALID_EMAIL}
        AND ($1='PENDING' OR NOT EXISTS (
          SELECT 1 FROM email_sends s WHERE s.lead_id=l.id AND s.status IN ('SENDING','SENT')
        ))
        AND ($2='' OR l.domain ILIKE '%' || $2 || '%' OR l.company_name ILIKE '%' || $2 || '%')
        AND ($3::timestamptz IS NULL OR d.updated_at < $3 OR (d.updated_at=$3 AND d.id > $4::uuid))
      ORDER BY d.updated_at DESC, d.id ASC LIMIT 26`,
    [approval, search, cursor?.updatedAt ?? null, cursor?.id ?? null],
  );
}

export async function getDraftQueueCounts(): Promise<
  Record<DraftQueueView, number>
> {
  const result = await query<{
    to_review: number;
    awaiting_draft: number;
    approved: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM drafts d JOIN leads l ON l.id=d.lead_id
         WHERE d.human_approval='PENDING' AND l.human_approval='APPROVED' AND l.archived=false AND ${VALID_EMAIL}) AS to_review,
       (SELECT count(*)::int FROM leads l
         WHERE l.human_approval='APPROVED' AND l.archived=false AND ${VALID_EMAIL}
           AND NOT EXISTS (SELECT 1 FROM drafts d WHERE d.lead_id=l.id AND d.human_approval <> 'REJECTED')) AS awaiting_draft,
       (SELECT count(*)::int FROM drafts d JOIN leads l ON l.id=d.lead_id
         WHERE d.human_approval='APPROVED' AND l.human_approval='APPROVED' AND l.archived=false AND ${VALID_EMAIL}
           AND NOT EXISTS (SELECT 1 FROM email_sends s WHERE s.lead_id=l.id AND s.status IN ('SENDING','SENT'))) AS approved`,
  );
  const counts = result.rows[0];
  return {
    "to-review": counts.to_review,
    "awaiting-draft": counts.awaiting_draft,
    approved: counts.approved,
  };
}
