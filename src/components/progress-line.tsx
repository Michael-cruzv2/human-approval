"use client";

type ProgressLineProps = {
  label?: string;
};

export function ProgressLine({ label = "Updating…" }: ProgressLineProps) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div className="progress-line" aria-hidden="true">
        <i />
      </div>
      <div className="updating-chip" role="status" aria-live="polite">
        <span className="spin spin-sm" />
        <span>{label}</span>
      </div>
    </div>
  );
}