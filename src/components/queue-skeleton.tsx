import { Skeleton } from "@/components/skeleton";

type QueueVariant = "leads" | "drafts";

function QueueRowSkeleton() {
  return (
    <div className="queue-skeleton-row" aria-hidden="true">
      <span className="lead-row-head">
        <Skeleton width={168} height={13} />
        <Skeleton width={22} height={11} />
      </span>
      <Skeleton width={104} height={11} className="queue-skeleton-sub" />
      <span className="queue-skeleton-meta">
        <Skeleton width={78} height={20} radius="999px" />
      </span>
    </div>
  );
}

/** Row-shaped placeholders for the Leads and Drafts queue panes. */
export function QueueRowsSkeleton({ variant, label }: { variant: QueueVariant; label: string }) {
  const listClass = variant === "drafts" ? "draft-queue-list" : "lead-queue-list";
  return (
    <div className={`${listClass} queue-skeleton`} aria-busy="true">
      <p className="visually-hidden" role="status" aria-live="polite">
        {label}
      </p>
      {Array.from({ length: 8 }, (_, index) => (
        <QueueRowSkeleton key={index} />
      ))}
    </div>
  );
}

/** Placeholder for the queue footer so "Showing n of N" and Load more do not jump. */
export function QueueFootSkeleton() {
  return (
    <div className="queue-foot queue-skeleton-foot" aria-hidden="true">
      <Skeleton width={92} height={11} />
    </div>
  );
}

/** Placeholder that mirrors the master-detail record pane. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="detail-skeleton" aria-busy="true">
      <p className="visually-hidden" role="status" aria-live="polite">
        {label}
      </p>
      <Skeleton width={232} height={20} />
      <Skeleton width={132} height={12} />
      <div className="detail-skeleton-panel">
        <Skeleton width="100%" height={13} />
        <Skeleton width="92%" height={13} />
        <Skeleton width="70%" height={13} />
        <Skeleton width="96%" height={13} />
        <Skeleton width="54%" height={13} />
      </div>
    </div>
  );
}

/** Placeholder rows for the read-only All table. */
export function TableSkeleton({ label, rows = 8 }: { label: string; rows?: number }) {
  return (
    <div className="table-scroll queue-skeleton" aria-busy="true">
      <p className="visually-hidden" role="status" aria-live="polite">
        {label}
      </p>
      <div className="table-skeleton" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className="table-skeleton-row" key={index}>
            <span className="table-skeleton-lead">
              <Skeleton width={158} height={12} />
              <Skeleton width={96} height={10} />
            </span>
            <Skeleton width={26} height={12} />
            <Skeleton width={68} height={20} radius="999px" />
            <Skeleton width={58} height={20} radius="999px" />
            <Skeleton width={44} height={12} />
            <Skeleton width={74} height={20} radius="999px" />
            <Skeleton width={62} height={12} />
            <Skeleton width={58} height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Neutral chip-sized placeholder for a count that has not arrived yet. */
export function CountSkeleton({ className = "" }: { className?: string }) {
  return <span className={`count-skeleton ${className}`.trim()} aria-hidden="true" />;
}
