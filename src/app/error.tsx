"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="login-shell">
      <section className="login-card" role="alert">
        <h1>Something went wrong</h1>
        <p>Please try again. If the problem continues, share this reference with the app owner:</p>
        <p className="request-id">{error.digest ?? "Reference unavailable"}</p>
        <button className="btn btn-primary" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
