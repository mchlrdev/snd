import { useSyncExternalStore } from "react";
import { DE } from "./i18n-de";

// ---------------------------------------------------------------------------
// The console speaks the instance language (Settings → Language). Strings are
// written in English in the code and looked up in the German table, so a
// missing entry shows English instead of a key. {name} placeholders are
// filled from `vars`.
// ---------------------------------------------------------------------------

export type Locale = "en" | "de";

const STORAGE_KEY = "snd:locale";
const listeners = new Set<() => void>();

function initial(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === "de" ? "de" : "en";
  } catch {
    return "en";
  }
}

let current: Locale = initial();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage the login page just starts in English.
  }
  for (const listener of listeners) listener();
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** Locale tag for Intl date and number formatting. */
export function intlLocale(): string {
  return current === "de" ? "de-DE" : "en-GB";
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function t(en: string, vars?: Record<string, string | number>): string {
  return fill(current === "de" ? (DE[en] ?? en) : en, vars);
}

const PATTERNS = Object.keys(DE)
  .filter((key) => key.includes("{"))
  .map((key) => {
    const names: string[] = [];
    const source = key
      .split(/(\{\w+\})/)
      .map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        if (name) {
          names.push(name);
          return "(.+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    return { key, names, regex: new RegExp(`^${source}$`, "s") };
  });

/** Messages from the server arrive in English; translate them, including
 *  ones with values in them ("Invalid recipient address: x"). */
export function translateMessage(message: string): string {
  if (current === "en") return message;
  if (DE[message]) return DE[message];
  for (const pattern of PATTERNS) {
    const match = pattern.regex.exec(message);
    if (!match) continue;
    const vars: Record<string, string> = {};
    pattern.names.forEach((name, index) => (vars[name] = match[index + 1]!));
    return fill(DE[pattern.key]!, vars);
  }
  const prefix = "Template error in ";
  if (message.startsWith(prefix)) return `${t("Template error in")} ${message.slice(prefix.length)}`;
  return message;
}
