import { instanceUrl, type Config } from "./config.js";
import type { SecretBox } from "./crypto.js";
import { submissionsToCsv } from "./csv.js";
import { AppError } from "./errors.js";
import { newAccessKey, newMcpToken } from "./ids.js";
import { sendTestMail, type Mailer } from "./mail.js";
import { normalizeOrigins } from "./origin.js";
import { formSnippet, scriptSnippet } from "./snippet.js";
import { isEmail } from "./submit.js";
import type { Store } from "./store.js";
import type {
  FormView,
  NotifyPolicy,
  ProjectView,
  SettingsView,
  SmtpInput,
  SmtpPatch,
  SmtpRecord,
  SmtpView,
  SubmissionFilter,
  SubmissionView,
} from "./types.js";
import { computeStats, resolveRange, safeTimeZone, type Stats, type StatsRequest } from "./stats.js";
import { fetchFavicon } from "./favicon.js";
import { asLocale, LOCALES, type Locale } from "./i18n.js";
import {
  compileTemplate,
  defaultTemplate,
  renderCompiled,
  templateData,
  TEMPLATE_REFERENCE,
  unknownVariables,
  type NotificationInput,
  type TemplateSource,
} from "./notification.js";
import type { TemplateRecord, TemplateView } from "./types.js";

export type Operator = ReturnType<typeof createOperator>;

function smtpView(record: SmtpRecord | null): SmtpView | null {
  if (!record) return null;
  return {
    host: record.host,
    port: record.port,
    user: record.user,
    from: record.from,
    passwordSet: Boolean(record.passEnc),
  };
}

function mergeSmtp(current: SmtpRecord | null, patch: SmtpPatch | SmtpInput | null | undefined): SmtpRecord | null {
  if (patch === undefined) return current;
  if (patch === null) return null;
  const password = "password" in patch && patch.password ? patch.password : null;
  if (!current && !password) {
    throw new AppError(400, "SMTP password is missing.");
  }
  return {
    host: patch.host,
    port: patch.port,
    user: patch.user,
    from: patch.from,
    passEnc: password ? "" : (current?.passEnc ?? ""),
  };
}

function validateRecipients(recipients: unknown): string[] {
  if (!Array.isArray(recipients) || recipients.length === 0) throw new AppError(400, "At least one recipient is required.");
  const out: string[] = [];
  for (const raw of recipients) {
    const email = typeof raw === "string" ? raw.trim() : "";
    if (!isEmail(email)) throw new AppError(400, `Invalid recipient address: ${raw}`);
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

const MAX_LABELS = 50;
const MAX_LABEL_LENGTH = 200;

/** Empty titles are dropped; field names and titles are trimmed. */
function validateFieldLabels(input: unknown): Record<string, string> {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new AppError(400, "Field titles must be an object.");
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (typeof rawValue !== "string") throw new AppError(400, `The field title for ${rawKey} must be text.`);
    const key = rawKey.trim();
    const value = rawValue.trim();
    if (!key || !value) continue;
    if (key.length > MAX_LABEL_LENGTH || value.length > MAX_LABEL_LENGTH) {
      throw new AppError(400, `Field titles may have at most ${MAX_LABEL_LENGTH} characters.`);
    }
    out[key] = value;
  }
  if (Object.keys(out).length > MAX_LABELS) throw new AppError(400, `At most ${MAX_LABELS} field titles.`);
  return out;
}

/** Field names to leave out of the mail; trimmed, empty and repeated names dropped. */
function validateHiddenFields(input: unknown): string[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new AppError(400, "Hidden fields must be a list of field names.");
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") throw new AppError(400, "Hidden fields must be a list of field names.");
    const name = raw.trim();
    if (!name || out.includes(name)) continue;
    if (name.length > MAX_LABEL_LENGTH) throw new AppError(400, `Field names may have at most ${MAX_LABEL_LENGTH} characters.`);
    out.push(name);
  }
  if (out.length > MAX_LABELS) throw new AppError(400, `At most ${MAX_LABELS} hidden fields.`);
  return out;
}

