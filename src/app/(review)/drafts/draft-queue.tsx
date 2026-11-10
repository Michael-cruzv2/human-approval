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
  selectedItemId,
}: {
  drafts: DraftQueueItem[];
  view: "to-review" | "awaiting-draft" | "approved";
  search: string;
  total: number;
  hasMore: boolean;
  selectedItemId: string;
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
      <div className="draft-queue-list" role="list" aria-label="Draft queue">
        {drafts.map((draft) => {
          const itemId = draft.draft_id ?? draft.lead_id;
          const params = new URLSearchParams({ view, search, [view === "awaiting-draft" ? "lead" : "draft"]: itemId });
          const href = `/drafts?${params}`;
          return <article className={`draft-queue-item${selectedItemId === itemId ? " is-selected" : ""}`} key={draft.id} role="listitem">
            <Link href={href} scroll={false} aria-current={selectedItemId === itemId ? "true" : undefined}>
              <span className="draft-row-title">{draft.company_name ?? draft.domain}</span>
              <span className="draft-row-domain">{draft.domain}</span>
              <span className="draft-row-email">{draft.email}</span>
              <span className="draft-row-meta">
                <span className={`badge ${view === "awaiting-draft" ? "badge-awaiting" : draft.human_approval === "APPROVED" ? "badge-approved" : "badge-pending"}`}>
                  {view === "awaiting-draft" ? "Awaiting draft" : draft.human_approval.replaceAll("_", " ")}
                </span>
                {draft.version !== null && <span>Version {draft.version}</span>}
              </span>
              <small>Updated {updatedDateFormat.format(new Date(draft.updated_at))}</small>
            </Link>
          </article>;
        })}
        {loading && Array.from({ length: 3 }, (_, index) => <div className="skeleton-card" key={`skeleton-${index}`} aria-hidden="true"><span /><span /></div>)}
        {drafts.length === 0 && <p className="empty-state">Nothing to review.</p>}
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
