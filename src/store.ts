import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { newId } from "./ids.js";
import type {
  FormRecord,
  MailJob,
  MailStatus,
  NotifyPolicy,
  DeliveryFilter,
  ProjectRecord,
  SettingsRecord,
  SubmissionFilter,
  SmtpRecord,
  SubmissionRecord,
} from "./types.js";

type Row = Record<string, unknown>;

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  admin_smtp_host TEXT,
  admin_smtp_port INTEGER,
  admin_smtp_user TEXT,
  admin_smtp_pass_enc TEXT,
  admin_smtp_from TEXT,
  notify_policy TEXT NOT NULL DEFAULT 'immediate',
  retention_days INTEGER,
  mcp_token_enc TEXT
);

INSERT OR IGNORE INTO settings (id, notify_policy) VALUES (1, 'immediate');

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  origins TEXT NOT NULL,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass_enc TEXT,
  smtp_from TEXT,
  notify_policy TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  access_key TEXT NOT NULL UNIQUE,
  recipients TEXT NOT NULL,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass_enc TEXT,
  smtp_from TEXT,
  turnstile_secret_enc TEXT,
  notify_policy TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  fields_json TEXT NOT NULL,
  reply_to TEXT,
  subject TEXT,
  created_at INTEGER NOT NULL,
  mail_status TEXT NOT NULL,
  mail_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_forms_project ON forms(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form ON submissions(form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_queue ON submissions(mail_status, next_attempt_at);
`;

function smtpFrom(row: Row, prefix: string): SmtpRecord | null {
  const host = row[`${prefix}host`];
  if (typeof host !== "string" || !host) return null;
  return {
    host,
    port: Number(row[`${prefix}port`] ?? 587),
    user: String(row[`${prefix}user`] ?? ""),
    passEnc: String(row[`${prefix}pass_enc`] ?? ""),
    from: String(row[`${prefix}from`] ?? ""),
  };
}

function smtpColumns(smtp: SmtpRecord | null): {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass_enc: string | null;
  smtp_from: string | null;
} {
  if (!smtp) {
    return {
      smtp_host: null,
      smtp_port: null,
      smtp_user: null,
      smtp_pass_enc: null,
      smtp_from: null,
    };
  }
  return {
    smtp_host: smtp.host,
    smtp_port: smtp.port,
    smtp_user: smtp.user,
    smtp_pass_enc: smtp.passEnc,
    smtp_from: smtp.from,
  };
}

function parseOrigins(raw: string): string[] {
  return JSON.parse(raw) as string[];
}

function parseRecipients(raw: string): string[] {
  return JSON.parse(raw) as string[];
}

function asNotify(value: unknown): NotifyPolicy {
  if (value === "immediate" || value === "abandoned" || value === "off") return value;
  return "immediate";
}

function asNotifyOrNull(value: unknown): NotifyPolicy | null {
  if (value === "immediate" || value === "abandoned" || value === "off") return value;
  return null;
}

function projectFrom(row: Row): ProjectRecord {
  return {
    id: String(row.id),
    label: String(row.label),
    origins: parseOrigins(String(row.origins)),
    smtp: smtpFrom(row, "smtp_"),
    notifyPolicy: asNotifyOrNull(row.notify_policy),
    createdAt: Number(row.created_at),
  };
}

function formFrom(row: Row): FormRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    accessKey: String(row.access_key),
    recipients: parseRecipients(String(row.recipients)),
    smtp: smtpFrom(row, "smtp_"),
    turnstileSecretEnc: row.turnstile_secret_enc ? String(row.turnstile_secret_enc) : null,
    notifyPolicy: row.notify_policy ? asNotify(row.notify_policy) : null,
    fieldLabels: parseLabels(row.field_labels),
    createdAt: Number(row.created_at),
  };
}

function parseLabels(raw: unknown): Record<string, string> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const labels: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") labels[key] = value;
    }
    return labels;
  } catch {
    return {};
  }
}

function submissionFrom(row: Row): SubmissionRecord {
  return {
    id: String(row.id),
    formId: String(row.form_id),
    projectId: String(row.project_id ?? ""),
    fields: JSON.parse(String(row.fields_json)) as Record<string, string>,
    replyTo: row.reply_to ? String(row.reply_to) : null,
    subject: row.subject ? String(row.subject) : null,
    createdAt: Number(row.created_at),
    mailStatus: String(row.mail_status) as MailStatus,
    mailAttempts: Number(row.mail_attempts),
    lastError: row.last_error ? String(row.last_error) : null,
    nextAttemptAt: row.next_attempt_at == null ? null : Number(row.next_attempt_at),
  };
}

const DELIVERY_SQL: Record<DeliveryFilter, string> = {
  delivered: "s.mail_status = 'sent'",
  pending: "s.mail_status IN ('queued', 'failed')",
  failed: "s.mail_status = 'abandoned'",
};

/** WHERE-Klausel und Parameter für einen Nachrichtenfilter. Alle Werte gehen
 *  als Parameter in die Abfrage, nie als Text. */
function submissionWhere(filter: SubmissionFilter): { clause: string; params: Record<string, unknown> } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.formId) {
    where.push("s.form_id = @formId");
    params.formId = filter.formId;
  }
  if (filter.projectId) {
    where.push("f.project_id = @projectId");
    params.projectId = filter.projectId;
  }
  if (filter.since != null) {
    where.push("s.created_at >= @since");
    params.since = filter.since;
  }
  if (filter.until != null) {
    where.push("s.created_at < @until");
    params.until = filter.until;
  }
  if (filter.status) where.push(DELIVERY_SQL[filter.status]);
  if (filter.unacknowledged) where.push("s.mail_status = 'abandoned' AND s.failure_ack_at IS NULL");
  if (filter.query) {
    where.push("s.fields_json LIKE @query ESCAPE '\\'");
    params.query = `%${filter.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  if (filter.field && filter.value != null) {
    where.push("json_extract(s.fields_json, @fieldPath) = @fieldValue");
    params.fieldPath = `$."${filter.field.replaceAll('"', '""')}"`;
    params.fieldValue = filter.value;
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

export class Store {
  readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(SCHEMA);
    this.migrate();
  }

  private migrate(): void {
    const cols = this.db.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
    if (!cols.some((col) => col.name === "mcp_token_enc")) {
      this.db.exec("ALTER TABLE settings ADD COLUMN mcp_token_enc TEXT");
    }
    const submissionCols = this.db.prepare("PRAGMA table_info(submissions)").all() as { name: string }[];
    if (!submissionCols.some((col) => col.name === "failure_ack_at")) {
      // Wann der Operator eine endgültig gescheiterte Zustellung zur Kenntnis genommen hat.
      this.db.exec("ALTER TABLE submissions ADD COLUMN failure_ack_at INTEGER");
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS favicons (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      origin TEXT NOT NULL,
      content_type TEXT,
      data BLOB,
      fetched_at INTEGER NOT NULL
    )`);
    const projectCols = this.db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    if (!projectCols.some((col) => col.name === "notify_policy")) {
      this.db.exec("ALTER TABLE projects ADD COLUMN notify_policy TEXT");
    }
    const formCols = this.db.prepare("PRAGMA table_info(forms)").all() as { name: string }[];
    if (!formCols.some((col) => col.name === "field_labels")) {
      this.db.exec("ALTER TABLE forms ADD COLUMN field_labels TEXT");
    }
  }

  close(): void {
    this.db.close();
  }

  backup(dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.backup(dest).then(() => resolve()).catch(reject);
    });
  }

  getSettings(): SettingsRecord {
    const row = this.db.prepare("SELECT * FROM settings WHERE id = 1").get() as Row;
    return {
      adminSmtp: smtpFrom(
        {
          host: row.admin_smtp_host,
          port: row.admin_smtp_port,
          user: row.admin_smtp_user,
          pass_enc: row.admin_smtp_pass_enc,
          from: row.admin_smtp_from,
        },
        "",
      ),
      notifyPolicy: asNotify(row.notify_policy),
      retentionDays: row.retention_days == null ? null : Number(row.retention_days),
      mcpTokenEnc: row.mcp_token_enc ? String(row.mcp_token_enc) : null,
    };
  }

  updateSettings(patch: {
    adminSmtp?: SmtpRecord | null;
    notifyPolicy?: NotifyPolicy;
    retentionDays?: number | null;
    mcpTokenEnc?: string | null;
  }): SettingsRecord {
    const current = this.getSettings();
    const smtp = patch.adminSmtp === undefined ? current.adminSmtp : patch.adminSmtp;
    const notifyPolicy = patch.notifyPolicy ?? current.notifyPolicy;
    const retentionDays = patch.retentionDays === undefined ? current.retentionDays : patch.retentionDays;
    const mcpTokenEnc = patch.mcpTokenEnc === undefined ? current.mcpTokenEnc : patch.mcpTokenEnc;
    this.db
      .prepare(
        `UPDATE settings SET
          admin_smtp_host = @host,
          admin_smtp_port = @port,
          admin_smtp_user = @user,
          admin_smtp_pass_enc = @pass,
          admin_smtp_from = @from,
          notify_policy = @notify,
          retention_days = @retention,
          mcp_token_enc = @mcp
        WHERE id = 1`,
      )
      .run({
        host: smtp?.host ?? null,
        port: smtp?.port ?? null,
        user: smtp?.user ?? null,
        pass: smtp?.passEnc ?? null,
        from: smtp?.from ?? null,
        notify: notifyPolicy,
        retention: retentionDays,
        mcp: mcpTokenEnc,
      });
    return this.getSettings();
  }

  listProjects(): ProjectRecord[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Row[];
    return rows.map(projectFrom);
  }

  getProject(id: string): ProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
    return row ? projectFrom(row) : null;
  }

  createProject(input: {
    label: string;
    origins: string[];
    smtp: SmtpRecord | null;
    notifyPolicy: NotifyPolicy | null;
    now: number;
  }): ProjectRecord {
    const id = newId();
    const smtp = smtpColumns(input.smtp);
    this.db
      .prepare(
        `INSERT INTO projects (id, label, origins, smtp_host, smtp_port, smtp_user, smtp_pass_enc, smtp_from, notify_policy, created_at)
         VALUES (@id, @label, @origins, @smtp_host, @smtp_port, @smtp_user, @smtp_pass_enc, @smtp_from, @notify_policy, @created_at)`,
      )
      .run({
        id,
        label: input.label,
        origins: JSON.stringify(input.origins),
        ...smtp,
        notify_policy: input.notifyPolicy,
        created_at: input.now,
      });
    return this.getProject(id)!;
  }

  updateProject(
    id: string,
    patch: { label?: string; origins?: string[]; smtp?: SmtpRecord | null; notifyPolicy?: NotifyPolicy | null },
  ): ProjectRecord | null {
    const current = this.getProject(id);
    if (!current) return null;
    const smtp = smtpColumns(patch.smtp === undefined ? current.smtp : patch.smtp);
    this.db
      .prepare(
        `UPDATE projects SET
          label = @label,
          origins = @origins,
          smtp_host = @smtp_host,
          smtp_port = @smtp_port,
          smtp_user = @smtp_user,
          smtp_pass_enc = @smtp_pass_enc,
          smtp_from = @smtp_from,
          notify_policy = @notify
        WHERE id = @id`,
      )
      .run({
        id,
        label: patch.label ?? current.label,
        origins: JSON.stringify(patch.origins ?? current.origins),
        ...smtp,
        notify: patch.notifyPolicy === undefined ? current.notifyPolicy : patch.notifyPolicy,
      });
    return this.getProject(id);
  }

  deleteProject(id: string): boolean {
    const result = this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return result.changes > 0;
  }

  listForms(projectId: string): FormRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM forms WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as Row[];
    return rows.map(formFrom);
  }

  getForm(id: string): FormRecord | null {
    const row = this.db.prepare("SELECT * FROM forms WHERE id = ?").get(id) as Row | undefined;
    return row ? formFrom(row) : null;
  }

  getFormByAccessKey(accessKey: string): FormRecord | null {
    const row = this.db.prepare("SELECT * FROM forms WHERE access_key = ?").get(accessKey) as Row | undefined;
    return row ? formFrom(row) : null;
  }

  createForm(input: {
    projectId: string;
    name: string;
    accessKey: string;
    recipients: string[];
    smtp: SmtpRecord | null;
    turnstileSecretEnc: string | null;
    notifyPolicy: NotifyPolicy | null;
    fieldLabels: Record<string, string>;
    now: number;
  }): FormRecord {
    const id = newId();
    const smtp = smtpColumns(input.smtp);
    this.db
      .prepare(
        `INSERT INTO forms (
          id, project_id, name, access_key, recipients,
          smtp_host, smtp_port, smtp_user, smtp_pass_enc, smtp_from,
          turnstile_secret_enc, notify_policy, field_labels, created_at
        ) VALUES (
          @id, @project_id, @name, @access_key, @recipients,
          @smtp_host, @smtp_port, @smtp_user, @smtp_pass_enc, @smtp_from,
          @turnstile_secret_enc, @notify_policy, @field_labels, @created_at
        )`,
      )
      .run({
        id,
        project_id: input.projectId,
        name: input.name,
        access_key: input.accessKey,
        recipients: JSON.stringify(input.recipients),
        ...smtp,
        turnstile_secret_enc: input.turnstileSecretEnc,
        notify_policy: input.notifyPolicy,
        field_labels: JSON.stringify(input.fieldLabels),
        created_at: input.now,
      });
    return this.getForm(id)!;
  }

  updateForm(
    id: string,
    patch: {
      name?: string;
      accessKey?: string;
      recipients?: string[];
      smtp?: SmtpRecord | null;
      turnstileSecretEnc?: string | null;
      notifyPolicy?: NotifyPolicy | null;
      fieldLabels?: Record<string, string>;
    },
  ): FormRecord | null {
    const current = this.getForm(id);
    if (!current) return null;
    const smtp = smtpColumns(patch.smtp === undefined ? current.smtp : patch.smtp);
    const turnstile =
      patch.turnstileSecretEnc === undefined ? current.turnstileSecretEnc : patch.turnstileSecretEnc;
    const notifyPolicy = patch.notifyPolicy === undefined ? current.notifyPolicy : patch.notifyPolicy;
    this.db
      .prepare(
        `UPDATE forms SET
          name = @name,
          access_key = @access_key,
          recipients = @recipients,
          smtp_host = @smtp_host,
          smtp_port = @smtp_port,
          smtp_user = @smtp_user,
          smtp_pass_enc = @smtp_pass_enc,
          smtp_from = @smtp_from,
          turnstile_secret_enc = @turnstile_secret_enc,
          notify_policy = @notify_policy,
          field_labels = @field_labels
        WHERE id = @id`,
      )
      .run({
        id,
        name: patch.name ?? current.name,
        access_key: patch.accessKey ?? current.accessKey,
        recipients: JSON.stringify(patch.recipients ?? current.recipients),
        ...smtp,
        turnstile_secret_enc: turnstile,
        notify_policy: notifyPolicy,
        field_labels: JSON.stringify(patch.fieldLabels ?? current.fieldLabels),
      });
    return this.getForm(id);
  }

  deleteForm(id: string): boolean {
    const result = this.db.prepare("DELETE FROM forms WHERE id = ?").run(id);
    return result.changes > 0;
  }

  createSubmission(input: {
    formId: string;
    fields: Record<string, string>;
    replyTo: string | null;
    subject: string | null;
    now: number;
  }): SubmissionRecord {
    const id = newId();
    this.db
      .prepare(
        `INSERT INTO submissions (
          id, form_id, fields_json, reply_to, subject, created_at,
          mail_status, mail_attempts, last_error, next_attempt_at
        ) VALUES (
          @id, @form_id, @fields_json, @reply_to, @subject, @created_at,
          'queued', 0, NULL, @created_at
        )`,
      )
      .run({
        id,
        form_id: input.formId,
        fields_json: JSON.stringify(input.fields),
        reply_to: input.replyTo,
        subject: input.subject,
        created_at: input.now,
      });
    return this.getSubmission(id)!;
  }

  getSubmission(id: string): SubmissionRecord | null {
    const row = this.db
      .prepare(
        `SELECT s.*, f.project_id FROM submissions s JOIN forms f ON f.id = s.form_id WHERE s.id = ?`,
      )
      .get(id) as Row | undefined;
    return row ? submissionFrom(row) : null;
  }

  deleteSubmission(id: string): boolean {
    const result = this.db.prepare("DELETE FROM submissions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  listSubmissions(filter: SubmissionFilter & { limit: number; offset: number }): {
    items: SubmissionRecord[];
    total: number;
  } {
    const { clause, params: base } = submissionWhere(filter);
    const params = { ...base, limit: filter.limit, offset: filter.offset };
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM submissions s JOIN forms f ON f.id = s.form_id ${clause}`)
        .get(params) as { n: number }
    ).n;
    const rows = this.db
      .prepare(
        `SELECT s.*, f.project_id FROM submissions s
         JOIN forms f ON f.id = s.form_id
         ${clause}
         ORDER BY s.created_at DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(params) as Row[];
    return { items: rows.map(submissionFrom), total };
  }

  countForms(projectId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM forms WHERE project_id = ?").get(projectId) as { n: number }).n;
  }

  countWhere(filter: SubmissionFilter): number {
    const { clause, params } = submissionWhere(filter);
    return (
      this.db.prepare(`SELECT COUNT(*) AS n FROM submissions s JOIN forms f ON f.id = s.form_id ${clause}`).get(params) as {
        n: number;
      }
    ).n;
  }

  /** Zeitstempel, Status und Felder im Zeitraum – Rohdaten für Auswertungen. */
  submissionsForStats(filter: SubmissionFilter): { createdAt: number; mailStatus: MailStatus; formId: string; projectId: string; fields: Record<string, string> }[] {
    const { clause, params } = submissionWhere(filter);
    const rows = this.db
      .prepare(
        `SELECT s.created_at, s.mail_status, s.form_id, f.project_id, s.fields_json FROM submissions s
         JOIN forms f ON f.id = s.form_id ${clause} ORDER BY s.created_at ASC`,
      )
      .all(params) as Row[];
    return rows.map((row) => ({
      createdAt: Number(row.created_at),
      mailStatus: String(row.mail_status) as MailStatus,
      formId: String(row.form_id),
      projectId: String(row.project_id),
      fields: JSON.parse(String(row.fields_json)) as Record<string, string>,
    }));
  }

  /** Quittiert alle offenen Zustellprobleme im Filter. */
  acknowledgeFailures(filter: SubmissionFilter, at: number): number {
    const { clause, params } = submissionWhere({ ...filter, unacknowledged: true });
    return this.db
      .prepare(
        `UPDATE submissions SET failure_ack_at = @at WHERE id IN (SELECT s.id FROM submissions s JOIN forms f ON f.id = s.form_id ${clause})`,
      )
      .run({ ...params, at }).changes;
  }

  getFavicon(projectId: string): { origin: string; contentType: string | null; data: Buffer | null; fetchedAt: number } | null {
    const row = this.db.prepare("SELECT * FROM favicons WHERE project_id = ?").get(projectId) as Row | undefined;
    if (!row) return null;
    return {
      origin: String(row.origin),
      contentType: row.content_type ? String(row.content_type) : null,
      data: row.data ? (row.data as Buffer) : null,
      fetchedAt: Number(row.fetched_at),
    };
  }

  putFavicon(projectId: string, origin: string, icon: { contentType: string; data: Buffer } | null, now: number): void {
    this.db
      .prepare(
        `INSERT INTO favicons (project_id, origin, content_type, data, fetched_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET origin = excluded.origin, content_type = excluded.content_type,
           data = excluded.data, fetched_at = excluded.fetched_at`,
      )
      .run(projectId, origin, icon?.contentType ?? null, icon?.data ?? null, now);
  }

  /** Feldnamen der letzten Nachrichten eines Forms, in der Reihenfolge der neuesten. */
  seenFields(formId: string, limit = 200): string[] {
    const rows = this.db
      .prepare("SELECT fields_json FROM submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(formId, limit) as { fields_json: string }[];
    const names = new Set<string>();
    for (const row of rows) {
      try {
        for (const key of Object.keys(JSON.parse(row.fields_json) as Record<string, unknown>)) names.add(key);
      } catch {
        // Kaputte Zeile überspringen.
      }
    }
    return [...names];
  }

  countSubmissions(filter: { formId?: string; projectId?: string }): number {
    if (filter.formId) {
      return (
        this.db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?").get(filter.formId) as { n: number }
      ).n;
    }
    if (filter.projectId) {
      return (
        this.db
          .prepare(
            `SELECT COUNT(*) AS n FROM submissions s JOIN forms f ON f.id = s.form_id WHERE f.project_id = ?`,
          )
          .get(filter.projectId) as { n: number }
      ).n;
    }
    return (this.db.prepare("SELECT COUNT(*) AS n FROM submissions").get() as { n: number }).n;
  }

  updateMailState(
    id: string,
    patch: {
      mailStatus: MailStatus;
      mailAttempts: number;
      lastError: string | null;
      nextAttemptAt: number | null;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE submissions SET
          mail_status = @mailStatus,
          mail_attempts = @mailAttempts,
          last_error = @lastError,
          next_attempt_at = @nextAttemptAt
        WHERE id = @id`,
      )
      .run({ id, ...patch });
  }

  dueMailJobs(now: number, limit: number): MailJob[] {
    const rows = this.db
      .prepare(
        `SELECT
            s.*,
            f.name AS form_name,
            f.recipients AS form_recipients,
            f.notify_policy AS form_notify_policy,
            f.field_labels AS form_field_labels,
            f.smtp_host AS form_smtp_host,
            f.smtp_port AS form_smtp_port,
            f.smtp_user AS form_smtp_user,
            f.smtp_pass_enc AS form_smtp_pass_enc,
            f.smtp_from AS form_smtp_from,
            p.id AS project_id,
            p.label AS project_label,
            p.smtp_host AS project_smtp_host,
            p.smtp_port AS project_smtp_port,
            p.smtp_user AS project_smtp_user,
            p.smtp_pass_enc AS project_smtp_pass_enc,
            p.smtp_from AS project_smtp_from,
            p.notify_policy AS project_notify_policy,
            st.notify_policy AS global_notify_policy
         FROM submissions s
         JOIN forms f ON f.id = s.form_id
         JOIN projects p ON p.id = f.project_id
         JOIN settings st ON st.id = 1
         WHERE s.mail_status IN ('queued', 'failed')
           AND s.next_attempt_at IS NOT NULL
           AND s.next_attempt_at <= @now
         ORDER BY s.next_attempt_at ASC
         LIMIT @limit`,
      )
      .all({ now, limit }) as Row[];

    return rows.map((row) => {
      const submission = submissionFrom(row);
      return {
        ...submission,
        projectId: String(row.project_id),
        formName: String(row.form_name),
        fieldLabels: parseLabels(row.form_field_labels),
        projectLabel: String(row.project_label),
        recipients: parseRecipients(String(row.form_recipients)),
        formSmtp: smtpFrom(
          {
            host: row.form_smtp_host,
            port: row.form_smtp_port,
            user: row.form_smtp_user,
            pass_enc: row.form_smtp_pass_enc,
            from: row.form_smtp_from,
          },
          "",
        ),
        projectSmtp: smtpFrom(
          {
            host: row.project_smtp_host,
            port: row.project_smtp_port,
            user: row.project_smtp_user,
            pass_enc: row.project_smtp_pass_enc,
            from: row.project_smtp_from,
          },
          "",
        ),
        formNotifyPolicy: row.form_notify_policy ? asNotify(row.form_notify_policy) : null,
        projectNotifyPolicy: asNotifyOrNull(row.project_notify_policy),
        globalNotifyPolicy: asNotify(row.global_notify_policy),
      };
    });
  }

  deleteSubmissionsOlderThan(cutoff: number): number {
    return this.db.prepare("DELETE FROM submissions WHERE created_at < ?").run(cutoff).changes;
  }

  listSubmissionsForExport(filter: { formId?: string; projectId?: string }): SubmissionRecord[] {
    const { items } = this.listSubmissions({ ...filter, limit: 1_000_000, offset: 0 });
    return items;
  }
}

export function openStore(dataDir: string): Store {
  mkdirSync(dataDir, { recursive: true });
  return new Store(join(dataDir, "snd.sqlite"));
}

export function openMemoryStore(): Store {
  return new Store(":memory:");
}
