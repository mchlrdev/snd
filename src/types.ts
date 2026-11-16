import type { Locale } from "./i18n.js";

export type NotifyPolicy = "immediate" | "abandoned" | "off";

export type MailStatus = "queued" | "sent" | "failed" | "abandoned";

export type SmtpInput = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export type SmtpPatch = {
  host: string;
  port: number;
  user: string;
  from: string;
  password?: string;
};

export type SmtpView = {
  host: string;
  port: number;
  user: string;
  from: string;
  passwordSet: boolean;
};

export type SmtpRecord = {
  host: string;
  port: number;
  user: string;
  passEnc: string;
  from: string;
};

export type SettingsRecord = {
  adminSmtp: SmtpRecord | null;
  notifyPolicy: NotifyPolicy;
  retentionDays: number | null;
  mcpTokenEnc: string | null;
  locale: Locale;
};

export type SettingsView = {
  adminSmtp: SmtpView | null;
  notifyPolicy: NotifyPolicy;
  retentionDays: number | null;
  mcpToken: string;
  locale: Locale;
};

export type ProjectRecord = {
  id: string;
  label: string;
  origins: string[];
  smtp: SmtpRecord | null;
  notifyPolicy: NotifyPolicy | null;
  createdAt: number;
};

export type ProjectView = {
  id: string;
  label: string;
  origins: string[];
  smtp: SmtpView | null;
  notifyPolicy: NotifyPolicy | null;
  formCount: number;
  submissionCount: number;
  /** Submissions that finally failed to deliver and are not acknowledged yet. */
  failedCount: number;
  createdAt: number;
};

export type FormRecord = {
  id: string;
  projectId: string;
  name: string;
  accessKey: string;
  recipients: string[];
  smtp: SmtpRecord | null;
  turnstileSecretEnc: string | null;
  notifyPolicy: NotifyPolicy | null;
  /** Custom titles per field name for mail and console, e.g. { message: "Your message" }. */
  fieldLabels: Record<string, string>;
  /** Mail template of the form's project; null uses the built-in default. */
  templateId: string | null;
  createdAt: number;
};

export type FormView = {
  id: string;
  projectId: string;
  name: string;
  accessKey: string;
  recipients: string[];
  smtp: SmtpView | null;
  turnstileSet: boolean;
  notifyPolicy: NotifyPolicy | null;
  fieldLabels: Record<string, string>;
  templateId: string | null;
  /** Field names that already appeared in this form's submissions. */
  seenFields: string[];
  /** Titles the website sent with its latest submissions (`label:<field>`). */
  sentLabels: Record<string, string>;
  /** Plain HTML form; needs a thank-you page in `redirect`. */
  snippet: string;
  /** Recommended: form plus script that sends with fetch and field titles. */
  scriptSnippet: string;
  submitUrl: string;
  submissionCount: number;
  failedCount: number;
  createdAt: number;
};

export type SubmissionRecord = {
  id: string;
  formId: string;
  projectId: string;
  fields: Record<string, string>;
  /** Field titles the website sent along (`label:<field>`). */
  fieldLabels: Record<string, string>;
  replyTo: string | null;
  subject: string | null;
  createdAt: number;
  mailStatus: MailStatus;
  mailAttempts: number;
  lastError: string | null;
  nextAttemptAt: number | null;
};

export type SubmissionView = {
  id: string;
  formId: string;
  formName: string;
  projectId: string;
  projectLabel: string;
  fields: Record<string, string>;
  fieldLabels: Record<string, string>;
  replyTo: string | null;
  subject: string | null;
  createdAt: number;
  mailStatus: MailStatus;
  mailAttempts: number;
  lastError: string | null;
  nextAttemptAt: number | null;
};

export type SubmissionFilter = {
  formId?: string;
  projectId?: string;
  /** Time range in ms since epoch, `until` exclusive. */
  since?: number;
  until?: number;
  /** "delivered" = sent, "pending" = queued/failed, "failed" = abandoned. */
  status?: DeliveryFilter;
  /** Only finally failed deliveries that are not acknowledged yet. */
  unacknowledged?: boolean;
  /** Full-text search across all field values. */
  query?: string;
  /** Only submissions whose field `field` equals `value` exactly. */
  field?: string;
  value?: string;
};

export type DeliveryFilter = "delivered" | "pending" | "failed";

export type MailJob = SubmissionRecord & {
  formName: string;
  fieldLabels: Record<string, string>;
  projectLabel: string;
  template: { subject: string; html: string; text: string } | null;
  locale: Locale;
  recipients: string[];
  formSmtp: SmtpRecord | null;
  projectSmtp: SmtpRecord | null;
  formNotifyPolicy: NotifyPolicy | null;
  projectNotifyPolicy: NotifyPolicy | null;
  globalNotifyPolicy: NotifyPolicy;
};

export type TemplateRecord = {
  id: string;
  projectId: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

export type TemplateView = TemplateRecord & {
  /** Forms that send with this template. */
  formCount: number;
};
