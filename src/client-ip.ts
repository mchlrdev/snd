import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * IP des Absenders für Rate-Limits. Hinter einem Proxy zählt der Eintrag, den
 * der nächste Proxy angehängt hat (der letzte in X-Forwarded-For); alles davor
 * kann der Client frei setzen. Ohne Proxy gilt die Socket-Adresse.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
