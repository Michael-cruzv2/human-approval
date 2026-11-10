import { query } from "@/lib/server/db";

export type AllQueueFilters = {
  status: "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED";
  agent: "ALL" | "VERIFIED" | "NEEDS_REVIEW" | "REJECTED";
  country: string;
  tag: string;
  email: "ALL" | "YES" | "NO";
  draft: "ALL" | "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  search: string;
};

export type AllQueueRow = {
  id: string;
  domain: string;
  company_name: string | null;
  country: string | null;
  agent_approval: string;
  lead_status: string;
  email_present: boolean;
  draft_status: string;
  send_status: string;
  updated_at: string;
  draft_id: string | null;
  total_count: number;
};

export async function getAllQueuePage(
  filters: AllQueueFilters,
  cursor?: { updatedAt: string; id: string },
) {
  return query<AllQueueRow>(
    `SELECT l.id, l.domain, l.company_name, l.country, l.agent_approval,
            CASE WHEN l.archived THEN 'ARCHIVED' ELSE l.human_approval END AS lead_status,
            (l.email IS NOT NULL AND btrim(l.email) <> '') AS email_present,
            CASE
              WHEN EXISTS (SELECT 1 FROM drafts dp WHERE dp.lead_id=l.id AND dp.human_approval='PENDING') THEN 'PENDING'
              WHEN EXISTS (SELECT 1 FROM drafts da WHERE da.lead_id=l.id AND da.human_approval='APPROVED') THEN 'APPROVED'
              WHEN EXISTS (SELECT 1 FROM drafts dr WHERE dr.lead_id=l.id AND dr.human_approval='REJECTED') THEN 'REJECTED'
              ELSE 'NONE'
            END AS draft_status,
            COALESCE((SELECT es.status FROM email_sends es WHERE es.lead_id=l.id), 'NONE') AS send_status,
            to_char(l.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
            (SELECT d.id FROM drafts d WHERE d.lead_id=l.id AND d.human_approval <> 'REJECTED' ORDER BY d.version DESC LIMIT 1) AS draft_id,
            count(*) OVER()::int AS total_count
       FROM leads l
      WHERE ($1='ALL' OR ($1='ARCHIVED' AND l.archived=true)
        OR ($1<>'ARCHIVED' AND l.archived=false AND l.human_approval=$1))
        AND ($2='ALL' OR l.agent_approval=$2)
        AND ($3='' OR l.country=$3)
        AND ($4='ALL' OR l.antispam_tag=$4)
        AND ($5='ALL'
          OR ($5='YES' AND l.email IS NOT NULL AND btrim(l.email) <> '')
          OR ($5='NO' AND (l.email IS NULL OR btrim(l.email) = '')))
        AND ($6='ALL'
          OR ($6='NONE' AND NOT EXISTS (SELECT 1 FROM drafts dn WHERE dn.lead_id=l.id))
          OR ($6='PENDING' AND EXISTS (SELECT 1 FROM drafts dp WHERE dp.lead_id=l.id AND dp.human_approval='PENDING'))
          OR ($6='APPROVED' AND EXISTS (SELECT 1 FROM drafts da WHERE da.lead_id=l.id AND da.human_approval='APPROVED'))
          OR ($6='REJECTED' AND EXISTS (SELECT 1 FROM drafts dr WHERE dr.lead_id=l.id AND dr.human_approval='REJECTED')
              AND NOT EXISTS (SELECT 1 FROM drafts dl WHERE dl.lead_id=l.id AND dl.human_approval<>'REJECTED')))
        AND ($7='' OR l.domain ILIKE '%' || $7 || '%' OR l.company_name ILIKE '%' || $7 || '%')
        AND ($8::timestamptz IS NULL OR l.updated_at < $8 OR (l.updated_at=$8 AND l.id > $9::uuid))
      ORDER BY l.updated_at DESC, l.id ASC
      LIMIT 26`,
    [
      filters.status,
      filters.agent,
      filters.country,
      filters.tag,
      filters.email,
      filters.draft,
      filters.search,
      cursor?.updatedAt ?? null,
      cursor?.id ?? null,
    ],
  );
}
