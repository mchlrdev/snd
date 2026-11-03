export class AuthError extends Error {
  constructor() {
    super("Nicht angemeldet.");
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, { credentials: "include", ...init, headers });
  if (res.status === 401) {
    // Session expired mid-use: let the app send the user back to the login.
    if (path !== "/api/login" && path !== "/api/me") window.dispatchEvent(new Event("snd:unauthorized"));
    throw new AuthError();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? "Fehler");
  }
  return data as T;
}

export type SmtpView = {
  host: string;
  port: number;
  user: string;
  from: string;
  passwordSet: boolean;
};

export type NotifyPolicy = "immediate" | "abandoned" | "off";

export type Project = {
  id: string;
  label: string;
  origins: string[];
  smtp: SmtpView | null;
  notifyPolicy: NotifyPolicy | null;
  formCount: number;
  submissionCount: number;
  failedCount: number;
  createdAt: number;
};

export type Form = {
  id: string;
  projectId: string;
  name: string;
  accessKey: string;
  recipients: string[];
  smtp: SmtpView | null;
  turnstileSet: boolean;
  notifyPolicy: NotifyPolicy | null;
  /** Eigene Titel pro Feldname, z. B. { message: "Nachricht" }. */
  fieldLabels: Record<string, string>;
  /** Feldnamen, die in Nachrichten schon vorkamen. */
  seenFields: string[];
  snippet: string;
  submitUrl: string;
  submissionCount: number;
  failedCount: number;
  createdAt: number;
};

export type Submission = {
  id: string;
  formId: string;
  formName: string;
  projectId: string;
  projectLabel: string;
  fields: Record<string, string>;
  replyTo: string | null;
  subject: string | null;
  createdAt: number;
  mailStatus: "queued" | "sent" | "failed" | "abandoned";
  mailAttempts: number;
  lastError: string | null;
  nextAttemptAt: number | null;
};

export type DeliveryFilter = "delivered" | "pending" | "failed";
export type StatsBucket = "day" | "week" | "month";

export type StatsQuery = {
  formId?: string;
  projectId?: string;
  days: number;
  status?: DeliveryFilter;
  field?: string;
  value?: string;
};

export type Stats = {
  since: number;
  until: number;
  bucket: StatsBucket;
  series: { key: string; total: number; delivered: number; pending: number; failed: number }[];
  totals: { total: number; delivered: number; pending: number; failed: number };
  previousTotal: number;
  byForm: { formId: string; total: number }[];
  byProject: { projectId: string; total: number }[];
  fields: { name: string; filled: number; values: { value: string; count: number }[] | null }[];
  forms: { id: string; name: string; projectId: string }[];
  projects: { id: string; label: string }[];
};

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  return search.toString();
}

export type Settings = {
  adminSmtp: SmtpView | null;
  notifyPolicy: NotifyPolicy;
  retentionDays: number | null;
  mcpToken: string;
};

export type SmtpInput = {
  host: string;
  port: number;
  user: string;
  from: string;
  password?: string;
};

export const api = {
  me: () => request<{ ok: true }>("/api/me"),
  login: (password: string) => request<{ ok: true }>("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),
  settings: () => request<Settings>("/api/settings"),
  updateSettings: (patch: Partial<{ adminSmtp: SmtpInput | null; notifyPolicy: NotifyPolicy; retentionDays: number | null }>) =>
    request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  testAdminSmtp: (to: string) => request<{ ok: true }>("/api/settings/test-smtp", { method: "POST", body: JSON.stringify({ to }) }),
  rotateMcpToken: () => request<Settings>("/api/settings/rotate-mcp-token", { method: "POST" }),
  projects: () => request<Project[]>("/api/projects"),
  project: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (body: { label: string; origins?: string[]; smtp?: SmtpInput; notifyPolicy?: NotifyPolicy | null }) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (
    id: string,
    body: { label?: string; origins?: string[]; smtp?: SmtpInput | null; notifyPolicy?: NotifyPolicy | null },
  ) => request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  testProjectSmtp: (id: string, to: string) =>
    request<{ ok: true }>(`/api/projects/${id}/test-smtp`, { method: "POST", body: JSON.stringify({ to }) }),
  forms: (projectId: string) => request<Form[]>(`/api/projects/${projectId}/forms`),
  form: (id: string) => request<Form>(`/api/forms/${id}`),
  createForm: (projectId: string, body: { name: string; recipients: string[]; smtp?: SmtpInput; turnstileSecret?: string; notifyPolicy?: NotifyPolicy | null }) =>
    request<Form>(`/api/projects/${projectId}/forms`, { method: "POST", body: JSON.stringify(body) }),
  updateForm: (
    id: string,
    body: {
      name?: string;
      recipients?: string[];
      smtp?: SmtpInput | null;
      turnstileSecret?: string | null;
      notifyPolicy?: NotifyPolicy | null;
      fieldLabels?: Record<string, string> | null;
    },
  ) =>
    request<Form>(`/api/forms/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteForm: (id: string) => request<void>(`/api/forms/${id}`, { method: "DELETE" }),
  rotateKey: (id: string) => request<Form>(`/api/forms/${id}/rotate-key`, { method: "POST" }),
  testFormSmtp: (id: string, to: string) =>
    request<{ ok: true }>(`/api/forms/${id}/test-smtp`, { method: "POST", body: JSON.stringify({ to }) }),
  submissions: (formId: string, limit = 100) =>
    request<{ items: Submission[]; total: number }>(`/api/forms/${formId}/submissions?limit=${limit}`),
  stats: (q: StatsQuery) =>
    request<Stats>(
      `/api/stats?${query({ ...q, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}`,
    ),
  failures: (formId: string) =>
    request<{ items: Submission[]; total: number }>(`/api/forms/${formId}/submissions?status=failed&limit=50`),
  acknowledgeFailures: (formId: string) =>
    request<{ acknowledged: number }>(`/api/forms/${formId}/acknowledge-failures`, { method: "POST" }),
  resendFailures: (formId: string) => request<{ queued: number }>(`/api/forms/${formId}/resend-failures`, { method: "POST" }),
  faviconUrl: (projectId: string, origin: string) => `/api/projects/${projectId}/favicon?o=${encodeURIComponent(origin)}`,
  submission: (id: string) => request<Submission>(`/api/submissions/${id}`),
  deleteSubmission: (id: string) => request<void>(`/api/submissions/${id}`, { method: "DELETE" }),
  resendSubmission: (id: string) => request<Submission>(`/api/submissions/${id}/resend`, { method: "POST" }),
  formCsvUrl: (id: string) => `/api/forms/${id}/export.csv`,
  projectCsvUrl: (id: string) => `/api/projects/${id}/export.csv`,
};
