import { z } from "zod";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { jsonNoStore } from "@/lib/server/auth/http";
import { getAllQueuePage } from "@/lib/server/review/all-queue";

export const runtime = "nodejs";
const QuerySchema = z
  .object({
    status: z
      .enum(["ALL", "PENDING", "APPROVED", "REJECTED", "ARCHIVED"])
      .default("ALL"),
    agent: z
      .enum(["ALL", "VERIFIED", "NEEDS_REVIEW", "REJECTED"])
      .default("ALL"),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .or(z.literal(""))
      .default(""),
    tag: z
      .enum([
        "ALL",
        "OPT_OUT_REGIME",
        "CONDITIONAL",
        "CONSENT_REQUIRED",
        "VARIES_REVIEW",
        "UNKNOWN_REVIEW",
      ])
      .default("ALL"),
    email: z.enum(["ALL", "YES", "NO"]).default("ALL"),
    draft: z
      .enum(["ALL", "NONE", "PENDING", "APPROVED", "REJECTED"])
      .default("ALL"),
    search: z.string().max(100).default(""),
    cursorAt: z.string().datetime().optional(),
    cursorId: z.uuid().optional(),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (
    !parsed.success ||
    Boolean(parsed.data.cursorAt) !== Boolean(parsed.data.cursorId)
  ) {
    return jsonNoStore({ message: "Invalid All filters." }, 400);
  }
  const { cursorAt, cursorId, ...filters } = parsed.data;
  const result = await getAllQueuePage(
    filters,
    cursorAt ? { updatedAt: cursorAt, id: cursorId! } : undefined,
  );
  const rows = result.rows.slice(0, 25);
  return jsonNoStore({
    leads: rows.map((row) => ({
      ...row,
      updated_at: row.updated_at,
    })),
    total: rows[0]?.total_count ?? 0,
    hasMore: result.rows.length > 25,
  });
}
