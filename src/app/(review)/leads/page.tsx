import { Suspense, cache } from "react";
import { z } from "zod";
import Link from "next/link";
import { getLeadQueuePage, type LeadQueueFilters } from "@/lib/server/review/lead-queue";
import { CountSkeleton, DetailSkeleton, QueueFootSkeleton, QueueRowsSkeleton } from "@/components/queue-skeleton";
import LeadQueueTable from "./lead-queue-table";
import { LeadDetailContent } from "./[id]/page";
import ApprovalToast from "./approval-toast";

export const dynamic = "force-dynamic";
const Agent = z.enum(["VERIFIED", "NEEDS_REVIEW", "ALL"]);
const Status = z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]);
const Tag = z.enum(["OPT_OUT_REGIME", "CONDITIONAL", "CONSENT_REQUIRED", "VARIES_REVIEW", "UNKNOWN_REVIEW", "ALL"]);

type LeadQueueState = "PENDING" | "MISSING" | "RETURNED" | "APPROVED" | "REJECTED" | "ALL";

/** One query per request even though the badge, list and detail panes each need it. */
const loadLeadQueue = cache((key: string) => getLeadQueuePage(JSON.parse(key) as LeadQueueFilters));

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="m10.2 10.2 2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function badgeLabel(state: LeadQueueState, total: number): string {
  if (state === "ALL") return `${total} ${total === 1 ? "lead" : "leads"}`;
  if (state === "APPROVED") return `${total} approved`;
  if (state === "REJECTED") return `${total} rejected`;
  return `${total} pending`;
}

async function LeadQueueBadge({ queueKey, state }: { queueKey: string; state: LeadQueueState }) {
  const rows = (await loadLeadQueue(queueKey)).rows.slice(0, 25);
  return (
    <span className="badge badge-leads-count">
      {badgeLabel(state, rows[0]?.total_count ?? 0)}
    </span>
  );
}

async function LeadQueueResults({
  queueKey,
  filters,
  state,
  selectedLeadId,
}: {
  queueKey: string;
  filters: LeadQueueFilters;
  state: LeadQueueState;
  selectedLeadId: string;
}) {
  const result = await loadLeadQueue(queueKey);
  const leads = result.rows.slice(0, 25);
  const total = leads[0]?.total_count ?? 0;
  return (
    <LeadQueueTable
      leads={leads}
      total={total}
      hasMore={result.rows.length > 25}
      filters={filters}
      state={state}
      selectedLeadId={selectedLeadId || leads[0]?.id || ""}
    />
  );
}

async function LeadDetailPane({
  queueKey,
  requestedLeadId,
  backHref,
}: {
  queueKey: string;
  requestedLeadId: string;
  backHref: string;
}) {
  const rows = (await loadLeadQueue(queueKey)).rows.slice(0, 25);
  const selectedLeadId = requestedLeadId || rows[0]?.id || "";
  if (!selectedLeadId) return <p className="empty-state">Nothing to review.</p>;
  return <LeadDetailContent id={selectedLeadId} embedded backHref={backHref} />;
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status = Status.safeParse(params.status).success ? Status.parse(params.status) : "PENDING";
  const agent = Agent.safeParse(params.agent).success ? Agent.parse(params.agent) : "ALL";
  const tag = Tag.safeParse(params.tag).success ? Tag.parse(params.tag) : "ALL";
  const countryValue = typeof params.country === "string" ? params.country.trim().toUpperCase() : "";
  const country = /^[A-Z]{2}$/.test(countryValue) ? countryValue : "";
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const email: "ALL" | "MISSING" = params.email === "MISSING" ? "MISSING" : "ALL";
  const returned = params.returned === "true";
  const filters: LeadQueueFilters = { status, agent, tag, country, search, email, returned };
  const queueKey = JSON.stringify(filters);
  const requestedLead = typeof params.lead === "string" ? params.lead : "";
  const validRequestedLead = z.uuid().safeParse(requestedLead).success ? requestedLead : "";
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
  const advancedFilters = [
    agent !== "ALL",
    tag !== "ALL",
    country !== "",
    search !== "",
  ].filter(Boolean).length;
  const state: LeadQueueState =
    status === "ALL"
      ? "ALL"
      : status === "APPROVED"
        ? "APPROVED"
        : status === "REJECTED"
          ? "REJECTED"
          : email === "MISSING"
            ? "MISSING"
            : returned
              ? "RETURNED"
              : "PENDING";

  function chipHref(next: { status: LeadQueueFilters["status"]; email: "ALL" | "MISSING"; returned: boolean }) {
    return `/leads?${new URLSearchParams({
      status: next.status,
      agent,
      tag,
      country,
      search,
      email: next.email,
      returned: String(next.returned),
    })}`;
  }

  return (
    <div className="leads-workspace" data-has-selection={Boolean(validRequestedLead)}>
      {approvedLead && <ApprovalToast leadId={approvedLead} returnHref={queueHref} />}
      <section className="lead-queue-pane" aria-label="Leads to verify">
        <div className="queue-head">
          <div className="queue-head-row">
            <h2>Leads to verify</h2>
            <Suspense key={queueKey} fallback={<CountSkeleton className="badge badge-leads-count" />}>
              <LeadQueueBadge queueKey={queueKey} state={state} />
            </Suspense>
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
            aria-current={state === "PENDING" ? "page" : undefined}
            href={chipHref({ status: "PENDING", email: "ALL", returned: false })}
          >
            Pending
          </Link>
          <Link
            aria-current={state === "MISSING" ? "page" : undefined}
            href={chipHref({ status: "PENDING", email: "MISSING", returned: false })}
          >
            Needs email
          </Link>
          <Link
            aria-current={state === "RETURNED" ? "page" : undefined}
            href={chipHref({ status: "PENDING", email: "ALL", returned: true })}
          >
            Returned
          </Link>
          <Link
            aria-current={state === "APPROVED" ? "page" : undefined}
            href={chipHref({ status: "APPROVED", email: "ALL", returned: false })}
          >
            Approved
          </Link>
          <Link
            aria-current={state === "REJECTED" ? "page" : undefined}
            href={chipHref({ status: "REJECTED", email: "ALL", returned: false })}
          >
            Rejected
          </Link>
          <Link
            aria-current={state === "ALL" ? "page" : undefined}
            href={chipHref({ status: "ALL", email: "ALL", returned: false })}
          >
            All
          </Link>
        </nav>
        <details className="quiet-filters" open={advancedFilters > 0}>
          <summary>More filters{advancedFilters > 0 ? ` (${advancedFilters})` : ""}</summary>
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
        <Suspense
          key={queueKey}
          fallback={
            <>
              <QueueRowsSkeleton variant="leads" label="Loading leads" />
              <QueueFootSkeleton />
            </>
          }
        >
          <LeadQueueResults
            queueKey={queueKey}
            filters={filters}
            state={state}
            selectedLeadId={validRequestedLead}
          />
        </Suspense>
      </section>
      <section className="lead-detail-pane" aria-label="Selected lead">
        <Suspense key={validRequestedLead || queueKey} fallback={<DetailSkeleton label="Loading lead" />}>
          <LeadDetailPane queueKey={queueKey} requestedLeadId={validRequestedLead} backHref={queueHref} />
        </Suspense>
      </section>
    </div>
  );
}
