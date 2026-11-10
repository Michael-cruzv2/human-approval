"use client";

import Link from "next/link";
import { useState } from "react";

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

  return (
    <>
      <div className="table-scroll">
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
            {loading && Array.from({ length: 3 }, (_, index) => (
              <tr className="skeleton-row" key={`skeleton-${index}`} aria-hidden="true">
                <td colSpan={9}><span /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && <p className="empty-state" style={{ padding: "1.5rem 0.875rem" }}>No leads match these filters.</p>}
      </div>
      <div className="pagination">
        <span className="muted">Showing {leads.length} of {total}</span>
        {error && <span role="alert">{error}</span>}
        {hasMore && (
          <button className="btn btn-sm" type="button" disabled={loading} onClick={loadMore}>
            {loading ? "Loading…" : error ? "Retry" : "Load more"}
          </button>
        )}
      </div>
    </>
  );
}
