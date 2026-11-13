import { Suspense, cache } from "react";
import { z } from "zod";
import { getAllQueuePage, type AllQueueFilters } from "@/lib/server/review/all-queue";
import { CountSkeleton, TableSkeleton } from "@/components/queue-skeleton";
import AllQueue from "./all-queue";
import FilterForm from "./filter-form";

export const dynamic = "force-dynamic";

/** One query per request shared by the total count and the table. */
const loadAllQueue = cache((key: string) => getAllQueuePage(JSON.parse(key) as AllQueueFilters));

async function AllQueueBadge({ queueKey }: { queueKey: string }) {
  const rows = (await loadAllQueue(queueKey)).rows.slice(0, 25);
  return <span className="muted">{rows[0]?.total_count ?? 0} leads</span>;
}

async function AllQueueResults({ queueKey, filters }: { queueKey: string; filters: AllQueueFilters }) {
  const result = await loadAllQueue(queueKey);
  const rows = result.rows.slice(0, 25);
  return (
    <section className="panel table-panel">
      <AllQueue
        leads={rows}
        filters={filters}
        total={rows[0]?.total_count ?? 0}
        hasMore={result.rows.length > 25}
      />
    </section>
  );
}
const Status = z.enum(["ALL", "PENDING", "APPROVED", "REJECTED", "ARCHIVED"]);
const Agent = z.enum(["ALL", "VERIFIED", "NEEDS_REVIEW", "REJECTED"]);
const Tag = z.enum(["ALL", "OPT_OUT_REGIME", "CONDITIONAL", "CONSENT_REQUIRED", "VARIES_REVIEW", "UNKNOWN_REVIEW"]);
const Email = z.enum(["ALL", "YES", "NO"]);
const Draft = z.enum(["ALL", "NONE", "PENDING", "APPROVED", "REJECTED"]);

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="m10.2 10.2 2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const statusLabel: Record<string, string> = {
  ALL: "Lead status",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};
const draftLabel: Record<string, string> = {
  ALL: "Draft status",
  NONE: "No draft",
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
const agentLabel: Record<string, string> = {
  ALL: "Agent",
  VERIFIED: "Verified",
  NEEDS_REVIEW: "Needs review",
  REJECTED: "Rejected",
};
const tagLabel: Record<string, string> = {
  ALL: "Anti-spam",
  OPT_OUT_REGIME: "Opt-out regime",
  CONDITIONAL: "Conditional",
  CONSENT_REQUIRED: "Consent required",
  VARIES_REVIEW: "Varies",
  UNKNOWN_REVIEW: "Unknown",
};

export default async function AllPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const countryValue = typeof params.country === "string" ? params.country.trim().toUpperCase() : "";
  const filters: AllQueueFilters = {
    status: Status.safeParse(params.status).success ? Status.parse(params.status) : "ALL",
    agent: Agent.safeParse(params.agent).success ? Agent.parse(params.agent) : "ALL",
    country: /^[A-Z]{2}$/.test(countryValue) ? countryValue : "",
    tag: Tag.safeParse(params.tag).success ? Tag.parse(params.tag) : "ALL",
    email: Email.safeParse(params.email).success ? Email.parse(params.email) : "ALL",
    draft: Draft.safeParse(params.draft).success ? Draft.parse(params.draft) : "ALL",
    search: typeof params.search === "string" ? params.search.trim().slice(0, 100) : "",
  };
  const queueKey = JSON.stringify(filters);
  const emailMissing = filters.email === "NO";

  return (
    <section className="page-stack all-page">
      <header className="page-heading">
        <div>
          <h1>All leads</h1>
          <p>Every lead in every state. Read only. Open a row to see its full data or jump to where it can be actioned.</p>
        </div>
        <form className="queue-search" action="/all" role="search">
          {filters.status !== "ALL" && <input type="hidden" name="status" value={filters.status} />}
          {filters.agent !== "ALL" && <input type="hidden" name="agent" value={filters.agent} />}
          {filters.draft !== "ALL" && <input type="hidden" name="draft" value={filters.draft} />}
          {filters.tag !== "ALL" && <input type="hidden" name="tag" value={filters.tag} />}
          {filters.country && <input type="hidden" name="country" value={filters.country} />}
          {filters.email !== "ALL" && <input type="hidden" name="email" value={filters.email} />}
          <SearchIcon />
          <input
            type="search"
            name="search"
            maxLength={100}
            defaultValue={filters.search}
            placeholder="Search domain or company"
            aria-label="Search domain or company"
          />
        </form>
      </header>

      <FilterForm className="filter-bar">
        {filters.search && <input type="hidden" name="search" value={filters.search} />}
        <label className="filter-chip">
          <span className="visually-hidden">Lead status</span>
          <select name="status" defaultValue={filters.status}>
            {Status.options.map((value) => (
              <option key={value} value={value}>{statusLabel[value] ?? value}</option>
            ))}
          </select>
        </label>
        <label className="filter-chip">
          <span className="visually-hidden">Draft status</span>
          <select name="draft" defaultValue={filters.draft}>
            {Draft.options.map((value) => (
              <option key={value} value={value}>{draftLabel[value] ?? value}</option>
            ))}
          </select>
        </label>
        <label className="filter-chip">
          <span className="visually-hidden">Country</span>
          <input name="country" maxLength={2} defaultValue={filters.country} placeholder="Country" />
        </label>
        <label className="filter-chip">
          <span className="visually-hidden">Agent verdict</span>
          <select name="agent" defaultValue={filters.agent}>
            {Agent.options.map((value) => (
              <option key={value} value={value}>{agentLabel[value] ?? value}</option>
            ))}
          </select>
        </label>
        <label className="filter-chip">
          <span className="visually-hidden">Anti-spam tag</span>
          <select name="tag" defaultValue={filters.tag}>
            {Tag.options.map((value) => (
              <option key={value} value={value}>{tagLabel[value] ?? value}</option>
            ))}
          </select>
        </label>
        <label className={`filter-chip${emailMissing ? " is-active" : ""}`}>
          <input type="checkbox" name="email" value="NO" defaultChecked={emailMissing} />
          Email missing
        </label>
        <span className="spacer" />
        <Suspense key={queueKey} fallback={<CountSkeleton />}>
          <AllQueueBadge queueKey={queueKey} />
        </Suspense>
      </FilterForm>

      <Suspense key={queueKey} fallback={<section className="panel table-panel"><TableSkeleton label="Loading leads" /></section>}>
        <AllQueueResults queueKey={queueKey} filters={filters} />
      </Suspense>
    </section>
  );
}
