import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BarChart3,
  Check,
  Code2,
  Download,
  FileText,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Type,
  MailOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Tabs, TabsItem } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { fontWeights } from "@/lib/font-weight";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { api, type DeliveryFilter, type Form, type MailTemplate, type NotifyPolicy, type Project, type Submission } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CodeBlock, EmptyState, Section, StatusPill } from "../components/kit";
import { PageHeader, PageTabs, usePageTab, type PageTab } from "../components/PageHeader";
import { SaveFooter, useSave } from "../components/SaveFooter";
import { NotifyChoice, RecipientsEditor } from "../components/SettingsWidgets";
import { emptySmtp, SmtpFields, smtpFromDraft, smtpProblem, SmtpTest, smtpChanged, type SmtpDraft } from "../components/SmtpFields";
import {
  ColumnChart,
  fieldLabel,
  FieldBreakdown,
  FilterChip,
  FilterRow,
  RangeTabs,
  StatTiles,
  StatusSelect,
  useRange,
  useStats,
} from "../components/Stats";
import { downloadCsv } from "../lib/download";
import { errorText, formatWhen, hostOf, NOTIFY_LABEL, senderOf } from "../lib/format";
import { formProblems } from "../lib/readiness";
import { htmlSnippet } from "../lib/snippet";
import { useProjects } from "../projects-context";
import { t } from "@/lib/i18n";

const TABS: PageTab[] = [
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "embed", label: "Embed", icon: Code2 },
  { key: "settings", label: "Settings", icon: Settings2 },
];

