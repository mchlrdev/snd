import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BarChart3, Check, ChevronRight, FileText, Globe, Mail, MailOpen, Plus, Settings2, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { fontWeights } from "@/lib/font-weight";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { api, type Form, type MailTemplate, type NotifyPolicy, type Project } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CreateFormDialog } from "../components/CreateDialogs";
import { EmptyState, Section, SiteIcon, StatusPill } from "../components/kit";
import { PageHeader, PageTabs, usePageTab, type PageTab } from "../components/PageHeader";
import { SaveFooter, useSave } from "../components/SaveFooter";
import { NotifyChoice, OriginsEditor } from "../components/SettingsWidgets";
import { emptySmtp, SmtpFields, smtpFromDraft, smtpProblem, SmtpTest, smtpChanged, type SmtpDraft } from "../components/SmtpFields";
import { ColumnChart, FilterRow, RangeTabs, StatTiles, useRange, useStats } from "../components/Stats";
import { errorText, hostOf, NOTIFY_LABEL } from "../lib/format";
import { formWarning, websiteChecks } from "../lib/readiness";
import { useProjects } from "../projects-context";
import { t } from "@/lib/i18n";

const TABS: PageTab[] = [
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "templates", label: "Mail templates", icon: MailOpen },
  { key: "settings", label: "Settings", icon: Settings2 },
];

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const { projects, formsFor, loaded, reload } = useProjects();
  const project = projects.find((item) => item.id === id) ?? null;
  const forms = formsFor(id);
  const tab = usePageTab(TABS);
  const [creatingForm, setCreatingForm] = useState(false);

  if (!loaded) return null;
  if (!project) return <EmptyState icon={<Globe />} title={t("This website no longer exists")} />;

  const ready = websiteChecks(project, forms).every((check) => check.done);

  return (
    <>
      <PageHeader
        leading={<SiteIcon project={project} size="lg" />}
        title={project.label}
        status={ready ? null : <StatusPill tone="warn">{t("Setup incomplete")}</StatusPill>}
        description={
          project.origins.length ? (
            <a href={project.origins[0]} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
              {[...new Set(project.origins.map((o) => hostOf(o).replace(/^www\./, "")))].join(" · ")}
            </a>
          ) : null
        }
        actions={
          <Button variant="secondary" leadingIcon={Plus} onClick={() => setCreatingForm(true)}>
            {t("Create form")}
          </Button>
        }
        tabs={<PageTabs tabs={TABS} index={tab.index} onSelect={tab.select} />}
      />

      {tab.key === "stats" ? (
        <Overview project={project} forms={forms} onCreateForm={() => setCreatingForm(true)} onOpenSettings={() => tab.select(2)} />
      ) : tab.key === "templates" ? (
        <Templates project={project} />
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
    <Section title={t("Set up")}>
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
                {check.key === "form" ? t("Create") : t("Add now")}
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
              <ColumnChart stats={data} title={t("Messages from {name}", { name: project.label })} loading={loading} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className={cn(typeClass("subtitle", "compact"), "mb-3 text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
          {t("Forms")}
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
                    {range.days === 365 ? t("messages in 12 months") : t("messages in {n} days", { n: range.days })}
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
            {t("Create form")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The website's mail templates. A form without one sends the built-in
 *  default; a new template starts as a copy of it. */
function Templates({ project }: { project: Project }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<MailTemplate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.templates(project.id).then(setItems).catch(() => setItems([]));
  }, [project.id]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const name = items?.length ? t("Template {n}", { n: items.length + 1 }) : t("My template");
      const created = await api.createTemplate(project.id, { name });
      navigate(`/templates/${created.id}`);
    } catch (err) {
      setError(errorText(err, t("That didn't work.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        icon={<MailOpen />}
        title={t("Mail templates")}
        description={t("How notification mails of this website look. Forms without a template use the default.")}
        footer={
          <>
            {error ? <p className={cn(typeClass("caption", "compact"), "mr-auto text-destructive")}>{error}</p> : null}
            <Button variant="secondary" size="compact" leadingIcon={Plus} loading={busy} disabled={busy} onClick={() => void create()}>
              {t("New template")}
            </Button>
          </>
        }
      >
        {items === null ? null : items.length === 0 ? (
          <p className={cn(typeClass("body", "compact"), "text-muted-foreground")}>
            {t("No templates yet. A new template starts as a copy of the default, so you only change what you need.")}
          </p>
        ) : (
          <ul className="divide-hairline -my-2 flex flex-col">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/templates/${item.id}`)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--group-hover)]"
                >
                  <MailOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className={cn(typeClass("body", "compact"), "min-w-0 flex-1 truncate text-foreground")}>{item.name}</span>
                  <span className={cn(typeClass("caption", "compact"), "shrink-0 text-muted-foreground")}>
                    {item.formCount === 0 ? t("unused") : item.formCount === 1 ? t("1 form") : t("{n} forms", { n: item.formCount })}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
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
                if (!label.trim()) throw new Error(t("Give the website a name."));
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
        title={t("Mailbox")}
        description={t("The forms' messages are sent to you from this mailbox.")}
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
                  {t("Disconnect")}
                </Button>
              ) : null
            }
          />
        }
      >
        {project.smtp ? <StatusPill tone="ok" className="self-start">{t("Connected")}</StatusPill> : null}
        <SmtpFields value={smtp} onChange={setSmtp} passwordSet={Boolean(project.smtp?.passwordSet)} />
        <SmtpTest disabled={!project.smtp || smtpDirty} defaultTo={project.smtp?.from} onTest={(to) => api.testProjectSmtp(project.id, to)} />
      </Section>

      {project.notifyPolicy ? (
        // Only shown when this website deviates from the global setting
        // (e.g. set by an agent), so it can be seen and undone.
        <Section
          icon={<TriangleAlert />}
          title={t("Alerts for this website")}
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
            inheritLabel={t("As in settings ({policy})", { policy: settings ? t(NOTIFY_LABEL[settings.notifyPolicy]) : t("default") })}
          />
        </Section>
      ) : null}

      <Section
        tone="danger"
        icon={<Trash2 />}
        title={t("Delete website")}
        footer={
          <Button variant="secondary" size="compact" onClick={() => setConfirmDelete(true)}>
            {t("Delete …")}
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t("Delete {name}?", { name: project.label })}
        description={t("All {forms} forms and {messages} stored messages will be deleted. The forms on the website will stop working.", { forms: project.formCount, messages: project.submissionCount })}
        confirmLabel={t("Delete permanently")}
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
