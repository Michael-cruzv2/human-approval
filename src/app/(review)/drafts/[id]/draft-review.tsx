"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

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
  company_name: string | null;
  country: string | null;
  antispam_tag: string;
  lead_approval: string;
  lead_archived: boolean;
};

function validEmail(value: string | null): boolean {
  return Boolean(value && value === value.toLowerCase() && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value));
}

export default function DraftReview({ draft }: { draft: Draft }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  useEffect(() => {
    let active = true;
    async function checkLead() {
      try {
        const response = await fetch(`/api/drafts/${draft.id}`, { cache: "no-store" });
        if (!response.ok) return;
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
      setMessage(result.approvalReset ? "Saved. Editing the text reset its approval to PENDING." : "Draft saved.");
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
    const requestBody = action === "approve"
      ? { action, contentHash }
      : { action, note };
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
        router.push("/leads?status=PENDING");
        return;
      }
      if (action === "reject") {
        router.push("/drafts?view=awaiting-draft");
        return;
      }
      setApproval(action === "approve" ? "APPROVED" : "PENDING");
      setMessage(action === "approve" ? "Draft approved." : "Draft approval revoked.");
      setAction(null);
      setNote("");
      router.refresh();
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
    <section className="page-stack">
      <header className="page-heading">
        <div><p className="eyebrow">Draft review · Version {draft.version}</p><h1>{draft.company_name ?? draft.domain}</h1></div>
        <Link href="/drafts?view=to-review">Back to drafts</Link>
      </header>
      {(leadChanged || draft.lead_approval !== "APPROVED" || draft.lead_archived || !validEmail(draft.email)) && (
        <aside className="notice" role="alert">
          <strong>{!validEmail(draft.email) ? "Email required" : "The lead changed. Review again"}</strong>
          <p>Approval is unavailable until the lead is current and has a valid approved email.</p>
          <button type="button" onClick={() => window.location.reload()}>Refresh review</button>
        </aside>
      )}
      <section className="panel lead-strip">
        <div><strong>{draft.company_name ?? draft.domain}</strong><span>{draft.domain}</span></div>
        <span>{draft.country ?? "Country unknown"}</span>
        <span className="badge" title="Screening aid only; not legal clearance">{draft.antispam_tag}</span>
        <Link href={`/all/${draft.lead_id}`}>Open lead</Link>
      </section>
      {draft.lead_approval === "APPROVED" && approval === "PENDING" && (
        <div className="page-stack">
          <section className="panel">
            <h2>Outreach draft</h2>
            <p className="draft-meta">Last edited by {draft.editor_name ?? "—"}</p>
            {draft.ai_opener && <div><h3>AI opener · read only</h3><pre>{draft.ai_opener}</pre></div>}
            <form className="draft-editor" onSubmit={save}>
              <label>Recipient email<input value={draft.email ?? ""} readOnly /></label>
              <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={1000} /></label>
              <label>Body<textarea className="draft-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={30000} /></label>
              <p>Footer is added automatically when sent.</p>
              {dirty && <strong>Unsaved changes</strong>}
              <div className="action-row">
                <button type="submit" disabled={busy || !dirty}>Save draft</button>
                <button type="button" disabled={busy || dirty || !draftCanBeReviewed} onClick={() => openAction("approve")}>Approve…</button>
                <button type="button" disabled={busy || dirty || !draftCanBeReviewed} onClick={() => openAction("reject")}>Reject draft…</button>
                <button type="button" disabled={busy || dirty || !draftCanBeReviewed} onClick={() => openAction("return")}>Reject and send lead back to verification…</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {approval === "APPROVED" && <section className="panel">
        <p>Status: <strong>APPROVED</strong></p><p>Recipient: {draft.email}</p><h2>{draft.subject}</h2><pre>{draft.body_text}</pre>
        <button type="button" disabled={!draftCanBeReviewed} onClick={() => openAction("revoke")}>Revoke approval…</button>
      </section>}
      {approval === "REJECTED" && <section className="panel">
        <p>Status: <strong>REJECTED</strong></p><p>Recipient: {draft.email}</p><h2>{draft.subject}</h2><pre>{draft.body_text}</pre>
        <p>Rejected drafts are final. The Drafter creates any new version.</p>
      </section>}
      <p className="form-message" role="status" aria-live="polite">{message}</p>
      <dialog ref={dialogRef} className="confirm-dialog" onCancel={() => { setAction(null); setNote(""); }}>
        <h2>{action === "reject" ? "Reject draft?" : action === "return" ? "Reject and return lead?" : action === "revoke" ? "Revoke draft approval?" : "Approve this draft?"}</h2>
        <p>Confirm the exact email text and recipient before continuing.</p>
        {action === "return" && <p>The draft will be rejected and the lead returned to Pending verification. This note will be saved on both records.</p>}
        <dl><div><dt>Recipient</dt><dd>{draft.email ?? "—"}</dd></div><div><dt>Anti-spam tag</dt><dd>{draft.antispam_tag} — screening aid only, not legal clearance</dd></div></dl>
        <h3>{subject}</h3><pre>{body}</pre>
        {(action === "reject" || action === "return") && <label>Note<textarea value={note} required onChange={(event) => setNote(event.target.value)} /></label>}
        <div className="dialog-actions">
          <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button type="button" disabled={busy || ((action === "reject" || action === "return") && !note.trim())} onClick={confirmAction}>{busy ? "Saving…" : "Confirm"}</button>
        </div>
      </dialog>
    </section>
  );
}
