"use client";

import { useEffect } from "react";
import type { LeadActivity, LeadDetailData } from "./lead-detail-view";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "—" : dateTimeFormat.format(parsed);
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.5 3.5h-6a1 1 0 0 0-1 1v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
      <path d="M4.5 4.5l7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Row({ label, children, copy }: { label: string; children: React.ReactNode; copy?: string | null }) {
  return (
    <div className="record-row">
      <dt>{label}</dt>
      <dd>
        {children}
        {copy && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={() => void navigator.clipboard?.writeText(copy)}
          >
            <CopyIcon />
          </button>
        )}
      </dd>
    </div>
  );
}

export default function LeadFullData({
  lead,
  activity,
  emailIsValid,
  siteHref,
  contactHref,
  formHref,
  shopifySignal,
  hasNoApp,
  onClose,
}: {
  lead: LeadDetailData;
  activity: LeadActivity[];
  emailIsValid: boolean;
  siteHref: string | null;
  contactHref: string | null;
  formHref: string | null;
  shopifySignal: string | null;
  hasNoApp: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="full-data-title">
        <header className="drawer-head">
          <div>
            <h2 id="full-data-title">{lead.company_name ?? lead.domain}</h2>
            <div className="chips">
              <span className="chip chip-quiet">Read only</span>
              {lead.agent_approval === "VERIFIED" && <span className="badge badge-verified">Verified by agent</span>}
              {!emailIsValid && <span className="badge badge-email-required">Email required</span>}
            </div>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} autoFocus>
            <CrossIcon /> Close <kbd>Esc</kbd>
          </button>
        </header>
        <div className="drawer-body">
          <section className="record-section">
            <h3>Identity</h3>
            <dl className="record-grid">
              <Row label="Domain" copy={lead.domain}>{lead.domain}</Row>
              <Row label="Website" copy={siteHref}>{siteHref ?? lead.site_url ?? "—"}</Row>
              <Row label="Company">{lead.company_name ?? "—"}</Row>
              <Row label="Contact">{lead.contact_name ?? "—"}</Row>
              <Row label="Niche">{lead.niche ?? "—"}</Row>
              <Row label="Found by search">{lead.agent_reason ?? "—"}</Row>
            </dl>
          </section>
          <section className="record-section">
            <h3>Contact</h3>
            <dl className="record-grid">
              <Row label="Email" copy={lead.email}>
                {lead.email ?? <span className="badge badge-email-required">Not set</span>}
              </Row>
              <Row label="Email type">{lead.email_type ?? "Not set"}</Row>
              <Row label="Phone" copy={lead.phone}>{lead.phone ?? "—"}</Row>
              <Row label="Contact page" copy={contactHref}>{contactHref ?? lead.contact_page_url ?? "—"}</Row>
              <Row label="Contact form" copy={formHref}>{formHref ?? lead.contact_form_url ?? "—"}</Row>
            </dl>
          </section>
          <section className="record-section">
            <h3>Location</h3>
            <dl className="record-grid">
              <Row label="Country">
                {lead.country ?? "—"}
                {lead.country_confidence ? ` · confidence ${lead.country_confidence.toLowerCase()}` : ""}
              </Row>
              <Row label="Language">{lead.language ?? "—"}</Row>
              <Row label="Currency">{lead.currency ?? "—"}</Row>
              <Row label="Timezone">{lead.timezone ?? "—"}</Row>
              <Row label="Address">{lead.address ?? "—"}</Row>
            </dl>
          </section>
          <section className="record-section">
            <h3>Compliance</h3>
            <dl className="record-grid">
              <Row label="Screening status">{lead.antispam_tag.replaceAll("_", " ").toLowerCase()}</Row>
              <Row label="Law">{lead.anti_spam_regime ?? "—"}</Row>
              <Row label="Note">{lead.antispam_note ?? "Screening aid, not legal advice"}</Row>
            </dl>
          </section>
          <section className="record-section">
            <h3>Evidence</h3>
            <dl className="record-grid">
              <Row label="Shopify">{shopifySignal ? "Confirmed" : "Not confirmed"}</Row>
              <Row label="Mobile app">{hasNoApp ? "None found" : "Not checked"}</Row>
              <Row label="Confidence">{lead.confidence !== null ? `${lead.confidence} of 10` : "—"}</Row>
              <Row label="Source query">{lead.agent_reason ?? "—"}</Row>
            </dl>
            <details className="raw-json">
              <summary className="text-link">Raw evidence data</summary>
              <pre>{JSON.stringify({ evidence: lead.evidence, app_signals: lead.app_signals, socials: lead.socials }, null, 2)}</pre>
            </details>
          </section>
          <section className="record-section">
            <h3>Review</h3>
            <dl className="record-grid">
              <Row label="Agent verdict">{lead.agent_approval.replaceAll("_", " ").toLowerCase()}</Row>
              <Row label="Agent note">{lead.agent_reason ?? "—"}</Row>
              <Row label="Your decision">{lead.human_approval.replaceAll("_", " ").toLowerCase()}</Row>
              {lead.human_note && <Row label="Reviewer note">{lead.human_note}</Row>}
            </dl>
          </section>
          <section className="record-section">
            <h3>Lifecycle</h3>
            <dl className="record-grid">
              <Row label="Added">{formatDateTime(lead.added_at)}</Row>
              <Row label="Last updated">{formatDateTime(lead.updated_at)}</Row>
              <Row label="Archived">{lead.archived ? "Yes" : "No"}</Row>
            </dl>
          </section>
          <section className="record-section">
            <h3>Activity</h3>
            {activity.length === 0 ? (
              <p className="muted">No recorded activity.</p>
            ) : (
              <ol className="activity">
                {activity.map((item, index) => (
                  <li key={`${item.action}-${item.at}-${index}`}>
                    <strong>{item.name ?? "System"}</strong> {item.action.replaceAll("_", " ").toLowerCase()}
                    <time dateTime={item.at}>{formatDateTime(item.at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
