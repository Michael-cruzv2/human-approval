import "server-only";

import type { PoolClient } from "pg";
import { getAppConfig } from "@/lib/server/config";
import { writeAuthAudit } from "@/lib/server/auth/audit";
import {
  generateOtp,
  hashEmail,
  hashOtp,
  newAuditEntityId,
  secureHashEquals,
} from "@/lib/server/auth/crypto";
import type { OtpEmailSender } from "@/lib/server/auth/email";
import { createSession, type CreatedSession } from "@/lib/server/auth/session";
import { getPool, withTransaction } from "@/lib/server/db";

type ClientMetadata = {
  ip: string | null;
  userAgent: string | null;
};

export type PendingOtpEmail = {
  id: string;
  email: string;
  code: string;
};

type VerifyResult =
  | { status: "success"; userId: string; session: CreatedSession }
  | { status: "invalid" }
  | { status: "locked" };

async function lockRateLimitKeys(client: PoolClient, emailHash: string, ip: string | null) {
  const keys = [`auth-email:${emailHash}`, ...(ip ? [`auth-ip:${ip}`] : [])].sort();
  for (const key of keys) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
  }
}

async function isVerifyLocked(
  client: PoolClient,
  emailHash: string,
  ip: string | null,
): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM auth_verify_attempts
          WHERE email_hash = $1 AND email_locked_until > now()
       ) OR (
         $2::inet IS NOT NULL AND EXISTS (
           SELECT 1 FROM auth_verify_attempts
            WHERE request_ip = $2::inet AND ip_locked_until > now()
         )
       ) AS locked`,
    [emailHash, ip],
  );
  return result.rows[0]?.locked === true;
}

export async function requestOtp(email: string, ip: string | null): Promise<PendingOtpEmail | null> {
  const config = getAppConfig();
  const normalizedEmail = email.trim().toLowerCase();
  const emailHash = hashEmail(normalizedEmail);
  const {
    otp_ttl_minutes,
    otp_resend_cooldown_seconds,
    otp_max_requests_per_email_per_hour,
    otp_max_requests_per_ip_per_hour,
  } = config.app.auth;

  const pending = await withTransaction(async (client) => {
    await lockRateLimitKeys(client, emailHash, ip);

    await client.query(
      `DELETE FROM auth_otp_codes
        WHERE created_at < now() - interval '1 hour' AND expires_at < now()`,
    );

    if (await isVerifyLocked(client, emailHash, ip)) {
      console.info("OTP request suppressed", { reason: "verification_lockout" });
      return null;
    }

    const userResult = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
      [normalizedEmail],
    );
    const user = userResult.rows[0] ?? null;

    const limitResult = await client.query<{
      email_count: number;
      ip_count: number;
      last_requested_at: Date | null;
    }>(
      `SELECT
         (SELECT count(*)::int FROM auth_otp_codes
           WHERE email = $1 AND created_at >= now() - interval '1 hour') AS email_count,
         (SELECT count(*)::int FROM auth_otp_codes
           WHERE $2::inet IS NOT NULL AND request_ip = $2::inet
             AND created_at >= now() - interval '1 hour') AS ip_count,
         (SELECT created_at FROM auth_otp_codes
           WHERE email = $1 ORDER BY created_at DESC LIMIT 1) AS last_requested_at`,
      [normalizedEmail, ip],
    );
    const limits = limitResult.rows[0];
    const cooldownActive =
      limits?.last_requested_at !== null &&
      limits?.last_requested_at !== undefined &&
      Date.now() - new Date(limits.last_requested_at).getTime() < otp_resend_cooldown_seconds * 1000;
    const emailRateLimited = (limits?.email_count ?? 0) >= otp_max_requests_per_email_per_hour;
    const ipRateLimited =
      ip !== null && (limits?.ip_count ?? 0) >= otp_max_requests_per_ip_per_hour;

    if (cooldownActive || emailRateLimited || ipRateLimited) {
      const reason = cooldownActive
        ? "resend_cooldown"
        : emailRateLimited
          ? "email_rate_limit"
          : "ip_rate_limit";
      console.info("OTP request suppressed", { reason });
      return null;
    }

    const code = user ? generateOtp() : null;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO auth_otp_codes (email, user_id, code_hash, expires_at, request_ip)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5::inet)
       RETURNING id`,
      [normalizedEmail, user?.id ?? null, code ? hashOtp(code) : null, otp_ttl_minutes, ip],
    );

    if (!user || !code) {
      console.info("OTP request suppressed", { reason: "no_active_user" });
      return null;
    }

    await client.query(
      `UPDATE auth_otp_codes
          SET invalidated_at = now()
        WHERE email = $1 AND id <> $2
          AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now()`,
      [normalizedEmail, inserted.rows[0].id],
    );

    return { id: inserted.rows[0].id, email: user.email, code };
  });

  return pending;
}

