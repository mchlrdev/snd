import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BarChart3, Check, FileText, Globe, Mail, Plus, Settings2, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { fontWeights } from "@/lib/font-weight";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { api, type Form, type NotifyPolicy, type Project } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CreateFormDialog } from "../components/CreateDialogs";
import { EmptyState, Section, SiteIcon, StatusPill } from "../components/kit";
import { PageHeader, PageTabs, usePageTab, type PageTab } from "../components/PageHeader";
import { SaveFooter, useSave } from "../components/SaveFooter";
import { NotifyChoice, OriginsEditor } from "../components/SettingsWidgets";
import { emptySmtp, SmtpFields, smtpFromDraft, smtpProblem, SmtpTest, smtpChanged, type SmtpDraft } from "../components/SmtpFields";
import { ColumnChart, FilterRow, RangeTabs, StatTiles, useRange, useStats } from "../components/Stats";
import { hostOf, NOTIFY_LABEL } from "../lib/format";
import { formWarning, websiteChecks } from "../lib/readiness";
import { useProjects } from "../projects-context";

const TABS: PageTab[] = [
  { key: "auswertung", label: "Auswertung", icon: BarChart3 },
  { key: "einstellungen", label: "Einstellungen", icon: Settings2 },
];

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const { projects, formsFor, loaded, reload } = useProjects();
  const project = projects.find((item) => item.id === id) ?? null;
  const forms = formsFor(id);
  const tab = usePageTab(TABS);
  const [creatingForm, setCreatingForm] = useState(false);

  if (!loaded) return null;
  if (!project) return <EmptyState icon={<Globe />} title="Diese Website gibt es nicht mehr" />;

  const ready = websiteChecks(project, forms).every((check) => check.done);

  return (
    <>
      <PageHeader
        leading={<SiteIcon project={project} size="lg" />}
        title={project.label}
        status={ready ? null : <StatusPill tone="warn">Einrichtung offen</StatusPill>}
        description={
          project.origins.length ? (
            <a href={project.origins[0]} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
              {[...new Set(project.origins.map((o) => hostOf(o).replace(/^www\./, "")))].join(" · ")}
            </a>
          ) : null
        }
        actions={
          <Button variant="secondary" leadingIcon={Plus} onClick={() => setCreatingForm(true)}>
            Formular anlegen
          </Button>
        }
        tabs={<PageTabs tabs={TABS} index={tab.index} onSelect={tab.select} />}
      />

      {tab.key === "auswertung" ? (
        <Overview project={project} forms={forms} onCreateForm={() => setCreatingForm(true)} onOpenSettings={() => tab.select(1)} />
      ) : (
        <WebsiteSettings project={project} onSaved={reload} />
      )}

      <CreateFormDialog projectId={project.id} open={creatingForm} onOpenChange={setCreatingForm} />
    </>
  );
}

