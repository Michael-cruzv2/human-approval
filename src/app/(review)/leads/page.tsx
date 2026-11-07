import { z } from "zod";
import { query } from "@/lib/server/db";
import { getAppConfig } from "@/lib/server/config";
import LeadQueueTable from "./lead-queue-table";

export const dynamic = "force-dynamic";

const Status = z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]);
const Agent = z.enum(["VERIFIED", "NEEDS_REVIEW", "REJECTED", "ALL"]);
const Tag = z.enum(["OPT_OUT_REGIME", "CONDITIONAL", "CONSENT_REQUIRED", "VARIES_REVIEW", "UNKNOWN_REVIEW", "ALL"]);

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status = Status.safeParse(params.status).success ? Status.parse(params.status) : "PENDING";
  const agent = Agent.safeParse(params.agent).success ? Agent.parse(params.agent) : "ALL";
  const tag = Tag.safeParse(params.tag).success ? Tag.parse(params.tag) : "ALL";
  const countryValue = typeof params.country === "string" ? params.country.trim().toUpperCase() : "";
  const country = /^[A-Z]{2}$/.test(countryValue) ? countryValue : "";
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const needsDraft = params.needsDraft === "1";
  const rows = await query<{
    id: string; domain: string; company_name: string | null; country: string | null;
    agent_approval: string; antispam_tag: string; email: string | null;
    human_approval: string; added_at: Date;
  }>(
    `SELECT id, domain, company_name, country, agent_approval, antispam_tag,
            email, human_approval, added_at
       FROM leads
      WHERE archived = false
        AND ($1 = 'ALL' OR human_approval = $1)
        AND ($1 <> 'PENDING' OR agent_approval <> 'REJECTED')
        AND ($2 = 'ALL' OR agent_approval = $2)
        AND ($3 = 'ALL' OR antispam_tag = $3)
        AND ($4 = '' OR country = $4)
        AND ($5 = '' OR domain ILIKE '%' || $5 || '%' OR company_name ILIKE '%' || $5 || '%')
        AND (NOT $7::boolean OR (human_approval='APPROVED' AND NOT EXISTS (
          SELECT 1 FROM drafts d WHERE d.lead_id=leads.id AND d.human_approval <> 'REJECTED'
        )))
      ORDER BY added_at ASC, id ASC
      LIMIT $6`,
    [status, agent, tag, country, search, getAppConfig().app.review.lead_queue_page_size, needsDraft],
  );

  return (
    <section className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Step 2</p><h1>Leads</h1><small>Keyboard: j/k move · a approve · r reject (each opens confirmation){needsDraft ? " · approved without a live draft" : ""}</small></div><span>{rows.rowCount ?? 0} shown</span></header>
      <form className="panel filters" action="/leads">
        <label>Status<select name="status" defaultValue={status}><option value="PENDING">Pending queue</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All active</option></select></label>
        <label>Agent review<select name="agent" defaultValue={agent}><option value="ALL">All</option><option value="VERIFIED">Verified</option><option value="NEEDS_REVIEW">Needs review</option><option value="REJECTED">Rejected</option></select></label>
        <label>Screening tag<select name="tag" defaultValue={tag}><option value="ALL">All</option>{Tag.options.filter((value) => value !== "ALL").map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Country<input name="country" maxLength={2} defaultValue={country} placeholder="US" /></label>
        <label>Domain or company<input name="search" maxLength={100} defaultValue={search} /></label>
        <button type="submit">Apply filters</button>
      </form>
      <section className="panel table-panel">
        <LeadQueueTable leads={rows.rows.map((lead) => ({ ...lead, added_at: lead.added_at.toISOString() }))} />
      </section>
    </section>
  );
}
