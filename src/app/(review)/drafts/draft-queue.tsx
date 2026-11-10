"use client";

import Link from "next/link";
import { useState } from "react";

type DraftQueueItem = {
  id: string;
  lead_id: string;
  draft_id: string | null;
  domain: string;
  company_name: string | null;
  email: string;
  version: number | null;
  human_approval: string;
  updated_at: string;
  editor_name: string | null;
};

const updatedDateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default function DraftQueue({
  drafts: initialDrafts,
  view,
  search,
  total,
  hasMore: initiallyHasMore,
}: {
  drafts: DraftQueueItem[];
  view: "to-review" | "awaiting-draft" | "approved";
  search: string;
  total: number;
  hasMore: boolean;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [hasMore, setHasMore] = useState(initiallyHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadMore() {
    if (loading || !hasMore || !drafts.length) return;
    setLoading(true);
    setError("");
    const last = drafts[drafts.length - 1];
    const params = new URLSearchParams({
      view,
      search,
      cursorAt: last.updated_at,
      cursorId: last.id,
    });
    try {
      const response = await fetch(`/api/drafts/queue?${params}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        drafts?: DraftQueueItem[];
        hasMore?: boolean;
        message?: string;
      };
      if (!response.ok || !result.drafts)
        throw new Error(result.message ?? "Could not load more drafts.");
      setDrafts((current) => [...current, ...result.drafts!]);
      setHasMore(Boolean(result.hasMore));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load more drafts.",
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
              <th>Company</th>
              <th>Domain</th>
              <th>Recipient email</th>
              <th>Version</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Last edited by</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr key={draft.id}>
                <td>
                  <Link
                    href={
                      view === "awaiting-draft"
                        ? `/all/${draft.lead_id}`
                        : `/drafts/${draft.draft_id}`
                    }
                  >
                    {draft.company_name ?? draft.domain}
                  </Link>
                </td>
                <td>{draft.domain}</td>
                <td>{draft.email}</td>
                <td>{draft.version ?? "—"}</td>
                <td>
                  {view === "awaiting-draft"
                    ? "Awaiting draft"
                    : draft.human_approval}
                </td>
                <td>
                  <time dateTime={draft.updated_at}>
                    {updatedDateFormat.format(new Date(draft.updated_at))}
                  </time>
                </td>
                <td>{draft.editor_name ?? "—"}</td>
              </tr>
            ))}
            {loading &&
              Array.from({ length: 3 }, (_, index) => (
                <tr
                  className="skeleton-row"
                  key={`skeleton-${index}`}
                  aria-hidden="true"
                >
                  <td colSpan={7}>
                    <span />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {drafts.length === 0 && (
          <p className="empty-state">Nothing to review.</p>
        )}
      </div>
      <div className="pagination">
        <span>
          Showing {drafts.length} of {total}
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
