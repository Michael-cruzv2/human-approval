import type { ChatMessage } from "./prompt";

/**
 * Minimal OpenAI-compatible chat-completions client. The endpoint is configured
 * by environment variables only (R24); calls are short and bounded by a timeout.
 */

export class LlmError extends Error {}

export type LlmClient = {
  complete(messages: ChatMessage[]): Promise<string>;
};

export type LlmSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export function createChatClient(
  settings: LlmSettings,
  fetchImpl: typeof fetch = fetch,
): LlmClient {
  const endpoint = `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const timeoutMs = settings.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async complete(messages) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model: settings.model,
            messages,
            temperature: 0.4,
            max_completion_tokens: 500,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new LlmError("MODEL_UNAVAILABLE");
      }
      if (!response.ok) throw new LlmError("MODEL_ERROR");

      let payload: ChatCompletionResponse;
      try {
        payload = (await response.json()) as ChatCompletionResponse;
      } catch {
        throw new LlmError("MODEL_BAD_RESPONSE");
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new LlmError("MODEL_EMPTY");
      }
      return content;
    },
  };
}

/** Accepts plain JSON, a JSON code fence, or JSON wrapped in prose. */
export function parseSectionResponse(raw: string): { language: string; text: string } {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) throw new LlmError("MODEL_BAD_RESPONSE");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new LlmError("MODEL_BAD_RESPONSE");
  }
  if (typeof parsed !== "object" || parsed === null) throw new LlmError("MODEL_BAD_RESPONSE");
  const record = parsed as Record<string, unknown>;
  const language = typeof record.language === "string" ? record.language.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!language || !text) throw new LlmError("MODEL_BAD_RESPONSE");
  return { language, text };
}
