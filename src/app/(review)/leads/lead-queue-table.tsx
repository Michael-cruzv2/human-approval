"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type LeadListItem = {
  id: string; domain: string; company_name: string | null; country: string | null;
  agent_approval: string; antispam_tag: string; email: string | null;
  human_approval: string; added_at: string;
};

export default function LeadQueueTable({ leads }: { leads: LeadListItem[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionDialogRef = useRef<HTMLDialogElement>(null);
  const [keyboardLead, setKeyboardLead] = useState<LeadListItem | null>(null);
  const [keyboardAction, setKeyboardAction] = useState<"approve" | "reject" | null>(null);
  const [keyboardNote, setKeyboardNote] = useState("");
  const allSelected = leads.length > 0 && leads.every((lead) => selected.includes(lead.id));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || dialogRef.current?.open || actionDialogRef.current?.open) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".lead-domain-link"));
      const currentIndex = links.findIndex((link) => link === document.activeElement);
      if (event.key === "j" || event.key === "k") {
        if (!links.length) return;
        event.preventDefault();
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + (event.key === "j" ? 1 : -1) + links.length) % links.length;
        links[nextIndex].focus();
      } else if ((event.key === "a" || event.key === "r") && document.activeElement instanceof HTMLAnchorElement) {
        const id = document.activeElement.dataset.leadId;
        const lead = leads.find((item) => item.id === id);
        if (!lead || lead.human_approval !== "PENDING" || lead.agent_approval === "REJECTED") return;
        event.preventDefault();
        setKeyboardLead(lead);
        setKeyboardAction(event.key === "a" ? "approve" : "reject");
        setKeyboardNote("");
        actionDialogRef.current?.showModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leads, selected.length]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? leads.filter((lead) => lead.human_approval === "PENDING" && lead.agent_approval !== "REJECTED").map((lead) => lead.id) : []);
  }

  async function submitBulkReject() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/leads/bulk-reject", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, note }),
      });
      const body = (await response.json()) as { message?: string; rejected?: number };
      if (!response.ok) { setMessage(body.message ?? "Could not reject selected leads."); return; }
      setMessage(`${body.rejected ?? 0} leads rejected.`);
      setSelected([]); setNote(""); dialogRef.current?.close(); window.location.reload();
    } catch {
      setMessage("Could not reject selected leads.");
    } finally { setBusy(false); }
  }

  async function submitKeyboardAction() {
    if (!keyboardLead || !keyboardAction) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/leads/${keyboardLead.id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: keyboardAction, note: keyboardNote }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) { setMessage(body.message ?? "Could not update this lead."); return; }
      actionDialogRef.current?.close(); window.location.reload();
    } catch { setMessage("Could not update this lead."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="bulk-tools">
        <label><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} /> Select pending shown</label>
        <button type="button" disabled={!selected.length} onClick={() => dialogRef.current?.showModal()}>Reject selected ({selected.length})</button>
        <span role="status">{message}</span>
      </div>
      <div className="table-scroll"><table>
        <thead><tr><th>Select</th><th>Domain</th><th>Company</th><th>Country</th><th>Agent</th><th>Screening</th><th>Email</th><th>Added</th></tr></thead>
        <tbody>{leads.map((lead) => <tr key={lead.id}>
          <td><input aria-label={`Select ${lead.domain}`} type="checkbox" disabled={lead.human_approval !== "PENDING" || lead.agent_approval === "REJECTED"} checked={selected.includes(lead.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, lead.id] : ids.filter((id) => id !== lead.id))} /></td>
          <td><Link className="lead-domain-link" data-lead-id={lead.id} href={`/leads/${lead.id}`}>{lead.domain}</Link></td><td>{lead.company_name ?? "—"}</td><td>{lead.country ?? "—"}</td>
          <td><span className={`badge badge-${lead.agent_approval.toLowerCase()}`}>{lead.agent_approval}</span></td><td><span className="badge">{lead.antispam_tag}</span></td>
          <td>{lead.email ?? "No email address"}</td><td><time dateTime={lead.added_at}>{new Date(lead.added_at).toLocaleDateString()}</time></td>
        </tr>)}</tbody>
      </table>{leads.length === 0 && <p className="empty-state">Nothing to review.</p>}</div>
      <dialog ref={dialogRef} className="confirm-dialog" onCancel={() => setNote("")}>
        <h2>Reject {selected.length} leads?</h2>
        <p>This action cannot be undone directly. Rejected leads can be reopened one at a time.</p>
        <label>Rejection note<textarea required value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <ul>{leads.filter((lead) => selected.includes(lead.id)).map((lead) => <li key={lead.id}>{lead.domain} · {lead.company_name ?? "—"} · {lead.country ?? "—"} · {lead.email ?? "No email address"} · {lead.antispam_tag}</li>)}</ul>
        <div className="dialog-actions"><button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button><button type="button" disabled={busy || !note.trim()} onClick={submitBulkReject}>{busy ? "Rejecting…" : "Confirm rejection"}</button></div>
      </dialog>
      <dialog ref={actionDialogRef} className="confirm-dialog" onCancel={() => { setKeyboardAction(null); setKeyboardNote(""); }}>
        <h2>Confirm {keyboardAction}</h2>
        <p>Domain: {keyboardLead?.domain}</p><p>Company: {keyboardLead?.company_name ?? "—"}</p><p>Country: {keyboardLead?.country ?? "—"}</p><p>Email: {keyboardLead?.email ?? "No email address"}</p><p>Screening tag: {keyboardLead?.antispam_tag}</p>
        {keyboardAction === "reject" && <label>Rejection note<textarea value={keyboardNote} onChange={(event) => setKeyboardNote(event.target.value)} required /></label>}
        <div className="dialog-actions"><button type="button" onClick={() => actionDialogRef.current?.close()}>Cancel</button><button type="button" disabled={busy || (keyboardAction === "reject" && !keyboardNote.trim())} onClick={submitKeyboardAction}>Confirm {keyboardAction}</button></div>
      </dialog>
    </>
  );
}
