import { z } from "zod";
import { writeAudit } from "@/lib/server/auth/audit";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { withTransaction } from "@/lib/server/db";

export const runtime = "nodejs";

const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]);
const LeadEditSchema = z.object({
  company_name: nullableText(500).optional(),
  contact_name: nullableText(300).optional(),
  email: z.union([z.email().max(320).transform((value) => value.trim().toLowerCase()), z.null()]).optional(),
  email_type: nullableText(100).optional(),
  phone: nullableText(40).optional(),
  country: z.union([z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()), z.null()]).optional(),
  language: nullableText(20).optional(),
  timezone: nullableText(100).optional(),
  niche: nullableText(500).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

const EDITABLE_COLUMNS = [
  "company_name", "contact_name", "email", "email_type", "phone", "country", "language", "timezone", "niche",
] as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonNoStore({ message: "Invalid lead changes." }, 400); }
  const parsed = LeadEditSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ message: "Check the lead fields and try again." }, 400);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({ message: "Lead not found." }, 404);

  try {
    const result = await withTransaction(async (client) => {
      const currentResult = await client.query<{ human_approval: string; archived: boolean }>(
        "SELECT human_approval, archived FROM leads WHERE id = $1 FOR UPDATE", [id],
      );
      const current = currentResult.rows[0];
      if (!current) return "NOT_FOUND" as const;
      if (current.archived) return "ARCHIVED" as const;
      const changes = EDITABLE_COLUMNS.filter((field) =>
        Object.hasOwn(parsed.data, field) && parsed.data[field] !== undefined,
      );
      const values = changes.map((field) => parsed.data[field]);
      const sets = changes.map((field, index) => `${field} = $${index + 1}`);
      const updated = await client.query<{ human_approval: string }>(
        `UPDATE leads SET ${sets.join(", ")}
          WHERE id = $${values.length + 1}
          RETURNING human_approval`,
        [...values, id],
      );
      await writeAudit(client, "EDIT", "lead", id, actor.id, "USER", { fields: changes });
      return { approvalReset: current.human_approval === "APPROVED" && updated.rows[0]?.human_approval === "PENDING" };
    });
    if (result === "NOT_FOUND") return jsonNoStore({ message: "Lead not found." }, 404);
    if (result === "ARCHIVED") return jsonNoStore({ message: "Archived leads cannot be edited." }, 409);
    return jsonNoStore({ ok: true, approvalReset: result.approvalReset });
  } catch {
    return jsonNoStore({ message: "Could not save lead changes." }, 503);
  }
}
