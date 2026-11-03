import { bodyLimit } from "hono/body-limit";
import type { Context, Hono } from "hono";
import { AppError } from "../errors.js";
import { acceptSubmission, MAX_BODY_BYTES, type TurnstileVerifier } from "../submit.js";
import type { SubmitLimits } from "../limits.js";
import type { SecretBox } from "../crypto.js";
import type { Store } from "../store.js";
import type { MailQueue } from "../mail.js";
import { clientIp } from "../client-ip.js";

type SubmitEnv = {
  store: Store;
  limits: SubmitLimits;
  box: SecretBox;
  verifyTurnstile: TurnstileVerifier;
  queue: MailQueue;
  now: () => number;
  trustProxy: boolean;
};

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Accept, Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function wantsJson(c: Context): boolean {
  return (c.req.header("accept") ?? "").includes("application/json");
}


async function readFields(c: Context): Promise<Record<string, string>> {
  const body = await c.req.parseBody({ all: true });
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value instanceof File) {
      throw new AppError(400, "Datei-Uploads werden nicht unterstützt.");
    }
    if (Array.isArray(value)) {
      if (value.some((item) => item instanceof File)) {
        throw new AppError(400, "Datei-Uploads werden nicht unterstützt.");
      }
      fields[key] = value.map(String).join(", ");
    } else {
      fields[key] = String(value);
    }
  }
  return fields;
}

function submitResponse(
  c: Context,
  result: { redirect: string | null },
  origin: string | null,
): Response {
  const headers = corsHeaders(origin);
  if (wantsJson(c)) {
    return c.json({ success: true, message: "Formular gesendet." }, 200, headers);
  }
  if (result.redirect) {
    return c.redirect(result.redirect, 303);
  }
  return c.text("Kein redirect und keine JSON-Antwort angefordert.", 400, headers);
}

function submitError(c: Context, error: AppError, origin: string | null): Response {
  const headers = corsHeaders(origin);
  if (error.status === 429) headers["retry-after"] = "60";
  if (wantsJson(c)) {
    return c.json({ success: false, message: error.message }, error.status as 400, headers);
  }
  return c.text(error.message, error.status as 400, headers);
}

export function mountSubmit(app: Hono, env: SubmitEnv): void {
  app.options("/submit", (c) => {
    const origin = c.req.header("origin") ?? null;
    return c.body(null, 204, corsHeaders(origin));
  });

  app.post(
    "/submit",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => {
        const origin = c.req.header("origin") ?? null;
        if (wantsJson(c)) {
          return c.json(
            { success: false, message: "Formular ist zu groß." },
            413,
            corsHeaders(origin),
          );
        }
        return c.text("Formular ist zu groß.", 413, corsHeaders(origin));
      },
    }),
    async (c) => {
      const originHeader = c.req.header("origin") ?? null;
      try {
        const fields = await readFields(c);
        const result = await acceptSubmission(
          env.store,
          env.limits,
          {
            fields,
            originHeader,
            referer: c.req.header("referer") ?? null,
            ip: clientIp(c, env.trustProxy),
            bodyBytes: Number(c.req.header("content-length") ?? 0),
            now: env.now(),
            wantsJson: wantsJson(c),
          },
          env.verifyTurnstile,
          (enc) => env.box.decrypt(enc),
        );
        if (!result.honeypot) void env.queue.tick();
        return submitResponse(c, result, originHeader);
      } catch (error) {
        if (error instanceof AppError) return submitError(c, error, originHeader);
        throw error;
      }
    },
  );
}
