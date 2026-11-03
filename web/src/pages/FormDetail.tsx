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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner";
import { InputCopy } from "@/components/ui/input-copy";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Tabs, TabsItem } from "@/components/ui/tabs";
import { fontWeights } from "@/lib/font-weight";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { api, type DeliveryFilter, type Form, type NotifyPolicy, type Project, type Submission } from "../api";
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
import { fetchSnippet, htmlSnippet } from "../lib/snippet";
import { useProjects } from "../projects-context";

const TABS: PageTab[] = [
  { key: "auswertung", label: "Auswertung", icon: BarChart3 },
  { key: "einbinden", label: "Einbinden", icon: Code2 },
  { key: "einstellungen", label: "Einstellungen", icon: Settings2 },
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
      setError(errorText(err, "Formular konnte nicht geladen werden."));
    }
  }, [id]);

  useEffect(() => {
    setForm(null);
    void refresh();
  }, [refresh]);

  if (error && !form) return <EmptyState icon={<FileText />} title="Dieses Formular gibt es nicht mehr" />;
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
        description={<>Nachrichten gehen an {form.recipients.join(", ")}</>}
        tabs={<PageTabs tabs={TABS} index={tab.index} onSelect={tab.select} />}
      />

      {problems.length && project ? (
        <Banner status="warning" className="mb-5">
          <BannerTitle>Nachrichten kommen noch nicht per E-Mail an</BannerTitle>
          <BannerDescription>
            {problems.join(" ")}{" "}
            <Link className="underline underline-offset-2" to={`/projects/${project.id}?tab=einstellungen`}>
              Jetzt eintragen
            </Link>
          </BannerDescription>
        </Banner>
      ) : null}

      {tab.key === "auswertung" ? <Analytics form={form} onChanged={refresh} /> : null}
      {tab.key === "einbinden" ? <Embed form={form} project={project} /> : null}
      {tab.key === "einstellungen" ? <FormSettings form={form} project={project} onSaved={afterSave} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

function Analytics({ form, onChanged }: { form: Form; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const range = useRange();
  const [status, setStatus] = useState<DeliveryFilter | undefined>();
  const [fieldFilter, setFieldFilter] = useState<{ field: string; value: string } | undefined>();
  const { data, loading, error } = useStats({ formId: form.id, days: range.days, status, ...fieldFilter });

  if (form.submissionCount === 0) {
    return (
      <div className="group-surface">
        <EmptyState
          icon={<BarChart3 />}
          title="Noch keine Nachrichten"
          action={
            <Button variant="primary" leadingIcon={Code2} onClick={() => navigate(`/forms/${form.id}?tab=einbinden`)}>
              Formular einbinden
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
            <FilterChip label={`${fieldLabel(fieldFilter.field, form.fieldLabels)}: ${fieldFilter.value}`} onClear={() => setFieldFilter(undefined)} />
          ) : null}
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="compact"
            leadingIcon={Download}
            onClick={() => void downloadCsv(api.formCsvUrl(form.id), `${form.name}.csv`)}
          >
            Alle als Tabelle
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
            <ColumnChart stats={data} title="Nachrichten" loading={loading} />
            <FieldBreakdown
              stats={data}
              labels={form.fieldLabels}
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
      setError(errorText(err, "Das hat nicht geklappt."));
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
            {form.failedCount === 1 ? "1 Nachricht ist nicht angekommen" : `${form.failedCount} Nachrichten sind nicht angekommen`}
          </h2>
          {lastError ? <p className={cn(typeClass("caption", "compact"), "mt-0.5 break-words text-muted-foreground")}>Grund: {lastError}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button size="compact" variant="primary" leadingIcon={RotateCcw} loading={busy === "resend"} disabled={busy !== null} onClick={() => void act("resend")}>
            Erneut senden
          </Button>
          <Button size="compact" variant="secondary" leadingIcon={Check} loading={busy === "ack"} disabled={busy !== null} onClick={() => void act("ack")}>
            Zur Kenntnis genommen
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
// Einbinden
// ---------------------------------------------------------------------------

function redirectKey(formId: string) {
  return `snd:redirect:${formId}`;
}

function Embed({ form, project }: { form: Form; project: Project | null }) {
  const origin = project?.origins[0];
  const fallback = origin ? `${origin}/danke` : "";
  const [redirect, setRedirect] = useState(() => {
    try {
      return localStorage.getItem(redirectKey(form.id)) || fallback;
    } catch {
      return fallback;
    }
  });
  const [mode, setMode] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(redirectKey(form.id), redirect);
    } catch {
      // Ohne Speicher wird die Eingabe nur nicht gemerkt.
    }
  }, [form.id, redirect]);

  const redirectProblem = useMemo(() => {
    if (!redirect.trim()) return "Gib die Adresse der Danke-Seite an.";
    try {
      const url = new URL(redirect.trim());
      if (project && !project.origins.some((item) => new URL(item).origin === url.origin)) {
        return `Muss auf ${project.origins.map(hostOf).join(" oder ") || "der Website"} liegen.`;
      }
      return null;
    } catch {
      return "Beginnt mit https://";
    }
  }, [redirect, project]);

  const html = htmlSnippet({ submitUrl: form.submitUrl, accessKey: form.accessKey, redirect: redirect.trim(), turnstile: form.turnstileSet });
  const js = fetchSnippet({ submitUrl: form.submitUrl, accessKey: form.accessKey });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section title="1 · Danke-Seite" description="Hierhin kommen Besucher nach dem Absenden.">
        <InputGroup className="w-full max-w-none">
          <InputField
            index={0}
            label="Adresse"
            value={redirect}
            onChange={setRedirect}
            placeholder="https://beispiel.de/danke"
            inputMode="url"
            spellCheck={false}
            error={redirectProblem ?? undefined}
          />
        </InputGroup>
      </Section>

      <Section title="2 · Code einfügen" description="Dort auf deiner Website einfügen, wo das Formular stehen soll.">
        <Tabs selectedIndex={mode} onSelect={setMode} size="compact" className="w-max">
          <TabsItem index={0} label="HTML" />
          <TabsItem index={1} label="JavaScript" />
        </Tabs>
        {mode === 0 ? (
          <CodeBlock code={html} label="HTML" />
        ) : (
          <div className="flex flex-col gap-4">
            <CodeBlock code={js} label="JavaScript" />
            <InputCopy label="Formular-Schlüssel" value={form.accessKey} className="min-w-0 overflow-hidden" />
          </div>
        )}
      </Section>

      <Section title="3 · Ausprobieren" description="Schick das Formular auf deiner Website einmal ab.">
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
        Es funktioniert – {count === 1 ? "1 Nachricht" : `${count} Nachrichten`} angekommen
      </StatusPill>
    );
  }
  return (
    <span className={cn(typeClass("body", "compact"), "flex items-center gap-2 text-muted-foreground")} role="status">
      <Loader2 className="size-4 animate-spin" /> Warte auf die erste Nachricht …
    </span>
  );
}

