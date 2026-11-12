"use client";

type EmptyStateProps = {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title = "Nothing to review",
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <p>{title}</p>
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <button className="btn" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}