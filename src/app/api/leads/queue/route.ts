import { z } from "zod";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { jsonNoStore } from "@/lib/server/auth/http";
import { getLeadQueuePage } from "@/lib/server/review/lead-queue";

export const runtime = "nodejs";
const QuerySchema = z
  .object({
    status: z.enum(["PENDING", "REJECTED", "ALL"]).default("PENDING"),
    agent: z.enum(["VERIFIED", "NEEDS_REVIEW", "ALL"]).default("ALL"),
    tag: z
      .enum([
        "OPT_OUT_REGIME",
        "CONDITIONAL",
        "CONSENT_REQUIRED",
        "VARIES_REVIEW",
        "UNKNOWN_REVIEW",
        "ALL",
      ])
      .default("ALL"),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .or(z.literal(""))
      .default(""),
    search: z.string().max(100).default(""),
    email: z.enum(["ALL", "MISSING"]).default("ALL"),
    returned: z.enum(["true", "false"]).default("false"),
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
    return jsonNoStore({ message: "Invalid lead queue filters." }, 400);
  }
  const filters = {
    status: parsed.data.status,
    agent: parsed.data.agent,
    tag: parsed.data.tag,
    country: parsed.data.country,
    search: parsed.data.search,
    email: parsed.data.email,
    returned: parsed.data.returned === "true",
  };
  const result = await getLeadQueuePage(
    filters,
    parsed.data.cursorAt
      ? {
          updatedAt: parsed.data.cursorAt,
          id: parsed.data.cursorId!,
        }
      : undefined,
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
