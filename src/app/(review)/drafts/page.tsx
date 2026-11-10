import { query } from "@/lib/server/db";
import Link from "next/link";
import { z } from "zod";
import { getDraftQueueCounts, getDraftQueuePage } from "@/lib/server/review/draft-queue";
import DraftQueue from "./draft-queue";
import { DraftDetailContent } from "./[id]/page";

export const dynamic = "force-dynamic";
const View = z.enum(["to-review", "awaiting-draft", "approved"]);

type AwaitingDraftLead = {
  id: string;
  lead_id: string;
  draft_id: null;
  domain: string;
  company_name: string | null;
  email: string;
  version: null;
  human_approval: string;
  updated_at: string;
  editor_name: null;
  total_count: number;
};

async function getAwaitingDraftLead(id: string, search: string): Promise<AwaitingDraftLead | undefined> {
  const result = await query<AwaitingDraftLead>(
    `SELECT l.id, l.id AS lead_id, NULL::uuid AS draft_id, l.domain, l.company_name, l.email,
            NULL::integer AS version, 'AWAITING_DRAFT' AS human_approval,
            to_char(l.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
            NULL::text AS editor_name, 1::int AS total_count
       FROM leads l
      WHERE l.id=$1 AND l.human_approval='APPROVED' AND l.archived=false
        AND l.email IS NOT NULL AND l.email=lower(l.email)
        AND l.email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$'
        AND NOT EXISTS (SELECT 1 FROM drafts d WHERE d.lead_id=l.id AND d.human_approval <> 'REJECTED')
        AND ($2='' OR l.domain ILIKE '%' || $2 || '%' OR l.company_name ILIKE '%' || $2 || '%')`,
    [id, search],
  );
  return result.rows[0];
}

export default async function DraftsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = View.safeParse(params.view).success ? View.parse(params.view) : "to-review";
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const [result, counts] = await Promise.all([
    getDraftQueuePage(view, search),
    getDraftQueueCounts(),
  ]);
  const rows = result.rows.slice(0, 25);
  const requestedItem = view === "awaiting-draft"
    ? typeof params.lead === "string" ? params.lead : ""
    : typeof params.draft === "string" ? params.draft : "";
  const validRequestedItem = z.uuid().safeParse(requestedItem).success ? requestedItem : "";
  const selected = rows.find((row) => (row.draft_id ?? row.lead_id) === validRequestedItem) ?? rows[0];
  const hasSelection = Boolean(validRequestedItem);
  const selectedItemId = validRequestedItem || selected?.draft_id || selected?.lead_id || "";
  const selectedAwaitingLead = view === "awaiting-draft" && selectedItemId
    ? selected ?? await getAwaitingDraftLead(selectedItemId, search)
    : undefined;
  const returnHref = `/drafts?${new URLSearchParams({ view, search })}`;
  return (
    <section className="page-stack">
      <header className="page-heading draft-page-heading"><div><p className="eyebrow">Email text review</p><h1>Drafts</h1><p>Review wording for approved leads. Customer details stay read-only.</p></div><span className="queue-total">{counts["to-review"]} to review</span></header>
      <nav className="subview-tabs draft-subview-tabs" aria-label="Draft queue views">
        <Link aria-current={view === "to-review" ? "page" : undefined} href="/drafts?view=to-review">To review <span>{counts["to-review"]}</span></Link>
        <Link aria-current={view === "awaiting-draft" ? "page" : undefined} href="/drafts?view=awaiting-draft">Awaiting draft <span>{counts["awaiting-draft"]}</span></Link>
        <Link aria-current={view === "approved" ? "page" : undefined} href="/drafts?view=approved">Approved <span>{counts.approved}</span></Link>
      </nav>
      <form className="panel filters draft-filters" action="/drafts">
        <input type="hidden" name="view" value={view} />
        <label>Find a company or domain<input name="search" defaultValue={search} maxLength={100} /></label>
        <button type="submit">Apply</button>
      </form>
      <div className="drafts-workspace" data-has-selection={Boolean(hasSelection)}>
        <section className="draft-queue-pane">
        <DraftQueue
          drafts={rows}
          view={view}
          search={search}
          total={rows[0]?.total_count ?? 0}
          hasMore={result.rows.length > 25}
          selectedItemId={selectedItemId}
        />
        </section>
        <section className="draft-detail-pane" aria-label="Selected draft">
          {view === "awaiting-draft" ? selectedAwaitingLead ? (
            <div className="page-stack awaiting-detail">
              <header className="page-heading"><div><Link className="mobile-back-link" href={returnHref}>Back to drafts</Link><p className="eyebrow">Approved lead</p><h2>{selectedAwaitingLead.company_name ?? selectedAwaitingLead.domain}</h2></div><span className="badge badge-awaiting">Awaiting draft</span></header>
              <section className="panel"><p>The lead is approved and has a valid recipient email. A draft has not arrived yet.</p><dl className="facts-grid"><div className="fact"><dt>Domain</dt><dd>{selectedAwaitingLead.domain}</dd></div><div className="fact"><dt>Recipient</dt><dd>{selectedAwaitingLead.email}</dd></div></dl><Link className="text-link-button" href={`/all/${selectedAwaitingLead.lead_id}`}>Open lead details</Link></section>
            </div>
          ) : <p className="empty-state">Select an item to review.</p> : selectedItemId ? <DraftDetailContent id={selectedItemId} embedded returnHref={returnHref} /> : <p className="empty-state">Select an item to review.</p>}
        </section>
      </div>
    </section>
  );
}
