"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

type Draft = {
  id: string; lead_id: string; version: number; subject: string; body_text: string; ai_opener: string | null;
  template_version: string | null; ai_model: string | null; content_hash: string; human_approval: string;
  human_note: string | null; editor_name: string | null; email: string | null; domain: string;
  company_name: string | null; country: string | null; antispam_tag: string; is_shopify: boolean | null;
  has_mobile_app: boolean | null; evidence: unknown; lead_approval: string;
};

export default function DraftReview({ draft }: { draft: Draft }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body_text);
  const [savedSubject, setSavedSubject] = useState(draft.subject);
  const [savedBody, setSavedBody] = useState(draft.body_text);
  const [contentHash, setContentHash] = useState(draft.content_hash);
  const [approval, setApproval] = useState(draft.human_approval);
  const [action, setAction] = useState<"approve" | "reject" | "revoke" | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = subject !== savedSubject || body !== savedBody;
  const evidence = typeof draft.evidence === "object" && draft.evidence !== null ? draft.evidence as Record<string, unknown> : {};

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body_text: body }) });
      const result = (await response.json()) as { message?: string; contentHash?: string; approvalReset?: boolean };
      if (!response.ok) { setMessage(result.message ?? "Could not save draft changes."); return; }
      setSavedSubject(subject); setSavedBody(body);
      if (result.contentHash) setContentHash(result.contentHash);
      if (result.approvalReset) setApproval("PENDING");
      setMessage(result.approvalReset ? "Saved. Editing the text reset its approval to PENDING." : "Draft saved.");
      router.refresh();
    } catch { setMessage("Could not save draft changes."); }
    finally { setBusy(false); }
  }

  async function confirmAction() {
    if (!action) return;
    setBusy(true); setMessage("");
    const requestBody = action === "approve"
      ? { action, contentHash, ...(note ? { note } : {}) }
      : { action, note };
    try {
      const response = await fetch(`/api/drafts/${draft.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        if (result.message === "draft changed, please review again") {
          const latestResponse = await fetch(`/api/drafts/${draft.id}`, { cache: "no-store" });
          if (latestResponse.ok) {
            const latest = (await latestResponse.json()) as { draft: { subject: string; body_text: string; content_hash: string; human_approval: string } };
            setSubject(latest.draft.subject); setSavedSubject(latest.draft.subject);
            setBody(latest.draft.body_text); setSavedBody(latest.draft.body_text);
            setContentHash(latest.draft.content_hash); setApproval(latest.draft.human_approval);
          }
          setMessage("This draft changed while you were reviewing. Review the new text.");
        } else {
          setMessage(result.message ?? "Could not update this draft.");
        }
        dialogRef.current?.close(); router.refresh(); return;
      }
      setApproval(action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "PENDING");
      setMessage(action === "approve" ? "Draft approved." : action === "reject" ? "Draft rejected." : "Draft approval revoked.");
      setAction(null); setNote(""); dialogRef.current?.close(); router.refresh();
    } catch { setMessage("Could not update this draft."); }
    finally { setBusy(false); }
  }

  function openAction(nextAction: NonNullable<typeof action>) { setAction(nextAction); setNote(""); dialogRef.current?.showModal(); }

  return (
    <section className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Draft review · Version {draft.version}</p><h1>{draft.company_name ?? draft.domain}</h1></div><Link href="/drafts">Back to drafts</Link></header>
      {draft.lead_approval !== "APPROVED" && <aside className="notice">This lead is not currently approved. The draft is hidden from the review queue; approval and rejection are unavailable.</aside>}
      {approval === "PENDING" && draft.lead_approval === "APPROVED" && <div className="split-review">
        <section className="panel"><h2>Lead facts</h2><dl className="facts-grid"><div className="fact"><dt>Domain</dt><dd>{draft.domain}</dd></div><div className="fact"><dt>Country</dt><dd>{draft.country ?? "—"}</dd></div><div className="fact"><dt>Recipient</dt><dd>{draft.email ?? "No recipient email"}</dd></div><div className="fact"><dt>Screening</dt><dd><span className="badge">{draft.antispam_tag}</span><small> Screening aid only; not legal advice.</small></dd></div><div className="fact"><dt>Shopify</dt><dd>{draft.is_shopify === null ? "—" : String(draft.is_shopify)}</dd></div><div className="fact"><dt>Mobile app</dt><dd>{draft.has_mobile_app === null ? "—" : String(draft.has_mobile_app)}</dd></div></dl><h3>Evidence</h3><pre>{JSON.stringify(evidence, null, 2)}</pre></section>
        <section className="panel"><h2>Outreach draft</h2><p className="draft-meta">Last edited by {draft.editor_name ?? "—"} · Template {draft.template_version ?? "—"} · Model {draft.ai_model ?? "—"}</p>{draft.ai_opener && <><h3>AI opener (read only)</h3><pre>{draft.ai_opener}</pre></>}
          <form className="draft-editor" onSubmit={save}><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={1000} /></label><label>Body<textarea className="draft-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={30000} /></label><p>Footer is added automatically when sent.</p>{dirty && <strong>Unsaved changes</strong>}<div className="action-row"><button type="submit" disabled={busy || !dirty}>Save draft</button>{approval === "PENDING" && <button type="button" disabled={busy || dirty} onClick={() => openAction("approve")}>Approve…</button>}{approval === "PENDING" && <button type="button" disabled={busy || dirty} onClick={() => openAction("reject")}>Reject…</button>}</div></form>
        </section>
      </div>}
      {(approval !== "PENDING" || draft.lead_approval !== "APPROVED") && <section className="panel"><p>Status: <strong>{approval}</strong></p><p>Recipient: {draft.email ?? "—"}</p><p>{subject}</p><pre>{body}</pre>{approval === "APPROVED" && <button type="button" onClick={() => openAction("revoke")}>Revoke approval…</button>}{approval === "REJECTED" && <p>Rejected drafts are final and require a new version from the Drafter.</p>}</section>}
      <p className="form-message" role="status" aria-live="polite">{message}</p>
      <dialog ref={dialogRef} className="confirm-dialog" onCancel={() => { setAction(null); setNote(""); }}>
        <h2>Confirm {action}</h2><p>Review the exact text before continuing.</p>
        <dl><div><dt>Recipient</dt><dd>{draft.email ?? "—"}</dd></div><div><dt>Screening tag</dt><dd>{draft.antispam_tag} — screening aid only, not legal advice</dd></div><div><dt>Character count</dt><dd>{subject.length + body.length}</dd></div></dl>
        <h3>{subject}</h3><pre>{body}</pre>
        {(action === "reject" || action === "approve") && <label>{action === "reject" ? "Rejection note" : "Note (optional)"}<textarea value={note} required={action === "reject"} onChange={(event) => setNote(event.target.value)} /></label>}
        <div className="dialog-actions"><button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button><button type="button" disabled={busy || (action === "reject" && !note.trim())} onClick={confirmAction}>Confirm {action}</button></div>
      </dialog>
    </section>
  );
}
