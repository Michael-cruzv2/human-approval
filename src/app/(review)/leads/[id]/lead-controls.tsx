"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

type LeadEdit = {
  id: string; company_name: string | null; contact_name: string | null; email: string | null;
  email_type: string | null; phone: string | null; country: string | null; language: string | null;
  timezone: string | null; niche: string | null; domain: string; human_approval: string;
  agent_approval: string; antispam_tag: string;
  archived: boolean;
};

const fields = ["company_name", "contact_name", "email", "email_type", "phone", "country", "language", "timezone", "niche"] as const;
type Field = typeof fields[number];

export default function LeadControls({ lead }: { lead: LeadEdit }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<Field, string>>({
    company_name: lead.company_name ?? "", contact_name: lead.contact_name ?? "", email: lead.email ?? "",
    email_type: lead.email_type ?? "", phone: lead.phone ?? "", country: lead.country ?? "",
    language: lead.language ?? "", timezone: lead.timezone ?? "", niche: lead.niche ?? "",
  });
  const [action, setAction] = useState<"approve" | "reject" | "revoke" | "reopen" | "archive" | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const changesEmail = values.email.trim().toLowerCase() !== (lead.email ?? "").toLowerCase();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const body = Object.fromEntries(fields.map((field) => [field, values[field] === "" ? null : values[field]]));
    try {
      const response = await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json()) as { message?: string; approvalReset?: boolean };
      if (!response.ok) { setMessage(result.message ?? "Could not save lead changes."); return; }
      setMessage(result.approvalReset ? "Saved. Changing the email reset this lead to PENDING." : "Lead facts saved.");
      router.refresh();
    } catch { setMessage("Could not save lead changes."); }
    finally { setBusy(false); }
  }

  async function confirmAction() {
    if (!action) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/leads/${lead.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) { setMessage(result.message ?? "Could not update this lead."); dialogRef.current?.close(); return; }
      setMessage("Lead updated."); setAction(null); setNote(""); dialogRef.current?.close(); router.refresh();
    } catch { setMessage("Could not update this lead."); }
    finally { setBusy(false); }
  }

  function openAction(nextAction: NonNullable<typeof action>) {
    setAction(nextAction); setNote(""); dialogRef.current?.showModal();
  }

  return (
    <section className="panel page-stack">
      <h2>Lead review</h2>
      <form className="form-grid lead-edit-form" onSubmit={save}>
        {fields.map((field) => <label key={field}>{field.replaceAll("_", " ")}<input type={field === "email" ? "email" : "text"} maxLength={field === "email" ? 320 : field === "phone" ? 40 : 500} value={values[field]} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
        {lead.human_approval === "APPROVED" && <p className="notice">Changing the email resets approval.</p>}
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save facts"}</button>
      </form>
      <div className="action-row">
        {!lead.archived && lead.human_approval === "PENDING" && lead.agent_approval !== "REJECTED" && <><button type="button" onClick={() => openAction("approve")}>Approve…</button><button type="button" onClick={() => openAction("reject")}>Reject…</button></>}
        {!lead.archived && lead.human_approval === "APPROVED" && <button type="button" onClick={() => openAction("revoke")}>Revoke approval…</button>}
        {!lead.archived && lead.human_approval === "REJECTED" && <button type="button" onClick={() => openAction("reopen")}>Reopen…</button>}
        {!lead.archived && <button type="button" onClick={() => openAction("archive")}>Archive…</button>}
      </div>
      <p className="form-message" role="status" aria-live="polite">{message}</p>
      <dialog ref={dialogRef} className="confirm-dialog" onCancel={() => { setAction(null); setNote(""); }}>
        <h2>Confirm {action}</h2>
        <p>Review these lead facts before continuing:</p>
        <ul><li>Domain: {lead.domain}</li><li>Company: {lead.company_name ?? "—"}</li><li>Email: {lead.email ?? "—"}</li><li>Country: {lead.country ?? "—"}</li><li>Screening tag: {lead.antispam_tag} (screening aid only)</li></ul>
        {action === "reject" && <label>Rejection note<textarea required value={note} onChange={(event) => setNote(event.target.value)} /></label>}
        {action === "approve" && <label>Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>}
        <div className="dialog-actions"><button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button><button type="button" disabled={busy || (action === "reject" && !note.trim())} onClick={confirmAction}>Confirm {action}</button></div>
      </dialog>
      {changesEmail && lead.human_approval === "APPROVED" && <p className="notice">Saving this email change will reset approval.</p>}
    </section>
  );
}
