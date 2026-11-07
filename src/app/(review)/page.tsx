import Link from "next/link";
import { query } from "@/lib/server/db";

export const dynamic = "force-dynamic";

type DashboardCounts = {
  pending_leads: number; pending_drafts: number; approved_without_draft: number;
  drafts_ready: number; sent: number; needs_human: number;
  sending_enabled: boolean | null; dry_run: boolean | null;
};

export default async function DashboardPage() {
  const result = await query<DashboardCounts>(
    `SELECT
       (SELECT count(*)::int FROM leads WHERE human_approval='PENDING' AND agent_approval <> 'REJECTED' AND archived=false) AS pending_leads,
       (SELECT count(*)::int FROM drafts d JOIN leads l ON l.id=d.lead_id WHERE d.human_approval='PENDING' AND l.human_approval='APPROVED') AS pending_drafts,
       (SELECT count(*)::int FROM leads l WHERE l.human_approval='APPROVED' AND l.archived=false
          AND NOT EXISTS (SELECT 1 FROM drafts d WHERE d.lead_id=l.id AND d.human_approval <> 'REJECTED')) AS approved_without_draft,
       (SELECT count(*)::int FROM v_ready_to_queue) AS drafts_ready,
       (SELECT count(*)::int FROM email_sends WHERE status='SENT') AS sent,
       (SELECT count(*)::int FROM email_sends WHERE status='NEEDS_HUMAN') AS needs_human,
       (SELECT value='true'::jsonb FROM settings WHERE key='sending_enabled') AS sending_enabled,
       (SELECT value='true'::jsonb FROM settings WHERE key='dry_run') AS dry_run`,
  );
  const counts = result.rows[0];
  return (
    <section className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Overview</p><h1>Dashboard</h1></div></header>
      <div className="dashboard-grid">
        <Link className="count-card" href="/leads?status=PENDING"><span>Pending leads</span><strong>{counts.pending_leads}</strong></Link>
        <Link className="count-card" href="/drafts?status=PENDING"><span>Pending drafts</span><strong>{counts.pending_drafts}</strong></Link>
        <Link className="count-card" href="/leads?status=APPROVED&needsDraft=1"><span>Approved leads without a live draft</span><strong>{counts.approved_without_draft}</strong></Link>
        <Link className="count-card" href="/drafts?status=APPROVED&ready=1"><span>Approved drafts ready to send</span><strong>{counts.drafts_ready}</strong></Link>
        <div className="count-card"><span>Sent</span><strong>{counts.sent}</strong></div>
        <div className="count-card"><span>Needs human</span><strong>{counts.needs_human}</strong></div>
      </div>
      <section className="panel"><h2>Read-only sending switches</h2><dl className="facts-grid">
        <div className="fact"><dt>Sending enabled</dt><dd>{counts.sending_enabled === null ? "Not set" : counts.sending_enabled ? "Yes" : "No"}</dd></div>
        <div className="fact"><dt>Dry run</dt><dd>{counts.dry_run === null ? "Not set" : counts.dry_run ? "Yes" : "No"}</dd></div>
      </dl></section>
    </section>
  );
}