function Setup({ project, forms, onCreateForm, onOpenSettings }: { project: Project; forms: Form[]; onCreateForm: () => void; onOpenSettings: () => void }) {
  const checks = websiteChecks(project, forms);
  return (
    <Section title="Einrichten">
      <ol className="divide-hairline flex flex-col">
        {checks.map((check, index) => (
          <li key={check.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span
              className={cn(
                typeClass("caption", "compact"),
                "flex size-6 shrink-0 items-center justify-center rounded-full tabular-nums",
                check.done ? "bg-[var(--success)] text-white" : "text-muted-foreground shadow-[inset_0_0_0_1.5px_var(--separator)]",
              )}
            >
              {check.done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(typeClass("body", "compact"), "flex-1", check.done ? "text-muted-foreground line-through" : "text-foreground")}
              style={{ fontVariationSettings: check.done ? fontWeights.normal : fontWeights.semibold }}
            >
              {check.title}
            </span>
            {!check.done ? (
              <Button size="compact" variant="primary" onClick={check.key === "form" ? onCreateForm : onOpenSettings}>
                {check.key === "form" ? "Anlegen" : "Jetzt eintragen"}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Overview({
  project,
  forms,
  onCreateForm,
  onOpenSettings,
}: {
  project: Project;
  forms: Form[];
  onCreateForm: () => void;
  onOpenSettings: () => void;
}) {
  const navigate = useNavigate();
  const range = useRange();
  const { data, loading } = useStats({ projectId: project.id, days: range.days });
  const byForm = new Map(data?.byForm.map((entry) => [entry.formId, entry.total]));
  const ready = websiteChecks(project, forms).every((check) => check.done);

  return (
    <div className="flex flex-col gap-6">
      {!ready ? <Setup project={project} forms={forms} onCreateForm={onCreateForm} onOpenSettings={onOpenSettings} /> : null}

      {project.submissionCount > 0 ? (
        <div>
          <FilterRow>
            <RangeTabs days={range.days} onChange={range.setDays} />
          </FilterRow>
          {data ? (
            <div className="flex flex-col gap-4">
              <StatTiles stats={data} days={range.days} />
              <ColumnChart stats={data} title={`Nachrichten von ${project.label}`} loading={loading} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className={cn(typeClass("subtitle", "compact"), "mb-3 text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
          Formulare
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => {
            const warning = formWarning(form, project);
            return (
              <button
                key={form.id}
                type="button"
                onClick={() => navigate(`/forms/${form.id}`)}
                className="group-surface flex flex-col gap-3 p-4 text-left transition-colors hover:bg-[var(--group-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--page)] text-foreground">
                    <FileText className="size-4" />
                  </span>
                  {warning ? (
                    <span className="text-[var(--warning)]" title={warning}>
                      <TriangleAlert className="size-4" />
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className={cn(typeClass("subtitle", "compact"), "block truncate text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
                    {form.name}
                  </span>
                  <span className={cn(typeClass("caption", "compact"), "mt-0.5 flex items-center gap-1 truncate text-muted-foreground")}>
                    <Mail className="size-3 shrink-0" />
                    <span className="truncate">{form.recipients.join(", ")}</span>
                  </span>
                </span>
                {data ? (
                  <span className={cn(typeClass("caption", "compact"), "text-muted-foreground")}>
                    <span className="text-foreground tabular-nums" style={{ fontVariationSettings: fontWeights.semibold }}>
                      {byForm.get(form.id) ?? 0}
                    </span>{" "}
                    Nachrichten in {range.days === 365 ? "12 Monaten" : `${range.days} Tagen`}
                  </span>
                ) : null}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onCreateForm}
            className={cn(
              typeClass("body", "compact"),
              "flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-[12px] p-4 text-muted-foreground shadow-[inset_0_0_0_1px_var(--separator)] transition-colors hover:bg-[var(--group)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            <Plus className="size-4" />
            Formular anlegen
          </button>
        </div>
      </div>
    </div>
  );
}

function WebsiteSettings({ project, onSaved }: { project: Project; onSaved: () => Promise<void> }) {
  const navigate = useNavigate();
  const { settings } = useProjects();
  const [label, setLabel] = useState(project.label);
  const [origins, setOrigins] = useState(project.origins);
  const [smtp, setSmtp] = useState<SmtpDraft>(emptySmtp(project.smtp));
  const [notify, setNotify] = useState<NotifyPolicy | "inherit">(project.notifyPolicy ?? "inherit");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const site = useSave();
  const mailbox = useSave();
  const warnings = useSave();

  useEffect(() => {
    setLabel(project.label);
    setOrigins(project.origins);
    setSmtp(emptySmtp(project.smtp));
    setNotify(project.notifyPolicy ?? "inherit");
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const smtpDirty = useMemo(() => smtpChanged(project.smtp, smtp), [project.smtp, smtp]);
  const originsDirty = origins.join("\n") !== project.origins.join("\n");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        icon={<Globe />}
        title="Website"
        footer={
          <SaveFooter
            state={site.state}
            dirty={label.trim() !== project.label || originsDirty}
            onSave={() =>
              void site.run(async () => {
                if (!label.trim()) throw new Error("Gib der Website einen Namen.");
                await api.updateProject(project.id, { label: label.trim(), origins });
                await onSaved();
              })
            }
          />
        }
      >
        <InputGroup className="w-full max-w-md">
          <InputField index={0} label="Name" value={label} onChange={setLabel} />
        </InputGroup>
        <OriginsEditor value={origins} onChange={setOrigins} />
      </Section>

      <Section
        icon={<Mail />}
        title="E-Mail-Postfach"
        description="Von diesem Postfach bekommst du die Nachrichten der Formulare."
        footer={
          <SaveFooter
            state={mailbox.state}
            dirty={smtpDirty}
            onSave={() => {
              const problem = smtpProblem(smtp, Boolean(project.smtp?.passwordSet));
              if (problem) return mailbox.fail(problem);
              void mailbox.run(async () => {
                await api.updateProject(project.id, { smtp: smtpFromDraft(smtp) });
                setSmtp((draft) => ({ ...draft, password: "" }));
                await onSaved();
              });
            }}
            extra={
              project.smtp ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  onClick={() =>
                    void mailbox.run(async () => {
                      await api.updateProject(project.id, { smtp: null });
                      setSmtp(emptySmtp(null));
                      await onSaved();
                    })
                  }
                >
                  Trennen
                </Button>
              ) : null
            }
          />
        }
      >
        {project.smtp ? <StatusPill tone="ok" className="self-start">Verbunden</StatusPill> : null}
        <SmtpFields value={smtp} onChange={setSmtp} passwordSet={Boolean(project.smtp?.passwordSet)} />
        <SmtpTest disabled={!project.smtp || smtpDirty} defaultTo={project.smtp?.from} onTest={(to) => api.testProjectSmtp(project.id, to)} />
      </Section>

      {project.notifyPolicy ? (
        // Only shown when this website deviates from the global setting
        // (e.g. set by an agent), so it can be seen and undone.
        <Section
          icon={<TriangleAlert />}
          title="Warnungen für diese Website"
          footer={
            <SaveFooter
              state={warnings.state}
              dirty={notify !== project.notifyPolicy}
              onSave={() =>
                void warnings.run(async () => {
                  await api.updateProject(project.id, { notifyPolicy: notify === "inherit" ? null : notify });
                  await onSaved();
                })
              }
            />
          }
        >
          <NotifyChoice
            value={notify}
            onChange={setNotify}
            inheritLabel={`Wie in den Einstellungen (${settings ? NOTIFY_LABEL[settings.notifyPolicy] : "Standard"})`}
          />
        </Section>
      ) : null}

      <Section
        tone="danger"
        icon={<Trash2 />}
        title="Website löschen"
        footer={
          <Button variant="secondary" size="compact" onClick={() => setConfirmDelete(true)}>
            Löschen …
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`${project.label} löschen?`}
        description={`Alle ${project.formCount} Formulare und ${project.submissionCount} gespeicherten Nachrichten werden gelöscht. Die Formulare auf der Website funktionieren danach nicht mehr.`}
        confirmLabel="Endgültig löschen"
        onOpenChange={setConfirmDelete}
        onConfirm={async () => {
          await api.deleteProject(project.id);
          await onSaved();
          navigate("/");
        }}
      />
    </div>
  );
}
