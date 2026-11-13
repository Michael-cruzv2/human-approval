import { z } from "zod";
import { writeAudit } from "@/lib/server/auth/audit";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { query, withTransaction } from "@/lib/server/db";
import { isValidReviewEmail } from "@/lib/server/review/email";

export const runtime = "nodejs";
const DraftEditSchema = z.object({
  subject: z.string().min(1).max(1000).refine((value) => value.trim().length > 0),
  body_text: z.string().min(1).max(30000).refine((value) => value.trim().length > 0),
}).strict();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({ message: "Draft not found." }, 404);
  const result = await query<{
    subject: string; body_text: string; content_hash: string; human_approval: string;
    lead_approval: string; lead_email: string | null; lead_archived: boolean;
  }>(
    `SELECT d.subject, d.body_text, d.content_hash, d.human_approval,
            l.human_approval AS lead_approval, l.email AS lead_email, l.archived AS lead_archived
       FROM drafts d JOIN leads l ON l.id=d.lead_id WHERE d.id=$1`, [id],
  );
  const draft = result.rows[0];
  return draft ? jsonNoStore({ draft }) : jsonNoStore({ message: "Draft not found." }, 404);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonNoStore({ message: "Invalid draft text." }, 400); }
  const parsed = DraftEditSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ message: "Subject and body are required." }, 400);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({ message: "Draft not found." }, 404);

  try {
    const result = await withTransaction(async (client) => {
      const selected = await client.query<{
        subject: string; body_text: string; human_approval: string; content_hash: string;
        lead_approval: string; lead_email: string | null; lead_archived: boolean;
      }>(
        `SELECT d.subject, d.body_text, d.human_approval, d.content_hash,
                l.human_approval AS lead_approval, l.email AS lead_email, l.archived AS lead_archived
           FROM drafts d JOIN leads l ON l.id=d.lead_id
          WHERE d.id=$1 FOR UPDATE OF d, l`, [id],
      );
      const draft = selected.rows[0];
      if (!draft) return "NOT_FOUND" as const;
      if (draft.lead_approval !== "APPROVED" || draft.lead_archived || !isValidReviewEmail(draft.lead_email)) {
        return "LEAD_CHANGED" as const;
      }
      if (draft.human_approval === "REJECTED") return "FINAL" as const;
      if (draft.subject === parsed.data.subject && draft.body_text === parsed.data.body_text) {
        return { unchanged: true, contentHash: draft.content_hash, approvalReset: false };
      }
      const updated = await client.query<{ human_approval: string; content_hash: string }>(
        `UPDATE drafts SET subject=$2, body_text=$3, last_edited_by=$4
          WHERE id=$1 RETURNING human_approval, content_hash`,
        [id, parsed.data.subject, parsed.data.body_text, actor.id],
      );
      await writeAudit(client, "EDIT", "draft", id, actor.id, "USER", { fields: ["subject", "body_text", "last_edited_by"] });
      return {
        unchanged: false,
        contentHash: updated.rows[0].content_hash,
        approvalReset: draft.human_approval === "APPROVED" && updated.rows[0].human_approval === "PENDING",
      };
    });
    if (result === "NOT_FOUND") return jsonNoStore({ message: "Draft not found." }, 404);
    if (result === "LEAD_CHANGED") return jsonNoStore({ message: "The lead changed. Review again." }, 409);
    if (result === "FINAL") return jsonNoStore({ message: "Rejected drafts are final. Regenerate a new version from Awaiting draft." }, 409);
    return jsonNoStore({ ok: true, ...result });
  } catch {
    return jsonNoStore({ message: "Could not save draft changes." }, 503);
  }
}
