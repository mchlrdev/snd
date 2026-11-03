import { SESSION_MAX_AGE_MS, signSession, verifySession } from "./crypto.js";

export const SESSION_COOKIE = "snd_session";

export function createSessionCookie(secret: string, password: string, now: number, secure: boolean): string {
  const token = signSession(secret, password, now);
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

export function sessionValid(
  secret: string,
  password: string,
  cookieHeader: string | undefined,
  now: number = Date.now(),
): boolean {
  const token = readSessionToken(cookieHeader);
  if (!token) return false;
  return verifySession(secret, password, token, now);
}
