"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"one" | "all" | null>(null);

  async function logout(endpoint: string, scope: "one" | "all") {
    setBusy(scope);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      if (!response.ok) {
        setMessage("Could not sign out. Try again.");
        return;
      }
      router.replace("/login");
    } catch {
      setMessage("Could not sign out. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => logout("/api/auth/logout", "one")}
        disabled={busy !== null}
      >
        {busy === "one" ? "Signing out…" : "Log out"}
      </button>
      <button
        type="button"
        onClick={() => logout("/api/auth/logout-everywhere", "all")}
        disabled={busy !== null}
      >
        {busy === "all" ? "Signing out…" : "Log out everywhere"}
      </button>
      {message && (
        <p className="form-message" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </>
  );
}
