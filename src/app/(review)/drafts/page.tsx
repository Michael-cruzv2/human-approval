import Link from "next/link";
import { z } from "zod";
import { getDraftQueueCounts, getDraftQueuePage } from "@/lib/server/review/draft-queue";
import DraftQueue from "./draft-queue";

export const dynamic = "force-dynamic";
const View = z.enum(["to-review", "awaiting-draft", "approved"]);

export default async function DraftsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = View.safeParse(params.view).success ? View.parse(params.view) : "to-review";
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const [result, counts] = await Promise.all([
    getDraftQueuePage(view, search),
    getDraftQueueCounts(),
  ]);
  const rows = result.rows.slice(0, 25);
  return (
    <section className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Email text review</p><h1>Drafts</h1><p>Review outreach wording for approved leads. Customer details are read-only.</p></div></header>
      <nav className="subview-tabs" aria-label="Draft queue views">
        <Link aria-current={view === "to-review" ? "page" : undefined} href="/drafts?view=to-review">To review <span>{counts["to-review"]}</span></Link>
        <Link aria-current={view === "awaiting-draft" ? "page" : undefined} href="/drafts?view=awaiting-draft">Awaiting draft <span>{counts["awaiting-draft"]}</span></Link>
        <Link aria-current={view === "approved" ? "page" : undefined} href="/drafts?view=approved">Approved <span>{counts.approved}</span></Link>
      </nav>
      <form className="panel filters" action="/drafts">
        <input type="hidden" name="view" value={view} />
        <label>Company or domain<input name="search" defaultValue={search} maxLength={100} /></label>
        <button type="submit">Apply filter</button>
      </form>
      <section className="panel table-panel">
        <DraftQueue
          drafts={rows}
          view={view}
          search={search}
          total={rows[0]?.total_count ?? 0}
          hasMore={result.rows.length > 25}
        />
      </section>
    </section>
  );
}
