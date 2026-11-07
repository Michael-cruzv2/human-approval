import { cookies } from "next/headers";
import { z } from "zod";
import { getAppConfig } from "@/lib/server/config";
import { getClientIp, getUserAgent, isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { verifyOtp } from "@/lib/server/auth/otp";

export const runtime = "nodejs";

const VerifySchema = z.object({ email: z.email().max(320), code: z.string().min(1).max(64) });

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonNoStore({ message: "Request origin not allowed." }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ message: "Code incorrect or expired." }, 400);
  }
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return jsonNoStore({ message: "Code incorrect or expired." }, 400);
  }

  try {
    const result = await verifyOtp(parsed.data.email, parsed.data.code, {
      ip: getClientIp(request.headers),
      userAgent: getUserAgent(request.headers),
    });
    if (result.status === "locked") {
      return jsonNoStore({ message: "Too many attempts. Try again in 15 minutes." }, 429);
    }
    if (result.status === "invalid") {
      return jsonNoStore({ message: "Code incorrect or expired." }, 400);
    }

    const cookieStore = await cookies();
    cookieStore.set(getAppConfig().app.auth.cookie_name, result.session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: result.session.expiresAt,
    });
    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ message: "Sign-in is temporarily unavailable. Try again shortly." }, 503);
  }
}
