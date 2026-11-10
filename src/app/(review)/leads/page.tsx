import { z } from "zod";
import { getLeadQueuePage } from "@/lib/server/review/lead-queue";
import LeadQueueTable from "./lead-queue-table";

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
  const filters = { status, agent, tag, country, search };
  const result = await getLeadQueuePage(filters);
  const leads = result.rows.slice(0, 25);
  return (
    <section className="page-stack">
      <header className="page-heading">
        <div><p className="eyebrow">Customer verification</p><h1>Leads</h1><p>Verify customer details. Drafts and sending are reviewed elsewhere.</p></div>
        <span>{leads[0]?.total_count ?? 0} in this view</span>
      </header>
      <form className="panel filters" action="/leads">
        <label>Queue<select name="status" defaultValue={status}><option value="PENDING">Pending</option><option value="REJECTED">Rejected (reopen)</option></select></label>
        <label>Agent verdict<select name="agent" defaultValue={agent}><option value="ALL">All eligible</option><option value="VERIFIED">Verified</option><option value="NEEDS_REVIEW">Needs review</option></select></label>
        <label>Screening tag<select name="tag" defaultValue={tag}><option value="ALL">All</option>{Tag.options.filter((value) => value !== "ALL").map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Country<input name="country" maxLength={2} defaultValue={country} placeholder="US" /></label>
        <label>Domain or company<input name="search" maxLength={100} defaultValue={search} /></label>
        <button type="submit">Apply filters</button>
      </form>
      <section className="panel table-panel">
        <LeadQueueTable
          leads={leads}
          total={leads[0]?.total_count ?? 0}
          hasMore={result.rows.length > 25}
          filters={filters}
        />
      </section>
    </section>
  );
}
