import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";

export function randomState(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function parseCookies(cookieHeader?: string) {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;

  for (const part of cookieHeader.split(";")) {
    const p = part.trim();
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx);
    const v = p.slice(idx + 1);
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function buildCookie(
  name: string,
  value: string,
  opts: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    domain?: string;
    path?: string;
    maxAgeSeconds?: number;
  } = {}
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly ?? true) parts.push("HttpOnly");
  if (opts.secure ?? true) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

export async function signAppJwt(payload: { sub: string; [k: string]: unknown }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET");
  const key = new TextEncoder().encode(secret);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 7; // 7 days

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);
}

export async function verifyAppJwt(token: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET");
  const key = new TextEncoder().encode(secret);

  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  return payload;
}
