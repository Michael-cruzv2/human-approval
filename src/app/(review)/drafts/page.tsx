import Link from "next/link";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { getAppConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";
const Status = z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]);

export default async function DraftsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status = Status.safeParse(params.status).success ? Status.parse(params.status) : "PENDING";
  const ready = params.ready === "1";
  const drafts = await query<{
    id: string; lead_id: string; domain: string; company_name: string | null; email: string | null; version: number;
    human_approval: string; created_at: Date; editor_name: string | null;
  }>(
    `SELECT d.id, d.lead_id, l.domain, l.company_name, l.email, d.version, d.human_approval,
            d.created_at, u.name AS editor_name
       FROM drafts d JOIN leads l ON l.id=d.lead_id
       LEFT JOIN users u ON u.id=d.last_edited_by
      WHERE ($1='ALL' OR d.human_approval=$1)
        AND ($1<>'PENDING' OR l.human_approval='APPROVED')
        AND (NOT $2::boolean OR EXISTS (SELECT 1 FROM v_ready_to_queue v WHERE v.draft_id=d.id))
      ORDER BY d.created_at ASC, d.id ASC
      LIMIT $3`,
    [status, ready, getAppConfig().app.review.draft_queue_page_size],
  );
  return (
    <section className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Step 3</p><h1>Drafts</h1></div><span>{drafts.rows.length} shown</span></header>
      <form className="panel filters" action="/drafts">{ready && <input type="hidden" name="ready" value="1" />}<label>Status<select name="status" defaultValue={status}><option value="PENDING">Pending queue</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All drafts</option></select></label><button type="submit">Apply filter</button></form>
      <section className="panel table-panel"><div className="table-scroll"><table>
        <thead><tr><th>Company</th><th>Domain</th><th>Recipient email</th><th>Version</th><th>Status</th><th>Created</th><th>Last edited by</th></tr></thead>
        <tbody>{drafts.rows.map((draft) => <tr key={draft.id}>
          <td><Link href={`/drafts/${draft.id}`}>{draft.company_name ?? draft.domain}</Link></td><td>{draft.domain}</td><td>{draft.email ?? "No email address"}</td><td>{draft.version}</td><td>{draft.human_approval}</td><td><time dateTime={draft.created_at.toISOString()}>{draft.created_at.toLocaleDateString()}</time></td><td>{draft.editor_name ?? "—"}</td>
        </tr>)}</tbody>
      </table>{drafts.rows.length === 0 && <p className="empty-state">Nothing to review.</p>}</div></section>
    </section>
  );
}
