import { z } from "zod";
import { writeAudit } from "@/lib/server/auth/audit";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { withTransaction } from "@/lib/server/db";
import { isValidReviewEmail } from "@/lib/server/review/email";

export const runtime = "nodejs";
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), contentHash: z.string().regex(/^[a-f0-9]{64}$/), note: z.string().max(2000).optional() }).strict(),
  z.object({ action: z.literal("reject"), note: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("return"), note: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("revoke"), note: z.string().max(2000).optional() }).strict(),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonNoStore({ message: "Invalid draft action." }, 400); }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ message: "Check the action details and try again." }, 400);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({ message: "Draft not found." }, 404);

  try {
    const outcome = await withTransaction(async (client) => {
      const selected = await client.query<{
        lead_id: string; human_approval: string; content_hash: string; human_approved_by: string | null;
        lead_approval: string; lead_email: string | null; lead_archived: boolean;
      }>(
        `SELECT d.lead_id, d.human_approval, d.content_hash, d.human_approved_by,
                l.human_approval AS lead_approval, l.email AS lead_email, l.archived AS lead_archived
           FROM drafts d JOIN leads l ON l.id=d.lead_id
          WHERE d.id=$1 FOR UPDATE OF d, l`, [id],
      );
      const draft = selected.rows[0];
      if (!draft) return "NOT_FOUND" as const;
      const action = parsed.data.action;
      if (action === "approve") {
        if (draft.human_approval === "REJECTED") return "FINAL" as const;
        if (draft.lead_approval !== "APPROVED" || draft.lead_archived) return "LEAD_NOT_APPROVED" as const;
        if (!isValidReviewEmail(draft.lead_email)) return "EMAIL_REQUIRED" as const;
        if (draft.content_hash !== parsed.data.contentHash) return "STALE" as const;
        const updated = await client.query(
          `UPDATE drafts AS d
              SET human_approval='APPROVED', human_approved_by=$3, human_approved_at=now(), human_note=$4
             FROM leads AS l
            WHERE d.id=$1 AND d.lead_id=l.id AND l.human_approval='APPROVED'
              AND d.human_approval='PENDING' AND d.content_hash=$2
            RETURNING d.id`,
          [id, parsed.data.contentHash, actor.id, parsed.data.note ?? null],
        );
        if (updated.rowCount !== 1) return "CONFLICT" as const;
        await writeAudit(client, "APPROVE", "draft", id, actor.id, "USER", {
          fields: ["human_approval", "human_approved_by", "human_approved_at", "human_note"],
          content_hash: parsed.data.contentHash,
        });
        return "UPDATED" as const;
      }

      if (action === "reject") {
        if (draft.lead_approval !== "APPROVED" || draft.lead_archived) return "LEAD_NOT_APPROVED" as const;
        if (!isValidReviewEmail(draft.lead_email)) return "EMAIL_REQUIRED" as const;
        if (draft.human_approval !== "PENDING") return draft.human_approval === "REJECTED" ? "FINAL" as const : "CONFLICT" as const;
        await client.query("UPDATE drafts SET human_approval='REJECTED', human_approved_by=$2, human_approved_at=now(), human_note=$3 WHERE id=$1", [id, actor.id, parsed.data.note]);
        await writeAudit(client, "REJECT", "draft", id, actor.id, "USER", { fields: ["human_approval", "human_approved_by", "human_approved_at", "human_note"] });
        return "UPDATED" as const;
      }

      if (action === "return") {
        if (draft.lead_approval !== "APPROVED" || draft.lead_archived) return "LEAD_NOT_APPROVED" as const;
        if (!isValidReviewEmail(draft.lead_email)) return "EMAIL_REQUIRED" as const;
        if (draft.human_approval !== "PENDING") return draft.human_approval === "REJECTED" ? "FINAL" as const : "CONFLICT" as const;
        const sending = await client.query<{ blocked: boolean }>(
          "SELECT EXISTS(SELECT 1 FROM email_sends WHERE lead_id=$1 AND status IN ('SENDING','SENT')) AS blocked",
          [draft.lead_id],
        );
        if (sending.rows[0]?.blocked) return "SEND_STARTED" as const;
        await client.query(
          "UPDATE drafts SET human_approval='REJECTED', human_approved_by=$2, human_approved_at=now(), human_note=$3 WHERE id=$1",
          [id, actor.id, parsed.data.note],
        );
        await client.query(
          "UPDATE leads SET human_approval='PENDING', human_approved_by=NULL, human_approved_at=NULL, human_note=$2 WHERE id=$1",
          [draft.lead_id, parsed.data.note],
        );
        await writeAudit(client, "DRAFT_REJECT", "draft", id, actor.id, "USER", {
          fields: ["human_approval", "human_approved_by", "human_approved_at", "human_note"],
          lead_id: draft.lead_id,
        });
        await writeAudit(client, "LEAD_RETURNED", "lead", draft.lead_id, actor.id, "USER", {
          fields: ["human_approval", "human_approved_by", "human_approved_at", "human_note"],
          draft_id: id,
        });
        return "RETURNED" as const;
      }

      if (draft.lead_approval !== "APPROVED" || draft.lead_archived) return "LEAD_NOT_APPROVED" as const;
      if (!isValidReviewEmail(draft.lead_email)) return "EMAIL_REQUIRED" as const;
      if (draft.human_approval !== "APPROVED") return "CONFLICT" as const;
      const sending = await client.query<{ blocked: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM email_sends WHERE lead_id=$1 AND status IN ('SENDING','SENT')) AS blocked",
        [draft.lead_id],
      );
      if (sending.rows[0]?.blocked) return "SEND_STARTED" as const;
      await client.query("UPDATE drafts SET human_approval='PENDING', human_approved_by=NULL, human_approved_at=NULL, human_note=COALESCE($2,human_note) WHERE id=$1", [id, parsed.data.note ?? null]);
      await writeAudit(client, "REVOKE", "draft", id, actor.id, "USER", { fields: ["human_approval", "human_approved_by", "human_approved_at", "human_note"] });
      return "UPDATED" as const;
    });
    if (outcome === "NOT_FOUND") return jsonNoStore({ message: "Draft not found." }, 404);
    if (outcome === "STALE") return jsonNoStore({ message: "draft changed, please review again" }, 409);
    if (outcome === "LEAD_NOT_APPROVED") return jsonNoStore({ message: "The lead must be approved before reviewing this draft." }, 409);
    if (outcome === "EMAIL_REQUIRED") return jsonNoStore({ message: "A valid email is required to review this draft." }, 409);
    if (outcome === "FINAL") return jsonNoStore({ message: "Rejected drafts are final. Regenerate a new version from Awaiting draft." }, 409);
    if (outcome === "SEND_STARTED") return jsonNoStore({
      message: parsed.data.action === "return"
        ? "This lead cannot be returned because sending has started."
        : "This approval cannot be revoked because sending has started.",
    }, 409);
    if (outcome === "RETURNED") return jsonNoStore({ ok: true, returned: true });
    if (outcome === "CONFLICT") return jsonNoStore({ message: "This draft changed state. Refresh and review it again." }, 409);
    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ message: "Could not update this draft." }, 503);
  }
}
