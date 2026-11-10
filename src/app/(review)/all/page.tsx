import { z } from "zod";
import {
  getAllQueuePage,
  type AllQueueFilters,
} from "@/lib/server/review/all-queue";
import AllQueue from "./all-queue";

export const dynamic = "force-dynamic";
const Status = z.enum(["ALL", "PENDING", "APPROVED", "REJECTED", "ARCHIVED"]);
const Agent = z.enum(["ALL", "VERIFIED", "NEEDS_REVIEW", "REJECTED"]);
const Tag = z.enum([
  "ALL",
  "OPT_OUT_REGIME",
  "CONDITIONAL",
  "CONSENT_REQUIRED",
  "VARIES_REVIEW",
  "UNKNOWN_REVIEW",
]);
const Email = z.enum(["ALL", "YES", "NO"]);
const Draft = z.enum(["ALL", "NONE", "PENDING", "APPROVED", "REJECTED"]);

export default async function AllPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const countryValue =
    typeof params.country === "string"
      ? params.country.trim().toUpperCase()
      : "";
  const filters: AllQueueFilters = {
    status: Status.safeParse(params.status).success
      ? Status.parse(params.status)
      : "ALL",
    agent: Agent.safeParse(params.agent).success
      ? Agent.parse(params.agent)
      : "ALL",
    country: /^[A-Z]{2}$/.test(countryValue) ? countryValue : "",
    tag: Tag.safeParse(params.tag).success ? Tag.parse(params.tag) : "ALL",
    email: Email.safeParse(params.email).success
      ? Email.parse(params.email)
      : "ALL",
    draft: Draft.safeParse(params.draft).success
      ? Draft.parse(params.draft)
      : "ALL",
    search:
      typeof params.search === "string"
        ? params.search.trim().slice(0, 100)
        : "",
  };
  const result = await getAllQueuePage(filters);
  const rows = result.rows.slice(0, 25);
  return (
    <section className="page-stack all-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Read-only overview</p>
          <h1>All</h1>
          <p>Every lead, in every state. No edits or approvals here.</p>
        </div>
      </header>
      <form className="panel filters" action="/all">
        <label>
          Lead status
          <select name="status" defaultValue={filters.status}>
            {Status.options.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All statuses" : value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agent verdict
          <select name="agent" defaultValue={filters.agent}>
            {Agent.options.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All verdicts" : value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Country
          <input
            name="country"
            maxLength={2}
            defaultValue={filters.country}
            placeholder="US"
          />
        </label>
        <label>
          Anti-spam tag
          <select name="tag" defaultValue={filters.tag}>
            {Tag.options.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All tags" : value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Email
          <select name="email" defaultValue={filters.email}>
            <option value="ALL">All</option>
            <option value="YES">Present</option>
            <option value="NO">Missing or invalid</option>
          </select>
        </label>
        <label>
          Draft status
          <select name="draft" defaultValue={filters.draft}>
            {Draft.options.map((value) => (
              <option key={value} value={value}>
                {value === "ALL"
                  ? "All drafts"
                  : value === "NONE"
                    ? "None"
                    : value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Text search
          <input
            name="search"
            maxLength={100}
            defaultValue={filters.search}
            placeholder="Domain or company"
          />
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <section className="panel table-panel">
        <AllQueue
          leads={rows}
          filters={filters}
          total={rows[0]?.total_count ?? 0}
          hasMore={result.rows.length > 25}
        />
      </section>
    </section>
  );
}
