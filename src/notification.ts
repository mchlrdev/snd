import { isEmail } from "./submit.js";
import { intlLocale, type Locale } from "./i18n.js";
import {
  escapeHtmlMultiline,
  parseTemplate,
  renderTemplate,
  TemplateError,
  type Template,
  type TemplateValue,
} from "./template.js";

/** What a notification about one submission needs. */
export type NotificationInput = {
  id: string;
  projectLabel: string;
  formName: string;
  createdAt: number;
  fields: Record<string, string>;
  /** Custom titles per field name from the form settings. */
  fieldLabels: Record<string, string>;
  /** Fields left out of the {{#fields}} list (e.g. a privacy checkbox). */
  hiddenFields?: string[];
  replyTo: string | null;
  subject: string | null;
};

/** Template sources. An empty subject or text falls back to the default. */
export type TemplateSource = { subject: string; html: string; text: string };

export type RenderedNotification = { subject: string; text: string; html: string };

export const DEFAULT_TIMEZONE = "Europe/Berlin";

export const MAX_SUBJECT_LENGTH = 250;

const KNOWN_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    name: "Name",
    vorname: "First name",
    nachname: "Last name",
    firstname: "First name",
    first_name: "First name",
    lastname: "Last name",
    last_name: "Last name",
    email: "Email",
    "e-mail": "Email",
    phone: "Phone",
    telefon: "Phone",
    tel: "Phone",
    message: "Message",
    nachricht: "Message",
    subject: "Subject",
    betreff: "Subject",
    company: "Company",
    firma: "Company",
    replyto: "Reply address",
    reply_to: "Reply address",
  },
  de: {
    name: "Name",
    vorname: "Vorname",
    nachname: "Nachname",
    firstname: "Vorname",
    first_name: "Vorname",
    lastname: "Nachname",
    last_name: "Nachname",
    email: "E-Mail",
    "e-mail": "E-Mail",
    phone: "Telefon",
    telefon: "Telefon",
    tel: "Telefon",
    message: "Nachricht",
    nachricht: "Nachricht",
    subject: "Betreff",
    betreff: "Betreff",
    company: "Firma",
    firma: "Firma",
    replyto: "Antwortadresse",
    reply_to: "Antwortadresse",
  },
};

/** The form's own title, otherwise a known name, otherwise the field name made
 *  readable ("tel_mobile" → "Tel mobile"). */
export function fieldTitle(name: string, labels: Record<string, string>, locale: Locale = "en"): string {
  const own = labels[name]?.trim();
  if (own) return own;
  const known = KNOWN_LABELS[locale][name.toLowerCase()];
  if (known) return known;
  const spaced = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : name;
}

export function formatReceived(createdAt: number, timeZone: string, locale: Locale = "en"): { date: string; time: string } {
  const at = new Date(createdAt);
  const tag = intlLocale(locale);
  const date = new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone }).format(at);
  const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(at);
  return { date, time: locale === "de" ? `${time} Uhr` : time };
}

