import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { query } from "@/lib/server/db";
import StructuredData from "./structured-data";

export const dynamic = "force-dynamic";

type Lead = {
  id: string;
  domain: string;
  site_url: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  email_type: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  country_confidence: string | null;
  language: string | null;
  currency: string | null;
  timezone: string | null;
  niche: string | null;
  contact_page_url: string | null;
  contact_form_url: string | null;
  socials: unknown;
  antispam_tag: string;
  anti_spam_regime: string | null;
  antispam_note: string | null;
  is_shopify: boolean | null;
  has_mobile_app: boolean | null;
  app_signals: unknown;
  evidence: unknown;
  confidence: number | null;
  agent_approval: string;
  agent_reason: string | null;
  human_approval: string;
  human_note: string | null;
  archived: boolean;
  added_at: Date;
  updated_at: Date;
  email_send_status: string | null;
  draft_status: string;
  draft_id: string | null;
};
type Audit = {
  action: string;
  created_at: Date;
  name: string | null;
  details: unknown;
};

function isSafeUrl(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export default async function AllLeadDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { back } = await searchParams;
  const backHref = back?.startsWith("/all?") ? back : "/all";
  const result = await query<Lead>(
    `SELECT l.id, l.domain, l.site_url, l.company_name, l.contact_name, l.email, l.email_type, l.phone,
            l.address, l.country, l.country_confidence, l.language, l.currency, l.timezone, l.niche,
            l.contact_page_url, l.contact_form_url, l.socials, l.antispam_tag, l.anti_spam_regime,
            l.antispam_note, l.is_shopify, l.has_mobile_app, l.app_signals, l.evidence, l.confidence,
            l.agent_approval, l.agent_reason, l.human_approval, l.human_note, l.archived, l.added_at, l.updated_at,
            (SELECT s.status FROM email_sends s WHERE s.lead_id=l.id) AS email_send_status,
            CASE WHEN EXISTS(SELECT 1 FROM drafts d WHERE d.lead_id=l.id AND d.human_approval='PENDING') THEN 'PENDING'
                 WHEN EXISTS(SELECT 1 FROM drafts d WHERE d.lead_id=l.id AND d.human_approval='APPROVED') THEN 'APPROVED'
                 WHEN EXISTS(SELECT 1 FROM drafts d WHERE d.lead_id=l.id AND d.human_approval='REJECTED') THEN 'REJECTED'
                 ELSE 'NONE' END AS draft_status,
            (SELECT d.id FROM drafts d WHERE d.lead_id=l.id AND d.human_approval<>'REJECTED' ORDER BY d.version DESC LIMIT 1) AS draft_id
       FROM leads l WHERE l.id=$1`,
    [id],
  );
  const lead = result.rows[0];
  if (!lead) notFound();
  const audit = await query<Audit>(
    `SELECT a.action, a.created_at, u.name, a.details
       FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
      WHERE a.entity='lead' AND a.entity_id=$1
      ORDER BY a.created_at DESC LIMIT 50`,
    [id],
  );
  const siteHref = isSafeUrl(lead.site_url);
  const contactHref = isSafeUrl(lead.contact_page_url);
  const formHref = isSafeUrl(lead.contact_form_url);
  const isPendingOrRejected =
    !lead.archived &&
    (lead.human_approval === "PENDING" || lead.human_approval === "REJECTED");
  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">All · read only</p>
          <h1>{lead.company_name ?? lead.domain}</h1>
        </div>
        <Link scroll={false} href={backHref}>
          Back to All
        </Link>
      </header>
      <div className="action-row">
        {isPendingOrRejected && (
          <a className="text-link-button" href={`/leads/${lead.id}`}>
            Open in Leads
          </a>
        )}
        {!lead.archived &&
          lead.human_approval === "APPROVED" &&
          (lead.draft_id ? (
            <a
              className="text-link-button"
              href={`/drafts/${lead.draft_id}`}
            >
              Open in Drafts
            </a>
          ) : (
            <a
              className="text-link-button"
              href="/drafts?view=awaiting-draft"
            >
              Open in Drafts
            </a>
          ))}
      </div>
      <section className="panel">
        <h2>Identity</h2>
        <dl className="facts-grid">
          <div className="fact">
            <dt>Domain</dt>
            <dd>{lead.domain}</dd>
          </div>
          <div className="fact">
            <dt>Company</dt>
            <dd>{lead.company_name ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Website</dt>
            <dd>
              {siteHref ? (
                <a href={siteHref} target="_blank" rel="noopener noreferrer">
                  {lead.site_url}
                </a>
              ) : (
                lead.site_url
              )}
            </dd>
          </div>
          <div className="fact">
            <dt>Agent verdict</dt>
            <dd>{lead.agent_approval}</dd>
          </div>
          <div className="fact">
            <dt>Agent reason</dt>
            <dd>{lead.agent_reason ?? "—"}</dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2>Contact</h2>
        <dl className="facts-grid">
          <div className="fact">
            <dt>Contact name</dt>
            <dd>{lead.contact_name ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Email</dt>
            <dd>{lead.email ?? "No email address"}</dd>
          </div>
          <div className="fact">
            <dt>Email type</dt>
            <dd>{lead.email_type ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Phone</dt>
            <dd>{lead.phone ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Contact page</dt>
            <dd>
              {contactHref ? (
                <a href={contactHref} target="_blank" rel="noopener noreferrer">
                  {lead.contact_page_url}
                </a>
              ) : (
                (lead.contact_page_url ?? "—")
              )}
            </dd>
          </div>
          <div className="fact">
            <dt>Contact form</dt>
            <dd>
              {formHref ? (
                <a href={formHref} target="_blank" rel="noopener noreferrer">
                  {lead.contact_form_url}
                </a>
              ) : (
                (lead.contact_form_url ?? "—")
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2>Location and business</h2>
        <dl className="facts-grid">
          <div className="fact">
            <dt>Address</dt>
            <dd>{lead.address ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Country</dt>
            <dd>{lead.country ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Country confidence</dt>
            <dd>{lead.country_confidence ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Language</dt>
            <dd>{lead.language ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Currency</dt>
            <dd>{lead.currency ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Timezone</dt>
            <dd>{lead.timezone ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Niche</dt>
            <dd>{lead.niche ?? "—"}</dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2>Compliance</h2>
        <dl className="facts-grid">
          <div className="fact">
            <dt>Anti-spam tag</dt>
            <dd>
              <span
                className="badge"
                title="Screening aid only; not legal clearance"
              >
                {lead.antispam_tag}
              </span>{" "}
              Screening aid only; not legal advice.
            </dd>
          </div>
          <div className="fact">
            <dt>Regime</dt>
            <dd>{lead.anti_spam_regime ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Screening note</dt>
            <dd>{lead.antispam_note ?? "—"}</dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2>Lifecycle</h2>
        <dl className="facts-grid">
          <div className="fact">
            <dt>Lead status</dt>
            <dd>{lead.archived ? "ARCHIVED" : lead.human_approval}</dd>
          </div>
          <div className="fact">
            <dt>Draft status</dt>
            <dd>{lead.draft_status}</dd>
          </div>
          <div className="fact">
            <dt>Send status</dt>
            <dd>{lead.email_send_status ?? "NONE"}</dd>
          </div>
          <div className="fact">
            <dt>Human note</dt>
            <dd>{lead.human_note ?? "—"}</dd>
          </div>
          <div className="fact">
            <dt>Added</dt>
            <dd>{lead.added_at.toISOString()}</dd>
          </div>
          <div className="fact">
            <dt>Last updated</dt>
            <dd>{lead.updated_at.toISOString()}</dd>
          </div>
          <div className="fact">
            <dt>Shopify</dt>
            <dd>{lead.is_shopify === null ? "—" : String(lead.is_shopify)}</dd>
          </div>
          <div className="fact">
            <dt>Mobile app</dt>
            <dd>
              {lead.has_mobile_app === null ? "—" : String(lead.has_mobile_app)}
            </dd>
          </div>
          <div className="fact">
            <dt>Confidence</dt>
            <dd>{lead.confidence ?? "—"}</dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2>Evidence and signals</h2>
        <StructuredData
          value={{
            evidence: lead.evidence,
            app_signals: lead.app_signals,
            socials: lead.socials,
          }}
        />
      </section>
      <section className="panel">
        <h2>Lead audit timeline</h2>
        {audit.rows.length === 0 ? (
          <p>No audit activity.</p>
        ) : (
          <ol className="audit-timeline">
            {audit.rows.map((item, index) => (
              <li
                key={`${item.action}-${item.created_at.toISOString()}-${index}`}
              >
                <strong>{item.action}</strong> · {item.name ?? "System"} ·{" "}
                <time dateTime={item.created_at.toISOString()}>
                  {item.created_at.toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
