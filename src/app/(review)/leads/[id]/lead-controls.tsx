"use client";

import Link from "next/link";
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

function getValues(lead: LeadEdit): Record<Field, string> {
  return {
    company_name: lead.company_name ?? "", contact_name: lead.contact_name ?? "", email: lead.email ?? "",
    email_type: lead.email_type ?? "", phone: lead.phone ?? "", country: lead.country ?? "",
    language: lead.language ?? "", timezone: lead.timezone ?? "", niche: lead.niche ?? "",
  };
}

function validEmail(value: string): boolean {
  return value === value.toLowerCase() && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value);
}

export default function LeadControls({ lead, returnHref = "/leads" }: { lead: LeadEdit; returnHref?: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<Field, string>>(() => getValues(lead));
  const [savedValues, setSavedValues] = useState<Record<Field, string>>(() => getValues(lead));
  const [action, setAction] = useState<"approve" | "reject" | "revoke" | "reopen" | "archive" | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const changesEmail = values.email.trim().toLowerCase() !== (lead.email ?? "").toLowerCase();
  const dirty = fields.some((field) => values[field] !== savedValues[field]);
  const emailIsValid = validEmail(values.email);
  const [undoApproval, setUndoApproval] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const body = Object.fromEntries(fields.map((field) => {
      const value = values[field].trim();
      const normalized = field === "email" ? value.toLowerCase() : field === "country" ? value.toUpperCase() : value;
      return [field, normalized === "" ? null : normalized];
    }));
    try {
      const response = await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json()) as { message?: string; approvalReset?: boolean };
      if (!response.ok) { setMessage(result.message ?? "Could not save lead changes."); return; }
      const normalizedValues = Object.fromEntries(fields.map((field) => [field, body[field] ?? ""])) as Record<Field, string>;
      setValues(normalizedValues);
      setSavedValues(normalizedValues);
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
      if (action === "approve") {
        const separator = returnHref.includes("?") ? "&" : "?";
        router.push(`${returnHref}${separator}approved=${encodeURIComponent(lead.id)}`);
        return;
      }
      setMessage(action === "revoke" && undoApproval ? "Approval undone." : "Lead updated.");
      setUndoApproval(false);
      setAction(null); setNote(""); dialogRef.current?.close(); router.refresh();
    } catch { setMessage("Could not update this lead."); }
    finally { setBusy(false); }
  }

  function openAction(nextAction: NonNullable<typeof action>) {
    setAction(nextAction); setNote(""); dialogRef.current?.showModal();
  }

  return (
    <section className="panel page-stack">
      <h2>Lead review</h2>
      {undoApproval && <div className="notice"><strong>Approval undone.</strong><div className="action-row"><Link className="text-link-button" href={returnHref}>Return to queue</Link></div></div>}
      {lead.archived && <p className="notice">Archived leads are read-only.</p>}
      {!undoApproval && !lead.archived && <>
      <form className="form-grid lead-edit-form" onSubmit={save}>
        {fields.map((field) => <label key={field} id={field === "email" ? "lead-email-label" : undefined}>{field.replaceAll("_", " ")}<input id={field === "email" ? "lead-email" : field} type={field === "email" ? "email" : "text"} maxLength={field === "email" ? 320 : field === "phone" ? 40 : 500} value={values[field]} aria-invalid={field === "email" && values.email.length > 0 && !emailIsValid} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} />{field === "email" && values.email.length > 0 && !emailIsValid && <small className="field-error">Enter a valid lowercase email address.</small>}</label>)}
        {dirty && <strong>Unsaved changes</strong>}
        {lead.human_approval === "APPROVED" && <p className="notice">Changing the email resets approval.</p>}
        <div className="action-row"><button type="submit" disabled={busy || !dirty}>{busy ? "Saving…" : "Save facts"}</button><button type="button" disabled={busy || !dirty} onClick={() => setValues(savedValues)}>Cancel</button></div>
      </form>
      <div className="action-row">
        {!lead.archived && lead.human_approval === "PENDING" && lead.agent_approval !== "REJECTED" && <><button type="button" disabled={!emailIsValid || dirty} aria-describedby={!emailIsValid ? "approve-email-reason" : undefined} onClick={() => openAction("approve")}>Approve…</button>{!emailIsValid && <><span id="approve-email-reason">Add an email to approve</span><button type="button" onClick={() => document.getElementById("lead-email")?.focus()}>Go to email</button></>}<button type="button" onClick={() => openAction("reject")}>Reject…</button></>}
        {!lead.archived && lead.human_approval === "APPROVED" && <button type="button" onClick={() => openAction("revoke")}>Revoke approval…</button>}
        {!lead.archived && lead.human_approval === "REJECTED" && <button type="button" onClick={() => openAction("reopen")}>Reopen…</button>}
        {!lead.archived && <button type="button" onClick={() => openAction("archive")}>Archive…</button>}
      </div>
      <p className="form-message" role="status" aria-live="polite">{message}</p>
      <dialog ref={dialogRef} className="confirm-dialog" onCancel={() => { setAction(null); setNote(""); }}>
        <h2>Confirm {action}</h2>
        <p>Review these lead facts before continuing:</p>
        <ul><li>Domain: {lead.domain}</li><li>Company: {values.company_name || "—"}</li><li>Email: {values.email || "—"}</li><li>Country: {values.country || "—"}</li><li>Screening tag: {lead.antispam_tag} (screening aid only)</li></ul>
        {action === "reject" && <label>Rejection note<textarea required value={note} onChange={(event) => setNote(event.target.value)} /></label>}
        {action === "approve" && <label>Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>}
        <div className="dialog-actions"><button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button><button type="button" disabled={busy || (action === "reject" && !note.trim())} onClick={confirmAction}>Confirm {action}</button></div>
      </dialog>
      {changesEmail && lead.human_approval === "APPROVED" && <p className="notice">Saving this email change will reset approval.</p>}
      </>}
    </section>
  );
}
