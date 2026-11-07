import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Lead Review</p>
        <h1 id="login-title">Sign in</h1>
        <p>Use your authorised work email to receive a one-time sign-in code.</p>
        <LoginForm />
      </section>
    </main>
  );
}
