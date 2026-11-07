"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const EMAIL_KEY = "lead-review-login-email";

export default function VerifyForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(60);

  useEffect(() => {
    const storedEmail = sessionStorage.getItem(EMAIL_KEY);
    if (!storedEmail) router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = sessionStorage.getItem(EMAIL_KEY);
    if (!email) {
      router.replace("/login");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? "Code incorrect or expired.");
        return;
      }
      sessionStorage.removeItem(EMAIL_KEY);
      router.replace("/");
    } catch {
      setMessage("Could not verify the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const email = sessionStorage.getItem(EMAIL_KEY);
    if (resendSeconds > 0 || busy || !email) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as { message?: string };
      setMessage(result.message ?? "If this email is authorised, a code has been sent.");
      setResendSeconds(60);
    } catch {
      setMessage("Could not request a new code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="code">Six-digit code</label>
        <input
          autoComplete="one-time-code"
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          required
        />
        <button type="submit" disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Verify code"}
        </button>
        <p className="form-message" role="status" aria-live="polite">
          {message}
        </p>
      </form>
      <button className="text-button" type="button" onClick={resend} disabled={busy || resendSeconds > 0}>
        {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
      </button>
    </>
  );
}
