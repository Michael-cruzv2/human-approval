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
  country: string | null;
  email: string;
  version: null;
  human_approval: string;
  updated_at: string;
  editor_name: null;
  total_count: number;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="m10.2 10.2 2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

async function getAwaitingDraftLead(id: string, search: string): Promise<AwaitingDraftLead | undefined> {
  const result = await query<AwaitingDraftLead>(
    `SELECT l.id, l.id AS lead_id, NULL::uuid AS draft_id, l.domain, l.company_name, l.country, l.email,
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
  const total = rows[0]?.total_count ?? 0;

  return (
    <div className="drafts-workspace" data-has-selection={hasSelection}>
      <section className="draft-queue-pane" aria-label="Drafts to review">
        <div className="queue-head">
          <div className="queue-head-row">
            <h2>Emails to review</h2>
            <span className="badge badge-drafts-count">{counts["to-review"]} pending</span>
          </div>
          <form className="queue-search" action="/drafts" role="search">
            <SearchIcon />
            <input type="hidden" name="view" value={view} />
            <input
              type="search"
              name="search"
              maxLength={100}
              defaultValue={search}
              placeholder="Search company or subject"
              aria-label="Search company or subject"
            />
          </form>
        </div>
        <nav className="filter-chips draft-subview-chips" aria-label="Draft queue views">
          <Link aria-current={view === "to-review" ? "page" : undefined} href={`/drafts?${new URLSearchParams({ view: "to-review", search })}`}>
            To review <span>{counts["to-review"]}</span>
          </Link>
          <Link aria-current={view === "awaiting-draft" ? "page" : undefined} href={`/drafts?${new URLSearchParams({ view: "awaiting-draft", search })}`}>
            Awaiting draft <span>{counts["awaiting-draft"]}</span>
          </Link>
          <Link aria-current={view === "approved" ? "page" : undefined} href={`/drafts?${new URLSearchParams({ view: "approved", search })}`}>
            Approved <span>{counts.approved}</span>
          </Link>
        </nav>
        <DraftQueue
          drafts={rows}
          view={view}
          search={search}
          total={total}
          hasMore={result.rows.length > 25}
          selectedItemId={selectedItemId}
        />
      </section>
      <section className="draft-detail-pane" aria-label="Selected draft" key={selectedItemId}>
        {view === "awaiting-draft" ? selectedAwaitingLead ? (
          <div className="page-stack awaiting-detail">
            <header className="detail-head">
              <div>
                <Link className="mobile-back-link" href={returnHref}>← Emails</Link>
                <h1>{selectedAwaitingLead.company_name ?? selectedAwaitingLead.domain}</h1>
                <div className="detail-chips">
                  <span className="badge badge-awaiting">Awaiting draft</span>
                </div>
              </div>
            </header>
            <section className="panel">
              <p>The lead is approved and has a valid recipient email. A draft has not arrived yet.</p>
              <dl className="facts-grid">
                <div className="fact"><dt>Domain</dt><dd>{selectedAwaitingLead.domain}</dd></div>
                <div className="fact"><dt>Recipient</dt><dd>{selectedAwaitingLead.email}</dd></div>
              </dl>
              <Link className="btn" href={`/all/${selectedAwaitingLead.lead_id}`}>Open lead details</Link>
            </section>
          </div>
        ) : <p className="empty-state">Select an item to review.</p> : selectedItemId ? (
          <DraftDetailContent id={selectedItemId} embedded returnHref={returnHref} />
        ) : <p className="empty-state">Nothing to review.</p>}
      </section>
    </div>
  );
}
