import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { getAppConfig } from "@/lib/server/config";

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string): string {
  return createHmac("sha256", getAppConfig().env.OTP_PEPPER).update(code).digest("hex");
}

export function hashEmail(email: string): string {
  return createHmac("sha256", getAppConfig().env.OTP_PEPPER)
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function secureHashEquals(actualHex: string | null, candidateHex: string): boolean {
  const candidate = Buffer.from(candidateHex, "hex");
  const actual = actualHex && /^[a-f0-9]{64}$/i.test(actualHex)
    ? Buffer.from(actualHex, "hex")
    : Buffer.alloc(32);
  return timingSafeEqual(actual, candidate) && actualHex !== null;
}

export function newAuditEntityId(): string {
  return randomUUID();
}
