import { notFound } from "next/navigation";
import { z } from "zod";
import { query } from "@/lib/server/db";
import DraftReview from "./draft-review";

export const dynamic = "force-dynamic";

type DraftDetail = {
  id: string; lead_id: string; version: number; subject: string; body_text: string; ai_opener: string | null;
  content_hash: string; human_approval: string;
  human_note: string | null; created_at: Date; editor_name: string | null; email: string | null;
  domain: string; company_name: string | null; country: string | null; antispam_tag: string;
  lead_approval: string; lead_archived: boolean;
};

export default async function DraftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await query<DraftDetail>(
    `SELECT d.id, d.lead_id, d.version, d.subject, d.body_text, d.ai_opener,
            d.content_hash, d.human_approval, d.human_note,
            d.created_at, u.name AS editor_name, l.email, l.domain, l.company_name, l.country,
            l.antispam_tag, l.human_approval AS lead_approval, l.archived AS lead_archived
       FROM drafts d JOIN leads l ON l.id=d.lead_id
       LEFT JOIN users u ON u.id=d.last_edited_by
      WHERE d.id=$1`, [id],
  );
  const draft = result.rows[0];
  if (!draft) notFound();
  return <DraftReview draft={draft} />;
}
