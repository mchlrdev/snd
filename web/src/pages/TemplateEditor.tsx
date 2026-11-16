import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BookOpen, Mail, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Tabs, TabsItem } from "@/components/ui/tabs";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { api, type MailTemplate, type TemplatePreview } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, Section, StatusPill } from "../components/kit";
import { PageHeader } from "../components/PageHeader";
import { SaveFooter, useSave } from "../components/SaveFooter";
import { errorText } from "../lib/format";
import { useProjects } from "../projects-context";

// ---------------------------------------------------------------------------
// One template: sources on the left, the rendered mail on the right. The
// preview is rendered by the server with the same code that sends the mail,
// using the website's latest message, and shown in a sandboxed frame without
// scripts, so a template can never run code in the console.
// ---------------------------------------------------------------------------

type Draft = { name: string; subject: string; html: string; text: string };

function draftOf(template: MailTemplate): Draft {
  return { name: template.name, subject: template.subject, html: template.html, text: template.text };
}

function SourceArea({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={cn(typeClass("caption", "compact"), "pl-2.5 text-muted-foreground")}>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn(
          typeClass("caption", "compact"),
          "w-full resize-y rounded-[10px] bg-[var(--code)] px-3 py-2.5 font-mono text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
    </label>
  );
}

export function TemplateEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { projects, reload } = useProjects();
  const [template, setTemplate] = useState<MailTemplate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [view, setView] = useState(0);
  const [showReference, setShowReference] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSave();

  useEffect(() => {
    setTemplate(null);
    api
      .template(id)
      .then((next) => {
        setTemplate(next);
        setDraft(draftOf(next));
      })
      .catch((err: unknown) => setLoadError(errorText(err, t("The template could not be loaded."))));
  }, [id]);

  // Re-render the preview shortly after typing stops.
  useEffect(() => {
    if (!draft || !template) return;
    const timer = window.setTimeout(() => {
      api
        .previewTemplate({ templateId: template.id, subject: draft.subject, html: draft.html, text: draft.text })
        .then((next) => {
          setPreview(next);
          setPreviewError(null);
        })
        .catch((err: unknown) => setPreviewError(errorText(err, t("The preview could not be rendered."))));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft?.subject, draft?.html, draft?.text, template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showReference || reference) return;
    void api.defaultTemplate().then((next) => setReference(next.reference)).catch(() => undefined);
  }, [showReference, reference]);

  const project = template ? (projects.find((item) => item.id === template.projectId) ?? null) : null;
  const dirty = useMemo(
    () => Boolean(template && draft && JSON.stringify(draftOf(template)) !== JSON.stringify(draft)),
    [template, draft],
  );

  if (loadError && !template) return <EmptyState icon={<Mail />} title={t("This template no longer exists")} />;
  if (!template || !draft) return null;

  const set = (key: keyof Draft) => (value: string) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <>
      <PageHeader
        parent={project ? { label: project.label, to: `/projects/${project.id}?tab=templates` } : undefined}
        leading={
          <span className="group-surface flex size-10 shrink-0 items-center justify-center text-foreground">
            <Mail className="size-5" />
          </span>
        }
        title={template.name}
        description={
          template.formCount === 0
            ? t("Not used by any form yet")
            : template.formCount === 1
              ? t("Used by 1 form")
              : t("Used by {n} forms", { n: template.formCount })
        }
        actions={
          <Button variant="secondary" leadingIcon={BookOpen} onClick={() => setShowReference((current) => !current)}>
            {showReference ? t("Hide reference") : t("Variables and syntax")}
          </Button>
        }
      />

      {showReference ? (
        <Section title={t("Variables and syntax")} className="mb-6">
          <pre className={cn(typeClass("caption", "compact"), "max-h-96 overflow-auto font-mono whitespace-pre-wrap text-foreground")}>
            {reference ?? "…"}
          </pre>
        </Section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <Section
            title={t("Template")}
            footer={
              <SaveFooter
                state={save.state}
                dirty={dirty}
                onSave={() =>
                  void save.run(async () => {
                    const next = await api.updateTemplate(template.id, draft);
                    setTemplate(next);
                    setDraft(draftOf(next));
                    await reload();
                  })
                }
              />
            }
          >
            <InputGroup className="w-full max-w-none">
              <InputField index={0} label={t("Name")} value={draft.name} onChange={set("name")} />
              <InputField
                index={1}
                label={t("Subject")}
                value={draft.subject}
                onChange={set("subject")}
                placeholder={t("Empty uses the default subject")}
                spellCheck={false}
              />
            </InputGroup>
            <SourceArea label="HTML" value={draft.html} onChange={set("html")} rows={22} />
            <SourceArea
              label={t("Plain text")}
              value={draft.text}
              onChange={set("text")}
              rows={8}
              placeholder={t("Empty uses the default plain-text version")}
            />
          </Section>

          <Section
            tone="danger"
            icon={<Trash2 />}
            title={t("Delete template")}
            description={template.formCount ? t("Forms using it go back to the default template.") : undefined}
            footer={
              <Button variant="secondary" size="compact" onClick={() => setConfirmDelete(true)}>
                {t("Delete …")}
              </Button>
            }
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs selectedIndex={view} onSelect={setView} size="compact" className="w-max">
              <TabsItem index={0} label={t("Preview")} />
              <TabsItem index={1} label={t("Plain text")} />
            </Tabs>
            {preview ? (
              <StatusPill tone="neutral">
                {preview.sample === "submission" ? t("With the latest message") : t("With example data")}
              </StatusPill>
            ) : null}
          </div>

          {previewError ? (
            <Banner status="error">
              <BannerTitle>{t("The template has an error")}</BannerTitle>
              <BannerDescription className="font-mono break-words">{previewError}</BannerDescription>
            </Banner>
          ) : null}
          {preview?.warnings.length ? (
            <Banner status="warning">
              <BannerTitle>{t("Unknown variables stay empty")}</BannerTitle>
              <BannerDescription className="font-mono break-words">{preview.warnings.join(", ")}</BannerDescription>
            </Banner>
          ) : null}

          {preview ? (
            <div className="group-surface overflow-hidden">
              <div className="hairline-bottom flex items-baseline gap-2 px-4 py-2.5">
                <span className={cn(typeClass("caption", "compact"), "shrink-0 text-muted-foreground")}>{t("Subject")}</span>
                <span className={cn(typeClass("body", "compact"), "truncate text-foreground")}>{preview.subject}</span>
              </div>
              {view === 0 ? (
                <iframe
                  title={t("Preview")}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={preview.html}
                  className={cn("block h-[640px] w-full bg-white", previewError && "opacity-60")}
                />
              ) : (
                <pre className={cn(typeClass("caption", "compact"), "max-h-[640px] overflow-auto px-4 py-3 font-mono whitespace-pre-wrap text-foreground")}>
                  {preview.text}
                </pre>
              )}
            </div>
          ) : (
            <div className="group-surface flex h-40 items-center justify-center text-muted-foreground">
              <TriangleAlert className="mr-2 size-4" /> {t("No preview yet")}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("Delete {name}?", { name: template.name })}
        description={
          template.formCount
            ? t("{n} forms use this template and will send the default template instead.", { n: template.formCount })
            : t("No form uses this template.")
        }
        confirmLabel={t("Delete permanently")}
        onOpenChange={setConfirmDelete}
        onConfirm={async () => {
          await api.deleteTemplate(template.id);
          await reload();
          navigate(`/projects/${template.projectId}?tab=templates`);
        }}
      />
    </>
  );
}
