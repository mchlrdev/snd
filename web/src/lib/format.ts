import type { NotifyPolicy, Submission } from "../api";

export function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

/** "vor 5 Min.", "gestern", sonst Datum. Für Listen, in denen man scannt. */
export function formatRelative(ms: number, now = Date.now()): string {
  const diff = now - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  if (diff < minute) return "gerade eben";
  if (diff < hour) return `vor ${Math.floor(diff / minute)} Min.`;
  const then = new Date(ms);
  const today = new Date(now);
  const sameDay = then.toDateString() === today.toDateString();
  if (sameDay) return new Intl.DateTimeFormat("de-DE", { timeStyle: "short" }).format(then);
  const yesterday = new Date(now - 24 * hour);
  if (then.toDateString() === yesterday.toDateString()) return "gestern";
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(then);
}

export const NOTIFY_LABEL: Record<NotifyPolicy, string> = {
  immediate: "Sofort beim ersten Fehlversuch",
  abandoned: "Erst wenn sie endgültig nicht ankommt",
  off: "Nie",
};

export function notifyLabel(policy: NotifyPolicy | null, inherited: string): string {
  if (policy == null) return inherited;
  return NOTIFY_LABEL[policy];
}

export function mailLabel(status: Submission["mailStatus"]): string {
  if (status === "sent") return "Zugestellt";
  if (status === "queued") return "Wird gesendet";
  if (status === "failed") return "Neuer Versuch geplant";
  if (status === "abandoned") return "Nicht zugestellt";
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

/** Wer hat geschrieben? Name-Feld, sonst Antwortadresse, sonst neutral. */
export function senderOf(item: Submission): string {
  const f = item.fields;
  const name = f.name ?? f.Name ?? f.vorname ?? f.firstname;
  if (name?.trim()) return name.trim();
  if (item.replyTo) return item.replyTo;
  return "Unbekannter Absender";
}

const MESSAGE_KEYS = ["message", "nachricht", "Message", "Nachricht", "text", "comment", "kommentar"];

/** Eine Zeile Vorschau: das Nachrichtenfeld, sonst das längste Feld. */
export function previewOf(item: Submission): string {
  for (const key of MESSAGE_KEYS) {
    const value = item.fields[key];
    if (value?.trim()) return value.trim();
  }
  if (item.subject) return item.subject;
  const longest = Object.values(item.fields).sort((a, b) => b.length - a.length)[0];
  return longest?.trim() || "Keine Inhalte";
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

/** Origin aus dem, was Laien eintippen: "beispiel.de" → "https://beispiel.de". */
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

/** "in 4 Min.", "um 14:30", sonst Datum und Uhrzeit. */
export function formatUntil(ms: number, now = Date.now()): string {
  const diff = ms - now;
  if (diff <= 60_000) return "gleich";
  if (diff < 60 * 60_000) return `in ${Math.ceil(diff / 60_000)} Min.`;
  if (new Date(ms).toDateString() === new Date(now).toDateString()) {
    return `um ${new Intl.DateTimeFormat("de-DE", { timeStyle: "short" }).format(new Date(ms))}`;
  }
  return `am ${formatWhen(ms)}`;
}
