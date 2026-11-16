import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type SecretBox = {
  encrypt(plain: string): string;
  decrypt(token: string): string;
};

export function createSecretBox(secret: string): SecretBox {
  const key = createHash("sha256").update(secret).digest();
  return {
    encrypt(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, enc]).toString("base64url");
    },
    decrypt(token: string): string {
      const buf = Buffer.from(token, "base64url");
      if (buf.length < 29) throw new Error("Invalid secret.");
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const enc = buf.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    },
  };
}

export function secretsEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function signSession(secret: string, password: string, issuedAt: number): string {
  const payload = Buffer.from(JSON.stringify({ iat: issuedAt }), "utf8").toString("base64url");
  const mac = createHmac("sha256", `${secret}:${password}`).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function verifySession(secret: string, password: string, token: string, now: number = Date.now()): boolean {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", `${secret}:${password}`).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  try {
    const { iat } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iat?: unknown };
    if (typeof iat !== "number" || !Number.isFinite(iat)) return false;
    // Sessions expire so a copied cookie does not stay valid forever.
    return now - iat >= -60_000 && now - iat < SESSION_MAX_AGE_MS;
  } catch {
    return false;
  }
}
