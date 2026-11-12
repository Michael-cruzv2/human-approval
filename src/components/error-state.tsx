"use client";

type ErrorStateProps = {
  title?: string;
  description?: string;
  requestId?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = "Something went wrong",
  description,
  requestId,
  retryLabel = "Try again",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="error-state" role="alert" aria-live="polite">
      <div className="error-icon" aria-hidden="true">
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {requestId && (
        <div className="request-id">Request ID: {requestId}</div>
      )}
      {onRetry && (
        <button className="btn btn-primary" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}