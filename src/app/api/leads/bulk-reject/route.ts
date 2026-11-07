import { z } from "zod";
import { writeAudit } from "@/lib/server/auth/audit";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { withTransaction } from "@/lib/server/db";

export const runtime = "nodejs";
const BulkSchema = z.object({ ids: z.array(z.uuid()).min(1).max(100), note: z.string().trim().min(1).max(2000) }).strict();

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonNoStore({ message: "Invalid bulk rejection." }, 400); }
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success || new Set(parsed.data.ids).size !== parsed.data.ids.length) return jsonNoStore({ message: "Select valid leads and enter a note." }, 400);

  try {
    const count = await withTransaction(async (client) => {
      const selected = await client.query<{ id: string }>(
        `SELECT id FROM leads WHERE id = ANY($1::uuid[]) AND human_approval='PENDING'
          AND agent_approval <> 'REJECTED' AND archived=false FOR UPDATE`, [parsed.data.ids],
      );
      if (selected.rowCount !== parsed.data.ids.length) throw new Error("CONFLICT");
      for (const { id } of selected.rows) {
        await client.query("UPDATE leads SET human_approval='REJECTED', human_approved_by=$2, human_approved_at=now(), human_note=$3 WHERE id=$1", [id, actor.id, parsed.data.note]);
        await writeAudit(client, "REJECT", "lead", id, actor.id, "USER", { fields: ["human_approval"] });
      }
      return selected.rows.length;
    });
    return jsonNoStore({ ok: true, rejected: count });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") return jsonNoStore({ message: "One or more leads changed. Refresh the list and try again." }, 409);
    return jsonNoStore({ message: "Could not reject selected leads." }, 503);
  }
}
