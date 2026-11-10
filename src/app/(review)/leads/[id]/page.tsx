import { notFound } from "next/navigation";
import { z } from "zod";
import { query } from "@/lib/server/db";
import LeadDetailView, { type LeadDetailData } from "./lead-detail-view";

export const dynamic = "force-dynamic";

export type LeadActivity = { action: string; at: string; name: string | null };

export async function LeadDetailContent({ id, embedded = false, backHref = "/leads" }: { id: string; embedded?: boolean; backHref?: string }) {
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await query<LeadDetailData>(
    `SELECT id, domain, site_url, company_name, contact_name, email, email_type, phone,
            address, country, country_confidence, language, currency, timezone, niche,
            contact_page_url, contact_form_url, socials, antispam_tag, anti_spam_regime,
            antispam_note, is_shopify, has_mobile_app, app_signals, evidence, confidence,
            agent_approval, agent_reason, human_approval, human_note, archived,
            to_char(added_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS added_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
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
            ) AS returned_from_drafts
       FROM leads WHERE id = $1`, [id],
  );
  const lead = result.rows[0];
  if (!lead) notFound();
  const activity = await query<LeadActivity>(
    `SELECT a.action, to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, u.name
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.entity = 'lead' AND a.entity_id = $1
      ORDER BY a.created_at DESC LIMIT 25`, [id],
  );
  return <LeadDetailView lead={lead} activity={activity.rows} embedded={embedded} backHref={backHref} />;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadDetailContent id={id} />;
}
