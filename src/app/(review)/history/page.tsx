import { query } from "@/lib/server/db";
import { z } from "zod";

export const dynamic = "force-dynamic";
const historyDate = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const HistoryAction = z.enum(["APPROVE", "REJECT", "DRAFT_REJECT", "LEAD_RETURNED", "REVOKE", "REOPEN", "EDIT", "ARCHIVE", "IMPORT"]);
const validDate = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const userId = typeof params.user === "string" && z.uuid().safeParse(params.user).success ? params.user : "";
  const action = typeof params.action === "string" && HistoryAction.safeParse(params.action).success ? params.action : "";
  const start = validDate(params.start) ? params.start : "";
  const end = validDate(params.end) ? params.end : "";
  const [users, history] = await Promise.all([
    query<{ id: string; name: string }>("SELECT id, name FROM users WHERE is_active=true ORDER BY name, id"),
    query<{
      id: string; created_at: Date; actor_name: string | null; action: string; entity: string;
      domain: string | null; company_name: string | null;
    }>(
      `SELECT a.id, a.created_at, u.name AS actor_name, a.action, a.entity,
              COALESCE(l.domain, parent.domain) AS domain,
              COALESCE(l.company_name, parent.company_name) AS company_name
         FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
         LEFT JOIN leads l ON a.entity='lead' AND l.id=a.entity_id
         LEFT JOIN drafts d ON a.entity='draft' AND d.id=a.entity_id
         LEFT JOIN leads parent ON parent.id=d.lead_id
        WHERE a.action IN ('APPROVE','REJECT','DRAFT_REJECT','LEAD_RETURNED','REVOKE','REOPEN','EDIT','ARCHIVE','IMPORT')
          AND ($1::uuid IS NULL OR a.actor_id=$1::uuid)
          AND ($2='' OR a.action=$2)
          AND ($3::date IS NULL OR a.created_at >= $3::date)
          AND ($4::date IS NULL OR a.created_at < $4::date + interval '1 day')
        ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
      [userId || null, action, start || null, end || null],
    ),
  ]);
  return (
    <section className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Review activity</p><h1>History</h1></div><span>Up to 200 recent actions</span></header>
      <form className="panel filters" action="/history">
        <label>User<select name="user" defaultValue={userId}><option value="">All active users</option>{users.rows.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label>Action<select name="action" defaultValue={action}><option value="">All review actions</option>{HistoryAction.options.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>From<input type="date" name="start" defaultValue={start} /></label><label>Through<input type="date" name="end" defaultValue={end} /></label><button className="btn" type="submit">Filter history</button>
      </form>
      <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Time</th><th>User</th><th>Entity</th><th>Action</th><th>Domain</th><th>Company</th></tr></thead><tbody>
        {history.rows.map((row) => <tr key={row.id}><td><time dateTime={row.created_at.toISOString()}>{historyDate.format(row.created_at)}</time></td><td>{row.actor_name ?? "System"}</td><td>{row.entity}</td><td>{row.action}</td><td>{row.domain ?? "—"}</td><td>{row.company_name ?? "—"}</td></tr>)}
      </tbody></table>{history.rows.length === 0 && <p className="empty-state">No matching history.</p>}</div></section>
    </section>
  );
}
