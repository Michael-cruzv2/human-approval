"use client";

import Link from "next/link";
import type { JSX, SyntheticEvent } from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isValidReviewEmail } from "@/lib/server/review/email";

import { Spinner } from "@/components/spinner";

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 4.5l7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6.5 3.5h6v6M12.5 3.5 7 9M11 10.5v2h-8v-8h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="m10.2 10.2 2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function safeUrl(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {}
  return undefined;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function validTimezone(value: unknown): boolean {
  return Boolean(value) && typeof value === "string" && /^[A-Za-z_/]+-[A-Za-z_0-9]+/i.test(value);
}

export type LeadActivity = { action: string; at: string; name: string | null };

export type LeadDetailData = {
  id: string;
  domain: string;
  site_url: string | null;
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
  added_at: string;
  updated_at: string;
  returned_from_drafts: boolean;
};

export type LeadDetailViewProps = {
  lead: LeadDetailData;
  activity: { action: string; at: string; name: string | null }[];
  embedded?: boolean;
  backHref?: string;
};

export default function LeadDetailView({ lead, activity, embedded = false, backHref = "/leads" }: LeadDetailViewProps): JSX.Element {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"approve" | "reject" | "revoke" | "reopen" | "archive" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fullData, setFullData] = useState(false);
  const savedValues = {
    company_name: lead.company_name ?? "",
    contact_name: lead.contact_name ?? "",
    email: lead.email ?? "",
    email_type: lead.email_type ?? "",
    phone: lead.phone ?? "",
    address: lead.address ?? "",
    country: lead.country ?? "",
    language: lead.language ?? "",
    timezone: lead.timezone ?? "",
    niche: lead.niche ?? "",
    contact_page_url: lead.contact_page_url ?? "",
    contact_form_url: lead.contact_form_url ?? "",
  };
  const [values, setValues] = useState(savedValues);
  const emailIsValid = isValidReviewEmail(values.email);

  const dirty = JSON.stringify(values) !== JSON.stringify(savedValues);
  const readOnly = lead.archived;
  const canDecide = !readOnly && lead.human_approval === "PENDING" && lead.agent_approval !== "REJECTED";

  const approveBlocked = !emailIsValid || dirty || busy;

  const STEPS = ["Checklist", "Customer details", "Draft review"] as const;
  const currentStep = lead.human_approval === "APPROVED" ? 3 : 2;

  const checklist = [
    { key: "email", state: emailIsValid ? "ok" : "missing", label: "Email present and valid", hint: emailIsValid ? undefined : "Add an email in the details", href: emailIsValid ? undefined : "#lead-email" },
    { key: "country", state: lead.country ? "ok" : "missing", label: "Country known", hint: lead.country ? undefined : "Add a country in the details", href: lead.country ? undefined : "#lead-country" },
    { key: "timezone", state: validTimezone(lead.timezone) ? "ok" : "missing", label: "Timezone valid", hint: validTimezone(lead.timezone) ? undefined : "Add a valid timezone", href: validTimezone(lead.timezone) ? undefined : "#lead-timezone" },
    { key: "tag", state: "unknown", label: "Anti-spam tag allowed", hint: `${lead.antispam_tag.replaceAll("_", " ").toLowerCase()} · screening aid, not legal advice`, href: undefined },
    { key: "agent", state: lead.agent_approval === "VERIFIED" ? "ok" : "missing", label: "Agent verdict verified", hint: lead.agent_approval === "VERIFIED" ? undefined : `Agent verdict is ${lead.agent_approval.replaceAll("_", " ").toLowerCase()}`, href: undefined },
  ] as const;

  const openAction = useCallback((nextAction: NonNullable<typeof action>) => {
    setAction(nextAction);
    setNote("");
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => {
      if ((e.key === "a" && canDecide && !readOnly) || (e.key === "e" && !readOnly && !fullData) || (e.key === "r" && canDecide && !approveBlocked && !readOnly)) {
        if (e.key === "a" && canDecide && !readOnly) { openAction("approve"); e.preventDefault(); }
        if (e.key === "r" && canDecide && !approveBlocked && !readOnly) { openAction("reject"); e.preventDefault(); }
        if (e.key === "e" && !readOnly && !fullData) { setFullData(true); }
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [canDecide, readOnly, fullData, approveBlocked, openAction]);

  async function save(e: SyntheticEvent) {
    e.preventDefault();
    if (!dirty || !canDecide) return;
    setBusy(true);
    setMessage("");

    const form = new FormData();
    for (const key of Object.keys(values)) {
      const k = key as keyof typeof values;
      if (values[k] !== savedValues[k]) form.append(k, values[k]);
    }

    if (lead.human_approval === "APPROVED" && values.email !== lead.email) {
      form.append("email_reset_approval", "true");
    }

    const response = await fetch(`/api/leads/${lead.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", values: Object.fromEntries(form), note: "" }),
    });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(result.message ?? "Could not save changes.");
      return;
    }
    setMessage("Changes saved.");
    setValues(savedValues);
    router.refresh();
  }

  async function confirmAction() {
    if (!action) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/leads/${lead.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? "Could not update this lead.");
        dialogRef.current?.close();
        return;
      }
      if (action === "approve") {
        const separator = backHref.includes("?") ? "&" : "?";
        router.push(`${backHref}${separator}approved=${encodeURIComponent(lead.id)}`);
        return;
      }
      setMessage(action === "revoke" ? "Approval undone." : "Lead updated.");
      setAction(null);
      setNote("");
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setMessage("Could not update this lead.");
    } finally {
      setBusy(false);
    }
  }

  const siteHref = safeUrl(lead.site_url);

  return (
    <>
      <dialog ref={dialogRef} className="confirm-dialog" onCancel={() => { setAction(null); setNote(""); }}>
        <h2>
          {action === "approve" && "Approve this lead?"}
          {action === "reject" && "Reject this lead?"}
          {action === "revoke" && "Revoke approval?"}
          {action === "reopen" && "Reopen this lead?"}
          {action === "archive" && "Archive this lead?"}
        </h2>
        <p>This covers the lead record for {lead.domain}. Approving a lead does not approve an email draft.</p>
        <dl>
          <div><dt>Company</dt><dd>{values.company_name || "—"}</dd></div>
          <div><dt>Email</dt><dd>{values.email || "—"}</dd></div>
          <div><dt>Country</dt><dd>{values.country || "—"}</dd></div>
          <div><dt>Anti-spam</dt><dd>{lead.antispam_tag}</dd></div>
          <div><dt>Note</dt><dd>{note || "—"}</dd></div>
        </dl>
        <div className="dialog-actions">
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setAction(null); setNote(""); }}>
            Cancel
          </button>
          <button className={`btn ${action === "approve" || action === "reject" || action === "archive" ? "btn-leads" : action === "revoke" ? "btn-stop" : "btn-ghost"}${busy ? " busy" : ""}`} type="button" disabled={busy} onClick={confirmAction}>
            {busy ? <><Spinner size="sm" />Processing…</> : (action === "approve" ? "Approve" : action === "reject" ? "Reject" : action === "revoke" ? "Revoke approval" : action === "reopen" ? "Reopen" : action === "archive" ? "Archive" : "OK")}
          </button>
        </div>
        {message && <p className="field-error" role="alert">{message}</p>}
      </dialog>

      <section className={`page-stack lead-detail-content${embedded ? " embedded-detail" : ""}`} aria-busy={false}>
        <header className="detail-head">
          <div>
            {embedded && (
              <Link className="mobile-back-link" href={backHref}>
                ← Leads
              </Link>
            )}
            <h1>{lead.company_name ?? lead.domain}</h1>
            <div className="detail-sub">
              {siteHref ? (
                <a href={siteHref} target="_blank" rel="noopener noreferrer">{lead.domain}</a>
              ) : (
                <span>{lead.domain}</span>
              )}
              {siteHref && <ExternalIcon />}
            </div>
            <div className="detail-chips">
              {lead.agent_approval === "VERIFIED" ? (
                <span className="verified-mark"><CheckIcon />Verified by agent</span>
              ) : (
                <span className="badge badge-needs_review">{lead.agent_approval.replaceAll("_", " ").toLowerCase()}</span>
              )}
              <span className="chip chip-quiet" title="Screening aid only, not legal clearance">
                {lead.antispam_tag.replaceAll("_", " ").toLowerCase()} <span aria-hidden="true">ⓘ</span>
              </span>
              <span className="muted">Added {formatDate(lead.added_at)}</span>
              {!emailIsValid && <span className="badge badge-email-required">Email required</span>}
              {lead.returned_from_drafts && <span className="badge badge-returned">↩ Returned from drafts</span>}
              {readOnly && <span className="badge">Read only</span>}
            </div>
          </div>
          {!readOnly && dirty && (
            <div className="detail-actions">
              <span className="editing-chip">Editing, unsaved changes</span>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setValues(savedValues)}>
                Cancel
              </button>
              <button className={`btn btn-leads${busy ? " busy" : ""}`} type="submit" form="lead-facts-form" disabled={busy}>
                {busy ? <><Spinner size="sm" />Saving…</> : "Save changes"}
              </button>
            </div>
          )}
        </header>

        {lead.returned_from_drafts && lead.human_note && (
          <aside className="notice" role="status">
            <strong>Returned from drafts</strong>
            <p>{lead.human_note}</p>
          </aside>
        )}

        <ol className="pipeline-rail" aria-label="Review progress">
          {STEPS.map((step, index) => (
            <li
              key={step}
              data-complete={index < currentStep}
              data-current={index === currentStep}
              aria-current={index === currentStep ? "step" : undefined}
            >
              <span aria-hidden="true" />
              {step}
            </li>
          ))}
        </ol>

        <div className="detail-grid">
          <div className="page-stack">
            <section className="panel">
              <div className="section-head">
                <h2>Customer details</h2>
                <button type="button" className="text-link" onClick={() => setFullData(true)}>
                  <SearchIcon /> View full data
                </button>
              </div>
              <form id="lead-facts-form" className="lead-form" onSubmit={save} noValidate>
                <div className="row">
                  <label className="field" htmlFor="lead-company_name">
                    Company name
                    <input
                      id="lead-company_name"
                      value={values.company_name}
                      maxLength={500}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, company_name: e.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-contact_name">
                    Contact name
                    <input
                      id="lead-contact_name"
                      value={values.contact_name}
                      maxLength={500}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, contact_name: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="field" htmlFor="lead-email">
                    Email
                    <input
                      id="lead-email"
                      type="email"
                      value={values.email}
                      maxLength={200}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, email: e.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-email_type">
                    Type
                    <input
                      id="lead-email_type"
                      value={values.email_type}
                      maxLength={100}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, email_type: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="field" htmlFor="lead-phone">
                    Phone
                    <input
                      id="lead-phone"
                      value={values.phone}
                      maxLength={100}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, phone: e.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-address">
                    Address
                    <input
                      id="lead-address"
                      value={values.address}
                      maxLength={500}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, address: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="field" htmlFor="lead-country">
                    Country
                    <input
                      id="lead-country"
                      value={values.country}
                      maxLength={2}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, country: e.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-language">
                    Language
                    <input
                      id="lead-language"
                      value={values.language}
                      maxLength={50}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, language: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="field" htmlFor="lead-timezone">
                    Timezone
                    <input
                      id="lead-timezone"
                      value={values.timezone}
                      maxLength={60}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, timezone: e.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-niche">
                    Niche
                    <input
                      id="lead-niche"
                      value={values.niche}
                      maxLength={200}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, niche: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="field" htmlFor="lead-contact_page_url">
                    Contact page URL
                    <input
                      id="lead-contact_page_url"
                      value={values.contact_page_url}
                      maxLength={500}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, contact_page_url: e.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-contact_form_url">
                    Contact form URL
                    <input
                      id="lead-contact_form_url"
                      value={values.contact_form_url}
                      maxLength={500}
                      disabled={readOnly}
                      onChange={(e) => setValues((c) => ({ ...c, contact_form_url: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="action-bar-group">
                  {!emailIsValid && canDecide && (
                    <span className="blocked-reason" id="approve-email-reason">Add an email to approve</span>
                  )}
                  {dirty && canDecide && <span className="blocked-reason">Save changes before deciding</span>}
                  {readOnly && <span className="blocked-reason">Archived</span>}
                  {!readOnly && (
                    <button
                      className={`btn btn-ghost${busy ? " busy" : ""}`}
                      type="button"
                      disabled={busy}
                      onClick={() => openAction("archive")}
                    >
                      {busy ? <><Spinner size="sm" />Archiving…</> : "Archive"}
                    </button>
                  )}
                  {lead.human_approval === "APPROVED" && !readOnly && (
                    <button
                      className={`btn btn-stop${busy ? " busy" : ""}`}
                      type="button"
                      disabled={busy}
                      onClick={() => openAction("revoke")}
                    >
                      {busy ? <><Spinner size="sm" />Revoking…</> : "Revoke approval"}
                    </button>
                  )}
                  {lead.human_approval === "REJECTED" && !readOnly && (
                    <button
                      className={`btn${busy ? " busy" : ""}`}
                      type="button"
                      disabled={busy}
                      onClick={() => openAction("reopen")}
                    >
                      {busy ? <><Spinner size="sm" />Reopening…</> : "Reopen"}
                    </button>
                  )}
                  {canDecide && (
                    <>
                      <button
                        className={`btn btn-stop${busy ? " busy" : ""}`}
                        type="button"
                        disabled={busy || dirty}
                        onClick={() => openAction("reject")}
                      >
                        {busy ? <><Spinner size="sm" />Rejecting…</> : <><CrossIcon /> Reject</>}
                      </button>
                      <button
                        className={`btn ${approveBlocked ? "" : "btn-leads"}${busy ? " busy" : ""}`}
                        type="button"
                        disabled={busy || approveBlocked}
                        aria-describedby={!emailIsValid ? "approve-email-reason" : undefined}
                        onClick={() => openAction("approve")}
                      >
                        {busy ? <><Spinner size="sm" />Approving…</> : <><CheckIcon /> Approve</>}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </section>

            <section className="panel">
              <h2>Checklist</h2>
              {checklist.map((item) => (
                <p key={item.key}>{item.label}{item.state === "ok" ? " – OK" : item.state === "missing" ? ` – Missing: ${item.hint}` : " –"}</p>
              ))}
            </section>

            <section className="panel">
              <h2>Lead activity</h2>
              {activity.length > 0 ? (
                activity.map((a) => <p key={a.at}>{a.at} – {a.name} {a.action}</p>)
              ) : (
                <p>No recent activity.</p>
              )}
            </section>
          </div>

          {!fullData && (
            <div className="detail-sidebar">
              <section className="panel">
                <div>
                  <h3>{lead.domain}</h3>
                  <p>{lead.company_name}</p>
                  <p>{lead.email}</p>
                  <p>{lead.country}</p>
                </div>
              </section>
            </div>
          )}
          {fullData && (
            <div className="detail-sidebar full-data">
              <button type="button" className="text-link" onClick={() => setFullData(false)}>
                Back to summary
              </button>
              <h3>Full data</h3>
              {Object.entries(lead).map(([key, val]) => (
                <div key={key}>
                  <h4>{key}</h4>
                  <pre>{JSON.stringify(val, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
