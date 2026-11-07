import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { getAppConfig } from "@/lib/server/config";
import { writeAuthAudit } from "@/lib/server/auth/audit";
import { hashSessionToken, newSessionToken } from "@/lib/server/auth/crypto";
import type { UserRow } from "@/lib/server/db/rows";
import { query, withTransaction } from "@/lib/server/db";

export type SessionUser = UserRow;

export type CreatedSession = {
  token: string;
  expiresAt: Date;
};

export async function createSession(
  client: PoolClient,
  userId: string,
  ip: string | null,
  userAgent: string | null,
): Promise<CreatedSession> {
  const { session_absolute_days } = getAppConfig().app.auth;
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + session_absolute_days * 24 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4::inet, $5)`,
    [userId, hashSessionToken(token), session_absolute_days, ip, userAgent],
  );
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const { session_idle_hours } = getAppConfig().app.auth;
  const result = await query<{
    id: string;
    email: string;
    name: string;
    role: "admin" | "operator";
    is_active: boolean;
  }>(
    `UPDATE auth_sessions AS s
        SET last_seen_at = now()
       FROM users AS u
      WHERE s.user_id = u.id
        AND s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(hours => $2)
        AND u.is_active = true
      RETURNING u.id, u.email, u.name, u.role, u.is_active`,
    [hashSessionToken(token), session_idle_hours],
  );
  const row = result.rows[0];
  return row
    ? {
        id: String(row.id),
        email: String(row.email),
        name: String(row.name),
        role: row.role,
        isActive: row.is_active === true,
      }
    : null;
}

export async function getCurrentSessionUser(): Promise<SessionUser | null> {
  const cookieName = getAppConfig().app.auth.cookie_name;
  const token = (await cookies()).get(cookieName)?.value;
  return token ? getSessionUser(token) : null;
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getCurrentSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function revokeSession(token: string): Promise<string | null> {
  return withTransaction(async (client) => {
    const result = await client.query<{ user_id: string }>(
      `UPDATE auth_sessions
          SET revoked_at = now()
        WHERE token_hash = $1 AND revoked_at IS NULL
        RETURNING user_id`,
      [hashSessionToken(token)],
    );
    const userId = result.rows[0]?.user_id;
    if (userId) await writeAuthAudit(client, "LOGOUT", userId, userId, "USER");
    return userId ?? null;
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await writeAuthAudit(client, "LOGOUT", userId, userId, "USER");
  });
}