/** Preview line in the inbox: the first values that are not addresses. */
function preheader(values: string[]): string {
  const text = values
    .filter((value) => value && !isEmail(value))
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

/** Everything a template can use. Maps are built without a prototype, so a
 *  field called "__proto__" or "constructor" is just a field. */
export function templateData(input: NotificationInput, timeZone: string, locale: Locale): TemplateValue {
  const { date, time } = formatReceived(input.createdAt, timeZone, locale);
  const hidden = new Set(input.hiddenFields ?? []);
  const field = Object.create(null) as Record<string, TemplateValue>;
  const title = Object.create(null) as Record<string, TemplateValue>;
  // field.<name> and title.<name> keep every field; only the list skips
  // hidden ones, so a template can still use one on purpose.
  for (const [name, raw] of Object.entries(input.fields)) {
    field[name] = raw.replace(/\r\n?/g, "\n").trim();
    title[name] = fieldTitle(name, input.fieldLabels, locale);
  }
  const entries = Object.keys(input.fields).filter((name) => !hidden.has(name));
  const fields = entries.map((name, index) => {
    const value = field[name] as string;
    const itemTitle = title[name] as string;
    return {
      name,
      title: itemTitle,
      value,
      isEmail: isEmail(value),
      isEmpty: value === "",
      isFirst: index === 0,
      isLast: index === entries.length - 1,
    };
  });
  return {
    project: { label: input.projectLabel },
    form: { name: input.formName },
    received: { date, time, iso: new Date(input.createdAt).toISOString() },
    submission: { id: input.id },
    subject: input.subject?.trim() ?? "",
    replyTo: input.replyTo ?? "",
    fields,
    field,
    title,
    preheader: preheader(fields.map((item) => item.value)),
  };
}

/** Names a template may use at the top level, and inside {{#fields}}. */
export const TOP_LEVEL_NAMES = ["project", "form", "received", "submission", "subject", "replyTo", "fields", "field", "title", "preheader"];
export const FIELD_ITEM_NAMES = ["name", "title", "value", "isEmail", "isEmpty", "isFirst", "isLast"];

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif";

const WORDS: Record<Locale, { heading: string; subject: string }> = {
  en: { heading: "New message via", subject: "New message:" },
  de: { heading: "Neue Nachricht über", subject: "Neue Nachricht:" },
};

/** The built-in template, written in the same template language a custom
 *  template uses, so it doubles as the starting point for one. */
export function defaultTemplate(locale: Locale): TemplateSource {
  const words = WORDS[locale];
  const subject = `{{#subject}}{{subject}}{{/subject}}{{^subject}}${words.subject} {{form.name}}{{/subject}}`;
  const text = `${words.heading} {{form.name}} ({{project.label}})
{{received.date}}, {{received.time}}
{{#fields}}

{{title}}
{{value}}{{#isEmpty}}–{{/isEmpty}}
{{/fields}}
`;
  const html = `<!DOCTYPE html>
<html lang="${locale}" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${words.heading} {{form.name}}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>td,p,a,h1{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:separate; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  @media (prefers-color-scheme: dark) {
    .fg { color:#f5f5f7 !important; }
    .fg2 { color:#98989d !important; }
    .tile { background-color:#1c1c1e !important; }
    .pill { background-color:#2c2c2e !important; color:#e5e5ea !important; }
    .lnk { color:#4ea1ff !important; }
  }
  [data-ogsc] .fg { color:#f5f5f7 !important; }
  [data-ogsc] .fg2 { color:#98989d !important; }
  [data-ogsc] .pill { color:#e5e5ea !important; }
  [data-ogsb] .tile { background-color:#1c1c1e !important; }
  [data-ogsb] .pill { background-color:#2c2c2e !important; }
</style>
</head>
<body style="margin:0; padding:0;">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; opacity:0;">{{preheader}}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; margin:0 auto; font-family:${FONT};">
  <tr>
    <td style="padding:32px 20px 0;">
      <p class="fg2" style="margin:0 0 4px; font-size:13px; line-height:18px; color:#86868b;">{{project.label}}</p>
      <h1 class="fg" style="margin:0; font-size:28px; line-height:34px; font-weight:600; letter-spacing:-0.01em; color:#1d1d1f;">${words.heading} {{form.name}}</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 20px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="pill" bgcolor="#f5f5f7" style="background-color:#f5f5f7; border-radius:999px; padding:6px 12px; font-size:13px; line-height:18px; font-weight:500; color:#1d1d1f; white-space:nowrap;">{{received.date}}</td>
          <td style="width:6px; font-size:0; line-height:0;">&nbsp;</td>
          <td class="pill" bgcolor="#f5f5f7" style="background-color:#f5f5f7; border-radius:999px; padding:6px 12px; font-size:13px; line-height:18px; font-weight:500; color:#1d1d1f; white-space:nowrap;">{{received.time}}</td>
        </tr>
      </table>
    </td>
  </tr>
  {{#fields}}
  <tr>
    <td style="padding:0 20px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="tile" bgcolor="#f5f5f7" style="background-color:#f5f5f7; border-radius:16px; padding:14px 16px;">
            <p class="fg2" style="margin:0 0 2px; font-size:13px; line-height:18px; color:#86868b;">{{title}}</p>
            {{#isEmpty}}
            <p class="fg2" style="margin:0; font-size:17px; line-height:24px; color:#86868b;">–</p>
            {{/isEmpty}}
            {{#isEmail}}
            <p style="margin:0; font-size:17px; line-height:24px; word-break:break-all;"><a href="mailto:{{value}}" class="lnk" style="color:#0066cc; text-decoration:none;">{{value}}</a></p>
            {{/isEmail}}
            {{^isEmail}}{{^isEmpty}}
            <p class="fg" style="margin:0; font-size:17px; line-height:24px; color:#1d1d1f; word-break:break-word;">{{value}}</p>
            {{/isEmpty}}{{/isEmail}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  {{/fields}}
  <tr><td style="padding:0 0 24px; font-size:0; line-height:0;">&nbsp;</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</body>
</html>
`;
  return { subject, html, text };
}

export type CompiledTemplate = { subject: Template; html: Template; text: Template };

const compiledDefaults = new Map<Locale, CompiledTemplate>();

function compiledDefault(locale: Locale): CompiledTemplate {
  let compiled = compiledDefaults.get(locale);
  if (!compiled) {
    compiled = compileTemplate(defaultTemplate(locale), locale);
    compiledDefaults.set(locale, compiled);
  }
  return compiled;
}

/** Parses all three parts; empty subject or text use the default's part.
 *  Throws a TemplateError naming the part and line. */
export function compileTemplate(source: TemplateSource, locale: Locale): CompiledTemplate {
  const part = (name: keyof TemplateSource, value: string, fallback: () => Template): Template => {
    if (!value.trim()) return fallback();
    try {
      return parseTemplate(value);
    } catch (error) {
      if (error instanceof TemplateError) throw new Error(`${name}: ${error.message}`);
      throw error;
    }
  };
  if (!source.html.trim()) throw new Error("html: the HTML template is empty");
  return {
    subject: part("subject", source.subject, () => compiledDefault(locale).subject),
    html: part("html", source.html, () => compiledDefault(locale).html),
    text: part("text", source.text, () => compiledDefault(locale).text),
  };
}

function cleanSubject(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, MAX_SUBJECT_LENGTH);
}