const MAX_TEMPLATES_PER_PROJECT = 50;
const MAX_TEMPLATE_NAME = 100;
const MAX_SUBJECT_SOURCE = 1000;
const MAX_HTML_SOURCE = 200 * 1024;
const MAX_TEXT_SOURCE = 100 * 1024;

function checkTemplateSizes(source: TemplateSource): void {
  if (source.subject.length > MAX_SUBJECT_SOURCE) throw new AppError(400, `The subject template may have at most ${MAX_SUBJECT_SOURCE} characters.`);
  if (source.html.length > MAX_HTML_SOURCE) throw new AppError(400, "The HTML template may be at most 200 KB.");
  if (source.text.length > MAX_TEXT_SOURCE) throw new AppError(400, "The text template may be at most 100 KB.");
}

const SAMPLE_FIELDS: Record<Locale, Record<string, string>> = {
  en: { name: "Jane Doe", email: "jane@example.com", message: "Hello,\nI would like to know more about your offer.\n\nBest regards\nJane" },
  de: { name: "Erika Mustermann", email: "erika@example.com", message: "Hallo,\nich hätte gern mehr Infos zu eurem Angebot.\n\nViele Grüße\nErika" },
};

function asNotify(value: string | null | undefined): NotifyPolicy | null {
  if (value == null) return null;
  if (value === "immediate" || value === "abandoned" || value === "off") return value;
  throw new AppError(400, "Invalid notification policy.");
}

