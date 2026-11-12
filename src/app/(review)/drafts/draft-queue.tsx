"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingBanner } from "@/components/loading-banner";

type DraftQueueItem = {
  id: string;
  lead_id: string;
  draft_id: string | null;
  domain: string;
  company_name: string | null;
  country: string | null;
  email: string;
  version: number | null;
  human_approval: string;
  updated_at: string;
  editor_name: string | null;
};

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function writtenLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "—";
  const now = new Date();
  const sameDay = parsed.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  return sameDay ? `today ${timeFormat.format(parsed)}` : `${dayFormat.format(parsed)}, ${timeFormat.format(parsed)}`;
}

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
  const [slow, setSlow] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [requestId, setRequestId] = useState("");
  const startRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

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
      const response = await fetch(`/api/drafts/queue?${params}`, { cache: "no-store" });
      const result = (await response.json()) as {
        drafts?: DraftQueueItem[];
        hasMore?: boolean;
        message?: string;
      };
      if (!response.ok || !result.drafts) throw new Error(result.message ?? "Could not load more drafts.");
      setDrafts((current) => [...current, ...result.drafts!]);
      setHasMore(Boolean(result.hasMore));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more drafts.");
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
          title="Could not load drafts"
          description="Your existing drafts are still safe. Try again to reload the queue."
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
          <div className="draft-queue-list" role="list" aria-label="Draft queue" aria-busy={loading || slow}>
            {drafts.map((draft) => {
              const itemId = draft.draft_id ?? draft.lead_id;
              const params = new URLSearchParams({ view, search, [view === "awaiting-draft" ? "lead" : "draft"]: itemId });
              const href = `/drafts?${params}`;
              const status =
                view === "awaiting-draft"
                  ? { className: "badge badge-awaiting", label: "Awaiting draft" }
                  : draft.human_approval === "APPROVED"
                    ? { className: "badge badge-approved", label: "Approved" }
                    : { className: "badge badge-pending", label: "Pending" };
              const subtitle =
                view === "awaiting-draft"
                  ? `Approved ${writtenLabel(draft.updated_at)}`
                  : `Draft ${draft.version ?? 1}, written ${writtenLabel(draft.updated_at)}`;
              return (
                <article className={`draft-queue-item${selectedItemId === itemId ? " is-selected" : ""}`} key={draft.id} role="listitem">
                  <Link href={href} scroll={false} aria-current={selectedItemId === itemId ? "true" : undefined}>
                    <span className="lead-row-head">
                      <span className="lead-row-title">{draft.company_name ?? draft.domain}</span>
                      <span className="lead-row-country">{draft.country ?? "—"}</span>
                    </span>
                    <span className="draft-row-domain">{subtitle}</span>
                    <span className="lead-row-meta">
                      {draft.version !== null && draft.version > 1 && <span className="badge badge-new">New version</span>}
                      <span className={status.className}>{status.label}</span>
                    </span>
                  </Link>
                </article>
              );
            })}
            {loading && showSkeleton && (
              <>
                <Skeleton width={170} height={14} className="skeleton-title" />
                <Skeleton width={110} height={11} className="skeleton-subtitle" />
                <Skeleton width={26} height={11} className="skeleton-meta" />
                <Skeleton width={70} height={20} radius="999px" className="skeleton-chip" />
              </>
            )}
            {!loading && drafts.length === 0 && (
              <EmptyState
                title="Nothing to review"
                description="All pending drafts have been actioned. Approve a lead in the Leads tab to generate a draft."
              />
            )}
          </div>
          <div className="queue-foot">
            <span>Showing {drafts.length} of {total}</span>
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
