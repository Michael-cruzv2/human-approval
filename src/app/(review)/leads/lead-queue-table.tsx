"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingBanner } from "@/components/loading-banner";

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
type Filters = { status: "PENDING" | "APPROVED" | "REJECTED" | "ALL"; agent: string; tag: string; country: string; search: string; email: "ALL" | "MISSING"; returned: boolean };
type QueueState = "PENDING" | "MISSING" | "RETURNED" | "APPROVED" | "REJECTED" | "ALL";

const emptyCopy: Record<QueueState, { title: string; description: string }> = {
  PENDING: {
    title: "Nothing to review",
    description: "All pending leads have been actioned. Check back later, or open Rejected to reopen a lead.",
  },
  MISSING: {
    title: "Every pending lead has an email",
    description: "No pending lead is missing a valid email address. Leads in this state cannot be approved.",
  },
  RETURNED: {
    title: "No returned leads",
    description: "No draft has been sent back for verification. Leads returned from Drafts appear here.",
  },
  APPROVED: {
    title: "No approved leads in flight",
    description: "Approved leads remain here until they are sent. They may have been sent or archived.",
  },
  REJECTED: {
    title: "No rejected leads",
    description: "Nothing has been rejected yet. Rejected leads can be reopened from here.",
  },
  ALL: {
    title: "No leads in this view",
    description: "No pending or rejected lead matches these filters. Adjust the filters or check back later.",
  },
};

function hasValidEmail(email: string | null): boolean {
  return Boolean(email && email === email.toLowerCase() && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email));
}