export function createOperator(opts: {
  store: Store;
  box: SecretBox;
  mailer: Mailer;
  config: Config;
  now: () => number;
  fetchIcon?: (origin: string) => Promise<{ contentType: string; data: Buffer } | null>;
}) {
  const { store, box, mailer, config, now } = opts;
  const fetchIcon = opts.fetchIcon ?? ((origin: string) => fetchFavicon(origin));

  function encryptSmtp(record: SmtpRecord | null, password: string | undefined): SmtpRecord | null {
    if (!record) return null;
    return {
      ...record,
      passEnc: password ? box.encrypt(password) : record.passEnc,
    };
  }

  function projectView(project: NonNullable<ReturnType<Store["getProject"]>>): ProjectView {
    return {
      id: project.id,
      label: project.label,
      origins: project.origins,
      smtp: smtpView(project.smtp),
      notifyPolicy: project.notifyPolicy,
      formCount: store.countForms(project.id),
      submissionCount: store.countSubmissions({ projectId: project.id }),
      failedCount: store.countWhere({ projectId: project.id, unacknowledged: true }),
      createdAt: project.createdAt,
    };
  }

  function formView(form: NonNullable<ReturnType<Store["getForm"]>>, requestUrl?: string): FormView {
    const base = instanceUrl(config, requestUrl);
    const seen = store.seenFields(form.id);
    const locale = store.getSettings().locale;
    return {
      id: form.id,
      projectId: form.projectId,
      name: form.name,
      accessKey: form.accessKey,
      recipients: form.recipients,
      smtp: smtpView(form.smtp),
      turnstileSet: Boolean(form.turnstileSecretEnc),
      notifyPolicy: form.notifyPolicy,
      fieldLabels: form.fieldLabels,
      hiddenFields: form.hiddenFields,
      templateId: form.templateId,
      seenFields: seen.names,
      sentLabels: seen.labels,
      sentHidden: seen.hidden,
      snippet: formSnippet(`${base}/submit`, form.accessKey, locale),
      scriptSnippet: scriptSnippet({
        submitUrl: `${base}/submit`,
        accessKey: form.accessKey,
        locale,
        turnstile: Boolean(form.turnstileSecretEnc),
      }),
      submitUrl: `${base}/submit`,
      submissionCount: store.countSubmissions({ formId: form.id }),
      failedCount: store.countWhere({ formId: form.id, unacknowledged: true }),
      createdAt: form.createdAt,
    };
  }

  function submissionView(id: string): SubmissionView {
    const submission = store.getSubmission(id);
    if (!submission) throw new AppError(404, "Submission not found.");
    const form = store.getForm(submission.formId);
    if (!form) throw new AppError(404, "Submission not found.");
    const project = store.getProject(form.projectId);
    if (!project) throw new AppError(404, "Submission not found.");
    return {
      id: submission.id,
      formId: form.id,
      formName: form.name,
      projectId: project.id,
      projectLabel: project.label,
      fields: submission.fields,
      fieldLabels: submission.fieldLabels,
      hiddenFields: submission.hiddenFields,
      replyTo: submission.replyTo,
      subject: submission.subject,
      createdAt: submission.createdAt,
      mailStatus: submission.mailStatus,
      mailAttempts: submission.mailAttempts,
      lastError: submission.lastError,
      nextAttemptAt: submission.nextAttemptAt,
    };
  }

  function requireProject(id: string) {
    const project = store.getProject(id);
    if (!project) throw new AppError(404, "Project not found.");
    return project;
  }

  function requireTemplate(id: string): TemplateRecord {
    const template = store.getTemplate(id);
    if (!template) throw new AppError(404, "Template not found.");
    return template;
  }

  function templateView(template: TemplateRecord): TemplateView {
    return { ...template, formCount: store.countFormsUsingTemplate(template.id) };
  }

  /** Parses and test-renders a template; errors become a 400 naming part and line. */
  function checkTemplate(source: TemplateSource): string[] {
    checkTemplateSizes(source);
    const locale = store.getSettings().locale;
    try {
      const compiled = compileTemplate(source, locale);
      renderCompiled(compiled, templateData(sampleInput(null, null), config.timeZone, locale), locale);
      return unknownVariables(compiled);
    } catch (error) {
      throw new AppError(400, `Template error in ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** A real submission when there is one, otherwise example data. */
  function sampleInput(projectId: string | null, submissionId: string | null): NotificationInput & { sample: "submission" | "example" } {
    const locale = store.getSettings().locale;
    let submission = submissionId ? store.getSubmission(submissionId) : null;
    if (submissionId && !submission) throw new AppError(404, "Submission not found.");
    if (!submission && projectId) submission = store.listSubmissions({ projectId, limit: 1, offset: 0 }).items[0] ?? null;
    const project = projectId ? store.getProject(projectId) : null;
    if (submission) {
      const form = store.getForm(submission.formId);
      if (projectId && form?.projectId !== projectId) throw new AppError(400, "The submission belongs to another website.");
      return {
        id: submission.id,
        projectLabel: store.getProject(form?.projectId ?? "")?.label ?? project?.label ?? "",
        formName: form?.name ?? "",
        createdAt: submission.createdAt,
        fields: submission.fields,
        fieldLabels: { ...submission.fieldLabels, ...form?.fieldLabels },
        hiddenFields: [...new Set([...submission.hiddenFields, ...(form?.hiddenFields ?? [])])],
        replyTo: submission.replyTo,
        subject: submission.subject,
        sample: "submission",
      };
    }
    const fields = SAMPLE_FIELDS[locale];
    return {
      id: "example",
      projectLabel: project?.label ?? "Example website",
      formName: locale === "de" ? "Kontakt" : "Contact",
      createdAt: now(),
      fields,
      fieldLabels: {},
      hiddenFields: [],
      replyTo: fields.email!,
      subject: null,
      sample: "example",
    };
  }

  function validTemplateId(projectId: string, templateId: string | null | undefined): string | null | undefined {
    if (templateId === undefined || templateId === null || templateId === "") return templateId === "" ? null : templateId;
    const template = store.getTemplate(templateId);
    if (!template || template.projectId !== projectId) throw new AppError(400, "The template does not belong to this form's website.");
    return templateId;
  }

  function requireForm(id: string) {
    const form = store.getForm(id);
    if (!form) throw new AppError(404, "Form not found.");
    return form;
  }

  return {
    mcpBearer(): string | null {
      const enc = store.getSettings().mcpTokenEnc;
      if (!enc) return null;
      try {
        return box.decrypt(enc);
      } catch {
        return null;
      }
    },

    ensureMcpToken(seed?: string | null): string {
      const existing = this.mcpBearer();
      if (existing) return existing;
      const plain = seed?.trim() || newMcpToken();
      store.updateSettings({ mcpTokenEnc: box.encrypt(plain) });
      return plain;
    },

    rotateMcpToken(): SettingsView {
      store.updateSettings({ mcpTokenEnc: box.encrypt(newMcpToken()) });
      return this.getSettings();
    },

    getSettings(): SettingsView {
      const settings = store.getSettings();
      return {
        adminSmtp: smtpView(settings.adminSmtp),
        notifyPolicy: settings.notifyPolicy,
        retentionDays: settings.retentionDays,
        mcpToken: this.mcpBearer() ?? "",
        locale: settings.locale,
      };
    },

    updateSettings(patch: {
      adminSmtp?: SmtpPatch | null;
      notifyPolicy?: NotifyPolicy;
      retentionDays?: number | null;
      locale?: Locale;
    }): SettingsView {
      const current = store.getSettings();
      let adminSmtp = current.adminSmtp;
      if (patch.adminSmtp !== undefined) {
        const merged = mergeSmtp(current.adminSmtp, patch.adminSmtp);
        adminSmtp = encryptSmtp(merged, patch.adminSmtp?.password);
      }
      if (patch.notifyPolicy) asNotify(patch.notifyPolicy);
      if (patch.locale !== undefined && !LOCALES.includes(patch.locale)) {
        throw new AppError(400, `locale must be one of: ${LOCALES.join(", ")}.`);
      }
      if (patch.retentionDays != null && (patch.retentionDays < 1 || !Number.isInteger(patch.retentionDays))) {
        throw new AppError(400, "Retention must be a whole number of days.");
      }
      store.updateSettings({
        adminSmtp,
        notifyPolicy: patch.notifyPolicy,
        retentionDays: patch.retentionDays,
        locale: patch.locale === undefined ? undefined : asLocale(patch.locale),
      });
      return this.getSettings();
    },

    async testAdminSmtp(to: string): Promise<void> {
      if (!isEmail(to)) throw new AppError(400, "Invalid test address.");
      const settings = store.getSettings();
      if (!settings.adminSmtp) throw new AppError(400, "No admin SMTP configured.");
      await sendTestMail(mailer, box, settings.adminSmtp, to);
    },

    listProjects(): ProjectView[] {
      return store.listProjects().map((project) => projectView(project));
    },

    getProject(id: string): ProjectView {
      return projectView(requireProject(id));
    },

    createProject(input: {
      label: string;
      origins?: string[];
      smtp?: SmtpInput | null;
      notifyPolicy?: NotifyPolicy | null;
    }): ProjectView {
      const label = input.label.trim();
      if (!label) throw new AppError(400, "Label is missing.");
      let origins: string[];
      try {
        origins = normalizeOrigins(input.origins ?? []);
      } catch (error) {
        throw new AppError(400, error instanceof Error ? error.message : "Invalid origins.");
      }
      const smtp = encryptSmtp(mergeSmtp(null, input.smtp ?? null), input.smtp?.password);
      return projectView(
        store.createProject({
          label,
          origins,
          smtp,
          notifyPolicy: asNotify(input.notifyPolicy),
          now: now(),
        }),
      );
    },

    updateProject(
      id: string,
      patch: {
        label?: string;
        origins?: string[];
        smtp?: SmtpPatch | null;
        notifyPolicy?: NotifyPolicy | null;
      },
    ): ProjectView {
      const current = requireProject(id);
      let origins = current.origins;
      if (patch.origins !== undefined) {
        try {
          origins = normalizeOrigins(patch.origins);
        } catch (error) {
          throw new AppError(400, error instanceof Error ? error.message : "Invalid origins.");
        }
      }
      const smtp = encryptSmtp(mergeSmtp(current.smtp, patch.smtp), patch.smtp?.password);
      const updated = store.updateProject(id, {
        label: patch.label?.trim() || current.label,
        origins,
        smtp,
        notifyPolicy: patch.notifyPolicy === undefined ? current.notifyPolicy : asNotify(patch.notifyPolicy),
      });
      return projectView(updated!);
    },

    deleteProject(id: string): void {
      if (!store.deleteProject(id)) throw new AppError(404, "Project not found.");
    },

    exportProjectCsv(id: string): string {
      requireProject(id);
      return submissionsToCsv(store.listSubmissionsForExport({ projectId: id }));
    },

    async testProjectSmtp(id: string, to: string): Promise<void> {
      if (!isEmail(to)) throw new AppError(400, "Invalid test address.");
      const project = requireProject(id);
      if (!project.smtp) throw new AppError(400, "No project SMTP configured.");
      await sendTestMail(mailer, box, project.smtp, to);
    },

    listForms(projectId: string, requestUrl?: string): FormView[] {
      requireProject(projectId);
      return store.listForms(projectId).map((form) => formView(form, requestUrl));
    },

    getForm(id: string, requestUrl?: string): FormView {
      return formView(requireForm(id), requestUrl);
    },

    createForm(
      projectId: string,
      input: {
        name: string;
        recipients: string[];
        smtp?: SmtpInput | null;
        turnstileSecret?: string | null;
        notifyPolicy?: NotifyPolicy | null;
        fieldLabels?: Record<string, string> | null;
        hiddenFields?: string[] | null;
        templateId?: string | null;
      },
      requestUrl?: string,
    ): FormView {
      requireProject(projectId);
      const templateId = validTemplateId(projectId, input.templateId) ?? null;
      const name = input.name.trim();
      if (!name) throw new AppError(400, "Name is missing.");
      const recipients = validateRecipients(input.recipients);
      const smtp = encryptSmtp(mergeSmtp(null, input.smtp ?? null), input.smtp?.password);
      const turnstileSecretEnc = input.turnstileSecret ? box.encrypt(input.turnstileSecret) : null;
      return formView(
        store.createForm({
          projectId,
          name,
          accessKey: newAccessKey(),
          recipients,
          smtp,
          turnstileSecretEnc,
          notifyPolicy: asNotify(input.notifyPolicy),
          fieldLabels: validateFieldLabels(input.fieldLabels),
          hiddenFields: validateHiddenFields(input.hiddenFields),
          templateId,
          now: now(),
        }),
        requestUrl,
      );
    },

    updateForm(
      id: string,
      patch: {
        name?: string;
        recipients?: string[];
        smtp?: SmtpPatch | null;
        turnstileSecret?: string | null;
        notifyPolicy?: NotifyPolicy | null;
        /** Replaces all field titles; null clears them. */
        fieldLabels?: Record<string, string> | null;
        /** Replaces the list of fields left out of the mail; null clears it. */
        hiddenFields?: string[] | null;
        /** Mail template of the same website; null uses the default. */
        templateId?: string | null;
      },
      requestUrl?: string,
    ): FormView {
      const current = requireForm(id);
      const templateId = validTemplateId(current.projectId, patch.templateId);
      const smtp = encryptSmtp(mergeSmtp(current.smtp, patch.smtp), patch.smtp?.password);
      let turnstileSecretEnc = current.turnstileSecretEnc;
      if (patch.turnstileSecret === null) turnstileSecretEnc = null;
      else if (typeof patch.turnstileSecret === "string" && patch.turnstileSecret) {
        turnstileSecretEnc = box.encrypt(patch.turnstileSecret);
      }
      const updated = store.updateForm(id, {
        name: patch.name?.trim() || current.name,
        recipients: patch.recipients ? validateRecipients(patch.recipients) : current.recipients,
        smtp,
        turnstileSecretEnc,
        notifyPolicy: patch.notifyPolicy === undefined ? current.notifyPolicy : asNotify(patch.notifyPolicy),
        fieldLabels: patch.fieldLabels === undefined ? current.fieldLabels : validateFieldLabels(patch.fieldLabels),
        hiddenFields: patch.hiddenFields === undefined ? current.hiddenFields : validateHiddenFields(patch.hiddenFields),
        templateId,
      });
      return formView(updated!, requestUrl);
    },

    listTemplates(projectId: string): TemplateView[] {
      requireProject(projectId);
      return store.listTemplates(projectId).map(templateView);
    },

    getTemplate(id: string): TemplateView {
      return templateView(requireTemplate(id));
    },

    /** The built-in template in the instance language, plus the syntax and
     *  variable reference. The starting point for a custom template. */
    defaultTemplate(): TemplateSource & { locale: Locale; reference: string } {
      const locale = store.getSettings().locale;
      return { ...defaultTemplate(locale), locale, reference: TEMPLATE_REFERENCE };
    },

    /** Without html, the template starts as a copy of the default. */
    createTemplate(
      projectId: string,
      input: { name: string; subject?: string; html?: string; text?: string },
    ): TemplateView & { warnings: string[] } {
      requireProject(projectId);
      const name = input.name.trim().slice(0, MAX_TEMPLATE_NAME);
      if (!name) throw new AppError(400, "Name is missing.");
      if (store.countTemplates(projectId) >= MAX_TEMPLATES_PER_PROJECT) {
        throw new AppError(400, `A website can have at most ${MAX_TEMPLATES_PER_PROJECT} templates.`);
      }
      const base = defaultTemplate(store.getSettings().locale);
      const fromDefault = !input.html?.trim();
      const source: TemplateSource = {
        subject: input.subject ?? (fromDefault ? base.subject : ""),
        html: fromDefault ? base.html : input.html!,
        text: input.text ?? (fromDefault ? base.text : ""),
      };
      const warnings = checkTemplate(source);
      const created = store.createTemplate({ projectId, name, ...source, now: now() });
      return { ...templateView(created), warnings };
    },

    updateTemplate(
      id: string,
      patch: { name?: string; subject?: string; html?: string; text?: string },
    ): TemplateView & { warnings: string[] } {
      const current = requireTemplate(id);
      const name = patch.name === undefined ? current.name : patch.name.trim().slice(0, MAX_TEMPLATE_NAME);
      if (!name) throw new AppError(400, "Name is missing.");
      const source: TemplateSource = {
        subject: patch.subject ?? current.subject,
        html: patch.html ?? current.html,
        text: patch.text ?? current.text,
      };
      const warnings = checkTemplate(source);
      const updated = store.updateTemplate(id, { name, ...source, now: now() });
      return { ...templateView(updated!), warnings };
    },

    deleteTemplate(id: string): void {
      if (!store.deleteTemplate(id)) throw new AppError(404, "Template not found.");
    },

    /**
     * Renders a template without saving: a saved one (templateId), unsaved
     * sources, or the default when neither is given. Uses the given submission,
     * else the website's latest one, else example data.
     */
    previewTemplate(input: {
      projectId?: string;
      templateId?: string;
      subject?: string;
      html?: string;
      text?: string;
      submissionId?: string;
    }): { subject: string; html: string; text: string; warnings: string[]; sample: "submission" | "example" } {
      const locale = store.getSettings().locale;
      let projectId = input.projectId ?? null;
      let source: TemplateSource;
      if (input.templateId) {
        const saved = requireTemplate(input.templateId);
        projectId = saved.projectId;
        source = { subject: input.subject ?? saved.subject, html: input.html ?? saved.html, text: input.text ?? saved.text };
      } else if (input.html !== undefined) {
        source = { subject: input.subject ?? "", html: input.html, text: input.text ?? "" };
      } else {
        source = defaultTemplate(locale);
      }
      if (projectId) requireProject(projectId);
      checkTemplateSizes(source);
      const { sample, ...sampleData } = sampleInput(projectId, input.submissionId ?? null);
      try {
        const compiled = compileTemplate(source, locale);
        const rendered = renderCompiled(compiled, templateData(sampleData, config.timeZone, locale), locale);
        return { ...rendered, warnings: unknownVariables(compiled), sample };
      } catch (error) {
        throw new AppError(400, `Template error in ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    deleteForm(id: string): void {
      if (!store.deleteForm(id)) throw new AppError(404, "Form not found.");
    },

    rotateAccessKey(id: string, requestUrl?: string): FormView {
      requireForm(id);
      const updated = store.updateForm(id, { accessKey: newAccessKey() });
      return formView(updated!, requestUrl);
    },

    exportFormCsv(id: string): string {
      requireForm(id);
      return submissionsToCsv(store.listSubmissionsForExport({ formId: id }));
    },

    async testFormSmtp(id: string, to: string): Promise<void> {
      if (!isEmail(to)) throw new AppError(400, "Invalid test address.");
      const form = requireForm(id);
      const project = requireProject(form.projectId);
      const smtp = form.smtp ?? project.smtp;
      if (!smtp) throw new AppError(400, "No SMTP account for this form.");
      await sendTestMail(mailer, box, smtp, to);
    },

    listSubmissions(filter: SubmissionFilter & { limit?: number; offset?: number }): {
      items: SubmissionView[];
      total: number;
    } {
      if (filter.formId) requireForm(filter.formId);
      if (filter.projectId) requireProject(filter.projectId);
      const limit = Math.min(Math.max(Math.trunc(Number(filter.limit) || 50), 1), 200);
      const offset = Math.max(Math.trunc(Number(filter.offset) || 0), 0);
      const { items, total } = store.listSubmissions({ ...filter, limit, offset });
      return { items: items.map((item) => submissionView(item.id)), total };
    },

    /** Key figures and time series for the dashboard, a website or a form. */
    stats(request: StatsRequest): Stats & {
      forms: { id: string; name: string; projectId: string }[];
      projects: { id: string; label: string }[];
    } {
      const { filter } = request;
      if (filter.formId) requireForm(filter.formId);
      if (filter.projectId) requireProject(filter.projectId);
      let range;
      try {
        range = resolveRange(request, now());
      } catch (error) {
        throw new AppError(400, error instanceof Error ? error.message : "Invalid time range.");
      }
      const span = range.until - range.since;
      const result = computeStats({
        rows: store.submissionsForStats({ ...filter, since: range.since, until: range.until }),
        previousTotal: store.countWhere({ ...filter, since: range.since - span, until: range.since }),
        ...range,
        timeZone: safeTimeZone(request.timeZone),
      });
      const projects = store.listProjects();
      return {
        ...result,
        projects: projects.map((project) => ({ id: project.id, label: project.label })),
        forms: projects.flatMap((project) =>
          store.listForms(project.id).map((form) => ({ id: form.id, name: form.name, projectId: project.id })),
        ),
      };
    },

    /** Favicon of the first website address, cached for 7 days. */
    async favicon(projectId: string): Promise<{ contentType: string; data: Buffer } | null> {
      const project = requireProject(projectId);
      const origin = project.origins[0];
      if (!origin) return null;
      const cached = store.getFavicon(projectId);
      const fresh = cached && cached.origin === origin && now() - cached.fetchedAt < (cached.data ? 7 : 1) * 24 * 60 * 60 * 1000;
      if (fresh) return cached.data && cached.contentType ? { contentType: cached.contentType, data: cached.data } : null;
      const icon = await fetchIcon(origin);
      store.putFavicon(projectId, origin, icon, now());
      return icon;
    },

    /** Acknowledge delivery problems of a form or a website. */
    acknowledgeFailures(filter: { formId?: string; projectId?: string }): { acknowledged: number } {
      if (filter.formId) requireForm(filter.formId);
      if (filter.projectId) requireProject(filter.projectId);
      return { acknowledged: store.acknowledgeFailures(filter, now()) };
    },

    getSubmission(id: string): SubmissionView {
      return submissionView(id);
    },

    deleteSubmission(id: string): void {
      if (!store.deleteSubmission(id)) throw new AppError(404, "Submission not found.");
    },

    resendSubmission(id: string): SubmissionView {
      const submission = store.getSubmission(id);
      if (!submission) throw new AppError(404, "Submission not found.");
      store.updateMailState(id, {
        mailStatus: "queued",
        mailAttempts: 0,
        lastError: null,
        nextAttemptAt: now(),
      });
      store.db.prepare("UPDATE submissions SET failure_ack_at = NULL WHERE id = ?").run(id);
      return submissionView(id);
    },

    /** Requeue all finally failed deliveries of a form. */
    resendFailures(formId: string): { queued: number } {
      requireForm(formId);
      const { items } = store.listSubmissions({ formId, status: "failed", limit: 10_000, offset: 0 });
      for (const item of items) this.resendSubmission(item.id);
      return { queued: items.length };
    },
  };
}
