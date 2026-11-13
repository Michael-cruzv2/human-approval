import { z } from "zod";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { generateDraftForLead, type GenerateDraftResult } from "@/lib/drafting/service";

export const runtime = "nodejs";
// At most 5 generations per request; each model call is bounded by 10 s (D27).
export const maxDuration = 60;

const BodySchema = z
  .object({
    leadIds: z.array(z.uuid()).min(1).max(5),
  })
  .strict();

type LeadResult = { leadId: string } & (
  | GenerateDraftResult
  | { status: "FAILED"; reason: "UNEXPECTED"; message: string }
);

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ message: "Invalid generation request." }, 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonNoStore({ message: "Choose between 1 and 5 leads to generate." }, 400);
  }

  const results: LeadResult[] = await Promise.all(
    parsed.data.leadIds.map(async (leadId) => {
      try {
        const result = await generateDraftForLead(leadId, { id: actor.id, type: "USER" });
        return { leadId, ...result };
      } catch {
        return {
          leadId,
          status: "FAILED" as const,
          reason: "UNEXPECTED" as const,
          message: "Could not generate this draft.",
        };
      }
    }),
  );

  return jsonNoStore({ results });
}
