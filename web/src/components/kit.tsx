import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fontWeights } from "@/lib/font-weight";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { initials } from "../lib/format";
import { t } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// App-level building blocks. Everything a page is made of: a grouped section
// (one job per card), a status pill, an avatar tile, an empty state, a code
// block with copy. Sizes come from the type roles, weights from fontWeights.
// ---------------------------------------------------------------------------

/** A grouped box in the manner of macOS settings: the heading sits above the
 *  group, the group is a filled surface (no border), and rows inside are
 *  separated by hairlines. The `icon` prop is accepted but not drawn — a tile
 *  per section was decoration, not information. */
export function Section({
  title,
  description,
  children,
  footer,
  tone = "default",
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <header className="px-1">
        <h2
          className={cn(typeClass("body", "compact"), tone === "danger" ? "text-destructive" : "text-foreground")}
          style={{ fontVariationSettings: fontWeights.semibold }}
        >
          {title}
        </h2>
        {description ? <p className={cn(typeClass("caption", "compact"), "text-muted-foreground")}>{description}</p> : null}
      </header>
      {children || footer ? (
        <div className="group-surface flex flex-col">
          {children ? <div className="flex flex-col gap-4 p-4">{children}</div> : null}
          {footer ? (
            <footer className={cn("flex flex-wrap items-center justify-end gap-2 px-4 py-2.5", children && "hairline-top")}>
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const PILL = {
  ok: "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[color-mix(in_oklab,var(--success)_70%,var(--foreground))]",
  warn: "bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))]",
  error: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

const DOT = {
  ok: "bg-[var(--success)]",
  warn: "bg-[var(--warning)]",
  error: "bg-destructive",
  neutral: "bg-muted-foreground",
} as const;

export type Tone = keyof typeof PILL;

export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        typeClass("caption", "compact"),
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2",
        PILL[tone],
        className,
      )}
      style={{ fontVariationSettings: fontWeights.semibold }}
    >
      <span className={cn("size-1.5 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="relative flex size-2 shrink-0" role="img" aria-label={label}>
      <span className={cn("size-2 rounded-full", DOT[tone])} />
    </span>
  );
}

/** A label tile: initials on a hue derived from the label, so websites and
 *  senders stay recognisable at a glance in long lists. */
export function Avatar({ label, size = "md", className }: { label: string; size?: "sm" | "md" | "lg"; className?: string }) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center",
        "bg-[oklch(0.94_0.045_var(--h))] text-[oklch(0.42_0.11_var(--h))] dark:bg-[oklch(0.33_0.06_var(--h))] dark:text-[oklch(0.88_0.07_var(--h))]",
        size === "sm" && "size-5 rounded-[6px] text-[length:var(--fs-micro-compact)] leading-none",
        size === "md" && "size-8 rounded-[10px] text-[length:var(--fs-caption)] leading-none",
        size === "lg" && "size-10 rounded-[12px] text-[length:var(--fs-subtitle)] leading-none",
        className,
      )}
      style={{ ["--h" as string]: hue, fontVariationSettings: fontWeights.semibold }}
    >
      {initials(label)}
    </span>
  );
}

/** A filled, borderless surface for anything that isn't a Section. */
export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("group-surface", className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-[var(--page)] text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>
      <h3 className={cn(typeClass("subtitle", "compact"), "text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
        {title}
      </h3>
      {children ? <p className={cn(typeClass("body", "compact"), "mt-1 max-w-sm text-muted-foreground")}>{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Copy with a short "Copied" acknowledgement in place of the label. */
export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="compact"
      leadingIcon={copied ? Check : Copy}
      className={className}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      <span aria-live="polite">{copied ? t("Copied") : (label ?? t("Copy"))}</span>
    </Button>
  );
}

export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[10px] bg-[var(--code)]", className)}>
      <div className="hairline-bottom flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3">
        <span className={cn(typeClass("caption", "compact"), "truncate text-muted-foreground")}>{label ?? "Code"}</span>
        <CopyButton value={code} />
      </div>
      <pre className={cn(typeClass("caption", "compact"), "max-h-72 overflow-auto px-3 py-3 font-mono text-foreground")}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Label + optional help above a control that is not an InputField
 *  (radio groups, segmented choices). */
export function FieldBlock({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={cn(typeClass("body", "compact"), "text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
          {label}
        </div>
        {hint ? <p className={cn(typeClass("caption", "compact"), "mt-0.5 text-muted-foreground")}>{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(typeClass("caption", "compact"), "text-muted-foreground", className)}>{children}</p>;
}

/** The website's own favicon, fetched by the server from its address. Falls
 *  back to the initials tile while loading, without an address, or when the
 *  site has no usable icon. */
export function SiteIcon({
  project,
  size = "md",
  className,
}: {
  project: { id: string; label: string; origins: string[] };
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const origin = project.origins[0];
  const src = origin ? `/api/projects/${project.id}/favicon?o=${encodeURIComponent(origin)}` : null;
  const [state, setState] = useState<"loading" | "ok" | "failed">(src ? "loading" : "failed");
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setState(src ? "loading" : "failed");
  }
  const box = size === "sm" ? "size-5 rounded-[6px]" : size === "md" ? "size-8 rounded-[10px]" : "size-10 rounded-[12px]";
  const pad = size === "sm" ? "p-0.5" : size === "md" ? "p-1" : "p-1.5";
  return (
    <span className={cn("relative grid shrink-0", box, className)}>
      {state !== "ok" ? <Avatar label={project.label} size={size} className="col-start-1 row-start-1" /> : null}
      {src && state !== "failed" ? (
        <img
          src={src}
          alt=""
          aria-hidden
          loading="lazy"
          onLoad={() => setState("ok")}
          onError={() => setState("failed")}
          className={cn(
            "col-start-1 row-start-1 size-full object-contain",
            box,
            pad,
            "bg-white ring-1 ring-black/5 dark:ring-white/10",
            state === "loading" && "invisible",
          )}
        />
      ) : null}
    </span>
  );
}
