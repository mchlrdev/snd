import type { Context, Hono } from "hono";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import type { Operator } from "../operator.js";
import { secretsEqual } from "../crypto.js";
import {
  clearSessionCookie,
  createSessionCookie,
  sessionValid,
} from "../session.js";
import type { MailQueue } from "../mail.js";
import { SlidingWindowLimiter } from "../limits.js";
import { clientIp } from "../client-ip.js";
import type { SubmissionFilter } from "../types.js";

function optionalNumber(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new AppError(400, `Ungültige Zahl: ${value}`);
  return n;
}

const STATUSES = new Set(["delivered", "pending", "failed"]);

/** Gemeinsame Filter für Nachrichtenlisten und Auswertungen aus der Query. */
function filterFromQuery(c: Context): SubmissionFilter {
  const status = c.req.query("status");
  if (status && !STATUSES.has(status)) throw new AppError(400, "status muss delivered, pending oder failed sein.");
  return {
    formId: c.req.query("formId") || undefined,
    projectId: c.req.query("projectId") || undefined,
    status: (status || undefined) as SubmissionFilter["status"],
    since: optionalNumber(c.req.query("since")),
    until: optionalNumber(c.req.query("until")),
    query: c.req.query("q") || undefined,
    field: c.req.query("field") || undefined,
    value: c.req.query("value") ?? undefined,
  };
}

const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_ATTEMPTS = 10;

function secureCookies(config: Config, c: Context): boolean {
  if (config.publicUrl) return config.publicUrl.startsWith("https://");
  if (config.trustProxy && c.req.header("x-forwarded-proto") === "https") return true;
  return new URL(c.req.url).protocol === "https:";
}

/**
 * CSRF-Schutz für schreibende Operator-Requests. Das Cookie ist SameSite=Lax,
 * das schützt aber nicht vor Seiten auf derselben Site (Subdomains). Browser
 * senden bei POST/PATCH/DELETE immer Origin bzw. Sec-Fetch-Site, also lehnen
 * wir alles ab, was nicht von dieser Instanz selbst kommt.
 */
