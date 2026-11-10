import { z } from "zod";
import Link from "next/link";
import { getLeadQueuePage } from "@/lib/server/review/lead-queue";
import LeadQueueTable from "./lead-queue-table";
import { LeadDetailContent } from "./[id]/page";
import ApprovalToast from "./approval-toast";

export const dynamic = "force-dynamic";
const Agent = z.enum(["VERIFIED", "NEEDS_REVIEW", "ALL"]);
const Tag = z.enum(["OPT_OUT_REGIME", "CONDITIONAL", "CONSENT_REQUIRED", "VARIES_REVIEW", "UNKNOWN_REVIEW", "ALL"]);

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="m10.2 10.2 2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status: "PENDING" | "REJECTED" = params.status === "REJECTED" ? "REJECTED" : "PENDING";
  const agent = Agent.safeParse(params.agent).success ? Agent.parse(params.agent) : "ALL";
  const tag = Tag.safeParse(params.tag).success ? Tag.parse(params.tag) : "ALL";
  const countryValue = typeof params.country === "string" ? params.country.trim().toUpperCase() : "";
  const country = /^[A-Z]{2}$/.test(countryValue) ? countryValue : "";
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const email: "ALL" | "MISSING" = params.email === "MISSING" ? "MISSING" : "ALL";
  const returned = params.returned === "true";
  const filters = { status, agent, tag, country, search, email, returned };
  const result = await getLeadQueuePage(filters);
  const leads = result.rows.slice(0, 25);
  const requestedLead = typeof params.lead === "string" ? params.lead : "";
  const validRequestedLead = z.uuid().safeParse(requestedLead).success ? requestedLead : "";
  const selectedLeadId = validRequestedLead || leads[0]?.id || "";
  const queueHref = `/leads?${new URLSearchParams({
    status,
    agent,
    tag,
    country,
    search,
    email,
    returned: String(returned),
  })}`;
  const approvedLead = typeof params.approved === "string" ? params.approved : "";
  const total = leads[0]?.total_count ?? 0;
  const advanced = agent !== "ALL" || tag !== "ALL" || country !== "";

  function chipHref(next: Record<string, string>) {
    return `/leads?${new URLSearchParams({ status, agent, tag, country, search, email, returned: String(returned), ...next })}`;
  }

  return (
    <div className="leads-workspace" data-has-selection={Boolean(validRequestedLead)}>
      {approvedLead && <ApprovalToast leadId={approvedLead} returnHref={queueHref} />}
      <section className="lead-queue-pane" aria-label="Leads to verify">
        <div className="queue-head">
          <div className="queue-head-row">
            <h2>Leads to verify</h2>
            <span className="badge badge-leads-count">{total} pending</span>
          </div>
          <form className="queue-search" action="/leads" role="search">
            <SearchIcon />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="agent" value={agent} />
            <input type="hidden" name="tag" value={tag} />
            <input type="hidden" name="country" value={country} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="returned" value={String(returned)} />
            <input
              type="search"
              name="search"
              maxLength={100}
              defaultValue={search}
              placeholder="Search domain or company"
              aria-label="Search domain or company"
            />
          </form>
        </div>
        <nav className="filter-chips" aria-label="Lead filters">
          <Link
            aria-current={status === "PENDING" && email === "ALL" && !returned ? "page" : undefined}
            href={chipHref({ status: "PENDING", email: "ALL", returned: "false" })}
          >
            Pending
          </Link>
          <Link
            aria-current={email === "MISSING" ? "page" : undefined}
            href={chipHref({ email: email === "MISSING" ? "ALL" : "MISSING" })}
          >
            Needs email
          </Link>
          <Link
            aria-current={returned ? "page" : undefined}
            href={chipHref({ status: "PENDING", returned: String(!returned) })}
          >
            Returned
          </Link>
          <Link
            aria-current={status === "REJECTED" ? "page" : undefined}
            href={chipHref({ status: status === "REJECTED" ? "PENDING" : "REJECTED" })}
          >
            Rejected
          </Link>
        </nav>
        <details className="quiet-filters" open={advanced}>
          <summary>More filters</summary>
          <form className="fields" action="/leads">
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="returned" value={String(returned)} />
            <input type="hidden" name="search" value={search} />
            <label>
              Agent verdict
              <select name="agent" defaultValue={agent}>
                <option value="ALL">All eligible</option>
                <option value="VERIFIED">Verified</option>
                <option value="NEEDS_REVIEW">Needs review</option>
              </select>
            </label>
            <label>
              Country
              <input name="country" maxLength={2} defaultValue={country} placeholder="US" />
            </label>
            <label>
              Anti-spam tag
              <select name="tag" defaultValue={tag}>
                <option value="ALL">All</option>
                {Tag.options.filter((value) => value !== "ALL").map((value) => (
                  <option key={value} value={value}>{value.replaceAll("_", " ").toLowerCase()}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-sm" type="submit" style={{ gridColumn: "1 / -1", justifySelf: "start" }}>
              Apply filters
            </button>
          </form>
        </details>
        <LeadQueueTable
          leads={leads}
          total={total}
          hasMore={result.rows.length > 25}
          filters={filters}
          selectedLeadId={selectedLeadId}
        />
      </section>
      <section className="lead-detail-pane" aria-label="Selected lead">
        {selectedLeadId ? (
          <LeadDetailContent id={selectedLeadId} embedded backHref={queueHref} />
        ) : (
          <p className="empty-state">Nothing to review.</p>
        )}
      </section>
    </div>
  );
}
