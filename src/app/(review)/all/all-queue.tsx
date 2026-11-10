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

const lastUpdatedFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

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
      const response = await fetch(`/api/all?${nextParams}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        leads?: AllLead[];
        hasMore?: boolean;
        message?: string;
      };
      if (!response.ok || !result.leads)
        throw new Error(result.message ?? "Could not load more leads.");
      setLeads((current) => [...current, ...result.leads!]);
      setHasMore(Boolean(result.hasMore));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load more leads.",
      );
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
              <th>Domain</th>
              <th>Company</th>
              <th>Country</th>
              <th>Agent verdict</th>
              <th>Lead status</th>
              <th>Email</th>
              <th>Draft</th>
              <th>Send</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <Link
                    scroll={false}
                    href={`/all/${lead.id}?back=${encodeURIComponent(backToAll)}`}
                  >
                    {lead.domain}
                  </Link>
                </td>
                <td>{lead.company_name ?? "—"}</td>
                <td>{lead.country ?? "—"}</td>
                <td>{lead.agent_approval}</td>
                <td>{lead.lead_status}</td>
                <td>{lead.email_present ? "Present" : "Missing"}</td>
                <td>{lead.draft_status.toLowerCase()}</td>
                <td>{lead.send_status.toLowerCase()}</td>
                <td>
                  <time dateTime={lead.updated_at}>
                    {lastUpdatedFormat.format(new Date(lead.updated_at))}
                  </time>
                </td>
              </tr>
            ))}
            {loading &&
              Array.from({ length: 3 }, (_, index) => (
                <tr
                  className="skeleton-row"
                  key={`skeleton-${index}`}
                  aria-hidden="true"
                >
                  <td colSpan={9}>
                    <span />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {leads.length === 0 && (
          <p className="empty-state">Nothing to review.</p>
        )}
      </div>
      <div className="pagination">
        <span>
          Showing {leads.length} of {total}
        </span>
        {error && <span role="alert">{error}</span>}
        {hasMore && (
          <button type="button" disabled={loading} onClick={loadMore}>
            {loading ? "Loading…" : error ? "Retry" : "Load more"}
          </button>
        )}
      </div>
    </>
  );
}
