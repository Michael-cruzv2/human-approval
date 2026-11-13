"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/spinner";

type GenerationResult = {
  leadId: string;
  status: "GENERATED" | "SKIPPED" | "FAILED";
  reason?: string;
  message?: string;
};

function summarize(results: GenerationResult[]): string {
  const generated = results.filter((result) => result.status === "GENERATED").length;
  const failure = results.find((result) => result.status === "FAILED");
  if (failure) return failure.message ?? "Could not generate a draft.";
  const skipped = results.find((result) => result.status === "SKIPPED");
  if (skipped) {
    if (skipped.reason === "DISABLED") return "Drafting is switched off in settings.";
    if (skipped.reason === "LIVE_DRAFT_EXISTS") return "A live draft already exists for this lead.";
    if (skipped.reason === "NOT_ELIGIBLE") return "This lead is no longer approved with a valid email.";
    return "No draft was generated.";
  }
  return generated === 1 ? "Draft generated." : `${generated} drafts generated.`;
}

export default function GenerateDraftButton({
  leadIds,
  label,
  busyLabel,
  className = "btn btn-sm",
  disabled = false,
  disabledReason,
}: {
  leadIds: string[];
  label: string;
  busyLabel: string;
  className?: string;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    if (busy || disabled) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: leadIds.slice(0, 5) }),
      });
      const result = (await response.json()) as { results?: GenerationResult[]; message?: string };
      if (!response.ok || !result.results) {
        setMessage(result.message ?? "Could not generate a draft.");
        return;
      }
      setMessage(summarize(result.results));
      if (result.results.some((item) => item.status === "GENERATED")) router.refresh();
    } catch {
      setMessage("Could not generate a draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="generate-action">
      <button className={className} type="button" disabled={busy || disabled} onClick={generate} title={disabled ? (disabledReason ?? undefined) : undefined}>
        {busy ? (
          <>
            <Spinner size="sm" />
            {busyLabel}
          </>
        ) : (
          label
        )}
      </button>
      {disabled && disabledReason && <span className="blocked-reason">{disabledReason}</span>}
      {message && (
        <span className="form-message" role="status" aria-live="polite">
          {message}
        </span>
      )}
    </span>
  );
}
