import { z } from "zod";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { jsonNoStore } from "@/lib/server/auth/http";
import { getDraftQueuePage } from "@/lib/server/review/draft-queue";

export const runtime = "nodejs";
const QuerySchema = z
  .object({
    view: z
      .enum(["to-review", "awaiting-draft", "approved"])
      .default("to-review"),
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
    return jsonNoStore({ message: "Invalid draft queue filters." }, 400);
  }
  const result = await getDraftQueuePage(
    parsed.data.view,
    parsed.data.search,
    parsed.data.cursorAt
      ? { updatedAt: parsed.data.cursorAt, id: parsed.data.cursorId! }
      : undefined,
  );
  const rows = result.rows.slice(0, 25);
  return jsonNoStore({
    drafts: rows.map((row) => ({
      ...row,
      updated_at: row.updated_at,
    })),
    total: rows[0]?.total_count ?? 0,
    hasMore: result.rows.length > 25,
  });
}
