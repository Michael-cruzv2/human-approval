import { z } from "zod";
import { writeAudit } from "@/lib/server/auth/audit";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { withTransaction } from "@/lib/server/db";

export const runtime = "nodejs";

const UpdateUserSchema = z.union([
  z.object({ role: z.enum(["admin", "operator"]) }).strict(),
  z.object({ isActive: z.boolean() }).strict(),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  if (actor.role !== "admin") return jsonNoStore({ message: "Admin access required." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ message: "Invalid user update." }, 400);
  }
  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ message: "Invalid user update." }, 400);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonNoStore({ message: "User not found." }, 404);

  try {
    const outcome = await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('review-app-active-users', 0))");
      const selected = await client.query<{
        role: "admin" | "operator";
        is_active: boolean;
      }>("SELECT role, is_active FROM users WHERE id = $1 FOR UPDATE", [id]);
      const current = selected.rows[0];
      if (!current) return "NOT_FOUND" as const;

      if ("role" in parsed.data) {
        if (current.role === parsed.data.role) return "UNCHANGED" as const;
        if (current.role === "admin" && current.is_active) {
          const admins = await client.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND is_active = true",
          );
          if ((admins.rows[0]?.count ?? 0) <= 1 && parsed.data.role !== "admin") {
            return "LAST_ADMIN" as const;
          }
        }
        await client.query("UPDATE users SET role = $2 WHERE id = $1", [id, parsed.data.role]);
        await writeAudit(client, "ROLE_CHANGE", "user", id, actor.id, "USER", { field: "role" });
        return "UPDATED" as const;
      }

      if (current.is_active === parsed.data.isActive) return "UNCHANGED" as const;
      if (!parsed.data.isActive && current.role === "admin") {
        const admins = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND is_active = true",
        );
        if ((admins.rows[0]?.count ?? 0) <= 1) return "LAST_ADMIN" as const;
      }
      if (parsed.data.isActive) {
        const active = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM users WHERE is_active = true",
        );
        if ((active.rows[0]?.count ?? 0) >= 3) return "ACTIVE_LIMIT" as const;
      }
      await client.query("UPDATE users SET is_active = $2 WHERE id = $1", [id, parsed.data.isActive]);
      if (!parsed.data.isActive) {
        await client.query(
          "UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
          [id],
        );
      }
      await writeAudit(
        client,
        parsed.data.isActive ? "USER_ACTIVATE" : "USER_DEACTIVATE",
        "user",
        id,
        actor.id,
        "USER",
        { field: "is_active" },
      );
      return "UPDATED" as const;
    });
    if (outcome === "NOT_FOUND") return jsonNoStore({ message: "User not found." }, 404);
    if (outcome === "LAST_ADMIN") return jsonNoStore({ message: "The last active admin cannot be changed." }, 409);
    if (outcome === "ACTIVE_LIMIT") return jsonNoStore({ message: "At most 3 active users are allowed." }, 409);
    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ message: "Could not update user." }, 503);
  }
}
