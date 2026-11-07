import VerifyForm from "./verify-form";

export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="verify-title">
        <p className="eyebrow">Lead Review</p>
        <h1 id="verify-title">Enter your code</h1>
        <p>Enter the six-digit code from your email. It expires after 10 minutes.</p>
        <VerifyForm />
      </section>
    </main>
  );
}
