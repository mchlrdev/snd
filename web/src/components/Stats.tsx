import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Table2, BarChart3, X } from "lucide-react";
import { Tabs, TabsItem } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { fontWeights } from "@/lib/font-weight";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { api, type DeliveryFilter, type Stats, type StatsBucket, type StatsQuery } from "../api";
import { errorText, intlLocale } from "../lib/format";
import { t } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Stats: one filter row scopes everything below it (tiles, chart, field
// breakdown), so the numbers always agree. While a new slice loads, the
// previous render stays at reduced opacity — no skeleton flash, no jump.
// ---------------------------------------------------------------------------

export const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

const RANGE_KEY = "snd:range";

export function useRange() {
  const [days, setDays] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(RANGE_KEY));
      return RANGES.some((r) => r.days === stored) ? stored : 30;
    } catch {
      return 30;
    }
  });
  return {
    days,
    setDays(next: number) {
      setDays(next);
      try {
        localStorage.setItem(RANGE_KEY, String(next));
      } catch {
        // convenience only
      }
    },
  };
}

export function useStats(query: StatsQuery) {
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(query);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .stats(JSON.parse(key) as StatsQuery)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(errorText(err, t("Stats could not be loaded."))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return { data, loading, error };
}

export function RangeTabs({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const index = Math.max(0, RANGES.findIndex((r) => r.days === days));
  return (
    <Tabs selectedIndex={index} onSelect={(i) => onChange(RANGES[i]!.days)} size="compact" className="w-max">
      {RANGES.map((range, i) => (
        <TabsItem key={range.days} index={i} label={t(range.label)} />
      ))}
    </Tabs>
  );
}

const STATUS_OPTIONS: { value: DeliveryFilter | "all"; label: string }[] = [
  { value: "all", label: "All messages" },
  { value: "delivered", label: "Delivered by email" },
  { value: "failed", label: "Not delivered" },
  { value: "pending", label: "Still being delivered" },
];

export function StatusSelect({ value, onChange }: { value: DeliveryFilter | undefined; onChange: (next: DeliveryFilter | undefined) => void }) {
  return (
    <Select value={value ?? "all"} onValueChange={(next) => onChange(next === "all" ? undefined : (next as DeliveryFilter))}>
      <SelectTrigger placeholder={t("All messages")} className="h-7 w-auto min-w-44" />
      <SelectContent>
        {STATUS_OPTIONS.map((option, index) => (
          <SelectItem key={option.value} index={index} value={option.value}>
            {t(option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterRow({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      className={cn(
        typeClass("caption", "compact"),
        "inline-flex h-7 items-center gap-1 rounded-full bg-foreground pr-1 pl-3 text-background",
      )}
    >
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={t("Remove filter {name}", { name: label })}
        className="flex size-5 items-center justify-center rounded-full hover:bg-background/20"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

const number = { format: (value: number) => new Intl.NumberFormat(intlLocale()).format(value) };

function Tile({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="group-surface flex min-w-0 flex-col gap-0.5 px-4 py-3">
      <span className={cn(typeClass("caption", "compact"), "text-muted-foreground")}>{label}</span>
      <span className={cn(typeClass("display", "compact"), "title-tight text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
        {value}
      </span>
      {children ? <span className={cn(typeClass("caption", "compact"), "text-muted-foreground")}>{children}</span> : null}
    </div>
  );
}

export function StatTiles({ stats, days }: { stats: Stats; days: number }) {
  const { total, delivered, failed } = stats.totals;
  const delta = total - stats.previousTotal;
  const perDay = total / Math.max(1, days);
  const finished = delivered + failed;
  const rate = finished ? Math.round((delivered / finished) * 100) : null;
  const rangeLabel = t(RANGES.find((r) => r.days === days)?.label ?? "{n} days", { n: days });
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Tile label={t("Messages · {range}", { range: rangeLabel })} value={number.format(total)}>
        {delta === 0 ? (
          t("same as before")
        ) : (
          <span className="inline-flex items-center gap-0.5">
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {t(delta > 0 ? "{n} more than before" : "{n} fewer than before", { n: number.format(Math.abs(delta)) })}
          </span>
        )}
      </Tile>
      <Tile label={t("Per day")} value={perDay < 10 ? perDay.toLocaleString(intlLocale(), { maximumFractionDigits: 1 }) : number.format(Math.round(perDay))}>
        {t("on average")}
      </Tile>
      <Tile label={t("Delivered")} value={rate == null ? "–" : `${rate} %`}>
        {rate == null ? t("nothing delivered yet") : t("{n} by email", { n: number.format(delivered) })}
      </Tile>
      <Tile label={t("Not delivered")} value={number.format(failed)}>
        {failed ? t("stored anyway") : t("all delivered")}
      </Tile>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column chart: one series (messages per bucket), so no legend; the card
// title names it. Bars ≤ 24px, 4px rounded tops, square at the baseline.
// ---------------------------------------------------------------------------

const monthShort = { format: (date: Date) => new Intl.DateTimeFormat(intlLocale(), { month: "short" }).format(date) };

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number?];
  return new Date(y, m - 1, d ?? 1);
}

export function bucketLabel(key: string, bucket: StatsBucket, long = false): string {
  const date = parseKey(key);
  if (bucket === "month") return long ? new Intl.DateTimeFormat(intlLocale(), { month: "long", year: "numeric" }).format(date) : `${monthShort.format(date)}`;
  const day = new Intl.DateTimeFormat(intlLocale(), { day: "numeric", month: "short" }).format(date);
  if (bucket === "week") return long ? t("Week of {day}", { day }) : day;
  return long ? new Intl.DateTimeFormat(intlLocale(), { weekday: "long", day: "numeric", month: "long" }).format(date) : day;
}

/** Top of the axis: four equal, whole-number steps (counts have no halves). */
function niceMax(value: number): number {
  const raw = Math.max(1, value / 4);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const f of [1, 2, 2.5, 5, 10]) {
    const step = f * magnitude;
    if (step >= raw && Number.isInteger(step)) return step * 4;
  }
  return Math.ceil(raw) * 4;
}

function compact(value: number): string {
  return value >= 10_000 ? new Intl.NumberFormat(intlLocale(), { notation: "compact" }).format(value) : number.format(value);
}

export function ColumnChart({
  stats,
  title,
  loading,
}: {
  stats: Stats;
  title: string;
  loading?: boolean;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const tooltipId = useId();

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [view]);

  const series = stats.series;
  const height = 200;
  const pad = { top: 12, right: 4, bottom: 26, left: 36 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...series.map((p) => p.total)));
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const slot = series.length ? plotW / series.length : plotW;
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(series.length / Math.max(1, Math.floor(plotW / 64)));

  const onKey = (event: KeyboardEvent) => {
    if (!series.length) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const dir = event.key === "ArrowRight" ? 1 : -1;
      setActive((current) => Math.min(series.length - 1, Math.max(0, (current ?? (dir > 0 ? -1 : series.length)) + dir)));
    }
    if (event.key === "Escape") setActive(null);
  };

  const point = active != null ? series[active] : null;
  // The table lists only periods with messages; the chart keeps the empty
  // ones so the time axis stays even.
  const rows = useMemo(() => series.filter((p) => p.total > 0 || p.failed > 0).reverse(), [series]);
  const tipLeft = active != null ? pad.left + slot * active + slot / 2 : 0;

  return (
    <section className="group-surface px-4 pt-3.5 pb-3">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className={cn(typeClass("subtitle", "compact"), "text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
          {title}
        </h2>
        <Tabs selectedIndex={view === "chart" ? 0 : 1} onSelect={(i) => setView(i === 0 ? "chart" : "table")} size="compact" activeLabel>
          <TabsItem index={0} label={t("Chart")} icon={BarChart3} />
          <TabsItem index={1} label={t("Table")} icon={Table2} />
        </Tabs>
      </header>
      <div className={cn("transition-opacity duration-150", loading && "opacity-50")}>
        {view === "chart" ? (
          <div
            ref={wrapRef}
            className="relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
            role="img"
            aria-label={`${title}: ${series.map((p) => `${bucketLabel(p.key, stats.bucket, true)} ${p.total}`).join(", ")}`}
            aria-describedby={point ? tooltipId : undefined}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            <svg width={width} height={height} className="block overflow-visible" aria-hidden>
              {ticks.map((tick) => (
                <g key={tick}>
                  <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth={1} />
                  <text
                    x={pad.left - 8}
                    y={y(tick)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-muted-foreground text-[length:var(--fs-micro)] tabular-nums"
                  >
                    {compact(tick)}
                  </text>
                </g>
              ))}
              {series.map((p, i) => {
                const x = pad.left + slot * i + (slot - barW) / 2;
                const top = y(p.total);
                const h = pad.top + plotH - top;
                const r = Math.min(4, barW / 2, h);
                const path =
                  h <= 0
                    ? ""
                    : `M${x},${pad.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.top + plotH} Z`;
                return (
                  <g key={p.key}>
                    {path ? <path d={path} fill={active === i ? "var(--chart-bar-hover)" : "var(--chart-bar)"} /> : null}
                    {i % labelEvery === 0 ? (
                      <text
                        x={pad.left + slot * i + slot / 2}
                        y={height - 8}
                        textAnchor="middle"
                        className="fill-muted-foreground text-[length:var(--fs-micro)]"
                      >
                        {bucketLabel(p.key, stats.bucket)}
                      </text>
                    ) : null}
                    {/* Hit target: the whole column slot, not just the painted bar. */}
                    <rect
                      x={pad.left + slot * i}
                      y={pad.top}
                      width={slot}
                      height={plotH}
                      fill="transparent"
                      onPointerEnter={() => setActive(i)}
                      onPointerMove={() => setActive(i)}
                    />
                  </g>
                );
              })}
            </svg>
            {point ? (
              <div
                id={tooltipId}
                role="status"
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-popover px-2.5 py-1.5 whitespace-nowrap shadow-surface-4"
                style={{ left: Math.min(Math.max(tipLeft, 70), width - 70) }}
              >
                <div className={cn(typeClass("body", "compact"), "text-foreground tabular-nums")} style={{ fontVariationSettings: fontWeights.semibold }}>
                  {t(point.total === 1 ? "{n} message" : "{n} messages", { n: number.format(point.total) })}
                </div>
                <div className={cn(typeClass("caption", "compact"), "text-muted-foreground")}>{bucketLabel(point.key, stats.bucket, true)}</div>
                {point.failed ? (
                  <div className={cn(typeClass("caption", "compact"), "mt-0.5 flex items-center gap-1.5 text-muted-foreground")}>
                    <span className="h-0.5 w-2.5 rounded-full bg-[var(--chart-critical)]" />
                    {t("{n} not delivered", { n: point.failed })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className={cn(typeClass("body", "compact"), "w-full")}>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className={cn(typeClass("caption", "compact"), "py-1.5 font-normal")}>{t("Period")}</th>
                  <th className={cn(typeClass("caption", "compact"), "py-1.5 text-right font-normal")}>{t("Messages")}</th>
                  <th className={cn(typeClass("caption", "compact"), "py-1.5 text-right font-normal")}>{t("Not delivered")}</th>
                </tr>
              </thead>
              <tbody className="divide-hairline">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-3 text-center text-muted-foreground">
                      {t("No messages in this period")}
                    </td>
                  </tr>
                ) : null}
                {rows.map((p) => (
                  <tr key={p.key}>
                    <td className="py-1.5 text-foreground">{bucketLabel(p.key, stats.bucket, true)}</td>
                    <td className="py-1.5 text-right tabular-nums text-foreground">{number.format(p.total)}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{p.failed ? number.format(p.failed) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Breakdown of choice fields ("Subject: Order / Question / …"). A value is
// a button: clicking it filters everything above to that value.
// ---------------------------------------------------------------------------

export function FieldBreakdown({
  stats,
  selected,
  onSelect,
  labels,
}: {
  stats: Stats;
  labels?: Record<string, string>;
  selected?: { field: string; value: string };
  onSelect: (field: string, value: string) => void;
}) {
  const choices = useMemo(() => stats.fields.filter((field) => field.values && field.values.length > 1), [stats.fields]);
  if (!choices.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {choices.map((field) => {
        const max = Math.max(...field.values!.map((v) => v.count));
        return (
          <section key={field.name} className="group-surface p-4">
            <h3 className={cn(typeClass("body", "compact"), "mb-3 text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
              {fieldLabel(field.name, labels)}
            </h3>
            <ul className="flex flex-col gap-1">
              {field.values!.map((entry) => {
                const isSelected = selected?.field === field.name && selected.value === entry.value;
                return (
                  <li key={entry.value}>
                    <button
                      type="button"
                      onClick={() => onSelect(field.name, entry.value)}
                      aria-pressed={isSelected}
                      className={cn(
                        "group grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[var(--group-hover)]",
                        isSelected && "bg-[var(--group-hover)]",
                      )}
                    >
                      <span className={cn(typeClass("caption", "compact"), "truncate text-foreground")}>{entry.value}</span>
                      <span className="h-2 overflow-hidden rounded-full">
                        <span
                          className="block h-full origin-left rounded-full bg-[var(--chart-bar)]"
                          style={{ transform: `scaleX(${entry.count / max})` }}
                        />
                      </span>
                      <span className={cn(typeClass("caption", "compact"), "w-8 text-right tabular-nums text-muted-foreground")}>{entry.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
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
  thema: "Topic",
  topic: "Topic",
  company: "Company",
  firma: "Company",
  replyto: "Reply address",
  reply_to: "Reply address",
};

/** Field names come from the website's HTML ("message", "tel_mobil"); show
 *  them the way a person would say them. */
export function fieldLabel(name: string, labels?: Record<string, string>): string {
  const own = labels?.[name]?.trim();
  if (own) return own;
  const known = FIELD_LABELS[name.toLowerCase()];
  if (known) return t(known);
  const spaced = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
