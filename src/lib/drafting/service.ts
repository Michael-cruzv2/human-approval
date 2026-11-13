import "server-only";

import { getAppConfig } from "@/lib/server/config";
import { generateDraft, type DraftActor, type GenerateDraftResult } from "./generate";

export type { GenerateDraftResult } from "./generate";
import { createChatClient } from "./llm";
import {
  insertGeneratedDraft,
  isDraftingEnabled,
  loadDraftState,
  loadGenerationLead,
} from "./repository";
import { loadEmailTemplate } from "./template";

function buildDeps() {
  const env = getAppConfig().env;
  return {
    loadTemplate: () => loadEmailTemplate(),
    loadLead: loadGenerationLead,
    loadDraftState,
    isDraftingEnabled,
    insertDraft: insertGeneratedDraft,
    llm: createChatClient({
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
    }),
    aiModel: env.LLM_MODEL,
  };
}

export async function generateDraftForLead(
  leadId: string,
  actor: DraftActor,
): Promise<GenerateDraftResult> {
  return generateDraft(buildDeps(), { leadId, actor });
}

/**
 * Runs after a lead approval commits (R30). It never throws, never blocks and
 * never logs lead data: a model failure leaves the approval untouched.
 */
export async function generateDraftAfterApproval(leadId: string): Promise<void> {
  try {
    await generateDraftForLead(leadId, { id: null, type: "SYSTEM" });
  } catch {
    // The approval is already committed; a failed generation is surfaced in the
    // Drafts > Awaiting draft queue. Only IDs and action names are ever logged.
    console.warn("DRAFT_GENERATE failed", { leadId });
  }
}