export function FormDetailPage() {
  const { id = "" } = useParams();
  const { projects, reload, loaded } = useProjects();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tab = usePageTab(TABS);
  const project = form ? (projects.find((item) => item.id === form.projectId) ?? null) : null;

  const refresh = useCallback(async () => {
    try {
      setForm(await api.form(id));
      setError(null);
    } catch (err) {
      setError(errorText(err, t("The form could not be loaded.")));
    }
  }, [id]);

  useEffect(() => {
    setForm(null);
    void refresh();
  }, [refresh]);

  if (error && !form) return <EmptyState icon={<FileText />} title={t("This form no longer exists")} />;
  if (!form || !loaded) return null;

  const problems = formProblems(form, project);
  const afterSave = async (next: Form) => {
    setForm(next);
    await reload();
  };

  return (
    <>
      <PageHeader
        parent={project ? { label: project.label, to: `/projects/${project.id}` } : undefined}
        leading={
          <span className="group-surface flex size-10 shrink-0 items-center justify-center text-foreground">
            <FileText className="size-5" />
          </span>
        }
        title={form.name}
        description={<>{t("Messages go to {recipients}", { recipients: form.recipients.join(", ") })}</>}
        tabs={<PageTabs tabs={TABS} index={tab.index} onSelect={tab.select} />}
      />

      {problems.length && project ? (
        <Banner status="warning" className="mb-5">
          <BannerTitle>{t("Messages aren't delivered by email yet")}</BannerTitle>
          <BannerDescription>
            {problems.join(" ")}{" "}
            <Link className="underline underline-offset-2" to={`/projects/${project.id}?tab=settings`}>
              {t("Add now")}
            </Link>
          </BannerDescription>
        </Banner>
      ) : null}

      {tab.key === "stats" ? <Analytics form={form} onChanged={refresh} /> : null}
      {tab.key === "embed" ? <Embed form={form} project={project} /> : null}
      {tab.key === "settings" ? <FormSettings form={form} project={project} onSaved={afterSave} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function Analytics({ form, onChanged }: { form: Form; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const range = useRange();
  const [status, setStatus] = useState<DeliveryFilter | undefined>();
  const [fieldFilter, setFieldFilter] = useState<{ field: string; value: string } | undefined>();
  const { data, loading, error } = useStats({ formId: form.id, days: range.days, status, ...fieldFilter });
  const titles = useMemo(() => ({ ...form.sentLabels, ...form.fieldLabels }), [form.sentLabels, form.fieldLabels]);

  if (form.submissionCount === 0) {
    return (
      <div className="group-surface">
        <EmptyState
          icon={<BarChart3 />}
          title={t("No messages yet")}
          action={
            <Button variant="primary" leadingIcon={Code2} onClick={() => navigate(`/forms/${form.id}?tab=embed`)}>
              {t("Embed form")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {form.failedCount > 0 ? <Failures form={form} onChanged={onChanged} /> : null}

      <div>
        <FilterRow>
          <RangeTabs days={range.days} onChange={range.setDays} />
          <StatusSelect value={status} onChange={setStatus} />
          {fieldFilter ? (
            <FilterChip label={`${fieldLabel(fieldFilter.field, titles)}: ${fieldFilter.value}`} onClear={() => setFieldFilter(undefined)} />
          ) : null}
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="compact"
            leadingIcon={Download}
            onClick={() => void downloadCsv(api.formCsvUrl(form.id), `${form.name}.csv`)}
          >
            {t("Export all as CSV")}
          </Button>
        </FilterRow>
        {error ? (
          <Banner status="error">
            <BannerDescription>{error}</BannerDescription>
          </Banner>
        ) : null}
        {data ? (
          <div className="flex flex-col gap-4">
            <StatTiles stats={data} days={range.days} />
            <ColumnChart stats={data} title={t("Messages")} loading={loading} />
            <FieldBreakdown
              stats={data}
              labels={titles}
              selected={fieldFilter}
              onSelect={(field, value) =>
                setFieldFilter((current) => (current?.field === field && current.value === value ? undefined : { field, value }))
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Messages that could not be delivered: the one place the app shows single
 *  messages, because here something has to be decided. */
function Failures({ form, onChanged }: { form: Form; onChanged: () => Promise<void> }) {
  const { reload } = useProjects();
  const [items, setItems] = useState<Submission[] | null>(null);
  const [busy, setBusy] = useState<"resend" | "ack" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.failures(form.id).then((list) => setItems(list.items)).catch(() => setItems([]));
  }, [form.id, form.failedCount]);

  async function act(kind: "resend" | "ack") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "resend") await api.resendFailures(form.id);
      else await api.acknowledgeFailures(form.id);
      await Promise.all([onChanged(), reload()]);
    } catch (err) {
      setError(errorText(err, t("That didn't work.")));
    } finally {
      setBusy(null);
    }
  }

  const lastError = items?.find((item) => item.lastError)?.lastError;
  return (
    <section className="group-surface overflow-hidden">
      <header className="flex flex-wrap items-start gap-3 px-4 pt-3.5 pb-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
        <div className="min-w-0 flex-1">
          <h2 className={cn(typeClass("body", "compact"), "text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
            {form.failedCount === 1 ? t("1 message was not delivered") : t("{n} messages were not delivered", { n: form.failedCount })}
          </h2>
          {lastError ? <p className={cn(typeClass("caption", "compact"), "mt-0.5 break-words text-muted-foreground")}>{t("Reason: {reason}", { reason: lastError })}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button size="compact" variant="primary" leadingIcon={RotateCcw} loading={busy === "resend"} disabled={busy !== null} onClick={() => void act("resend")}>
            {t("Send again")}
          </Button>
          <Button size="compact" variant="secondary" leadingIcon={Check} loading={busy === "ack"} disabled={busy !== null} onClick={() => void act("ack")}>
            {t("Acknowledge")}
          </Button>
        </div>
      </header>
      {error ? <p className={cn(typeClass("caption", "compact"), "px-4 pb-2 text-destructive")}>{error}</p> : null}
      {items && items.length ? (
        <ul className="divide-hairline hairline-top">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className={cn(typeClass("body", "compact"), "truncate text-foreground")}>
                {senderOf(item)}
                {item.replyTo && item.replyTo !== senderOf(item) ? <span className="text-muted-foreground"> · {item.replyTo}</span> : null}
              </span>
              <span className={cn(typeClass("caption", "compact"), "shrink-0 text-muted-foreground")}>{formatWhen(item.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Embed
// ---------------------------------------------------------------------------

function redirectKey(formId: string) {
  return `snd:redirect:${formId}`;
}

function Embed({ form, project }: { form: Form; project: Project | null }) {
  const [redirect, setRedirect] = useState(() => {
    try {
      return localStorage.getItem(redirectKey(form.id)) ?? "";
    } catch {
      return "";
    }
  });
  const [mode, setMode] = useState(0);

  useEffect(() => {
    try {
      if (redirect) localStorage.setItem(redirectKey(form.id), redirect);
      else localStorage.removeItem(redirectKey(form.id));
    } catch {
      // Without storage the input is just not remembered.
    }
  }, [form.id, redirect]);

  // Only the plain HTML form needs a thank-you page; the JavaScript version
  // shows the result inside the form.
  const redirectProblem = useMemo(() => {
    if (!redirect.trim()) return t("Enter the address of the thank-you page.");
    try {
      const url = new URL(redirect.trim());
      if (project && !project.origins.some((item) => new URL(item).origin === url.origin)) {
        return t("Must be on {hosts}.", { hosts: project.origins.map(hostOf).join(t(" or ")) || t("the website") });
      }
      return null;
    } catch {
      return t("Starts with https://");
    }
  }, [redirect, project]);

  const html = htmlSnippet({
    submitUrl: form.submitUrl,
    accessKey: form.accessKey,
    redirect: redirect.trim(),
    turnstile: form.turnstileSet,
  });
  const example = project?.origins[0] ? `${project.origins[0]}/${t("thanks")}` : t("https://example.com/thanks");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section title={t("1 · Paste the code")} description={t("Paste it on your website where the form should appear.")}>
        <Tabs selectedIndex={mode} onSelect={setMode} size="compact" className="w-max">
          <TabsItem index={0} label="JavaScript" />
          <TabsItem index={1} label={t("HTML only")} />
        </Tabs>
        {mode === 0 ? (
          <div className="flex flex-col gap-4">
            <span className={cn(typeClass("body", "compact"), "text-muted-foreground")}>
              {t("Recommended. Sends without leaving the page, shows the result in the form and sends each field's title for the mail. Adapt the fields freely; give each one a <label>.")}
            </span>
            <CodeBlock code={form.scriptSnippet} label="HTML + JavaScript" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <span className={cn(typeClass("body", "compact"), "text-muted-foreground")}>
              {t("Works without JavaScript. After sending, visitors go to your thank-you page.")}
            </span>
            <InputGroup className="w-full max-w-none">
              <InputField
                index={0}
                label={t("Thank-you page")}
                value={redirect}
                onChange={setRedirect}
                placeholder={example}
                inputMode="url"
                spellCheck={false}
                error={redirectProblem ?? undefined}
              />
            </InputGroup>
            <CodeBlock code={html} label="HTML" />
          </div>
        )}
      </Section>

      <Section title={t("2 · Try it")} description={t("Submit the form on your website once.")}>
        <FirstMessage form={form} />
      </Section>
    </div>
  );
}

/** Watches for the first message, so "did it work?" answers itself. */
function FirstMessage({ form }: { form: Form }) {
  const [count, setCount] = useState(form.submissionCount);
  useEffect(() => {
    if (count > 0) return;
    const timer = window.setInterval(() => {
      void api.form(form.id).then((next) => setCount(next.submissionCount)).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [form.id, count]);

  if (count > 0) {
    return (
      <StatusPill tone="ok" className="self-start">
        {count === 1 ? t("It works – 1 message received") : t("It works – {n} messages received", { n: count })}
      </StatusPill>
    );
  }
  return (
    <span className={cn(typeClass("body", "compact"), "flex items-center gap-2 text-muted-foreground")} role="status">
      <Loader2 className="size-4 animate-spin" /> {t("Waiting for the first message …")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function FormSettings({ form, project, onSaved }: { form: Form; project: Project | null; onSaved: (next: Form) => Promise<void> }) {
  const navigate = useNavigate();
  const { settings, reload } = useProjects();
  const [name, setName] = useState(form.name);
  const [recipients, setRecipients] = useState(form.recipients);
  const [ownMailbox, setOwnMailbox] = useState(Boolean(form.smtp));
  const [smtp, setSmtp] = useState<SmtpDraft>(emptySmtp(form.smtp));
  const [turnstile, setTurnstile] = useState("");
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [notify, setNotify] = useState<NotifyPolicy | "inherit">(form.notifyPolicy ?? "inherit");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const general = useSave();
  const mailbox = useSave();
  const spam = useSave();
  const warnings = useSave();

  const smtpDirty = useMemo(() => {
    if (ownMailbox !== Boolean(form.smtp)) return true;
    return ownMailbox && smtpChanged(form.smtp, smtp);
  }, [form.smtp, smtp, ownMailbox]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        icon={<FileText />}
        title={t("Form")}
        footer={
          <SaveFooter
            state={general.state}
            dirty={name.trim() !== form.name || recipients.join(",") !== form.recipients.join(",")}
            onSave={() =>
              void general.run(async () => {
                if (!recipients.length) throw new Error(t("At least one email address."));
                await onSaved(await api.updateForm(form.id, { name: name.trim(), recipients }));
              })
            }
          />
        }
      >
        <InputGroup className="w-full max-w-md">
          <InputField index={0} label={t("Name")} value={name} onChange={setName} />
        </InputGroup>
        <div className="flex flex-col gap-2">
          <span className={cn(typeClass("body", "compact"), "text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
            {t("Send messages to")}
          </span>
          <RecipientsEditor value={recipients} onChange={setRecipients} />
        </div>
      </Section>

      <FieldTitles form={form} onSaved={onSaved} />

      <TemplateChoice form={form} onSaved={onSaved} />

      <Section
        icon={<Mail />}
        title={t("Sent through")}
        footer={
          <SaveFooter
            state={mailbox.state}
            dirty={smtpDirty}
            onSave={() => {
              if (ownMailbox) {
                const problem = smtpProblem(smtp, Boolean(form.smtp?.passwordSet));
                if (problem) return mailbox.fail(problem);
              }
              void mailbox.run(async () => {
                await onSaved(await api.updateForm(form.id, { smtp: ownMailbox ? smtpFromDraft(smtp) : null }));
                setSmtp((draft) => ({ ...draft, password: "" }));
              });
            }}
          />
        }
      >
        <Tabs selectedIndex={ownMailbox ? 1 : 0} onSelect={(index) => setOwnMailbox(index === 1)} className="w-max max-w-full">
          <TabsItem index={0} label={project?.smtp ? t("Website mailbox ({address})", { address: project.smtp.from }) : t("Website mailbox")} />
          <TabsItem index={1} label={t("Other mailbox")} />
        </Tabs>
        {ownMailbox ? (
          <>
            <SmtpFields value={smtp} onChange={setSmtp} passwordSet={Boolean(form.smtp?.passwordSet)} />
            <SmtpTest disabled={!form.smtp || smtpDirty} defaultTo={form.recipients[0]} onTest={(to) => api.testFormSmtp(form.id, to)} />
          </>
        ) : project?.smtp ? (
          <SmtpTest defaultTo={form.recipients[0]} onTest={(to) => api.testFormSmtp(form.id, to)} />
        ) : project ? (
          <Button variant="primary" size="compact" className="self-start" onClick={() => navigate(`/projects/${project.id}?tab=settings`)}>
            {t("Set up the website mailbox")}
          </Button>
        ) : null}
      </Section>

      <Section
        icon={<ShieldCheck />}
        title={t("Spam protection")}
        footer={
          showTurnstile || form.turnstileSet ? (
            <SaveFooter
              state={spam.state}
              dirty={Boolean(turnstile)}
              onSave={() =>
                void spam.run(async () => {
                  await onSaved(await api.updateForm(form.id, { turnstileSecret: turnstile }));
                  setTurnstile("");
                })
              }
              extra={
                form.turnstileSet ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() => void spam.run(async () => onSaved(await api.updateForm(form.id, { turnstileSecret: null })))}
                  >
                    {t("Remove Turnstile")}
                  </Button>
                ) : null
              }
            />
          ) : undefined
        }
      >
        <StatusPill tone="ok" className="self-start">
          {form.turnstileSet ? t("Spam trap and Cloudflare Turnstile active") : t("Spam trap active")}
        </StatusPill>
        {showTurnstile || form.turnstileSet ? (
          <InputGroup className="w-full max-w-none">
            <InputField
              index={0}
              label="Turnstile Secret Key"
              type="password"
              value={turnstile}
              onChange={setTurnstile}
              placeholder={form.turnstileSet ? t("••••••••  (saved)") : "0x4AAAAAAA…"}
              autoComplete="off"
            />
          </InputGroup>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!showTurnstile && !form.turnstileSet ? (
            <Button variant="secondary" size="compact" onClick={() => setShowTurnstile(true)}>
              {t("Connect Cloudflare Turnstile")}
            </Button>
          ) : null}
          <Button variant="secondary" size="compact" onClick={() => setConfirmRotate(true)}>
            {t("Still getting spam? Create a new key")}
          </Button>
        </div>
      </Section>

      {form.notifyPolicy ? (
        <Section
          icon={<TriangleAlert />}
          title={t("Alerts for this form")}
          footer={
            <SaveFooter
              state={warnings.state}
              dirty={notify !== form.notifyPolicy}
              onSave={() =>
                void warnings.run(async () => onSaved(await api.updateForm(form.id, { notifyPolicy: notify === "inherit" ? null : notify })))
              }
            />
          }
        >
          <NotifyChoice
            value={notify}
            onChange={setNotify}
            inheritLabel={t("As in settings ({policy})", {
              policy: project?.notifyPolicy ? t(NOTIFY_LABEL[project.notifyPolicy]) : settings ? t(NOTIFY_LABEL[settings.notifyPolicy]) : t("default"),
            })}
          />
        </Section>
      ) : null}

      <Section
        tone="danger"
        icon={<Trash2 />}
        title={t("Delete form")}
        footer={
          <Button variant="secondary" size="compact" onClick={() => setConfirmDelete(true)}>
            {t("Delete …")}
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmRotate}
        title={t("Create a new key?")}
        description={t("The current code on the website will stop working. You need to copy it again under “Embed” and replace it.")}
        confirmLabel={t("Create new key")}
        onOpenChange={setConfirmRotate}
        onConfirm={async () => {
          await onSaved(await api.rotateKey(form.id));
          navigate(`/forms/${form.id}?tab=embed`);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t("Delete {name}?", { name: form.name })}
        description={t("The {n} stored messages will be deleted. The form on the website will stop working.", { n: form.submissionCount })}
        confirmLabel={t("Delete permanently")}
        onOpenChange={setConfirmDelete}
        onConfirm={async () => {
          await api.deleteForm(form.id);
          await reload();
          navigate(`/projects/${form.projectId}`);
        }}
      />
    </div>
  );
}

/** Which mail template the notifications of this form use. */
function TemplateChoice({ form, onSaved }: { form: Form; onSaved: (next: Form) => Promise<void> }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MailTemplate[] | null>(null);
  const [choice, setChoice] = useState(form.templateId ?? "default");
  const save = useSave();

  useEffect(() => {
    void api.templates(form.projectId).then(setTemplates).catch(() => setTemplates([]));
  }, [form.projectId]);
  useEffect(() => setChoice(form.templateId ?? "default"), [form.templateId]);

  const options = [{ value: "default", label: t("Default template") }, ...(templates ?? []).map((item) => ({ value: item.id, label: item.name }))];

  return (
    <Section
      icon={<MailOpen />}
      title={t("Mail template")}
      description={t("How the notification mail of this form looks. Templates belong to the website.")}
      footer={
        <SaveFooter
          state={save.state}
          dirty={choice !== (form.templateId ?? "default")}
          onSave={() => void save.run(async () => onSaved(await api.updateForm(form.id, { templateId: choice === "default" ? null : choice })))}
          extra={
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => navigate(choice === "default" ? `/projects/${form.projectId}?tab=templates` : `/templates/${choice}`)}
            >
              {choice === "default" ? t("Manage templates") : t("Edit template")}
            </Button>
          }
        />
      }
    >
      <Select value={choice} onValueChange={(next) => setChoice(String(next))}>
        <SelectTrigger placeholder={t("Default template")} className="w-full max-w-md" />
        <SelectContent>
          {options.map((option, index) => (
            <SelectItem key={option.value} index={index} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Section>
  );
}

/** Titles shown instead of the HTML field names in the notification mail and
 *  in the analysis. Fields come from past messages; for a form without any,
 *  names can be added by hand. */
function FieldTitles({ form, onSaved }: { form: Form; onSaved: (next: Form) => Promise<void> }) {
  const [labels, setLabels] = useState<Record<string, string>>(form.fieldLabels);
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const save = useSave();

  useEffect(() => {
    setLabels(form.fieldLabels);
    setExtra([]);
  }, [form.fieldLabels]);

  const names = useMemo(
    () => [...new Set([...form.seenFields, ...Object.keys(form.fieldLabels), ...extra])],
    [form.seenFields, form.fieldLabels, extra],
  );
  const cleaned = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(labels)) if (value.trim()) out[key] = value.trim();
    return out;
  }, [labels]);
  const dirty = JSON.stringify(cleaned) !== JSON.stringify(form.fieldLabels);

  function addField() {
    const name = draft.trim();
    if (!name) return;
    if (!names.includes(name)) setExtra((current) => [...current, name]);
    setDraft("");
  }

  return (
    <Section
      icon={<Type />}
      title={t("Field titles")}
      description={t("How the fields are named in the email and in the stats. Leave empty to use the suggestion, or the title your form sends with label:<field>.")}
      footer={<SaveFooter state={save.state} dirty={dirty} onSave={() => void save.run(async () => onSaved(await api.updateForm(form.id, { fieldLabels: cleaned })))} />}
    >
      {names.length ? (
        <InputGroup className="w-full max-w-none">
          {names.map((name, index) => (
            <InputField
              key={name}
              index={index}
              label={name}
              value={labels[name] ?? ""}
              onChange={(value) => setLabels((current) => ({ ...current, [name]: value }))}
              placeholder={fieldLabel(name, form.sentLabels)}
              autoComplete="off"
            />
          ))}
        </InputGroup>
      ) : (
        <p className={cn(typeClass("body", "compact"), "text-muted-foreground")}>
          {t("Once the first message arrives, its fields appear here. You can also add them yourself.")}
        </p>
      )}
      <div className="flex items-end gap-2">
        <InputGroup className="w-full max-w-none flex-1">
          <InputField
            index={0}
            label={t("Field name from the HTML")}
            value={draft}
            onChange={setDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addField();
              }
            }}
            placeholder={t("e.g. phone")}
            autoComplete="off"
            spellCheck={false}
          />
        </InputGroup>
        <Button type="button" variant="secondary" leadingIcon={Plus} onClick={addField} disabled={!draft.trim()}>
          {t("Add")}
        </Button>
      </div>
    </Section>
  );
}
