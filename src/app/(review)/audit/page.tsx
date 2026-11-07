import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/server/auth/session";
import { query } from "@/lib/server/db";

export const dynamic = "force-dynamic";
const Action = z.string().trim().max(40).regex(/^[A-Z_]*$/);
const validDate = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getCurrentSessionUser();
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/");
  const params = await searchParams;
  const userId = typeof params.user === "string" && z.uuid().safeParse(params.user).success ? params.user : "";
  const action = typeof params.action === "string" && Action.safeParse(params.action).success ? params.action : "";
  const start = validDate(params.start) ? params.start : "";
  const end = validDate(params.end) ? params.end : "";
  const [users, actions, entries] = await Promise.all([
    query<{ id: string; name: string }>("SELECT id, name FROM users ORDER BY name, id"),
    query<{ action: string }>("SELECT DISTINCT action FROM audit_log ORDER BY action"),
    query<{
      id: string; created_at: Date; actor_name: string | null; actor_type: string;
      action: string; entity: string; entity_id: string;
    }>(
      `SELECT a.id, a.created_at, u.name AS actor_name, a.actor_type, a.action, a.entity, a.entity_id
         FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
        WHERE ($1::uuid IS NULL OR a.actor_id=$1::uuid)
          AND ($2='' OR a.action=$2)
          AND ($3::date IS NULL OR a.created_at >= $3::date)
          AND ($4::date IS NULL OR a.created_at < $4::date + interval '1 day')
        ORDER BY a.created_at DESC, a.id DESC LIMIT 300`,
      [userId || null, action, start || null, end || null],
    ),
  ]);
  return (
    <section className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Administration</p><h1>Audit</h1></div><span>Read only · up to 300 events</span></header>
      <form className="panel filters" action="/audit">
        <label>User<select name="user" defaultValue={userId}><option value="">All users</option>{users.rows.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label>Action<select name="action" defaultValue={action}><option value="">All actions</option>{actions.rows.map(({ action: value }) => <option key={value}>{value}</option>)}</select></label>
        <label>From<input type="date" name="start" defaultValue={start} /></label><label>Through<input type="date" name="end" defaultValue={end} /></label><button type="submit">Filter audit</button>
      </form>
      <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Time</th><th>Actor</th><th>Entity</th><th>Entity ID</th><th>Action</th></tr></thead><tbody>
        {entries.rows.map((row) => <tr key={row.id}><td><time dateTime={row.created_at.toISOString()}>{row.created_at.toLocaleString()}</time></td><td>{row.actor_name ?? row.actor_type}</td><td>{row.entity}</td><td><code>{row.entity_id}</code></td><td>{row.action}</td></tr>)}
      </tbody></table>{entries.rows.length === 0 && <p className="empty-state">No matching audit entries.</p>}</div></section>
    </section>
  );
}
