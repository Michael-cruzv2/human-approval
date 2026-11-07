import { z } from "zod";
import { writeAudit } from "@/lib/server/auth/audit";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { withTransaction } from "@/lib/server/db";

export const runtime = "nodejs";

const CreateUserSchema = z.object({
  email: z.email().max(320),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "operator"]),
});

export async function GET(): Promise<Response> {
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  if (actor.role !== "admin") return jsonNoStore({ message: "Admin access required." }, 403);

  const users = await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, email, name, role, is_active, created_at
         FROM users ORDER BY created_at ASC, id ASC`,
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      role: row.role,
      isActive: row.is_active === true,
      createdAt: row.created_at,
    }));
  });
  return jsonNoStore({ users });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  if (actor.role !== "admin") return jsonNoStore({ message: "Admin access required." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ message: "Enter valid user details." }, 400);
  }
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ message: "Enter valid user details." }, 400);

  try {
    const user = await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('review-app-active-users', 0))");
      const activeCount = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM users WHERE is_active = true",
      );
      if ((activeCount.rows[0]?.count ?? 0) >= 3) throw new Error("ACTIVE_LIMIT");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, name, role, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [parsed.data.email.trim().toLowerCase(), parsed.data.name, parsed.data.role],
      );
      const id = inserted.rows[0].id;
      await writeAudit(client, "USER_ADD", "user", id, actor.id, "USER", { role: parsed.data.role });
      return { id };
    });
    return jsonNoStore({ ok: true, user }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVE_LIMIT") {
      return jsonNoStore({ message: "At most 3 active users are allowed." }, 409);
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return jsonNoStore({ message: "A user with that email already exists." }, 409);
    }
    return jsonNoStore({ message: "Could not add user." }, 503);
  }
}