export default function LeadQueueTable({
  leads: initialLeads,
  total,
  hasMore: initiallyHasMore,
  filters,
  state,
  selectedLeadId,
}: {
  leads: LeadListItem[];
  total: number;
  hasMore: boolean;
  filters: Filters;
  state: QueueState;
  selectedLeadId: string;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [hasMore, setHasMore] = useState(initiallyHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [slow, setSlow] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [requestId, setRequestId] = useState("");
  const startRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
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
      const detailPane = document.querySelector<HTMLElement>(".lead-detail-pane");
      const detailVisible = Boolean(detailPane?.getClientRects().length);
      if (event.key === "e" && detailVisible) {
        const firstField = detailPane?.querySelector<HTMLInputElement>("#lead-company_name");
        if (firstField) {
          event.preventDefault();
          firstField.focus();
        }
      } else if (event.key === "f" && detailVisible) {
        const fullData = detailPane?.querySelector<HTMLDetailsElement>(".lead-full-data");
        if (fullData) {
          event.preventDefault();
          fullData.open = !fullData.open;
        }
      } else if ((event.key === "j" || event.key === "k") && links.length) {
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

  useEffect(() => {
    mountedRef.current = true;
    if (loading) {
      startRef.current = setTimeout(() => setSlow(true), 8000);
      errorRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setErrorState(true);
          setRequestId(`req-${Date.now()}`);
        }
      }, 20000);
    } else {
      if (startRef.current) clearTimeout(startRef.current);
      if (slowRef.current) clearTimeout(slowRef.current);
      if (errorRef.current) clearTimeout(errorRef.current);
      setTimeout(() => {
        setSlow(false);
        setErrorState(false);
        setRequestId("");
      }, 0);
    }
    const startTimer = startRef.current;
    const slowTimer = slowRef.current;
    const errorTimer = errorRef.current;
    return () => {
      if (startTimer) clearTimeout(startTimer);
      if (slowTimer) clearTimeout(slowTimer);
      if (errorTimer) clearTimeout(errorTimer);
    };
  }, [loading]);

  async function loadMore() {
    if (loading || !hasMore || !leads.length) return;
    setLoading(true);
    setError("");
    const last = leads[leads.length - 1];
    const params = new URLSearchParams({
      ...filters,
      returned: String(filters.returned),
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

  const showSkeleton = loading && !errorState;

  return (
    <>
      {errorState && (
        <ErrorState
          title="Could not load leads"
          description="Your existing leads are still safe. Try again to reload the queue."
          requestId={requestId}
          retryLabel="Try again"
          onRetry={() => {
            setErrorState(false);
            setRequestId("");
            setLoading(true);
          }}
        />
      )}
      {!errorState && slow && (
        <LoadingBanner
          message="Taking longer than usual"
          onRetry={() => {
            setLoading(true);
            setSlow(false);
          }}
        />
      )}
      {!errorState && filters.status === "PENDING" && (selected.length > 0 || message) && (
        <div className="bulk-tools">
          <button className="btn btn-sm btn-stop" type="button" disabled={!selected.length} onClick={() => dialogRef.current?.showModal()}>
            Reject selected ({selected.length})
          </button>
          <label>
            Shared rejection note
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <span role="status">{message}</span>
        </div>
      )}
      {!errorState && (
        <>
          <div
            className="lead-queue-list"
            role="list"
            aria-label="Leads to verify"
            aria-busy={loading || slow}
          >
        {leads.map((lead) => {
          const emailMissing = !hasValidEmail(lead.email);
          const params = new URLSearchParams({
            status: filters.status,
            agent: filters.agent,
            tag: filters.tag,
            country: filters.country,
            search: filters.search,
            email: filters.email,
            returned: String(filters.returned),
            lead: lead.id,
          });
          const statusChip = lead.human_approval === "APPROVED"
            ? { className: "badge badge-approved", text: "Approved" }
            : lead.human_approval === "REJECTED"
              ? { className: "badge badge-rejected", text: "Rejected" }
            : lead.returned_from_drafts
              ? { className: "badge badge-returned", text: "↩ Returned from drafts" }
              : emailMissing
                ? { className: "badge badge-email-required", text: "Email required" }
                : lead.agent_approval === "NEEDS_REVIEW"
                  ? { className: "badge badge-needs_review", text: "Needs review" }
                  : { className: "badge badge-verified", text: "Verified" };
          return (
            <article className={`lead-queue-item${selectedLeadId === lead.id ? " is-selected" : ""}`} key={lead.id} role="listitem">
              {filters.status === "PENDING" && (
                <input
                  aria-label={`Select ${lead.domain}`}
                  type="checkbox"
                  checked={selected.includes(lead.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id),
                    )
                  }
                />
              )}
              <Link
                className="lead-domain-link"
                data-lead-id={lead.id}
                href={`/leads?${params}`}
                scroll={false}
                aria-current={selectedLeadId === lead.id ? "true" : undefined}
              >
                <span className="lead-row-head">
                  <span className="lead-row-title">{lead.domain}</span>
                  <span className="lead-row-country">{lead.country ?? "—"}</span>
                </span>
                <span className="lead-row-domain">{lead.company_name ?? "Company unknown"}</span>
                <span className="lead-row-meta">
                  <span className={statusChip.className}>{statusChip.text}</span>
                </span>
                {lead.returned_from_drafts && lead.human_note && <small className="returned-note">{lead.human_note}</small>}
              </Link>
            </article>
          );
        })}
        {loading && showSkeleton && (
          <div className="queue-skeleton-row" aria-hidden="true">
            <span className="lead-row-head">
              <Skeleton width={168} height={13} />
              <Skeleton width={22} height={11} />
            </span>
            <Skeleton width={104} height={11} className="queue-skeleton-sub" />
            <Skeleton width={78} height={20} radius="999px" />
          </div>
        )}
        {!loading && leads.length === 0 && (
          <EmptyState title={emptyCopy[state].title} description={emptyCopy[state].description} />
        )}
      </div>
      <div className="queue-foot">
        <span>Showing {leads.length} of {total}</span>
        {!slow && error && <span role="alert">{error}</span>}
        {hasMore && (
          <button
            className={`btn btn-sm ${loading ? "loading-more" : ""}`}
            type="button"
            disabled={loading}
            onClick={loadMore}
          >
            {loading ? "Loading 25 more…" : error ? "Retry" : "Load more"}
          </button>
        )}
      </div>
        </>)} {/* end !errorState */}
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
