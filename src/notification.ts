import { isEmail } from "./submit.js";

/** Was die Benachrichtigung über eine Nachricht braucht. */
export type NotificationInput = {
  projectLabel: string;
  formName: string;
  createdAt: number;
  fields: Record<string, string>;
  /** Eigene Titel pro Feldname aus der Form-Konfiguration. */
  fieldLabels: Record<string, string>;
};

export type RenderedNotification = { text: string; html: string };

export const DEFAULT_TIMEZONE = "Europe/Berlin";

const KNOWN_LABELS: Record<string, string> = {
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
};

/** Eigener Titel aus der Form, sonst ein bekannter deutscher Name, sonst der
 *  Feldname lesbar gemacht ("tel_mobil" → "Tel mobil"). */
export function fieldTitle(name: string, labels: Record<string, string>): string {
  const own = labels[name]?.trim();
  if (own) return own;
  const known = KNOWN_LABELS[name.toLowerCase()];
  if (known) return known;
  const spaced = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : name;
}

export function formatReceived(createdAt: number, timeZone: string): { date: string; time: string } {
  const at = new Date(createdAt);
  const date = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(at);
  const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone }).format(at);
  return { date, time: `${time} Uhr` };
}

export function renderNotification(input: NotificationInput, timeZone = DEFAULT_TIMEZONE): RenderedNotification {
  const { date, time } = formatReceived(input.createdAt, timeZone);
  const fields = Object.entries(input.fields).map(([name, value]) => ({
    title: fieldTitle(name, input.fieldLabels),
    value: value.replace(/\r\n?/g, "\n").trim(),
  }));
  return {
    text: renderText(input, `${date}, ${time}`, fields),
    html: renderHtml(input, date, time, fields),
  };
}

type Field = { title: string; value: string };

function renderText(input: NotificationInput, when: string, fields: Field[]): string {
  const lines = [`Neue Nachricht über ${input.formName} (${input.projectLabel})`, when];
  for (const field of fields) {
    lines.push("", field.title, field.value || "–");
  }
  return `${lines.join("\n")}\n`;
}

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function multiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function fieldValue(value: string): string {
  if (!value) return `<p class="fg2" style="margin:0; font-size:17px; line-height:24px; color:#86868b;">–</p>`;
  if (isEmail(value)) {
    const safe = escapeHtml(value);
    return `<p style="margin:0; font-size:17px; line-height:24px; word-break:break-all;"><a href="mailto:${safe}" class="lnk" style="color:#0066cc; text-decoration:none;">${safe}</a></p>`;
  }
  return `<p class="fg" style="margin:0; font-size:17px; line-height:24px; color:#1d1d1f; word-break:break-word;">${multiline(value)}</p>`;
}

function pill(text: string): string {
  return `<td class="pill" bgcolor="#f5f5f7" style="background-color:#f5f5f7; border-radius:999px; padding:6px 12px; font-size:13px; line-height:18px; font-weight:500; color:#1d1d1f; white-space:nowrap;">${escapeHtml(text)}</td>`;
}

function tile(field: Field, last: boolean): string {
  return `
  <tr>
    <td style="padding:0 20px ${last ? 32 : 8}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="tile" bgcolor="#f5f5f7" style="background-color:#f5f5f7; border-radius:16px; padding:14px 16px;">
            <p class="fg2" style="margin:0 0 2px; font-size:13px; line-height:18px; color:#86868b;">${escapeHtml(field.title)}</p>
            ${fieldValue(field.value)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Vorschautext im Posteingang: die ersten Inhalte, die keine Adressen sind. */
function preheader(fields: Field[]): string {
  const text = fields
    .map((field) => field.value)
    .filter((value) => value && !isEmail(value))
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

function renderHtml(input: NotificationInput, date: string, time: string, fields: Field[]): string {
  const title = `Neue Nachricht über ${input.formName}`;
  const tiles = fields.map((field, index) => tile(field, index === fields.length - 1)).join("");
  const spacer = fields.length ? "" : `<tr><td style="padding:0 0 32px; font-size:0; line-height:0;">&nbsp;</td></tr>`;
  return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
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
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; opacity:0;">${escapeHtml(preheader(fields))}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; margin:0 auto; font-family:${FONT};">
  <tr>
    <td style="padding:32px 20px 0;">
      <p class="fg2" style="margin:0 0 4px; font-size:13px; line-height:18px; color:#86868b;">${escapeHtml(input.projectLabel)}</p>
      <h1 class="fg" style="margin:0; font-size:28px; line-height:34px; font-weight:600; letter-spacing:-0.01em; color:#1d1d1f;">${escapeHtml(title)}</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 20px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${pill(date)}
          <td style="width:6px; font-size:0; line-height:0;">&nbsp;</td>
          ${pill(time)}
        </tr>
      </table>
    </td>
  </tr>${tiles}${spacer}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</body>
</html>
`;
}
