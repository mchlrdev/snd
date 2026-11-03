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
};

export type SettingsView = {
  adminSmtp: SmtpView | null;
  notifyPolicy: NotifyPolicy;
  retentionDays: number | null;
  mcpToken: string;
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
  /** Endgültig nicht zugestellte Nachrichten, die noch nicht quittiert sind. */
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
  /** Eigene Titel pro Feldname für Mail und Konsole, z. B. { message: "Nachricht" }. */
  fieldLabels: Record<string, string>;
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
  /** Feldnamen, die in Nachrichten dieses Forms schon vorkamen. */
  seenFields: string[];
  snippet: string;
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
  /** Zeitraum in ms seit Epoch, `until` exklusiv. */
  since?: number;
  until?: number;
  /** "delivered" = sent, "pending" = queued/failed, "failed" = abandoned. */
  status?: DeliveryFilter;
  /** Nur endgültig gescheiterte Zustellungen, die noch nicht quittiert sind. */
  unacknowledged?: boolean;
  /** Volltextsuche in allen Feldwerten. */
  query?: string;
  /** Nur Nachrichten, deren Feld `field` genau `value` enthält. */
  field?: string;
  value?: string;
};

export type DeliveryFilter = "delivered" | "pending" | "failed";

export type MailJob = SubmissionRecord & {
  formName: string;
  fieldLabels: Record<string, string>;
  projectLabel: string;
  recipients: string[];
  formSmtp: SmtpRecord | null;
  projectSmtp: SmtpRecord | null;
  formNotifyPolicy: NotifyPolicy | null;
  projectNotifyPolicy: NotifyPolicy | null;
  globalNotifyPolicy: NotifyPolicy;
};
