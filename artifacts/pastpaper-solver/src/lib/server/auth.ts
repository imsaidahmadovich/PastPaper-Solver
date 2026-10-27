import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "pps_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters.");
  }
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createAdminSession(): string {
  const payload = Buffer.from(
    JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function isAdminRequest(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
  if (!cookie) return false;

  const token = cookie.slice(ADMIN_COOKIE_NAME.length + 1);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  try {
    const expected = sign(payload);
    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length) return false;
    if (!timingSafeEqual(suppliedBuffer, expectedBuffer)) return false;

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      role?: string;
      exp?: number;
    };
    return decoded.role === "admin" && typeof decoded.exp === "number" && decoded.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function setAdminCookie(response: NextResponse, token: string | null): void {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token ?? "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: token ? SESSION_TTL_SECONDS : 0,
  });
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function requireAdmin(request: Request): Response | null {
  return isAdminRequest(request) ? null : jsonError("Administrator authentication required.", 401);
}
