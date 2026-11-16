import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Code2, Globe, Mail, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fontWeights } from "@/lib/font-weight";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { CreateWebsiteDialog } from "../components/CreateDialogs";
import { SiteIcon, StatusPill } from "../components/kit";
import { PageHeader } from "../components/PageHeader";
import { ColumnChart, FilterRow, RangeTabs, StatTiles, useRange, useStats } from "../components/Stats";
import { hostOf, intlLocale } from "../lib/format";
import { formWarning, websiteChecks } from "../lib/readiness";
import { useProjects } from "../projects-context";
import { t } from "@/lib/i18n";

const number = { format: (value: number) => new Intl.NumberFormat(intlLocale()).format(value) };

export function DashboardPage() {
  const { projects, loaded, formsFor } = useProjects();
  const [creating, setCreating] = useState(false);
  const range = useRange();
  const { data, loading } = useStats({ days: range.days });

  if (!loaded) return null;
  if (projects.length === 0) {
    return (
      <>
        <Welcome onStart={() => setCreating(true)} />
        <CreateWebsiteDialog open={creating} onOpenChange={setCreating} />
      </>
    );
  }

  const byProject = new Map(data?.byProject.map((entry) => [entry.projectId, entry.total]));

  return (
    <>
      <PageHeader title={t("Overview")} />
      <Attention />
      <FilterRow>
        <RangeTabs days={range.days} onChange={range.setDays} />
      </FilterRow>
      {data ? (
        <div className={cn("flex flex-col gap-3 transition-opacity", loading && "opacity-60")}>
          <StatTiles stats={data} days={range.days} />
          <ColumnChart stats={data} title={t("Messages across all websites")} loading={loading} />
          <section className="mt-3 flex flex-col gap-2">
            <h2 className={cn(typeClass("body", "compact"), "px-1 text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
              {t("Websites")}
            </h2>
            <ul className="group-surface divide-hairline overflow-hidden">
              {[...projects]
                .sort((a, b) => (byProject.get(b.id) ?? 0) - (byProject.get(a.id) ?? 0))
                .map((project) => {
                  const total = byProject.get(project.id) ?? 0;
                  const max = Math.max(1, ...byProject.values());
                  const ready = websiteChecks(project, formsFor(project.id)).every((check) => check.done);
                  return (
                    <li key={project.id}>
                      <WebsiteRow
                        project={project}
                        total={total}
                        share={total / max}
                        ready={ready}
                      />
                    </li>
                  );
                })}
            </ul>
          </section>
        </div>
      ) : null}
      <CreateWebsiteDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function WebsiteRow({
  project,
  total,
  share,
  ready,
}: {
  project: { id: string; label: string; origins: string[] };
  total: number;
  share: number;
  ready: boolean;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/projects/${project.id}`)}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--group-hover)] sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,12rem)_auto]"
    >
      <SiteIcon project={project} />
      <span className="min-w-0">
        <span className={cn(typeClass("body", "compact"), "block truncate text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
          {project.label}
        </span>
        <span className={cn(typeClass("caption", "compact"), "block truncate text-muted-foreground")}>
          {project.origins.length ? [...new Set(project.origins.map((o) => hostOf(o).replace(/^www\./, "")))].join(" · ") : t("no address")}
        </span>
      </span>
      <span className="hidden h-2 overflow-hidden rounded-full sm:block" aria-hidden>
        <span className="block h-full origin-left rounded-full bg-[var(--chart-bar)]" style={{ transform: `scaleX(${share})` }} />
      </span>
      <span className="flex items-center gap-3">
        {ready ? null : <StatusPill tone="warn">{t("Setup incomplete")}</StatusPill>}
        <span className={cn(typeClass("body", "compact"), "w-10 text-right tabular-nums text-foreground")}>{number.format(total)}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </span>
    </button>
  );
}

/** Everything that needs a decision, in one place. Empty means all is well,
 *  so the block disappears instead of saying so. */
function Attention() {
  const navigate = useNavigate();
  const { projects, formsFor } = useProjects();
  const items: { key: string; project: (typeof projects)[number]; title: string; detail: string; to: string; action: string }[] = [];
  for (const project of projects) {
    const forms = formsFor(project.id);
    const open = websiteChecks(project, forms).filter((check) => !check.done);
    if (open.length) {
      items.push({
        key: project.id,
        project,
        title: t("{name} isn't fully set up yet", { name: project.label }),
        detail: open.map((check) => check.title).join(" · "),
        to: `/projects/${project.id}`,
        action: t("Set up"),
      });
      continue;
    }
    for (const form of forms) {
      const warning = formWarning(form, project);
      if (warning) {
        items.push({
          key: form.id,
          project,
          title: `${form.name} · ${project.label}`,
          detail: warning,
          to: `/forms/${form.id}`,
          action: t("View"),
        });
      }
    }
  }
  if (!items.length) return null;
  return (
    <section className="mb-6 flex flex-col gap-2">
      <h2 className={cn(typeClass("body", "compact"), "px-1 text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
        {t("Needs your attention")}
      </h2>
      <ul className="group-surface divide-hairline overflow-hidden">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 px-4 py-2.5">
            <TriangleAlert className="size-4 shrink-0 text-[var(--warning)]" />
            <span className="min-w-0 flex-1">
              <span className={cn(typeClass("body", "compact"), "block truncate text-foreground")}>{item.title}</span>
              <span className={cn(typeClass("caption", "compact"), "block truncate text-muted-foreground")}>{item.detail}</span>
            </span>
            <Button size="compact" variant="secondary" onClick={() => navigate(item.to)}>
              {item.action}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  const steps = [
    { icon: <Globe />, title: t("Add a website") },
    { icon: <Mail />, title: t("Connect a mailbox") },
    { icon: <Code2 />, title: t("Paste the form code") },
  ];
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-10">
      <h1 className={cn(typeClass("display", "compact"), "text-foreground")} style={{ fontVariationSettings: fontWeights.bold }}>
        {t("Forms for your websites")}
      </h1>
      <p className={cn(typeClass("subtitle", "compact"), "mt-2 text-muted-foreground")}>
        {t("Every message from a contact form lands in the right inbox by email.")}
      </p>
      <ol className="mt-8 flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step.title} className="group-surface flex items-center gap-3 px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--page)] text-foreground [&_svg]:size-4">{step.icon}</span>
            <span className={cn(typeClass("body", "compact"), "flex-1 text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
              {step.title}
            </span>
            <span className={cn(typeClass("caption", "compact"), "tabular-nums text-muted-foreground")}>{index + 1}</span>
          </li>
        ))}
      </ol>
      <div className="mt-8">
        <Button variant="primary" leadingIcon={Plus} onClick={onStart}>
          {t("Get started")}
        </Button>
      </div>
    </div>
  );
}
