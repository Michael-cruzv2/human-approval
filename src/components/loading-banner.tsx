"use client";

type LoadingBannerProps = {
  onRetry?: () => void;
  message?: string;
};

export function LoadingBanner({ onRetry, message = "Taking longer than usual" }: LoadingBannerProps) {
  return (
    <div className="loading-banner" role="status" aria-live="polite">
      <span className="spin" />
      <span>{message}</span>
      {onRetry && (
        <button className="btn btn-sm" type="button" onClick={onRetry} style={{ marginLeft: "auto" }}>
          Try again
        </button>
      )}
    </div>
  );
}