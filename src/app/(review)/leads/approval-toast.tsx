"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ApprovalToast({
  leadId,
  returnHref,
}: {
  leadId: string;
  returnHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function undo() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/leads/${leadId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? "Could not undo this approval.");
        return;
      }
      router.replace(returnHref);
    } catch {
      setError("Could not undo this approval.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="approval-toast" role="status" aria-live="polite">
      <div>
        <strong>Approved, moved to Drafts.</strong>
        <span>The lead no longer appears in Leads.</span>
        {error && <span className="field-error" role="alert">{error}</span>}
      </div>
      <button type="button" disabled={busy} onClick={undo}>{busy ? "Undoing…" : "Undo"}</button>
    </aside>
  );
}
