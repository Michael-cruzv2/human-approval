import { isIP } from "node:net";
import { getAppConfig } from "@/lib/server/config";

export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export function isSameOriginRequest(request: Request): boolean {
  const { APP_ORIGIN } = getAppConfig().env;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const expectedHost = new URL(APP_ORIGIN).host.toLowerCase();
  return origin === APP_ORIGIN && host?.toLowerCase() === expectedHost;
}

export function getClientIp(headers: Headers): string | null {
  // Vercel overwrites X-Forwarded-For with the client's public IP.
  if (process.env.NODE_ENV === "production") {
    const forwarded = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
    return forwarded && isIP(forwarded) ? forwarded : null;
  }
  return "127.0.0.1";
}

export function getUserAgent(headers: Headers): string | null {
  return headers.get("user-agent")?.slice(0, 512) ?? null;
}
