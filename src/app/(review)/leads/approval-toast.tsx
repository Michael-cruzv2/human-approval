"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [showUndo, setShowUndo] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowUndo(false), 2000);
    return () => window.clearTimeout(timeout);
  }, []);

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
        <strong>Approved, draft requested.</strong>
        <span>The lead stays in Leads and appears in Drafts; it leaves Leads once the email is sent.</span>
        {error && <span className="field-error" role="alert">{error}</span>}
      </div>
      {showUndo && <button type="button" disabled={busy} onClick={undo}>{busy ? "Undoing…" : "Undo"}</button>}
    </aside>
  );
}
