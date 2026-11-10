"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="login-shell">
          <section className="login-card" role="alert">
            <h1>Something went wrong</h1>
            <p>Please try again. Reference:</p>
            <p className="request-id">{error.digest ?? "Reference unavailable"}</p>
            <button className="btn btn-primary" type="button" onClick={reset}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
