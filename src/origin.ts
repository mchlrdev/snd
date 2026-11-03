export function canonicalOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function originFromRequest(originHeader: string | null, referer: string | null): string | null {
  if (originHeader && originHeader !== "null") return canonicalOrigin(originHeader);
  if (referer) return canonicalOrigin(referer);
  return null;
}

export function originAllowed(candidate: string, allowed: string[]): boolean {
  const origin = canonicalOrigin(candidate);
  if (!origin) return false;
  return allowed.some((item) => canonicalOrigin(item) === origin);
}

export function normalizeOrigins(origins: string[]): string[] {
  const out: string[] = [];
  for (const raw of origins) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const origin = canonicalOrigin(trimmed);
    if (!origin) {
      throw new Error(`Ungültige Origin: ${raw}`);
    }
    if (!out.includes(origin)) out.push(origin);
  }
  return out;
}
