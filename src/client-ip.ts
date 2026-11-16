import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * Sender IP for rate limits. Behind a proxy, the entry appended by the nearest
 * proxy counts (the last one in X-Forwarded-For); the client can set anything
 * before it. Without a proxy, the socket address is used.
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
