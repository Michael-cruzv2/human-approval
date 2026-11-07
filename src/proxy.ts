import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__Host-session";
const PUBLIC_PATHS = new Set([
  "/login",
  "/login/verify",
  "/api/auth/request-otp",
  "/api/auth/verify-otp",
]);

function securityHeaders(response: NextResponse, csp: string, requestId: string) {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Request-Id", requestId);
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const requestId = randomUUID();
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ""}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-request-id", requestId);

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);
  if (!isPublic && !hasSessionCookie) {
    if (pathname.startsWith("/api/")) {
      return securityHeaders(
        NextResponse.json({ message: "Sign-in required." }, { status: 401 }),
        csp,
        requestId,
      );
    }
    return securityHeaders(NextResponse.redirect(new URL("/login", request.url)), csp, requestId);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return securityHeaders(response, csp, requestId);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
