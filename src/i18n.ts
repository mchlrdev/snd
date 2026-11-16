/** Instance language: the console, the default mail template, and the
 *  answers visitors get from /submit. Agents (MCP) always get English. */
export type Locale = "en" | "de";

export const LOCALES: readonly Locale[] = ["en", "de"];

export function asLocale(value: unknown): Locale {
  return value === "de" ? "de" : "en";
}

/** Locale for Intl date and number formatting. */
export function intlLocale(locale: Locale): string {
  return locale === "de" ? "de-DE" : "en-GB";
}

const DE: Record<string, string> = {
  "Form is too large.": "Formular ist zu groß.",
  "Too many fields.": "Zu viele Felder.",
  "Form not found.": "Formular nicht gefunden.",
  "This website is not allowed to submit here.": "Diese Website darf hier nicht absenden.",
  "redirect does not point to an allowed origin.": "redirect zeigt nicht auf eine erlaubte Origin.",
  "Too many submissions. Please wait a moment.": "Zu viele Absendungen. Bitte kurz warten.",
  "Please submit again.": "Bitte nochmal absenden.",
  "File uploads are not supported.": "Datei-Uploads werden nicht unterstützt.",
  "Form submitted.": "Formular gesendet.",
  "No redirect given and no JSON response requested.": "Kein redirect und keine JSON-Antwort angefordert.",
};

/** Translates an English message; unknown messages stay English. */
export function tr(locale: Locale, message: string): string {
  return locale === "de" ? (DE[message] ?? message) : message;
}