export function renderCompiled(compiled: CompiledTemplate, data: TemplateValue, locale: Locale): RenderedNotification {
  const subject = cleanSubject(renderTemplate(compiled.subject, data, (value) => value));
  return {
    // A template that renders an empty subject still gets a useful one.
    subject: subject || cleanSubject(renderTemplate(compiledDefault(locale).subject, data, (value) => value)),
    html: renderTemplate(compiled.html, data, escapeHtmlMultiline),
    text: renderTemplate(compiled.text, data, (value) => value),
  };
}

/**
 * Renders the notification with the form's template, or the built-in one.
 * A custom template that fails here falls back to the default, so a broken
 * template never costs a message.
 */
export function renderNotification(
  input: NotificationInput,
  options: { timeZone?: string; locale?: Locale; template?: TemplateSource | null } = {},
): RenderedNotification & { templateError: string | null } {
  const locale = options.locale ?? "en";
  const data = templateData(input, options.timeZone ?? DEFAULT_TIMEZONE, locale);
  if (options.template) {
    try {
      return { ...renderCompiled(compileTemplate(options.template, locale), data, locale), templateError: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ...renderCompiled(compiledDefault(locale), data, locale), templateError: message };
    }
  }
  return { ...renderCompiled(compiledDefault(locale), data, locale), templateError: null };
}

/** Variables the template uses that snd never provides, as hints for the
 *  author (typos like {{feld.email}}). */
export function unknownVariables(compiled: CompiledTemplate): string[] {
  const out = new Set<string>();
  for (const template of [compiled.subject, compiled.html, compiled.text]) {
    for (const { path, depth, line } of template.paths) {
      const head = path[0]!;
      if (head === ".") continue;
      if (TOP_LEVEL_NAMES.includes(head)) continue;
      if (depth > 0 && FIELD_ITEM_NAMES.includes(head)) continue;
      out.add(`{{${path.join(".")}}} (line ${line})`);
    }
  }
  return [...out];
}

/** Reference for template authors, human or agent. */
export const TEMPLATE_REFERENCE = `Mail templates use a small, logic-less Mustache subset.

Syntax
  {{path}}              insert a value. Always escaped: HTML in the html part (line breaks become <br>), as-is in subject and text.
  {{#path}}…{{/path}}   section. Repeats for each item of a list; renders once for any other non-empty value.
  {{^path}}…{{/path}}   inverted section. Renders when the value is empty, false or missing.
  {{! comment }}        ignored.
  {{.}}                 the current item inside a section.
Not allowed: {{{raw}}}, {{&raw}}, partials {{>x}}, delimiter changes {{=…=}}. There is no way to output unescaped values.
Section, closing and comment tags alone on a line remove that whole line (useful in the text part).

Variables
  project.label         website name
  form.name             form name
  received.date         date the message arrived, formatted in the instance language and time zone
  received.time         time the message arrived
  received.iso          ISO 8601 timestamp (UTC)
  submission.id         id of the stored message
  subject               the visitor's "subject" field, or empty
  replyTo               the visitor's reply address (email/replyto field), or empty
  preheader             first non-address values joined, max 140 characters, for the hidden inbox preview line
  field.<name>          value of one field by its HTML name, e.g. {{field.email}}; empty if missing (hidden fields too)
  title.<name>          display title of one field (own field title, otherwise a readable default)
  fields                list of the submitted fields in order, without hidden ones (hide:<field> from the
                        website, or "Hide in mail" in the form settings). Inside {{#fields}}…{{/fields}}:
    name, title, value  the field's HTML name, display title and value
    isEmail             true when the value is an email address
    isEmpty             true when the value is empty
    isFirst, isLast     position in the list

Parts
  subject   optional; empty uses the default subject. Line breaks are removed, max ${MAX_SUBJECT_LENGTH} characters.
  html      required; the HTML mail. Use email-safe HTML: tables, inline styles, no scripts.
  text      optional; empty uses the default plain-text version.

If a template fails while a mail is sent, snd sends the default template instead.`;
