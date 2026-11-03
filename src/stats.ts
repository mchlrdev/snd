import type { MailStatus, SubmissionFilter } from "./types.js";

export type StatsBucket = "day" | "week" | "month";

export type StatsRow = {
  createdAt: number;
  mailStatus: MailStatus;
  formId: string;
  projectId: string;
  fields: Record<string, string>;
};

export type StatsPoint = { key: string; total: number; delivered: number; pending: number; failed: number };

export type FieldSummary = {
  name: string;
  filled: number;
  /** Häufigste Werte – nur bei Auswahlfeldern (wenige, kurze Werte), sonst null. */
  values: { value: string; count: number }[] | null;
};

export type Stats = {
  since: number;
  until: number;
  bucket: StatsBucket;
  timeZone: string;
  series: StatsPoint[];
  totals: { total: number; delivered: number; pending: number; failed: number };
  /** Anzahl im gleich langen Zeitraum davor – für "mehr/weniger als vorher". */
  previousTotal: number;
  byForm: { formId: string; total: number }[];
  byProject: { projectId: string; total: number }[];
  fields: FieldSummary[];
};

const DAY = 24 * 60 * 60 * 1000;
const MAX_CHOICES = 12;
const MAX_CHOICE_LENGTH = 60;
/** Personal or free-text fields are never summarised as choices, even when a
 *  few values happen to repeat. */
const PERSONAL = /(name|mail|phone|telefon|tel$|handy|mobil|adresse|address|strasse|street|message|nachricht|text|comment|kommentar)/i;

export function safeTimeZone(value: string | undefined): string {
  if (!value) return "Europe/Berlin";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "Europe/Berlin";
  }
}

function dayKeyFormatter(timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return (ms: number) => fmt.format(new Date(ms));
}

/** Bucket key for a timestamp: YYYY-MM-DD (day), Monday's YYYY-MM-DD (week), YYYY-MM (month). */
export function bucketKey(ms: number, bucket: StatsBucket, timeZone: string): string {
  const day = dayKeyFormatter(timeZone)(ms);
  if (bucket === "day") return day;
  if (bucket === "month") return day.slice(0, 7);
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const utc = Date.UTC(y, m - 1, d);
  const weekday = (new Date(utc).getUTCDay() + 6) % 7; // Montag = 0
  return new Date(utc - weekday * DAY).toISOString().slice(0, 10);
}

export function bucketKeys(since: number, until: number, bucket: StatsBucket, timeZone: string): string[] {
  const keys: string[] = [];
  for (let cursor = since; cursor < until; cursor += DAY / 2) {
    const key = bucketKey(cursor, bucket, timeZone);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  const last = bucketKey(until - 1, bucket, timeZone);
  if (keys[keys.length - 1] !== last) keys.push(last);
  return keys;
}

function delivery(status: MailStatus): "delivered" | "pending" | "failed" {
  if (status === "sent") return "delivered";
  if (status === "abandoned") return "failed";
  return "pending";
}

export function computeStats(input: {
  rows: StatsRow[];
  previousTotal: number;
  since: number;
  until: number;
  bucket: StatsBucket;
  timeZone: string;
}): Stats {
  const { rows, since, until, bucket, timeZone } = input;
  const series = new Map<string, StatsPoint>();
  for (const key of bucketKeys(since, until, bucket, timeZone)) {
    series.set(key, { key, total: 0, delivered: 0, pending: 0, failed: 0 });
  }
  const totals = { total: 0, delivered: 0, pending: 0, failed: 0 };
  const byForm = new Map<string, number>();
  const byProject = new Map<string, number>();
  const fieldValues = new Map<string, Map<string, number>>();
  const fieldFilled = new Map<string, number>();

  for (const row of rows) {
    const kind = delivery(row.mailStatus);
    const point = series.get(bucketKey(row.createdAt, bucket, timeZone));
    if (point) {
      point.total += 1;
      point[kind] += 1;
    }
    totals.total += 1;
    totals[kind] += 1;
    byForm.set(row.formId, (byForm.get(row.formId) ?? 0) + 1);
    byProject.set(row.projectId, (byProject.get(row.projectId) ?? 0) + 1);
    for (const [name, raw] of Object.entries(row.fields)) {
      const value = raw.trim();
      if (!value) continue;
      fieldFilled.set(name, (fieldFilled.get(name) ?? 0) + 1);
      let counts = fieldValues.get(name);
      if (!counts) fieldValues.set(name, (counts = new Map()));
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const fields: FieldSummary[] = [...fieldFilled.entries()].map(([name, filled]) => {
    const counts = fieldValues.get(name)!;
    const choice =
      !PERSONAL.test(name) &&
      counts.size <= MAX_CHOICES &&
      filled > counts.size &&
      [...counts.keys()].every((value) => value.length <= MAX_CHOICE_LENGTH && !value.includes("\n"));
    return {
      name,
      filled,
      values: choice
        ? [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
        : null,
    };
  });

  const sorted = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]);
  return {
    since,
    until,
    bucket,
    timeZone,
    series: [...series.values()],
    totals,
    previousTotal: input.previousTotal,
    byForm: sorted(byForm).map(([formId, total]) => ({ formId, total })),
    byProject: sorted(byProject).map(([projectId, total]) => ({ projectId, total })),
    fields,
  };
}

export type StatsRequest = {
  filter: Omit<SubmissionFilter, "since" | "until">;
  days?: number;
  since?: number;
  until?: number;
  bucket?: StatsBucket;
  timeZone?: string;
};

/** Normalises a stats request: a range (default the last 30 days) and a
 *  bucket that keeps the chart readable (≤ ~60 bars). */
export function resolveRange(request: StatsRequest, now: number): { since: number; until: number; bucket: StatsBucket } {
  const until = request.until ?? now;
  const days = Math.min(Math.max(Math.trunc(request.days ?? 30), 1), 3660);
  const since = request.since ?? until - days * DAY;
  if (!(since < until)) throw new Error("Zeitraum ist leer.");
  const span = (until - since) / DAY;
  const bucket = request.bucket ?? (span <= 62 ? "day" : span <= 370 ? "week" : "month");
  return { since, until, bucket };
}
