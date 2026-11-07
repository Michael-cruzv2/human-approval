import { randomInt } from "node:crypto";
import { z } from "zod";
import { getClientIp, isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { MailgunOtpEmailSender } from "@/lib/server/auth/email";
import { deliverOtpEmail, requestOtp } from "@/lib/server/auth/otp";

export const runtime = "nodejs";

const RequestSchema = z.object({ email: z.email().max(320) });
const GENERIC_MESSAGE = "If this email is authorised, a code has been sent.";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonNoStore({ message: "Request origin not allowed." }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ message: "Enter a valid email address." }, 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonNoStore({ message: "Enter a valid email address." }, 400);
  }

  const startedAt = Date.now();
  let databaseUnavailable = false;
  try {
    const pending = await requestOtp(parsed.data.email, getClientIp(request.headers));
    await deliverOtpEmail(pending, new MailgunOtpEmailSender());
  } catch {
    databaseUnavailable = true;
  }

  await wait(Math.max(0, randomInt(100, 301) - (Date.now() - startedAt)));
  if (databaseUnavailable) {
    return jsonNoStore({ message: "Sign-in is temporarily unavailable. Try again shortly." }, 503);
  }
  return jsonNoStore({ message: GENERIC_MESSAGE });
}
