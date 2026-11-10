"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import LeadFullData from "./lead-full-data";

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

const fields = [
  "company_name",
  "contact_name",
  "email",
  "email_type",
  "phone",
  "country",
  "language",
  "timezone",
  "niche",
] as const;
type Field = (typeof fields)[number];

function getValues(lead: LeadDetailData): Record<Field, string> {
  return {
    company_name: lead.company_name ?? "",
    contact_name: lead.contact_name ?? "",
    email: lead.email ?? "",
    email_type: lead.email_type ?? "",
    phone: lead.phone ?? "",
    country: lead.country ?? "",
    language: lead.language ?? "",
    timezone: lead.timezone ?? "",
    niche: lead.niche ?? "",
  };
}

function validEmail(value: string | null): boolean {
  return Boolean(
    value &&
      value === value.toLowerCase() &&
      /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value),
  );
}

function validTimezone(value: string | null): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function safeUrl(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "—" : dateFormat.format(parsed);
}

function label(field: Field): string {
  return field === "email_type" ? "Email type" : field.replaceAll("_", " ");
}

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

function DotIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.6 2" />
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

const STEPS = ["Found", "Agent checked", "Your approval", "Draft written", "Draft reviewed", "Sent"];

export default function LeadDetailView({
  lead,
  activity,
  embedded = false,
  backHref = "/leads",
}: {
  lead: LeadDetailData;
  activity: LeadActivity[];
  embedded?: boolean;
  backHref?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<Field, string>>(() => getValues(lead));
  const [savedValues, setSavedValues] = useState<Record<Field, string>>(() => getValues(lead));
  const [action, setAction] = useState<"approve" | "reject" | "revoke" | "reopen" | "archive" | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fullData, setFullData] = useState(false);

  const dirty = fields.some((field) => values[field] !== savedValues[field]);
  const emailIsValid = validEmail(values.email.trim().toLowerCase());
  const changesEmail = values.email.trim().toLowerCase() !== (lead.email ?? "").toLowerCase();
  const readOnly = lead.archived;
  const canDecide = !readOnly && lead.human_approval === "PENDING" && lead.agent_approval !== "REJECTED";
  const approveBlocked = !emailIsValid || dirty;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (dialogRef.current?.open || fullData) {
        if (event.key === "Escape" && fullData) setFullData(false);
        return;
      }
      if (event.key === "e" && !readOnly) {
        event.preventDefault();
        document.getElementById("lead-company_name")?.focus();
      }
      if (event.key === "f") {
        event.preventDefault();
        setFullData((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullData, readOnly]);

  useEffect(() => {
    if (!fullData) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullData]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const body = Object.fromEntries(
      fields.map((field) => {
        const value = values[field].trim();
        const normalized = field === "email" ? value.toLowerCase() : field === "country" ? value.toUpperCase() : value;
        return [field, normalized === "" ? null : normalized];
      }),
    );
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { message?: string; approvalReset?: boolean };
      if (!response.ok) {
        setMessage(result.message ?? "Could not save lead changes.");
        return;
      }
      const normalizedValues = Object.fromEntries(
        fields.map((field) => [field, (body[field] as string | null) ?? ""]),
      ) as Record<Field, string>;
      setValues(normalizedValues);
      setSavedValues(normalizedValues);
      setMessage(result.approvalReset ? "Saved. Changing the email reset this lead to Pending." : "Lead details saved.");
      router.refresh();
    } catch {
      setMessage("Could not save lead changes.");
    } finally {
      setBusy(false);
    }
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

  function openAction(nextAction: NonNullable<typeof action>) {
    setAction(nextAction);
    setNote("");
    dialogRef.current?.showModal();
  }

  const evidence = isRecord(lead.evidence) ? lead.evidence : {};
  const shopify = isRecord(evidence.shopify) ? evidence.shopify : null;
  const noApp = isRecord(evidence.no_app) ? evidence.no_app : null;
  const shopifySignal = text(shopify?.signal) ?? text(shopify?.url);
  const noAppDetail = text(noApp?.pages_checked)
    ? `${noApp?.pages_checked} pages checked`
    : text(noApp?.signal);

  const siteHref = safeUrl(lead.site_url);
  const contactHref = safeUrl(lead.contact_page_url);
  const formHref = safeUrl(lead.contact_form_url);

  const currentStep = lead.human_approval === "APPROVED" ? 3 : 2;

  const checklist = [
    {
      key: "email",
      state: emailIsValid ? "ok" : "missing",
      label: "Email present and valid",
      hint: emailIsValid ? undefined : "Add an email in the details",
      href: emailIsValid ? undefined : "#lead-email",
    },
    { key: "country", state: lead.country ? "ok" : "missing", label: "Country known", hint: lead.country ? undefined : "Add a country in the details", href: lead.country ? undefined : "#lead-country" },
    { key: "timezone", state: validTimezone(lead.timezone) ? "ok" : "missing", label: "Timezone valid", hint: validTimezone(lead.timezone) ? undefined : "Add a valid timezone", href: validTimezone(lead.timezone) ? undefined : "#lead-timezone" },
    { key: "tag", state: "unknown", label: "Anti-spam tag allowed", hint: `${lead.antispam_tag.replaceAll("_", " ").toLowerCase()} · screening aid, not legal advice`, href: undefined },
    { key: "agent", state: lead.agent_approval === "VERIFIED" ? "ok" : "missing", label: "Agent verdict verified", hint: lead.agent_approval === "VERIFIED" ? undefined : `Agent verdict is ${lead.agent_approval.replaceAll("_", " ").toLowerCase()}`, href: undefined },
  ] as const;

  return (
    <>
      <section className={`page-stack lead-detail-content${embedded ? " embedded-detail" : ""}`}>
        <header className="detail-head">
          <div>
            {embedded && <Link className="mobile-back-link" href={backHref}>← Leads</Link>}
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
              <button className="btn btn-leads" type="submit" form="lead-facts-form" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
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
                      onChange={(event) => setValues((current) => ({ ...current, company_name: event.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-contact_name">
                    Contact name
                    <input
                      id="lead-contact_name"
                      value={values.contact_name}
                      maxLength={500}
                      disabled={readOnly}
                      onChange={(event) => setValues((current) => ({ ...current, contact_name: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="field" htmlFor="lead-email">
                  Email
                  <span className={`input-wrap${emailIsValid ? "" : " is-missing"}`}>
                    <input
                      id="lead-email"
                      type="email"
                      value={values.email}
                      maxLength={320}
                      disabled={readOnly}
                      placeholder="Add an email address"
                      aria-invalid={values.email.length > 0 && !emailIsValid}
                      aria-describedby={!emailIsValid ? "lead-email-hint" : undefined}
                      onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
                    />
                    {!emailIsValid && <span className="required-pill">Required</span>}
                  </span>
                  <span id="lead-email-hint" className={`field-note${emailIsValid ? "" : " is-attention"}`}>
                    {emailIsValid
                      ? "Needed to approve. Changing it on an approved lead resets approval."
                      : "Needed to approve. No address was found on the site, so check the contact page or add one by hand."}
                  </span>
                  {values.email.length > 0 && !emailIsValid && (
                    <span className="field-error">Enter a valid lowercase address, like dana@harborandpine.com.</span>
                  )}
                </label>
                <div className="row">
                  <label className="field" htmlFor="lead-email_type">
                    Email type
                    <input
                      id="lead-email_type"
                      value={values.email_type}
                      maxLength={500}
                      disabled={readOnly}
                      placeholder="Choose type"
                      onChange={(event) => setValues((current) => ({ ...current, email_type: event.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-phone">
                    Phone
                    <input
                      id="lead-phone"
                      value={values.phone}
                      maxLength={40}
                      disabled={readOnly}
                      onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))}
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
                      placeholder="US"
                      onChange={(event) => setValues((current) => ({ ...current, country: event.target.value.toUpperCase() }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-language">
                    Language
                    <input
                      id="lead-language"
                      value={values.language}
                      maxLength={500}
                      disabled={readOnly}
                      placeholder="en"
                      onChange={(event) => setValues((current) => ({ ...current, language: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="field" htmlFor="lead-timezone">
                    Timezone
                    <input
                      id="lead-timezone"
                      value={values.timezone}
                      maxLength={500}
                      disabled={readOnly}
                      placeholder="America/Los_Angeles"
                      onChange={(event) => setValues((current) => ({ ...current, timezone: event.target.value }))}
                    />
                  </label>
                  <label className="field" htmlFor="lead-niche">
                    Niche
                    <input
                      id="lead-niche"
                      value={values.niche}
                      maxLength={500}
                      disabled={readOnly}
                      onChange={(event) => setValues((current) => ({ ...current, niche: event.target.value }))}
                    />
                  </label>
                </div>
                {changesEmail && lead.human_approval === "APPROVED" && (
                  <p className="notice">Saving an email change will reset approval to Pending.</p>
                )}
              </form>
            </section>
          </div>

          <div className="page-stack">
            <section className="panel">
              <div className="section-head">
                <h2>Ready for drafting</h2>
              </div>
              <ul className="checklist">
                {checklist.map((item) => (
                  <li key={item.key} id={item.key === "email" ? "lead-email-check" : undefined} data-state={item.state}>
                    {item.state === "ok" ? <CheckIcon /> : item.state === "unknown" ? <DotIcon /> : <CrossIcon />}
                    <span>
                      {item.href ? (
                        <a href={item.href}>{item.label}</a>
                      ) : (
                        item.label
                      )}
                      {item.hint && <span className="hint">{item.hint}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="checklist-foot">Screening tags are review aids, not legal clearance.</p>
            </section>

            <section className="panel">
              <div className="section-head">
                <h2>Evidence</h2>
              </div>
              <div className="evidence-item">
                <h3>{shopifySignal ? "Shopify store confirmed" : "Shopify not confirmed"}</h3>
                <p className="evidence-quote">{shopifySignal ?? "No Shopify signals were recorded for this store."}</p>
              </div>
              <div className="evidence-item">
                <h3>{noApp ? "No mobile app found" : "Mobile app check unavailable"}</h3>
                <p className="evidence-quote">{noAppDetail ?? lead.agent_reason ?? "No app check was recorded."}</p>
              </div>
            </section>
          </div>
        </div>

        <p className="form-message" role="status" aria-live="polite">{message}</p>

        <div className="action-bar">
          <div className="keyhints">
            <span><kbd>j</kbd><kbd>k</kbd> move</span>
            <span><kbd>e</kbd> edit</span>
            <span><kbd>f</kbd> full data</span>
          </div>
          <div className="action-bar-group">
            {!emailIsValid && canDecide && (
              <span className="blocked-reason" id="approve-email-reason">Add an email to approve</span>
            )}
            {dirty && canDecide && <span className="blocked-reason">Save changes before deciding</span>}
            {readOnly && <span className="blocked-reason">Archived</span>}
            {!readOnly && <button className="btn btn-ghost" type="button" onClick={() => openAction("archive")}>Archive</button>}
            {lead.human_approval === "APPROVED" && !readOnly && (
              <button className="btn btn-stop" type="button" onClick={() => openAction("revoke")}>Revoke approval</button>
            )}
            {lead.human_approval === "REJECTED" && !readOnly && (
              <button className="btn" type="button" onClick={() => openAction("reopen")}>Reopen</button>
            )}
            {canDecide && (
              <>
                <button className="btn btn-stop" type="button" disabled={dirty} onClick={() => openAction("reject")}>
                  <CrossIcon /> Reject <kbd>r</kbd>
                </button>
                <button
                  className={`btn ${approveBlocked ? "" : "btn-leads"}`}
                  type="button"
                  disabled={approveBlocked}
                  aria-describedby={!emailIsValid ? "approve-email-reason" : undefined}
                  onClick={() => openAction("approve")}
                >
                  <CheckIcon /> Approve
                </button>
              </>
            )}
          </div>
        </div>

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
            <div><dt>Email</dt><dd>{values.email || "No email address"}</dd></div>
            <div><dt>Country</dt><dd>{values.country || "—"}</dd></div>
            <div><dt>Anti-spam tag</dt><dd>{lead.antispam_tag.replaceAll("_", " ").toLowerCase()} — screening aid only</dd></div>
          </dl>
          {(action === "reject" || action === "approve") && (
            <label>
              {action === "reject" ? "Rejection note · required" : "Note · optional"}
              <textarea
                value={note}
                required={action === "reject"}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button
              type="button"
              className={action === "reject" || action === "archive" ? "btn-stop" : undefined}
              disabled={busy || (action === "reject" && !note.trim())}
              onClick={confirmAction}
            >
              {busy ? "Saving…" : action === "approve" ? "Approve lead" : action === "reject" ? "Reject lead" : action === "archive" ? "Archive lead" : "Confirm"}
            </button>
          </div>
        </dialog>
      </section>

      {fullData && (
        <LeadFullData
          lead={lead}
          activity={activity}
          emailIsValid={emailIsValid}
          siteHref={siteHref}
          contactHref={contactHref}
          formHref={formHref}
          shopifySignal={shopifySignal}
          hasNoApp={Boolean(noApp)}
          onClose={() => setFullData(false)}
        />
      )}

    </>
  );
}
