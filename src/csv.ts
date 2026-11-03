import type { SubmissionRecord } from "./types.js";

export function submissionsToCsv(items: SubmissionRecord[]): string {
  const fieldNames = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item.fields)) fieldNames.add(key);
  }
  const extra = [...fieldNames].sort();
  const header = ["id", "form_id", "created_at", "mail_status", "reply_to", "subject", ...extra];
  const lines = [header.map(escapeCsv).join(",")];
  for (const item of items) {
    const row = [
      item.id,
      item.formId,
      new Date(item.createdAt).toISOString(),
      item.mailStatus,
      item.replyTo ?? "",
      item.subject ?? "",
      ...extra.map((name) => item.fields[name] ?? ""),
    ];
    lines.push(row.map(escapeCsv).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function escapeCsv(raw: string): string {
  // Formel-Injection: Tabellenprogramme führen Zellen mit =, +, -, @ als Formel aus.
  // Absender sind öffentlich, also wird so ein Wert als Text markiert.
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