export async function invalidateUndeliveredOtp(id: string): Promise<void> {
  await getPool().query(
    `UPDATE auth_otp_codes
        SET invalidated_at = now()
      WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
    [id],
  );
}

export async function deliverOtpEmail(
  pending: PendingOtpEmail | null,
  sender: OtpEmailSender,
): Promise<void> {
  if (!pending) return;
  const delivered = await sender.sendLoginCode(pending.email, pending.code);
  if (!delivered) {
    try {
      await invalidateUndeliveredOtp(pending.id);
    } catch {
      // Keep the public response generic; the OTP is unpredictable and never returned.
    }
  }
}

async function recordFailedVerification(
  client: PoolClient,
  emailHash: string,
  ip: string | null,
  userId: string | null,
): Promise<"invalid" | "locked"> {
  const { failed_verify_lockout_threshold, failed_verify_lockout_minutes } = getAppConfig().app.auth;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO auth_verify_attempts (email_hash, request_ip)
     VALUES ($1, $2::inet)
     RETURNING id`,
    [emailHash, ip],
  );
  const counts = await client.query<{ email_count: number; ip_count: number }>(
    `SELECT
       (SELECT count(*)::int FROM auth_verify_attempts
         WHERE email_hash = $1 AND attempted_at >= now() - interval '15 minutes') AS email_count,
       (SELECT count(*)::int FROM auth_verify_attempts
         WHERE $2::inet IS NOT NULL AND request_ip = $2::inet
           AND attempted_at >= now() - interval '15 minutes') AS ip_count`,
    [emailHash, ip],
  );
  const emailLocked = (counts.rows[0]?.email_count ?? 0) >= failed_verify_lockout_threshold;
  const ipLocked = ip !== null && (counts.rows[0]?.ip_count ?? 0) >= failed_verify_lockout_threshold;

  if (emailLocked || ipLocked) {
    await client.query(
      `UPDATE auth_verify_attempts
          SET email_locked_until = CASE WHEN $2 THEN now() + make_interval(mins => $4) ELSE NULL END,
              ip_locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE NULL END
        WHERE id = $1`,
      [inserted.rows[0].id, emailLocked, ipLocked, failed_verify_lockout_minutes],
    );
  }

  const auditEntityId = userId ?? newAuditEntityId();
  await writeAuthAudit(client, "LOGIN_FAILED", auditEntityId, null, "SYSTEM");
  return emailLocked || ipLocked ? "locked" : "invalid";
}

export async function verifyOtp(
  email: string,
  code: string,
  metadata: ClientMetadata,
): Promise<VerifyResult> {
  const config = getAppConfig();
  const normalizedEmail = email.trim().toLowerCase();
  const emailHash = hashEmail(normalizedEmail);

  return withTransaction(async (client) => {
    await lockRateLimitKeys(client, emailHash, metadata.ip);
    await client.query(
      `DELETE FROM auth_verify_attempts WHERE attempted_at < now() - interval '15 minutes'`,
    );
    if (await isVerifyLocked(client, emailHash, metadata.ip)) return { status: "locked" };

    const otpResult = await client.query<{
      id: string;
      user_id: string | null;
      code_hash: string | null;
      attempts: number;
      expires_at: Date;
    }>(
      `SELECT id, user_id, code_hash, attempts, expires_at
         FROM auth_otp_codes
        WHERE email = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
          AND code_hash IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE`,
      [normalizedEmail],
    );
    const otp = otpResult.rows[0] ?? null;
    const candidateHash = hashOtp(code);
    const hashMatches = secureHashEquals(otp?.code_hash ?? null, candidateHash);
    const codeIsValid = /^[0-9]{6}$/.test(code);
    const notExpired = otp ? new Date(otp.expires_at).getTime() > Date.now() : false;
    const hasAttempts = otp ? otp.attempts < config.app.auth.otp_max_attempts : false;
    let user: { id: string } | null = null;

    if (otp?.user_id && hashMatches && codeIsValid && notExpired && hasAttempts) {
      const userResult = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1 AND is_active = true FOR UPDATE`,
        [otp.user_id],
      );
      user = userResult.rows[0] ?? null;
    }

    if (!otp || !user) {
      if (otp && otp.attempts + 1 >= config.app.auth.otp_max_attempts) {
        await client.query(
          `UPDATE auth_otp_codes
              SET attempts = attempts + 1, invalidated_at = now()
            WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
          [otp.id],
        );
      } else if (otp) {
        await client.query(
          `UPDATE auth_otp_codes SET attempts = attempts + 1
            WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
          [otp.id],
        );
      }
      const status = await recordFailedVerification(
        client,
        emailHash,
        metadata.ip,
        otp?.user_id ?? null,
      );
      return { status };
    }

    const consumed = await client.query<{ id: string }>(
      `UPDATE auth_otp_codes
          SET consumed_at = now()
        WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
          AND expires_at > now() AND attempts < $2
        RETURNING id`,
      [otp.id, config.app.auth.otp_max_attempts],
    );
    if (consumed.rowCount !== 1) {
      const status = await recordFailedVerification(client, emailHash, metadata.ip, user.id);
      return { status };
    }

    const session = await createSession(client, user.id, metadata.ip, metadata.userAgent);
    await writeAuthAudit(client, "LOGIN", user.id, user.id, "USER");
    return { status: "success", userId: user.id, session };
  });
}

