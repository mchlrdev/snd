import { AppError } from "./errors.js";
import { tr } from "./i18n.js";
import type { SubmitLimits } from "./limits.js";
import { originAllowed, originFromRequest } from "./origin.js";
import type { Store } from "./store.js";
import type { SubmissionRecord } from "./types.js";

export const MAX_FIELDS = 50;
export const MAX_BODY_BYTES = 100 * 1024;

const RESERVED = new Set(["access_key", "redirect", "botcheck", "cf-turnstile-response"]);

/** `label:<field>` carries the title of a field for the mail, e.g.
 *  <input type="hidden" name="label:message" value="Your request">. */
export const LABEL_PREFIX = "label:";
/** `hide:<field>` leaves a field out of the mail (it is still stored), e.g.
 *  <input type="hidden" name="hide:privacy" value="1"> for a consent box. */
export const HIDE_PREFIX = "hide:";
const MAX_LABEL_LENGTH = 200;

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
  const locale = store.getSettings().locale;
  const fail = (status: number, message: string) => new AppError(status, tr(locale, message));
  if (input.bodyBytes > MAX_BODY_BYTES) {
    throw fail(413, "Form is too large.");
  }
  // Titles don't count as fields, so a form can label every one of them.
  const keys = Object.keys(input.fields);
  const labelKeys = keys.filter((key) => key.startsWith(LABEL_PREFIX));
  const hideKeys = keys.filter((key) => key.startsWith(HIDE_PREFIX));
  if (keys.length - labelKeys.length - hideKeys.length > MAX_FIELDS || labelKeys.length > MAX_FIELDS || hideKeys.length > MAX_FIELDS) {
    throw fail(400, "Too many fields.");
  }

  const accessKey = input.fields.access_key?.trim() ?? "";
  if (!accessKey) {
    throw fail(400, "Form not found.");
  }
  const form = store.getFormByAccessKey(accessKey);
  if (!form) {
    throw fail(400, "Form not found.");
  }
  const project = store.getProject(form.projectId);
  if (!project) {
    throw fail(400, "Form not found.");
  }

  const origin = originFromRequest(input.originHeader, input.referer);
  if (!origin || !originAllowed(origin, project.origins)) {
    throw fail(403, "This website is not allowed to submit here.");
  }

  const redirect = input.fields.redirect?.trim() || null;
  if (redirect && !originAllowed(redirect, project.origins)) {
    throw fail(400, "redirect does not point to an allowed origin.");
  }
  // A plain form post needs somewhere to go afterwards; snd shows no pages
  // of its own. Sites that send with JavaScript ask for JSON instead.
  if (!input.wantsJson && !redirect) {
    throw fail(400, "No redirect given and no JSON response requested.");
  }

  if ((input.fields.botcheck ?? "").trim() !== "") {
    return { kind: "ok", honeypot: true, redirect, submission: null };
  }

  if (!limits.ip.allow(input.ip, input.now)) {
    throw fail(429, "Too many submissions. Please wait a moment.");
  }
  if (!limits.form.allow(form.id, input.now)) {
    throw fail(429, "Too many submissions. Please wait a moment.");
  }

  if (form.turnstileSecretEnc) {
    const secret = decryptTurnstile(form.turnstileSecretEnc);
    const token = input.fields["cf-turnstile-response"] ?? "";
    const result = await verify(secret, token);
    if (result !== "ok") {
      throw fail(400, "Please submit again.");
    }
  }

  const storedFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.fields)) {
    if (RESERVED.has(key) || key.startsWith(LABEL_PREFIX) || key.startsWith(HIDE_PREFIX)) continue;
    storedFields[key] = value;
  }
  const fieldLabels: Record<string, string> = {};
  for (const key of labelKeys) {
    const name = key.slice(LABEL_PREFIX.length);
    // eslint-disable-next-line no-control-regex
    const title = (input.fields[key] ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
    if (title && Object.hasOwn(storedFields, name)) fieldLabels[name] = title;
  }
  // Any value except an explicit "0"/"false" hides, so value="1" or an empty value both work.
  const hiddenFields = hideKeys
    .filter((key) => !/^(0|false|no)$/i.test((input.fields[key] ?? "").trim()))
    .map((key) => key.slice(HIDE_PREFIX.length))
    .filter((name) => Object.hasOwn(storedFields, name));
  const replyTo = pickReplyTo(input.fields);
  const subject = input.fields.subject?.trim() || null;
  const submission = store.createSubmission({
    formId: form.id,
    fields: storedFields,
    fieldLabels,
    hiddenFields,
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
