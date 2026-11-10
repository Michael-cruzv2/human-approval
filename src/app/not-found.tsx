export default function NotFound() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">Lead Review</p>
        <h1>Page not found</h1>
        <p>The page you asked for does not exist, or the item has moved.</p>
        <p className="login-action">
          <a className="btn btn-primary" href="/leads">
            Back to Leads
          </a>
        </p>
      </section>
    </main>
  );
}
