import { AppError } from "./errors.js";
import type { SubmitLimits } from "./limits.js";
import { originAllowed, originFromRequest } from "./origin.js";
import type { Store } from "./store.js";
import type { SubmissionRecord } from "./types.js";

export const MAX_FIELDS = 50;
export const MAX_BODY_BYTES = 100 * 1024;

const RESERVED = new Set(["access_key", "redirect", "botcheck", "cf-turnstile-response"]);

export type TurnstileResult = "ok" | "denied" | "unavailable";

export type TurnstileVerifier = (secret: string, token: string) => Promise<TurnstileResult>;

export type SubmitInput = {
  fields: Record<string, string>;
  originHeader: string | null;
  referer: string | null;
  ip: string;
  bodyBytes: number;
  now: number;
  wantsJson: boolean;
};

export type SubmitOk = {
  kind: "ok";
  honeypot: boolean;
  redirect: string | null;
  submission: SubmissionRecord | null;
};

export type CloudTurnstile = {
  success: boolean;
};

export async function verifyTurnstile(secret: string, token: string): Promise<TurnstileResult> {
  if (!token) return "denied";
  try {
    const body = new URLSearchParams({ secret, response: token });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "unavailable";
    const data = (await res.json()) as CloudTurnstile;
    return data.success ? "ok" : "denied";
  } catch {
    return "unavailable";
  }
}

export async function acceptSubmission(
  store: Store,
  limits: SubmitLimits,
  input: SubmitInput,
  verify: TurnstileVerifier,
  decryptTurnstile: (enc: string) => string,
): Promise<SubmitOk> {
  if (input.bodyBytes > MAX_BODY_BYTES) {
    throw new AppError(413, "Formular ist zu groß.");
  }
  const keys = Object.keys(input.fields);
  if (keys.length > MAX_FIELDS) {
    throw new AppError(400, "Zu viele Felder.");
  }

  const accessKey = input.fields.access_key?.trim() ?? "";
  if (!accessKey) {
    throw new AppError(400, "Formular nicht gefunden.");
  }
  const form = store.getFormByAccessKey(accessKey);
  if (!form) {
    throw new AppError(400, "Formular nicht gefunden.");
  }
  const project = store.getProject(form.projectId);
  if (!project) {
    throw new AppError(400, "Formular nicht gefunden.");
  }

  const origin = originFromRequest(input.originHeader, input.referer);
  if (!origin || !originAllowed(origin, project.origins)) {
    throw new AppError(403, "Diese Website darf hier nicht absenden.");
  }

  const redirect = input.fields.redirect?.trim() || null;
  if (redirect && !originAllowed(redirect, project.origins)) {
    throw new AppError(400, "redirect zeigt nicht auf eine erlaubte Origin.");
  }
  if (!input.wantsJson && !redirect) {
    throw new AppError(400, "Kein redirect und keine JSON-Antwort angefordert.");
  }

  if ((input.fields.botcheck ?? "").trim() !== "") {
    return { kind: "ok", honeypot: true, redirect, submission: null };
  }

  if (!limits.ip.allow(input.ip, input.now)) {
    throw new AppError(429, "Zu viele Absendungen. Bitte kurz warten.");
  }
  if (!limits.form.allow(form.id, input.now)) {
    throw new AppError(429, "Zu viele Absendungen. Bitte kurz warten.");
  }

  if (form.turnstileSecretEnc) {
    const secret = decryptTurnstile(form.turnstileSecretEnc);
    const token = input.fields["cf-turnstile-response"] ?? "";
    const result = await verify(secret, token);
    if (result !== "ok") {
      throw new AppError(400, "Bitte nochmal absenden.");
    }
  }

  const storedFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.fields)) {
    if (RESERVED.has(key)) continue;
    storedFields[key] = value;
  }
  const replyTo = pickReplyTo(input.fields);
  const subject = input.fields.subject?.trim() || null;
  const submission = store.createSubmission({
    formId: form.id,
    fields: storedFields,
    replyTo,
    subject,
    now: input.now,
  });
  return { kind: "ok", honeypot: false, redirect, submission };
}

function pickReplyTo(fields: Record<string, string>): string | null {
  const replyto = fields.replyto?.trim() || fields.reply_to?.trim();
  const email = fields.email?.trim();
  const value = replyto || email || "";
  if (!value || !isEmail(value)) return null;
  return value;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
