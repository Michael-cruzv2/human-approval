import { notFound } from "next/navigation";
import { query } from "@/lib/server/db";
import LeadControls from "./lead-controls";
import { z } from "zod";
import { isValidReviewEmail } from "@/lib/server/review/email";

export const dynamic = "force-dynamic";

type LeadDetail = {
  id: string; domain: string; site_url: string; company_name: string | null; contact_name: string | null;
  email: string | null; email_type: string | null; phone: string | null; address: string | null;
  country: string | null; country_confidence: string | null; language: string | null; currency: string | null;
  timezone: string | null; niche: string | null; contact_page_url: string | null; contact_form_url: string | null;
  socials: unknown; antispam_tag: string; anti_spam_regime: string | null; antispam_note: string | null;
  is_shopify: boolean | null; has_mobile_app: boolean | null; app_signals: unknown; evidence: unknown;
  confidence: number | null; agent_approval: string; agent_reason: string | null; human_approval: string;
  human_note: string | null; archived: boolean; added_at: Date;
  returned_from_drafts: boolean;
};

function normalizeSafeUrl(href: string | null): string | null {
  if (!href) return null;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function SafeLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const safeUrl = normalizeSafeUrl(href);
  if (!safeUrl) return <span>{href ?? "—"}</span>;
  return <a href={safeUrl} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="fact"><dt>{label}</dt><dd>{value ?? "—"}</dd></div>;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await query<LeadDetail>(
    `SELECT id, domain, site_url, company_name, contact_name, email, email_type, phone,
            address, country, country_confidence, language, currency, timezone, niche,
            contact_page_url, contact_form_url, socials, antispam_tag, anti_spam_regime,
            antispam_note, is_shopify, has_mobile_app, app_signals, evidence, confidence,
            agent_approval, agent_reason, human_approval, human_note, archived, added_at,
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
  const evidence = typeof lead.evidence === "object" && lead.evidence !== null ? lead.evidence as Record<string, unknown> : {};
  return (
    <section className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Lead detail</p><h1>{lead.company_name ?? lead.domain}</h1>{!isValidReviewEmail(lead.email) && <span className="badge badge-email-required">Email required</span>}{lead.returned_from_drafts && <span className="badge badge-returned">Returned from drafts</span>}</div><span>{lead.human_approval}</span></header>
      {lead.returned_from_drafts && lead.human_note && <aside className="notice"><strong>Returned from drafts</strong><p>{lead.human_note}</p></aside>}
      {lead.agent_approval === "NEEDS_REVIEW" && <aside className="notice"><strong>Agent verification needs review.</strong><p>{lead.agent_reason ?? "No reason provided."}</p><p>Not sendable until the agent verdict is VERIFIED. Screening is a review aid, not legal clearance.</p></aside>}
      <section className="panel"><h2>Lead facts</h2><dl className="facts-grid">
        <Fact label="Domain" value={lead.domain} /><Fact label="Website" value={<SafeLink href={lead.site_url}>{lead.site_url}</SafeLink>} />
        <Fact label="Contact email" value={lead.email ?? "No email address"} /><Fact label="Address" value={lead.address} /><Fact label="Country" value={lead.country} />
        <Fact label="Country confidence" value={lead.country_confidence} /><Fact label="Language" value={lead.language} /><Fact label="Currency" value={lead.currency} />
        <Fact label="Timezone" value={lead.timezone} /><Fact label="Niche" value={lead.niche} /><Fact label="Agent verdict" value={lead.agent_approval} />
        <Fact label="Agent reason" value={lead.agent_reason} /><Fact label="Screening tag" value={<><span className="badge">{lead.antispam_tag}</span> <small>Screening aid only; not legal advice.</small></>} />
        <Fact label="Anti-spam regime" value={lead.anti_spam_regime} /><Fact label="Screening note" value={lead.antispam_note} />
        <Fact label="Shopify" value={lead.is_shopify === null ? "—" : String(lead.is_shopify)} /><Fact label="Mobile app" value={lead.has_mobile_app === null ? "—" : String(lead.has_mobile_app)} />
        <Fact label="Confidence" value={lead.confidence} /><Fact label="Contact page" value={<SafeLink href={lead.contact_page_url}>{lead.contact_page_url}</SafeLink>} />
        <Fact label="Contact form" value={<SafeLink href={lead.contact_form_url}>{lead.contact_form_url}</SafeLink>} />
        <Fact label="Human note" value={lead.human_note} />
      </dl></section>
      <section className="panel"><h2>Evidence</h2><div className="evidence-grid"><div><h3>Shopify</h3><pre>{JSON.stringify(evidence.shopify ?? null, null, 2)}</pre></div><div><h3>No app</h3><pre>{JSON.stringify(evidence.no_app ?? null, null, 2)}</pre></div></div>
        <details><summary>Additional signals and social links</summary><pre>{JSON.stringify({ app_signals: lead.app_signals, socials: lead.socials }, null, 2)}</pre></details>
      </section>
      <LeadControls lead={lead} />
    </section>
  );
}
