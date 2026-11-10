import { z } from "zod";
import Link from "next/link";
import { getLeadQueuePage } from "@/lib/server/review/lead-queue";
import LeadQueueTable from "./lead-queue-table";
import { LeadDetailContent } from "./[id]/page";
import ApprovalToast from "./approval-toast";

export const dynamic = "force-dynamic";
const Agent = z.enum(["VERIFIED", "NEEDS_REVIEW", "ALL"]);
const Tag = z.enum(["OPT_OUT_REGIME", "CONDITIONAL", "CONSENT_REQUIRED", "VARIES_REVIEW", "UNKNOWN_REVIEW", "ALL"]);

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
  return (
    <div className="leads-workspace" data-has-selection={Boolean(validRequestedLead)}>
      {approvedLead && <ApprovalToast leadId={approvedLead} returnHref={queueHref} />}
      <section className="lead-queue-pane">
        <header className="page-heading">
          <div><p className="eyebrow">Customer verification</p><h1>Leads</h1><p>Verify customer information before it can move forward.</p></div>
          <span className="queue-total">{leads[0]?.total_count ?? 0} leads</span>
        </header>
        <nav className="lead-filter-chips" aria-label="Lead filters">
          <Link aria-current={status === "PENDING" && email === "ALL" && !returned ? "page" : undefined} href="/leads">Pending</Link>
          <Link aria-current={email === "MISSING" ? "page" : undefined} href={`/leads?${new URLSearchParams({ status, agent, tag, country, search, email: email === "MISSING" ? "ALL" : "MISSING", returned: String(returned) })}`}>Needs email</Link>
          <Link aria-current={returned ? "page" : undefined} href={`/leads?${new URLSearchParams({ status: "PENDING", agent, tag, country, search, email, returned: String(!returned) })}`}>Returned</Link>
          <Link aria-current={status === "REJECTED" ? "page" : undefined} href={`/leads?${new URLSearchParams({ status: status === "REJECTED" ? "PENDING" : "REJECTED", agent, tag, country, search, email, returned: String(returned) })}`}>Rejected</Link>
        </nav>
        <form className="panel filters lead-filters" action="/leads">
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="returned" value={String(returned)} />
          <label>Find a lead<input name="search" maxLength={100} defaultValue={search} placeholder="Company or domain" /></label>
          <label>Agent verdict<select name="agent" defaultValue={agent}><option value="ALL">All eligible</option><option value="VERIFIED">Verified</option><option value="NEEDS_REVIEW">Needs review</option></select></label>
          <label>Country<input name="country" maxLength={2} defaultValue={country} placeholder="US" /></label>
          <label>Screening tag<select name="tag" defaultValue={tag}><option value="ALL">All</option>{Tag.options.filter((value) => value !== "ALL").map((value) => <option key={value}>{value}</option>)}</select></label>
          <button type="submit">Apply</button>
        </form>
        <LeadQueueTable
          leads={leads}
          total={leads[0]?.total_count ?? 0}
          hasMore={result.rows.length > 25}
          filters={filters}
          selectedLeadId={selectedLeadId}
        />
      </section>
      <section className="lead-detail-pane" aria-label="Selected lead">
        {selectedLeadId ? <LeadDetailContent id={selectedLeadId} embedded backHref={queueHref} /> : <p className="empty-state">No leads match these filters.</p>}
      </section>
    </div>
  );
}
