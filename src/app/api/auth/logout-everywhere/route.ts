import { cookies } from "next/headers";
import { getAppConfig } from "@/lib/server/config";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { getSessionUser, revokeAllUserSessions } from "@/lib/server/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonNoStore({ message: "Request origin not allowed." }, 403);
  }
  const cookieStore = await cookies();
  const name = getAppConfig().app.auth.cookie_name;
  const token = cookieStore.get(name)?.value;
  if (!token) return jsonNoStore({ message: "Sign-in required." }, 401);

  try {
    const user = await getSessionUser(token);
    if (!user) {
      cookieStore.delete(name);
      return jsonNoStore({ message: "Sign-in required." }, 401);
    }
    await revokeAllUserSessions(user.id);
    cookieStore.delete(name);
    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ message: "Could not sign out. Try again." }, 503);
  }
}
