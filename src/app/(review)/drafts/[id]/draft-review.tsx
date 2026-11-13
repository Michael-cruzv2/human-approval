"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Spinner } from "@/components/spinner";

type Draft = {
  id: string;
  lead_id: string;
  version: number;
  subject: string;
  body_text: string;
  ai_opener: string | null;
  content_hash: string;
  human_approval: string;
  human_note: string | null;
  editor_name: string | null;
  email: string | null;
  domain: string;
  site_url: string | null;
  company_name: string | null;
  country: string | null;
  antispam_tag: string;
  template_version: string | null;
  lead_approval: string;
  lead_archived: boolean;
};

function validEmail(value: string | null): boolean {
  return Boolean(value && value === value.toLowerCase() && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value));
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

function MailIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="m2.8 4.6 5.2 3.9 5.2-3.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 7.2v3.4M8 5.4v.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const STEPS = ["Found", "Agent checked", "Lead approved", "Draft written", "Draft reviewed", "Sent"];

export default function DraftReview({ draft, embedded = false, returnHref = "/drafts?view=to-review" }: { draft: Draft; embedded?: boolean; returnHref?: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body_text);
  const [savedSubject, setSavedSubject] = useState(draft.subject);
  const [savedBody, setSavedBody] = useState(draft.body_text);
  const [contentHash, setContentHash] = useState(draft.content_hash);
  const [approval, setApproval] = useState(draft.human_approval);
  const [action, setAction] = useState<"approve" | "reject" | "return" | "revoke" | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [leadChanged, setLeadChanged] = useState(false);
  const dirty = subject !== savedSubject || body !== savedBody;
  const draftCanBeReviewed = draft.lead_approval === "APPROVED" && !draft.lead_archived && validEmail(draft.email) && !leadChanged;
  const siteHref = safeUrl(draft.site_url);
  const editable = approval === "PENDING" && draftCanBeReviewed;

  useEffect(() => {
    let active = true;
    async function checkLead() {
      try {
        const response = await fetch(`/api/drafts/${draft.id}`, { cache: "no-store" });
        if (!response.ok) {
          if (active) {
            setLeadChanged(true);
            setMessage("Could not verify the lead. Refresh review before continuing.");
          }
          return;
        }
        const result = await response.json() as { draft?: { lead_approval: string; lead_email: string | null; lead_archived: boolean } };
        const current = result.draft;
        if (active && current && (
          current.lead_approval !== "APPROVED" ||
          current.lead_archived ||
          current.lead_email !== draft.email
        )) setLeadChanged(true);
      } catch {
        if (active) {
          setLeadChanged(true);
          setMessage("Could not verify the lead. Refresh review before continuing.");
        }
      }
    }
    const timer = window.setInterval(checkLead, 10000);
    window.addEventListener("focus", checkLead);
    checkLead();
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkLead);
    };
  }, [draft.id, draft.email]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (dialogRef.current?.open || !editable) return;
      if (event.key === "e") {
        event.preventDefault();
        subjectRef.current?.focus();
      } else if (event.key === "a" && !dirty) {
        event.preventDefault();
        openAction("approve");
      } else if (event.key === "r" && !dirty) {
        event.preventDefault();
        openAction("reject");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, dirty]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body_text: body }),
      });
      const result = await response.json() as { message?: string; contentHash?: string; approvalReset?: boolean };
      if (!response.ok) {
        if (result.message?.includes("lead") || result.message?.includes("email")) setLeadChanged(true);
        setMessage(result.message ?? "Could not save draft changes.");
        return;
      }
      setSavedSubject(subject);
      setSavedBody(body);
      if (result.contentHash) setContentHash(result.contentHash);
      if (result.approvalReset) setApproval("PENDING");
      setMessage(result.approvalReset ? "Saved. Editing the text reset its approval to Pending." : "Draft saved.");
      router.refresh();
    } catch {
      setMessage("Could not save draft changes.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction() {
    if (!action) return;
    setBusy(true);
    setMessage("");
    const requestBody = action === "approve" ? { action, contentHash } : { action, note };
    try {
      const response = await fetch(`/api/drafts/${draft.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json() as { message?: string; returned?: boolean };
      if (!response.ok) {
        if (result.message === "draft changed, please review again") {
          const latestResponse = await fetch(`/api/drafts/${draft.id}`, { cache: "no-store" });
          if (latestResponse.ok) {
            const latest = await latestResponse.json() as { draft: { subject: string; body_text: string; content_hash: string; human_approval: string } };
            setSubject(latest.draft.subject);
            setSavedSubject(latest.draft.subject);
            setBody(latest.draft.body_text);
            setSavedBody(latest.draft.body_text);
            setContentHash(latest.draft.content_hash);
            setApproval(latest.draft.human_approval);
          }
          setMessage("This draft changed while you were reviewing. Review the new text.");
        } else {
          setMessage(result.message ?? "Could not update this draft.");
        }
        dialogRef.current?.close();
        return;
      }
      dialogRef.current?.close();
      if (action === "return" && result.returned) {
        router.push(`/leads?status=PENDING&returned=true&lead=${encodeURIComponent(draft.lead_id)}`);
        return;
      }
      if (action === "reject") {
        router.push(`/drafts?view=awaiting-draft&lead=${encodeURIComponent(draft.lead_id)}`);
        return;
      }
      if (action === "approve") {
        router.push(`/drafts?view=approved&draft=${encodeURIComponent(draft.id)}`);
        return;
      }
      router.push(`/drafts?view=to-review&draft=${encodeURIComponent(draft.id)}`);
    } catch {
      setMessage("Could not update this draft.");
    } finally {
      setBusy(false);
    }
  }

  function openAction(nextAction: NonNullable<typeof action>) {
    setAction(nextAction);
    setNote("");
    dialogRef.current?.showModal();
  }

  return (
    <section className={`page-stack draft-review-content${embedded ? " embedded-detail" : ""}`}>
      <header className="detail-head">
        <div>
          {embedded && <Link className="mobile-back-link" href={returnHref}>← Emails</Link>}
          <h1>Review email</h1>
          <div className="draft-head-meta">
            <span className="badge badge-pending">Draft {draft.version}</span>
            {draft.template_version && <span className="chip chip-quiet">Template {draft.template_version}</span>}
            {approval === "APPROVED" && <span className="badge badge-approved">Approved</span>}
            {approval === "REJECTED" && <span className="badge badge-rejected">Rejected</span>}
            {editable && (dirty
              ? <span className="editing-chip">Unsaved changes</span>
              : <span className="verified-mark"><CheckIcon /> All changes saved</span>)}
          </div>
        </div>
        {editable && dirty && (
          <div className="detail-actions">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setSubject(savedSubject); setBody(savedBody); }}>
              Cancel
            </button>
            <button className={`btn btn-drafts${busy ? " busy" : ""}`} type="submit" form="draft-form" disabled={busy}>
              {busy ? <><Spinner size="sm" />Saving…</> : "Save changes"}
            </button>
          </div>
        )}
      </header>

      {(leadChanged || draft.lead_approval !== "APPROVED" || draft.lead_archived || !validEmail(draft.email)) && (
        <aside className="notice" role="alert">
          <strong>{!validEmail(draft.email) ? "Email required" : "The lead changed. Review again"}</strong>
          <p>Approval is unavailable until the lead is current and has a valid approved email.</p>
          <button className="btn btn-sm" type="button" onClick={() => window.location.reload()}>Refresh review</button>
        </aside>
      )}

      <ol className="pipeline-rail" aria-label="Draft progress">
        {STEPS.map((step, index) => (
          <li key={step} data-complete={index < 4} data-current={index === 4} aria-current={index === 4 ? "step" : undefined}>
            <span aria-hidden="true" />
            {step}
          </li>
        ))}
      </ol>

      <div className="detail-grid">
        <div className="page-stack">
          <section className="panel draft-panel">
            <label className="field" htmlFor="draft-recipient">
              To
              <span className="recipient-field">
                <MailIcon />
                <input id="draft-recipient" value={draft.email ?? ""} readOnly aria-label="Recipient email, read only" />
                <Link className="change-link" href={`/all/${draft.lead_id}`}>Change it in the lead</Link>
              </span>
            </label>
            <form id="draft-form" className="draft-editor" onSubmit={save} noValidate>
              <label htmlFor="draft-subject">
                Subject
                <input
                  ref={subjectRef}
                  id="draft-subject"
                  value={subject}
                  maxLength={1000}
                  readOnly={!editable}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>
              {draft.ai_opener && !body.includes(draft.ai_opener) && (
                <div className="opener-block">
                  <p className="eyebrow">Opening line written by AI. Read only.</p>
                  <p>{draft.ai_opener}</p>
                </div>
              )}
              <label htmlFor="draft-body">
                Message
                <textarea
                  id="draft-body"
                  className="draft-body"
                  value={body}
                  maxLength={30000}
                  readOnly={!editable}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
            </form>
            <p className="footer-note">
              <InfoIcon />
              Footer with sender name, company and address is added automatically when sent. {body.length} characters.
            </p>
            {draft.editor_name && <p className="muted">Last edited by {draft.editor_name}</p>}
          </section>
        </div>

        <div className="page-stack">
          <section className="panel">
            <div className="section-head">
              <h2>About this lead</h2>
            </div>
            <div className="about-lead">
              <dl>
                <dt>Company</dt><dd>{draft.company_name ?? "—"}</dd>
                <dt>Site</dt><dd>{siteHref ? <a href={siteHref} target="_blank" rel="noopener noreferrer">{draft.domain}</a> : draft.domain}</dd>
                <dt>Country</dt><dd>{draft.country ?? "—"}</dd>
                <dt>Anti-spam</dt><dd>{draft.antispam_tag.replaceAll("_", " ").toLowerCase()}</dd>
              </dl>
              <Link className="btn btn-sm" href={`/all/${draft.lead_id}`}>Open lead</Link>
            </div>
            <p className="section-foot">Read only. Customer details are fixed in the Leads tab.</p>
          </section>

          {approval === "APPROVED" && (
            <section className="panel">
              <div className="section-head"><h2>Approved</h2></div>
              <p className="muted">This email is approved and waiting to be sent. Editing the text sends it back for review.</p>
              <div className="action-row" style={{ marginTop: "0.75rem" }}>
                <button className="btn btn-stop" type="button" disabled={!draftCanBeReviewed} onClick={() => openAction("revoke")}>
                  Revoke approval
                </button>
              </div>
            </section>
          )}

          {approval === "REJECTED" && (
            <section className="panel">
              <div className="section-head"><h2>Rejected</h2></div>
              <p className="muted">Rejected drafts are final. Regenerate a new version from Drafts › Awaiting draft.</p>
              {draft.human_note && <p className="section-foot">{draft.human_note}</p>}
            </section>
          )}
        </div>
      </div>

      <p className="form-message" role="status" aria-live="polite">{message}</p>

      {editable && (
        <div className="action-bar draft-action-bar">
          <div className="keyhints">
            <span><kbd>e</kbd> edit message</span>
            <span><kbd>a</kbd> approve</span>
            <span><kbd>r</kbd> reject</span>
          </div>
          <div className="action-bar-group">
            {dirty && <span className="blocked-reason">Save your edits before approving</span>}
            <button
              className={`btn btn-stop${busy ? " busy" : ""}`}
              type="button"
              disabled={busy || dirty}
              onClick={() => openAction("return")}
            >
              {busy ? <><Spinner size="sm" />Sending back…</> : "Reject and send lead back"}
            </button>
            <button
              className={`btn btn-stop${busy ? " busy" : ""}`}
              type="button"
              disabled={busy || dirty}
              onClick={() => openAction("reject")}
            >
              {busy ? <><Spinner size="sm" />Rejecting…</> : <><CrossIcon /> Reject draft</>}
            </button>
            <button
              className={`btn btn-drafts${busy ? " busy" : ""}`}
              type="button"
              disabled={busy || dirty}
              onClick={() => openAction("approve")}
            >
              {busy ? <><Spinner size="sm" />Approving…</> : <><CheckIcon /> Approve email</>}
            </button>
          </div>
        </div>
      )}

      <dialog ref={dialogRef} className="confirm-dialog" onCancel={() => { setAction(null); setNote(""); }}>
        <h2>
          {action === "approve" && "Approve this email?"}
          {action === "reject" && "Reject this draft?"}
          {action === "return" && "Send this lead back to verification?"}
          {action === "revoke" && "Revoke draft approval?"}
        </h2>
        {action === "approve" && (
          <>
            <p>Approval covers exactly this text. Any later edit sends it back for review.</p>
            <dl>
              <div><dt>To</dt><dd>{draft.email ?? "—"}</dd></div>
              <div><dt>Anti-spam</dt><dd>{draft.antispam_tag.replaceAll("_", " ").toLowerCase()}</dd></div>
              <div><dt>Length</dt><dd>{body.length} characters</dd></div>
            </dl>
            <div className="preview">
              <h3>{subject}</h3>
              <div className="body">{body}</div>
            </div>
            <p className="section-foot">The footer is added automatically when sent. Esc closes this window.</p>
          </>
        )}
        {action === "reject" && (
          <>
            <p>The draft is rejected and the lead stays approved. Regenerate a new version from Awaiting draft, with this note passed to the model.</p>
            <label>
              What needs fixing? · Required
              <textarea value={note} required onChange={(event) => setNote(event.target.value)} />
            </label>
          </>
        )}
        {action === "return" && (
          <>
            <p>The draft is rejected and {draft.company_name ?? draft.domain} returns to the Leads tab to be checked again. This note is saved on both records.</p>
            <label>
              What needs fixing? · Required
              <textarea value={note} required onChange={(event) => setNote(event.target.value)} />
            </label>
          </>
        )}
        {action === "revoke" && (
          <p>Revoking returns this draft to review. It is blocked once sending has started.</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button
            type="button"
            className={action === "reject" || action === "return" || action === "revoke" ? "btn-stop" : undefined}
            disabled={busy || ((action === "reject" || action === "return") && !note.trim())}
            onClick={confirmAction}
          >
            {busy ? "Saving…" : action === "approve" ? "Approve email" : action === "return" ? "Send lead back" : action === "reject" ? "Reject draft" : "Revoke approval"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
