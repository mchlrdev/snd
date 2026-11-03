import { instanceUrl, type Config } from "./config.js";
import type { SecretBox } from "./crypto.js";
import { submissionsToCsv } from "./csv.js";
import { AppError } from "./errors.js";
import { newAccessKey, newMcpToken } from "./ids.js";
import { sendTestMail, type Mailer } from "./mail.js";
import { normalizeOrigins } from "./origin.js";
import { formSnippet } from "./snippet.js";
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
    throw new AppError(400, "SMTP-Passwort fehlt.");
  }
  return {
    host: patch.host,
    port: patch.port,
    user: patch.user,
    from: patch.from,
    passEnc: password ? "" : (current?.passEnc ?? ""),
  };
}

function validateRecipients(recipients: string[]): string[] {
  if (recipients.length === 0) throw new AppError(400, "Mindestens ein Empfänger ist nötig.");
  const out: string[] = [];
  for (const raw of recipients) {
    const email = raw.trim();
    if (!isEmail(email)) throw new AppError(400, `Ungültige Empfängeradresse: ${raw}`);
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

function asNotify(value: string | null | undefined): NotifyPolicy | null {
  if (value == null) return null;
  if (value === "immediate" || value === "abandoned" || value === "off") return value;
  throw new AppError(400, "Ungültige Benachrichtigung.");
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
    return {
      id: form.id,
      projectId: form.projectId,
      name: form.name,
      accessKey: form.accessKey,
      recipients: form.recipients,
      smtp: smtpView(form.smtp),
      turnstileSet: Boolean(form.turnstileSecretEnc),
      notifyPolicy: form.notifyPolicy,
      snippet: formSnippet(`${base}/submit`, form.accessKey),
      submitUrl: `${base}/submit`,
      submissionCount: store.countSubmissions({ formId: form.id }),
      failedCount: store.countWhere({ formId: form.id, unacknowledged: true }),
      createdAt: form.createdAt,
    };
  }

  function submissionView(id: string): SubmissionView {
    const submission = store.getSubmission(id);
    if (!submission) throw new AppError(404, "Submission nicht gefunden.");
    const form = store.getForm(submission.formId);
    if (!form) throw new AppError(404, "Submission nicht gefunden.");
    const project = store.getProject(form.projectId);
    if (!project) throw new AppError(404, "Submission nicht gefunden.");
    return {
      id: submission.id,
      formId: form.id,
      formName: form.name,
      projectId: project.id,
      projectLabel: project.label,
      fields: submission.fields,
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
    if (!project) throw new AppError(404, "Project nicht gefunden.");
    return project;
  }

  function requireForm(id: string) {
    const form = store.getForm(id);
    if (!form) throw new AppError(404, "Form nicht gefunden.");
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
      };
    },

    updateSettings(patch: {
      adminSmtp?: SmtpPatch | null;
      notifyPolicy?: NotifyPolicy;
      retentionDays?: number | null;
    }): SettingsView {
      const current = store.getSettings();
      let adminSmtp = current.adminSmtp;
      if (patch.adminSmtp !== undefined) {
        const merged = mergeSmtp(current.adminSmtp, patch.adminSmtp);
        adminSmtp = encryptSmtp(merged, patch.adminSmtp?.password);
      }
      if (patch.notifyPolicy) asNotify(patch.notifyPolicy);
      if (patch.retentionDays != null && (patch.retentionDays < 1 || !Number.isInteger(patch.retentionDays))) {
        throw new AppError(400, "Aufbewahrung muss eine ganze Zahl von Tagen sein.");
      }
      store.updateSettings({
        adminSmtp,
        notifyPolicy: patch.notifyPolicy,
        retentionDays: patch.retentionDays,
      });
      return this.getSettings();
    },

    async testAdminSmtp(to: string): Promise<void> {
      if (!isEmail(to)) throw new AppError(400, "Ungültige Testadresse.");
      const settings = store.getSettings();
      if (!settings.adminSmtp) throw new AppError(400, "Kein Admin-SMTP konfiguriert.");
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
      if (!label) throw new AppError(400, "Label fehlt.");
      let origins: string[];
      try {
        origins = normalizeOrigins(input.origins ?? []);
      } catch (error) {
        throw new AppError(400, error instanceof Error ? error.message : "Ungültige Origins.");
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
          throw new AppError(400, error instanceof Error ? error.message : "Ungültige Origins.");
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
      if (!store.deleteProject(id)) throw new AppError(404, "Project nicht gefunden.");
    },

    exportProjectCsv(id: string): string {
      requireProject(id);
      return submissionsToCsv(store.listSubmissionsForExport({ projectId: id }));
    },

    async testProjectSmtp(id: string, to: string): Promise<void> {
      if (!isEmail(to)) throw new AppError(400, "Ungültige Testadresse.");
      const project = requireProject(id);
      if (!project.smtp) throw new AppError(400, "Kein Project-SMTP konfiguriert.");
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
      },
      requestUrl?: string,
    ): FormView {
      requireProject(projectId);
      const name = input.name.trim();
      if (!name) throw new AppError(400, "Name fehlt.");
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
      },
      requestUrl?: string,
    ): FormView {
      const current = requireForm(id);
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
      });
      return formView(updated!, requestUrl);
    },

    deleteForm(id: string): void {
      if (!store.deleteForm(id)) throw new AppError(404, "Form nicht gefunden.");
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
      if (!isEmail(to)) throw new AppError(400, "Ungültige Testadresse.");
      const form = requireForm(id);
      const project = requireProject(form.projectId);
      const smtp = form.smtp ?? project.smtp;
      if (!smtp) throw new AppError(400, "Kein SMTP-Konto für dieses Formular.");
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

    /** Kennzahlen und Zeitreihe für das Dashboard, eine Website oder ein Formular. */
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
        throw new AppError(400, error instanceof Error ? error.message : "Ungültiger Zeitraum.");
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

    /** Favicon der ersten Website-Adresse, 7 Tage zwischengespeichert. */
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

    /** Zustellprobleme eines Formulars oder einer Website zur Kenntnis nehmen. */
    acknowledgeFailures(filter: { formId?: string; projectId?: string }): { acknowledged: number } {
      if (filter.formId) requireForm(filter.formId);
      if (filter.projectId) requireProject(filter.projectId);
      return { acknowledged: store.acknowledgeFailures(filter, now()) };
    },

    getSubmission(id: string): SubmissionView {
      return submissionView(id);
    },

    deleteSubmission(id: string): void {
      if (!store.deleteSubmission(id)) throw new AppError(404, "Submission nicht gefunden.");
    },

    resendSubmission(id: string): SubmissionView {
      const submission = store.getSubmission(id);
      if (!submission) throw new AppError(404, "Submission nicht gefunden.");
      store.updateMailState(id, {
        mailStatus: "queued",
        mailAttempts: 0,
        lastError: null,
        nextAttemptAt: now(),
      });
      store.db.prepare("UPDATE submissions SET failure_ack_at = NULL WHERE id = ?").run(id);
      return submissionView(id);
    },

    /** Alle endgültig gescheiterten Zustellungen eines Formulars neu einreihen. */
    resendFailures(formId: string): { queued: number } {
      requireForm(formId);
      const { items } = store.listSubmissions({ formId, status: "failed", limit: 10_000, offset: 0 });
      for (const item of items) this.resendSubmission(item.id);
      return { queued: items.length };
    },
  };
}