function sameOrigin(c: Context): boolean {
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = c.req.header("origin");
  if (!origin) return true;
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function mountApi(
  app: Hono,
  env: { config: Config; operator: Operator; queue: MailQueue; now: () => number },
): void {
  const loginLimiter = new SlidingWindowLimiter(LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS);

  function requireSession(_config: Config, cookie: string | undefined): void {
    if (!sessionValid(env.config.secret, env.config.password, cookie, env.now())) {
      throw new AppError(401, "Nicht angemeldet.");
    }
  }

  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && !sameOrigin(c)) {
      throw new AppError(403, "Anfrage von fremder Herkunft abgelehnt.");
    }
    await next();
    if (!c.res.headers.has("cache-control")) c.header("cache-control", "no-store");
  });

  app.post("/api/login", async (c) => {
    const ip = clientIp(c, env.config.trustProxy);
    // Nur Fehlversuche zählen: wer das Passwort kennt, wird nie ausgesperrt.
    if (loginLimiter.exhausted(ip, env.now())) {
      throw new AppError(429, "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.");
    }
    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    if (!secretsEqual(password, env.config.password)) {
      loginLimiter.allow(ip, env.now());
      throw new AppError(401, "Ungültiges Passwort.");
    }
    c.header("set-cookie", createSessionCookie(env.config.secret, env.config.password, env.now(), secureCookies(env.config, c)));
    return c.json({ ok: true });
  });

  app.post("/api/logout", (c) => {
    c.header("set-cookie", clearSessionCookie(secureCookies(env.config, c)));
    return c.json({ ok: true });
  });

  app.get("/api/me", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json({ ok: true });
  });

  app.get("/api/settings", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.getSettings());
  });

  app.patch("/api/settings", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const body = await c.req.json();
    return c.json(env.operator.updateSettings(body));
  });

  app.post("/api/settings/test-smtp", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const body = (await c.req.json()) as { to?: string };
    await env.operator.testAdminSmtp(body.to ?? "");
    return c.json({ ok: true });
  });

  app.post("/api/settings/rotate-mcp-token", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.rotateMcpToken());
  });

  app.get("/api/projects", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.listProjects());
  });

  app.post("/api/projects", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const body = await c.req.json();
    return c.json(env.operator.createProject(body), 201);
  });

  app.get("/api/projects/:id", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.getProject(c.req.param("id")));
  });

  app.patch("/api/projects/:id", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const body = await c.req.json();
    return c.json(env.operator.updateProject(c.req.param("id"), body));
  });

  app.delete("/api/projects/:id", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    env.operator.deleteProject(c.req.param("id"));
    return c.body(null, 204);
  });

  app.get("/api/projects/:id/export.csv", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const csv = env.operator.exportProjectCsv(c.req.param("id"));
    return c.text(csv, 200, { "content-type": "text/csv; charset=utf-8" });
  });

  app.post("/api/projects/:id/test-smtp", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const body = (await c.req.json()) as { to?: string };
    await env.operator.testProjectSmtp(c.req.param("id"), body.to ?? "");
    return c.json({ ok: true });
  });

  app.get("/api/projects/:id/forms", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.listForms(c.req.param("id"), c.req.url));
  });

  app.post("/api/projects/:id/forms", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const body = await c.req.json();
    return c.json(env.operator.createForm(c.req.param("id"), body, c.req.url), 201);
  });

  app.get("/api/forms/:id", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.getForm(c.req.param("id"), c.req.url));
  });

  app.patch("/api/forms/:id", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const body = await c.req.json();
    return c.json(env.operator.updateForm(c.req.param("id"), body, c.req.url));
  });

  app.delete("/api/forms/:id", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    env.operator.deleteForm(c.req.param("id"));
    return c.body(null, 204);
  });

  app.post("/api/forms/:id/rotate-key", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.rotateAccessKey(c.req.param("id"), c.req.url));
  });

  app.post("/api/forms/:id/acknowledge-failures", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.acknowledgeFailures({ formId: c.req.param("id") }));
  });

  app.post("/api/forms/:id/resend-failures", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const result = env.operator.resendFailures(c.req.param("id"));
    void env.queue.tick();
    return c.json(result);
  });

  app.get("/api/forms/:id/export.csv", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const csv = env.operator.exportFormCsv(c.req.param("id"));
    return c.text(csv, 200, { "content-type": "text/csv; charset=utf-8" });
  });

  app.post("/api/forms/:id/test-smtp", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const body = (await c.req.json()) as { to?: string };
    await env.operator.testFormSmtp(c.req.param("id"), body.to ?? "");
    return c.json({ ok: true });
  });

  app.get("/api/forms/:id/submissions", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    return c.json(
      env.operator.listSubmissions({ ...filterFromQuery(c), formId: c.req.param("id"), limit, offset }),
    );
  });

  app.get("/api/projects/:id/submissions", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    return c.json(
      env.operator.listSubmissions({ ...filterFromQuery(c), projectId: c.req.param("id"), limit, offset }),
    );
  });

  app.get("/api/submissions", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    return c.json(env.operator.listSubmissions({ ...filterFromQuery(c), limit, offset }));
  });

  app.get("/api/stats", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const bucket = c.req.query("bucket");
    if (bucket && bucket !== "day" && bucket !== "week" && bucket !== "month") {
      throw new AppError(400, "bucket muss day, week oder month sein.");
    }
    const filter = filterFromQuery(c);
    return c.json(
      env.operator.stats({
        filter,
        since: filter.since,
        until: filter.until,
        days: optionalNumber(c.req.query("days")),
        bucket: (bucket || undefined) as "day" | "week" | "month" | undefined,
        timeZone: c.req.query("tz"),
      }),
    );
  });

  app.get("/api/projects/:id/favicon", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const icon = await env.operator.favicon(c.req.param("id"));
    if (!icon) return c.body(null, 404, { "cache-control": "private, max-age=3600" });
    return c.body(new Uint8Array(icon.data), 200, {
      "content-type": icon.contentType,
      "cache-control": "private, max-age=86400",
      // Fremde SVGs dürfen nichts ausführen, auch nicht beim direkten Aufruf.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
  });

  app.get("/api/submissions/:id", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    return c.json(env.operator.getSubmission(c.req.param("id")));
  });

  app.delete("/api/submissions/:id", (c) => {
    requireSession(env.config, c.req.header("cookie"));
    env.operator.deleteSubmission(c.req.param("id"));
    return c.body(null, 204);
  });

  app.post("/api/submissions/:id/resend", async (c) => {
    requireSession(env.config, c.req.header("cookie"));
    const view = env.operator.resendSubmission(c.req.param("id"));
    void env.queue.tick();
    return c.json(view);
  });
}
