import type { NotifyPolicy, Submission } from "../api";
import { intlLocale, t } from "./i18n";
export { intlLocale } from "./i18n";


export function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

/** "5 min ago", "yesterday", otherwise the date. For lists people scan. */
export function formatRelative(ms: number, now = Date.now()): string {
  const diff = now - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  if (diff < minute) return t("just now");
  if (diff < hour) return t("{n} min ago", { n: Math.floor(diff / minute) });
  const then = new Date(ms);
  const today = new Date(now);
  const sameDay = then.toDateString() === today.toDateString();
  if (sameDay) return new Intl.DateTimeFormat(intlLocale(), { timeStyle: "short" }).format(then);
  const yesterday = new Date(now - 24 * hour);
  if (then.toDateString() === yesterday.toDateString()) return t("yesterday");
  return new Intl.DateTimeFormat(intlLocale(), { day: "numeric", month: "short" }).format(then);
}

export const NOTIFY_LABEL: Record<NotifyPolicy, string> = {
  immediate: "Right after the first failed attempt",
  abandoned: "Only when it finally can't be delivered",
  off: "Never",
};

export function notifyLabel(policy: NotifyPolicy | null, inherited: string): string {
  if (policy == null) return inherited;
  return t(NOTIFY_LABEL[policy]);
}

export function mailLabel(status: Submission["mailStatus"]): string {
  if (status === "sent") return t("Delivered");
  if (status === "queued") return t("Sending");
  if (status === "failed") return t("Retry scheduled");
  if (status === "abandoned") return t("Not delivered");
  return status;
}

export const MAIL_COLOR = {
  sent: "green",
  queued: "blue",
  failed: "orange",
  abandoned: "red",
} as const;

export function splitList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Who wrote? The name field, otherwise the reply address, otherwise neutral. */
export function senderOf(item: Submission): string {
  const f = item.fields;
  const name = f.name ?? f.Name ?? f.vorname ?? f.firstname;
  if (name?.trim()) return name.trim();
  if (item.replyTo) return item.replyTo;
  return t("Unknown sender");
}

const MESSAGE_KEYS = ["message", "nachricht", "Message", "Nachricht", "text", "comment", "kommentar"];

/** A one-line preview: the message field, otherwise the longest field. */
export function previewOf(item: Submission): string {
  for (const key of MESSAGE_KEYS) {
    const value = item.fields[key];
    if (value?.trim()) return value.trim();
  }
  if (item.subject) return item.subject;
  const longest = Object.values(item.fields).sort((a, b) => b.length - a.length)[0];
  return longest?.trim() || t("No content");
}

export function initials(label: string): string {
  const parts = label.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/** Origin from what people type: "example.com" → "https://example.com". */
export function toOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return `${url.protocol}//${url.host}`;
    } catch {
      return trimmed;
    }
  }
  return `https://${trimmed.split("/")[0]}`;
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** "in 4 min", "at 14:30", otherwise date and time. */
export function formatUntil(ms: number, now = Date.now()): string {
  const diff = ms - now;
  if (diff <= 60_000) return t("shortly");
  if (diff < 60 * 60_000) return t("in {n} min", { n: Math.ceil(diff / 60_000) });
  if (new Date(ms).toDateString() === new Date(now).toDateString()) {
    return t("at {time}", { time: new Intl.DateTimeFormat(intlLocale(), { timeStyle: "short" }).format(new Date(ms)) });
  }
  return t("on {date}", { date: formatWhen(ms) });
}