// ---------------------------------------------------------------------------
// Einstellungen
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
        title="Formular"
        footer={
          <SaveFooter
            state={general.state}
            dirty={name.trim() !== form.name || recipients.join(",") !== form.recipients.join(",")}
            onSave={() =>
              void general.run(async () => {
                if (!recipients.length) throw new Error("Mindestens eine E-Mail-Adresse.");
                await onSaved(await api.updateForm(form.id, { name: name.trim(), recipients }));
              })
            }
          />
        }
      >
        <InputGroup className="w-full max-w-md">
          <InputField index={0} label="Name" value={name} onChange={setName} />
        </InputGroup>
        <div className="flex flex-col gap-2">
          <span className={cn(typeClass("body", "compact"), "text-foreground")} style={{ fontVariationSettings: fontWeights.semibold }}>
            Nachrichten schicken an
          </span>
          <RecipientsEditor value={recipients} onChange={setRecipients} />
        </div>
      </Section>

      <FieldTitles form={form} onSaved={onSaved} />

      <Section
        icon={<Mail />}
        title="Verschickt über"
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
          <TabsItem index={0} label={project?.smtp ? `Postfach der Website (${project.smtp.from})` : "Postfach der Website"} />
          <TabsItem index={1} label="Anderes Postfach" />
        </Tabs>
        {ownMailbox ? (
          <>
            <SmtpFields value={smtp} onChange={setSmtp} passwordSet={Boolean(form.smtp?.passwordSet)} />
            <SmtpTest disabled={!form.smtp || smtpDirty} defaultTo={form.recipients[0]} onTest={(to) => api.testFormSmtp(form.id, to)} />
          </>
        ) : project?.smtp ? (
          <SmtpTest defaultTo={form.recipients[0]} onTest={(to) => api.testFormSmtp(form.id, to)} />
        ) : project ? (
          <Button variant="primary" size="compact" className="self-start" onClick={() => navigate(`/projects/${project.id}?tab=einstellungen`)}>
            Postfach der Website eintragen
          </Button>
        ) : null}
      </Section>

      <Section
        icon={<ShieldCheck />}
        title="Spam-Schutz"
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
                    Turnstile entfernen
                  </Button>
                ) : null
              }
            />
          ) : undefined
        }
      >
        <StatusPill tone="ok" className="self-start">
          {form.turnstileSet ? "Spam-Falle und Cloudflare Turnstile aktiv" : "Spam-Falle aktiv"}
        </StatusPill>
        {showTurnstile || form.turnstileSet ? (
          <InputGroup className="w-full max-w-none">
            <InputField
              index={0}
              label="Turnstile Secret Key"
              type="password"
              value={turnstile}
              onChange={setTurnstile}
              placeholder={form.turnstileSet ? "••••••••  (gespeichert)" : "0x4AAAAAAA…"}
              autoComplete="off"
            />
          </InputGroup>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!showTurnstile && !form.turnstileSet ? (
            <Button variant="secondary" size="compact" onClick={() => setShowTurnstile(true)}>
              Cloudflare Turnstile verbinden
            </Button>
          ) : null}
          <Button variant="secondary" size="compact" onClick={() => setConfirmRotate(true)}>
            Trotzdem Spam? Neuen Schlüssel erzeugen
          </Button>
        </div>
      </Section>

      {form.notifyPolicy ? (
        <Section
          icon={<TriangleAlert />}
          title="Warnungen für dieses Formular"
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
            inheritLabel={`Wie in den Einstellungen (${
              project?.notifyPolicy ? NOTIFY_LABEL[project.notifyPolicy] : settings ? NOTIFY_LABEL[settings.notifyPolicy] : "Standard"
            })`}
          />
        </Section>
      ) : null}

      <Section
        tone="danger"
        icon={<Trash2 />}
        title="Formular löschen"
        footer={
          <Button variant="secondary" size="compact" onClick={() => setConfirmDelete(true)}>
            Löschen …
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmRotate}
        title="Neuen Schlüssel erzeugen?"
        description="Der bisherige Code auf der Website funktioniert danach nicht mehr. Du musst ihn unter „Einbinden“ neu kopieren und austauschen."
        confirmLabel="Neuen Schlüssel erzeugen"
        onOpenChange={setConfirmRotate}
        onConfirm={async () => {
          await onSaved(await api.rotateKey(form.id));
          navigate(`/forms/${form.id}?tab=einbinden`);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`${form.name} löschen?`}
        description={`Die ${form.submissionCount} gespeicherten Nachrichten werden gelöscht. Das Formular auf der Website funktioniert danach nicht mehr.`}
        confirmLabel="Endgültig löschen"
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
      title="Feldtitel"
      description="So heißen die Felder in der E-Mail und in der Auswertung. Leer lassen für den Vorschlag."
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
              placeholder={fieldLabel(name)}
              autoComplete="off"
            />
          ))}
        </InputGroup>
      ) : (
        <p className={cn(typeClass("body", "compact"), "text-muted-foreground")}>
          Sobald die erste Nachricht da ist, erscheinen hier ihre Felder. Du kannst sie auch selbst eintragen.
        </p>
      )}
      <div className="flex items-end gap-2">
        <InputGroup className="w-full max-w-none flex-1">
          <InputField
            index={0}
            label="Feldname aus dem HTML"
            value={draft}
            onChange={setDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addField();
              }
            }}
            placeholder="z. B. telefon"
            autoComplete="off"
            spellCheck={false}
          />
        </InputGroup>
        <Button type="button" variant="secondary" leadingIcon={Plus} onClick={addField} disabled={!draft.trim()}>
          Hinzufügen
        </Button>
      </div>
    </Section>
  );
}
