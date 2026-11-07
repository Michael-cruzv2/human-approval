"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/logout-everywhere", { method: "POST" });
      if (!response.ok) {
        setMessage("Could not sign out. Try again.");
        return;
      }
      router.replace("/login");
    } catch {
      setMessage("Could not sign out. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="auth-action" type="button" onClick={logout} disabled={busy}>
        {busy ? "Signing out…" : "Log out everywhere"}
      </button>
      <p className="form-message" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
