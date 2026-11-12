"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingBanner } from "@/components/loading-banner";

type AllLead = {
  id: string;
  domain: string;
  company_name: string | null;
  country: string | null;
  agent_approval: string;
  lead_status: string;
  email_present: boolean;
  draft_status: string;
  send_status: string;
  updated_at: string;
  draft_id: string | null;
};
type Filters = {
  status: string;
  agent: string;
  country: string;
  tag: string;
  email: string;
  draft: string;
  search: string;
};

const updatedFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function agentChip(value: string) {
  if (value === "VERIFIED") return { className: "badge badge-verified", label: "Verified" };
  if (value === "NEEDS_REVIEW") return { className: "badge badge-needs_review", label: "Needs review" };
  if (value === "REJECTED") return { className: "badge badge-rejected", label: "Rejected" };
  return { className: "badge", label: value.toLowerCase() };
}

function leadChip(value: string) {
  if (value === "APPROVED") return { className: "badge badge-approved", label: "Approved" };
  if (value === "REJECTED") return { className: "badge badge-rejected", label: "Rejected" };
  if (value === "ARCHIVED") return { className: "badge", label: "Archived" };
  return { className: "badge badge-pending", label: "Pending" };
}

function draftCell(value: string) {
  if (value === "PENDING") return <span className="badge badge-needs_review">Pending review</span>;
  if (value === "APPROVED") return <span className="badge badge-approved">Approved</span>;
  if (value === "REJECTED") return <span className="badge badge-rejected">Rejected</span>;
  return <span className="muted">None</span>;
}

function sendCell(value: string) {
  if (value === "SENT") return <span className="badge badge-done">Sent</span>;
  if (value === "SENDING") return <span className="badge badge-attention">Sending</span>;
  return <span className="muted">Not queued</span>;
}

function ActionLink({ lead, back }: { lead: AllLead; back: string }) {
  if (lead.lead_status === "PENDING" || lead.lead_status === "REJECTED") {
    return (
      <Link className="row-action" href={`/leads/${lead.id}`}>
        {lead.lead_status === "REJECTED" ? "Reopen in Leads" : "Open in Leads"}
      </Link>
    );
  }
  if (lead.lead_status === "APPROVED") {
    const href = lead.draft_id
      ? `/drafts?view=to-review&draft=${lead.draft_id}`
      : `/drafts?view=awaiting-draft&lead=${lead.id}`;
    return <Link className="row-action is-drafts" href={href}>Open in Drafts</Link>;
  }
  return (
    <Link className="row-action is-muted" scroll={false} href={`/all/${lead.id}?back=${encodeURIComponent(back)}`}>
      Full data
    </Link>
  );
}

export default function AllQueue({
  leads: initialLeads,
  filters,
  total,
  hasMore: initiallyHasMore,
}: {
  leads: AllLead[];
  filters: Filters;
  total: number;
  hasMore: boolean;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [hasMore, setHasMore] = useState(initiallyHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [requestId, setRequestId] = useState("");
  const startRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const params = new URLSearchParams(filters);
  const backToAll = `/all?${params}`;

  async function loadMore() {
    if (loading || !hasMore || !leads.length) return;
    setLoading(true);
    setError("");
    const last = leads[leads.length - 1];
    const nextParams = new URLSearchParams({
      ...filters,
      cursorAt: last.updated_at,
      cursorId: last.id,
    });
    try {
      const response = await fetch(`/api/all?${nextParams}`, { cache: "no-store" });
      const result = (await response.json()) as {
        leads?: AllLead[];
        hasMore?: boolean;
        message?: string;
      };
      if (!response.ok || !result.leads) throw new Error(result.message ?? "Could not load more leads.");
      setLeads((current) => [...current, ...result.leads!]);
      setHasMore(Boolean(result.hasMore));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more leads.");
    } finally {
      setLoading(false);
    }
  }

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
    return () => {
      if (startRef.current) clearTimeout(startRef.current);
      if (slowRef.current) clearTimeout(slowRef.current);
      if (errorRef.current) clearTimeout(errorRef.current);
    };
  }, [loading]);

  const showSkeleton = loading && !errorState;

  return (
    <>
      {errorState && (
        <ErrorState
          title="Could not load leads"
          description="Your existing leads are still safe. Try again to reload the overview."
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
      {!errorState && (
        <>
          <div className="table-scroll" aria-busy={loading || slow}>
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Country</th>
                  <th>Agent</th>
                  <th>Lead status</th>
                  <th>Email</th>
                  <th>Draft</th>
                  <th>Sending</th>
                  <th>Updated</th>
                  <th><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const agent = agentChip(lead.agent_approval);
                  const status = leadChip(lead.lead_status);
                  return (
                    <tr key={lead.id}>
                      <td>
                        <span className="cell-lead">
                          <Link scroll={false} href={`/all/${lead.id}?back=${encodeURIComponent(backToAll)}`}>
                            <strong>{lead.domain}</strong>
                          </Link>
                          <span>{lead.company_name ?? "—"}</span>
                        </span>
                      </td>
                      <td data-label="Country">{lead.country ?? "—"}</td>
                      <td data-label="Agent"><span className={agent.className}>{agent.label}</span></td>
                      <td data-label="Lead status"><span className={status.className}>{status.label}</span></td>
                      <td data-label="Email">
                        {lead.email_present
                          ? <span>Present</span>
                          : <span className="badge badge-email-required">Missing</span>}
                      </td>
                      <td data-label="Draft">{draftCell(lead.draft_status)}</td>
                      <td data-label="Sending">{sendCell(lead.send_status)}</td>
                      <td data-label="Updated" className="lead-num">{updatedFormat.format(new Date(lead.updated_at))}</td>
                      <td className="cell-action"><ActionLink lead={lead} back={backToAll} /></td>
                    </tr>
                  );
                })}
                {loading && showSkeleton && (
                  <>
                    <tr key="skeleton-lead" aria-hidden="true">
                      <td colSpan={9}><Skeleton width={120} height={12} /></td>
                    </tr>
                    <tr key="skeleton-agent" aria-hidden="true">
                      <td colSpan={9}><Skeleton width={60} height={12} /></td>
                    </tr>
                    <tr key="skeleton-status" aria-hidden="true">
                      <td colSpan={9}><Skeleton width={80} height={12} /></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            {!loading && leads.length === 0 && (
              <EmptyState
                title="Nothing to review"
                description="No leads match these filters. Try adjusting the filters or check back later."
              />
            )}
          </div>
          <div className="pagination">
            <span className="muted">Showing {leads.length} of {total}</span>
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
        </>
      )}
    </>
  );
}
