import { notFound } from "next/navigation";
import { z } from "zod";
import { query } from "@/lib/server/db";
import DraftReview from "./draft-review";

export const dynamic = "force-dynamic";

type DraftDetail = {
  id: string; lead_id: string; version: number; subject: string; body_text: string; ai_opener: string | null;
  template_version: string | null; ai_model: string | null; content_hash: string; human_approval: string;
  human_note: string | null; created_at: Date; editor_name: string | null; email: string | null;
  domain: string; company_name: string | null; country: string | null; antispam_tag: string;
  is_shopify: boolean | null; has_mobile_app: boolean | null; evidence: unknown; lead_approval: string;
};

export default async function DraftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await query<DraftDetail>(
    `SELECT d.id, d.lead_id, d.version, d.subject, d.body_text, d.ai_opener,
            d.template_version, d.ai_model, d.content_hash, d.human_approval, d.human_note,
            d.created_at, u.name AS editor_name, l.email, l.domain, l.company_name, l.country,
            l.antispam_tag, l.is_shopify, l.has_mobile_app, l.evidence,
            l.human_approval AS lead_approval
       FROM drafts d JOIN leads l ON l.id=d.lead_id
       LEFT JOIN users u ON u.id=d.last_edited_by
      WHERE d.id=$1`, [id],
  );
  const draft = result.rows[0];
  if (!draft) notFound();
  return <DraftReview draft={draft} />;
}
