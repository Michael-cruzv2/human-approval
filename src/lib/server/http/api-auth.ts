import "server-only";

import { cookies } from "next/headers";
import { getAppConfig } from "@/lib/server/config";
import { getSessionUser, type SessionUser } from "@/lib/server/auth/session";

export type ApiSessionContext = { user: SessionUser; token: string };

export async function getApiSessionContext(): Promise<ApiSessionContext | null> {
  const cookieStore = await cookies();
  const cookieName = getAppConfig().app.auth.cookie_name;
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;
  const user = await getSessionUser(token);
  return user ? { user, token } : null;
}

export async function getApiSessionUser(): Promise<SessionUser | null> {
  const context = await getApiSessionContext();
  return context?.user ?? null;
}
