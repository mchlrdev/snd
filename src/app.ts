import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Config } from "./config.js";
import type { SecretBox } from "./crypto.js";
import { AppError } from "./errors.js";
import type { SubmitLimits } from "./limits.js";
import type { MailQueue } from "./mail.js";
import type { Operator } from "./operator.js";
import { mountApi } from "./routes/api.js";
import { mountMcp } from "./routes/mcp.js";
import { mountSubmit } from "./routes/submit.js";
import type { Store } from "./store.js";
import type { TurnstileVerifier } from "./submit.js";

export type AppEnv = {
  store: Store;
  config: Config;
  limits: SubmitLimits;
  operator: Operator;
  verifyTurnstile: TurnstileVerifier;
  box: SecretBox;
  queue: MailQueue;
  now: () => number;
};

export function createApp(env: AppEnv): Hono {
  const app = new Hono();
  // Operator console: no framing by other sites, strict CSP. /submit is left
  // out so form responses (redirect, CORS) stay unchanged.
  const consoleHeaders = secureHeaders({
    xFrameOptions: "DENY",
    referrerPolicy: "same-origin",
    crossOriginResourcePolicy: "same-origin",
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
  });
  app.use("*", async (c, next) => {
    if (c.req.path === "/submit") return next();
    return consoleHeaders(c, next);
  });
  app.get("/health", (c) => c.json({ ok: true }));
  mountSubmit(app, {
    store: env.store,
    limits: env.limits,
    box: env.box,
    verifyTurnstile: env.verifyTurnstile,
    queue: env.queue,
    now: env.now,
    trustProxy: env.config.trustProxy,
  });
  mountApi(app, {
    config: env.config,
    operator: env.operator,
    queue: env.queue,
    now: env.now,
  });
  mountMcp(app, { config: env.config, operator: env.operator, queue: env.queue });

  const publicDir = "dist/public";
  const indexHtml = join(publicDir, "index.html");
  if (existsSync(indexHtml)) {
    app.use("/*", serveStatic({ root: publicDir }));
  }
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: error.message }, error.status as 400);
    }
    console.error(error);
    return c.json({ error: "Internal error." }, 500);
  });
  app.notFound((c) => {
    if (c.req.method === "GET" && existsSync(indexHtml) && !c.req.path.startsWith("/api") && c.req.path !== "/mcp" && c.req.path !== "/submit") {
      return c.html(readFileSync(indexHtml, "utf8"));
    }
    return c.json({ error: "Not found." }, 404);
  });
  return app;
}
