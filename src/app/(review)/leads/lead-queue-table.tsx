"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type LeadListItem = {
  id: string;
  domain: string;
  company_name: string | null;
  country: string | null;
  agent_approval: string;
  antispam_tag: string;
  email: string | null;
  human_approval: string;
  human_note: string | null;
  updated_at: string;
  returned_from_drafts: boolean;
};
type Filters = { status: "PENDING" | "REJECTED"; agent: string; tag: string; country: string; search: string };

function hasValidEmail(email: string | null): boolean {
  return Boolean(email && email === email.toLowerCase() && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email));
}

const updatedDateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default function LeadQueueTable({
  leads: initialLeads,
  total,
  hasMore: initiallyHasMore,
  filters,
}: {
  leads: LeadListItem[];
  total: number;
  hasMore: boolean;
  filters: Filters;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [hasMore, setHasMore] = useState(initiallyHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionDialogRef = useRef<HTMLDialogElement>(null);
  const [keyboardLead, setKeyboardLead] = useState<LeadListItem | null>(null);
  const [keyboardAction, setKeyboardAction] = useState<"approve" | "reject" | null>(null);
  const [keyboardNote, setKeyboardNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || dialogRef.current?.open || actionDialogRef.current?.open) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".lead-domain-link"));
      const currentIndex = links.findIndex((link) => link === document.activeElement);
      if ((event.key === "j" || event.key === "k") && links.length) {
        event.preventDefault();
        const index = currentIndex < 0 ? 0 : (currentIndex + (event.key === "j" ? 1 : -1) + links.length) % links.length;
        links[index].focus();
      } else if ((event.key === "a" || event.key === "r") && document.activeElement instanceof HTMLAnchorElement) {
        const focusedLink = document.activeElement;
        const lead = leads.find((item) => item.id === focusedLink.dataset.leadId);
        if (!lead || lead.human_approval !== "PENDING" || (event.key === "a" && !hasValidEmail(lead.email))) return;
        event.preventDefault();
        setKeyboardLead(lead);
        setKeyboardAction(event.key === "a" ? "approve" : "reject");
        setKeyboardNote("");
        actionDialogRef.current?.showModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leads]);

  async function loadMore() {
    if (loading || !hasMore || !leads.length) return;
    setLoading(true);
    setError("");
    const last = leads[leads.length - 1];
    const params = new URLSearchParams({
      ...filters,
      cursorAt: last.updated_at,
      cursorId: last.id,
    });
    try {
      const response = await fetch(`/api/leads/queue?${params}`, { cache: "no-store" });
      const result = await response.json() as { leads?: LeadListItem[]; hasMore?: boolean; message?: string };
      if (!response.ok || !result.leads) throw new Error(result.message ?? "Could not load more leads.");
      setLeads((current) => [...current, ...result.leads!]);
      setHasMore(Boolean(result.hasMore));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more leads.");
    } finally {
      setLoading(false);
    }
  }

  async function rejectSelected() {
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/leads/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, note }),
      });
      const result = await response.json() as { message?: string; rejected?: number };
      if (!response.ok) {
        setMessage(result.message ?? "Could not reject selected leads.");
        return;
      }
      setMessage(`${result.rejected ?? 0} leads rejected.`);
      dialogRef.current?.close();
      window.location.reload();
    } catch {
      setMessage("Could not reject selected leads.");
    } finally {
      setBusy(false);
    }
  }

  async function submitKeyboardAction() {
    if (!keyboardLead || !keyboardAction) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/leads/${keyboardLead.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: keyboardAction, note: keyboardNote }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? "Could not update this lead.");
        actionDialogRef.current?.close();
        return;
      }
      setMessage(keyboardAction === "approve" ? "Approved, moved to Drafts." : "Lead rejected.");
      actionDialogRef.current?.close();
      window.location.reload();
    } catch {
      setMessage("Could not update this lead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {filters.status === "PENDING" && <div className="bulk-tools">
        <button type="button" disabled={!selected.length} onClick={() => dialogRef.current?.showModal()}>Reject selected ({selected.length})</button>
        <label>Shared rejection note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <span role="status">{message}</span>
      </div>}
      <div className="table-scroll">
        <table>
          <thead><tr>{filters.status === "PENDING" && <th>Select</th>}<th>Domain</th><th>Company</th><th>Country</th><th>Agent</th><th>Screening</th><th>Email</th><th>Updated</th></tr></thead>
          <tbody>{leads.map((lead) => {
            const emailMissing = !hasValidEmail(lead.email);
            return <tr key={lead.id}>
              {filters.status === "PENDING" && <td><input aria-label={`Select ${lead.domain}`} type="checkbox" checked={selected.includes(lead.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id))} /></td>}
              <td><Link className="lead-domain-link" data-lead-id={lead.id} href={`/leads/${lead.id}`}>{lead.domain}</Link>{lead.returned_from_drafts && <div><span className="badge badge-returned">Returned from drafts</span><small className="returned-note">{lead.human_note}</small></div>}</td>
              <td>{lead.company_name ?? "—"}</td><td>{lead.country ?? "—"}</td>
              <td><span className={`badge badge-${lead.agent_approval.toLowerCase()}`}>{lead.agent_approval}</span></td>
              <td><span className="badge">{lead.antispam_tag}</span></td>
              <td>{emailMissing ? <><span className="badge badge-email-required">Email required</span><div>{lead.email ?? "No email address"}</div></> : lead.email}</td>
              <td><time dateTime={lead.updated_at}>              {updatedDateFormat.format(new Date(lead.updated_at))}</time></td>
            </tr>;
          })}{loading && Array.from({ length: 3 }, (_, index) => <tr className="skeleton-row" key={`skeleton-${index}`} aria-hidden="true"><td colSpan={filters.status === "PENDING" ? 8 : 7}><span /></td></tr>)}</tbody>
        </table>
        {leads.length === 0 && <p className="empty-state">Nothing to review.</p>}
      </div>
      <div className="pagination">
        <span>Showing {leads.length} of {total}</span>
        {error && <span role="alert">{error}</span>}
        {hasMore && <button type="button" disabled={loading} onClick={loadMore}>{loading ? "Loading…" : error ? "Retry" : "Load more"}</button>}
      </div>
      <dialog ref={dialogRef} className="confirm-dialog">
        <h2>Reject {selected.length} leads?</h2>
        <p>This action rejects the selected leads. Rejected leads can be reopened individually.</p>
        <ul>{leads.filter((lead) => selected.includes(lead.id)).map((lead) => <li key={lead.id}>{lead.domain} · {lead.company_name ?? "—"} · {lead.country ?? "—"} · {lead.email ?? "No email address"} · {lead.antispam_tag}</li>)}</ul>
        <label>Rejection note<textarea required value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <div className="dialog-actions"><button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button><button type="button" disabled={busy || !note.trim()} onClick={rejectSelected}>Confirm rejection</button></div>
      </dialog>
      <dialog ref={actionDialogRef} className="confirm-dialog" onCancel={() => { setKeyboardAction(null); setKeyboardNote(""); }}>
        <h2>Confirm {keyboardAction}</h2>
        <p>Domain: {keyboardLead?.domain}</p><p>Company: {keyboardLead?.company_name ?? "—"}</p><p>Country: {keyboardLead?.country ?? "—"}</p>
        <p>Email: {keyboardLead?.email ?? "No email address"}</p><p>Screening tag: {keyboardLead?.antispam_tag} (screening aid only)</p>
        {keyboardAction === "reject" && <label>Rejection note<textarea required value={keyboardNote} onChange={(event) => setKeyboardNote(event.target.value)} /></label>}
        <div className="dialog-actions"><button type="button" onClick={() => actionDialogRef.current?.close()}>Cancel</button><button type="button" disabled={busy || (keyboardAction === "reject" && !keyboardNote.trim())} onClick={submitKeyboardAction}>Confirm {keyboardAction}</button></div>
      </dialog>
    </>
  );
}
