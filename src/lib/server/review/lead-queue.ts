import { query } from "@/lib/server/db";

export type LeadQueueStatus = "PENDING" | "REJECTED" | "ALL";

export type LeadQueueFilters = {
  status: LeadQueueStatus;
  agent: string;
  tag: string;
  country: string;
  search: string;
  email: "ALL" | "MISSING";
  returned: boolean;
};

export type LeadQueueRow = {
  id: string;
  domain: string;
  company_name: string | null;
  country: string | null;
  agent_approval: string;
  antispam_tag: string;
  email: string | null;
  human_approval: string;
  human_note: string | null;
  updated_at: string;
  returned_from_drafts: boolean;
  total_count: number;
};

export async function getLeadQueuePage(
  filters: LeadQueueFilters,
  cursor?: { updatedAt: string; id: string },
) {
  return query<LeadQueueRow>(
    `SELECT id, domain, company_name, country, agent_approval, antispam_tag,
            email, human_approval, human_note,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
            EXISTS (
              SELECT 1 FROM audit_log returned
               WHERE returned.entity='lead' AND returned.entity_id=leads.id
                 AND returned.action='LEAD_RETURNED'
                 AND NOT EXISTS (
                   SELECT 1 FROM audit_log later
                    WHERE later.entity='lead' AND later.entity_id=leads.id
                      AND later.action IN ('APPROVE','REJECT','REOPEN','REVOKE')
                      AND later.created_at > returned.created_at
                 )
            ) AS returned_from_drafts,
            count(*) OVER()::int AS total_count
       FROM leads
      WHERE archived=false
        AND (($1='ALL' AND human_approval IN ('PENDING','REJECTED')) OR ($1<>'ALL' AND human_approval=$1))
        AND agent_approval <> 'REJECTED'
        AND ($2='ALL' OR agent_approval=$2)
        AND ($3='ALL' OR antispam_tag=$3)
        AND ($4='' OR country=$4)
        AND ($5='' OR domain ILIKE '%' || $5 || '%' OR company_name ILIKE '%' || $5 || '%')
        AND ($6::timestamptz IS NULL OR updated_at < $6 OR (updated_at=$6 AND id > $7::uuid))
        AND ($8='ALL' OR ($8='MISSING' AND (email IS NULL OR btrim(email)='' OR email<>lower(email)
          OR email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$')))
        AND (NOT $9::boolean OR EXISTS (
          SELECT 1 FROM audit_log returned
           WHERE returned.entity='lead' AND returned.entity_id=leads.id
             AND returned.action='LEAD_RETURNED'
             AND NOT EXISTS (
               SELECT 1 FROM audit_log later
                WHERE later.entity='lead' AND later.entity_id=leads.id
                  AND later.action IN ('APPROVE','REJECT','REOPEN','REVOKE')
                  AND later.created_at > returned.created_at
             )
        ))
      ORDER BY updated_at DESC, id ASC
      LIMIT 26`,
    [
      filters.status,
      filters.agent,
      filters.tag,
      filters.country,
      filters.search,
      cursor?.updatedAt ?? null,
      cursor?.id ?? null,
      filters.email,
      filters.returned,
    ],
  );
}

export async function getLeadQueueCount(): Promise<number> {
  const result = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM leads
      WHERE archived=false AND human_approval='PENDING' AND agent_approval <> 'REJECTED'`,
  );
  return result.rows[0]?.count ?? 0;
}
