import { z } from "zod";
import { writeAudit } from "@/lib/server/auth/audit";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { withTransaction } from "@/lib/server/db";

export const runtime = "nodejs";

const ActionSchema = z.object({
  action: z.enum(["approve", "reject", "revoke", "reopen", "archive"]),
  note: z.string().trim().max(2000).optional(),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonNoStore({ message: "Invalid lead action." }, 400); }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success || (parsed.data.action === "reject" && !parsed.data.note)) {
    return jsonNoStore({ message: "A rejection note is required." }, 400);
  }
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({ message: "Lead not found." }, 404);

  try {
    const outcome = await withTransaction(async (client) => {
      const selected = await client.query<{
        human_approval: string; agent_approval: string; archived: boolean;
      }>("SELECT human_approval, agent_approval, archived FROM leads WHERE id = $1 FOR UPDATE", [id]);
      const lead = selected.rows[0];
      if (!lead) return "NOT_FOUND" as const;
      const { action, note } = parsed.data;
      if (action !== "archive" && lead.archived) return "CONFLICT" as const;
      let status: string;
      let auditAction: "APPROVE" | "REJECT" | "REVOKE" | "REOPEN" | "ARCHIVE";
      if (action === "approve") {
        if (lead.human_approval !== "PENDING" || lead.agent_approval === "REJECTED" || lead.archived) return "CONFLICT" as const;
        await client.query("UPDATE leads SET human_approval='APPROVED', human_approved_by=$2, human_approved_at=now(), human_note=$3 WHERE id=$1", [id, actor.id, note ?? null]);
        auditAction = "APPROVE"; status = "APPROVED";
      } else if (action === "reject") {
        if (lead.human_approval !== "PENDING" || lead.agent_approval === "REJECTED" || lead.archived) return "CONFLICT" as const;
        await client.query("UPDATE leads SET human_approval='REJECTED', human_approved_by=$2, human_approved_at=now(), human_note=$3 WHERE id=$1", [id, actor.id, note]);
        auditAction = "REJECT"; status = "REJECTED";
      } else if (action === "revoke") {
        if (lead.human_approval !== "APPROVED") return "CONFLICT" as const;
        const sending = await client.query<{ blocked: boolean }>(
          "SELECT EXISTS(SELECT 1 FROM email_sends WHERE lead_id=$1 AND status IN ('SENDING','SENT')) AS blocked", [id],
        );
        if (sending.rows[0]?.blocked) return "SEND_STARTED" as const;
        await client.query("UPDATE leads SET human_approval='PENDING', human_approved_by=NULL, human_approved_at=NULL, human_note=COALESCE($2,human_note) WHERE id=$1", [id, note ?? null]);
        auditAction = "REVOKE"; status = "PENDING";
      } else if (action === "reopen") {
        if (lead.human_approval !== "REJECTED") return "CONFLICT" as const;
        await client.query("UPDATE leads SET human_approval='PENDING', human_approved_by=NULL, human_approved_at=NULL, human_note=COALESCE($2,human_note) WHERE id=$1", [id, note ?? null]);
        auditAction = "REOPEN"; status = "PENDING";
      } else {
        if (lead.archived) return "CONFLICT" as const;
        await client.query("UPDATE leads SET archived=true WHERE id=$1", [id]);
        auditAction = "ARCHIVE"; status = lead.human_approval;
      }
      const fields = action === "archive"
        ? ["archived"]
        : ["human_approval", "human_approved_by", "human_approved_at", "human_note"];
      await writeAudit(client, auditAction, "lead", id, actor.id, "USER", { fields });
      return { status };
    });
    if (outcome === "NOT_FOUND") return jsonNoStore({ message: "Lead not found." }, 404);
    if (outcome === "SEND_STARTED") return jsonNoStore({ message: "This lead cannot be revoked because sending has started." }, 409);
    if (outcome === "CONFLICT") return jsonNoStore({ message: "This lead changed state. Refresh and review it again." }, 409);
    return jsonNoStore({ ok: true, status: outcome.status });
  } catch {
    return jsonNoStore({ message: "Could not update this lead." }, 503);
  }
}
