import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import type { Context, Hono } from "hono";
import * as z from "zod/v4";
import type { Config } from "../config.js";
import { secretsEqual } from "../crypto.js";
import { AppError } from "../errors.js";
import type { Operator } from "../operator.js";
import { publicHostname } from "../config.js";
import type { MailQueue } from "../mail.js";

const smtpInput = z.object({
  host: z.string(),
  port: z.number(),
  user: z.string(),
  password: z.string(),
  from: z.string(),
});

const smtpPatch = z.object({
  host: z.string(),
  port: z.number(),
  user: z.string(),
  from: z.string(),
  password: z.string().optional(),
});

const notifyPolicy = z.enum(["immediate", "abandoned", "off"]);

const fieldLabels = z
  .record(z.string(), z.string())
  .describe('Eigene Titel pro Feldname für die Benachrichtigungs-Mail, z. B. { "message": "Nachricht" }. Ersetzt alle bisherigen; null löscht sie.');

const submissionFilter = {
  formId: z.string().optional().describe("Nur dieses Formular."),
  projectId: z.string().optional().describe("Nur diese Website (Project)."),
  status: z
    .enum(["delivered", "pending", "failed"])
    .optional()
    .describe("delivered = per Mail zugestellt, pending = wird noch versucht, failed = endgültig nicht zugestellt."),
  since: z.number().optional().describe("Ab Zeitpunkt (ms seit Epoch, inklusiv)."),
  until: z.number().optional().describe("Bis Zeitpunkt (ms seit Epoch, exklusiv)."),
  query: z.string().optional().describe("Volltextsuche in allen Feldwerten."),
  field: z.string().optional().describe("Feldname für einen exakten Wertfilter, z. B. 'betreff'."),
  value: z.string().optional().describe("Wert für `field`."),
  unacknowledged: z.boolean().optional().describe("Nur gescheiterte Zustellungen, die noch nicht quittiert sind."),
};

function jsonResult(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(error: unknown) {
  const text = error instanceof AppError || error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text }], isError: true };
}

async function run(fn: () => unknown | Promise<unknown>) {
  try {
    return jsonResult(await fn());
  } catch (error) {
    return errorResult(error);
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function mcpHosts(config: Config): string[] {
  const hosts = new Set(localhostAllowedHostnames());
  const hostname = publicHostname(config);
  if (hostname) hosts.add(hostname);
  return [...hosts];
}

function mcpOrigins(config: Config): string[] {
  const origins = new Set(localhostAllowedOrigins());
  const hostname = publicHostname(config);
  if (hostname) origins.add(hostname);
  return [...origins];
}

export function mountMcp(
  app: Hono,
  env: { config: Config; operator: Operator; queue: MailQueue },
): void {
  const handler = createMcpHandler((ctx) => {
    const requestUrl = ctx.requestInfo?.url;
    const server = new McpServer({ name: "snd", version: "0.1.0" });

    server.registerTool(
      "list_projects",
      { description: "Alle Projects der Instanz auflisten.", inputSchema: z.object({}) },
      async () => run(() => env.operator.listProjects()),
    );
    server.registerTool(
      "get_project",
      {
        description: "Ein Project lesen.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.getProject(id)),
    );
    server.registerTool(
      "create_project",
      {
        description:
          "Website (Project) anlegen. origins = erlaubte Adressen wie https://beispiel.de; ohne Origin nimmt kein Formular Nachrichten an.",
        inputSchema: z.object({
          label: z.string(),
          origins: z.array(z.string()).optional(),
          smtp: smtpInput.optional(),
          notifyPolicy: notifyPolicy.nullable().optional(),
        }),
      },
      async (input) => run(() => env.operator.createProject(input)),
    );
    server.registerTool(
      "update_project",
      {
        description: "Project ändern. SMTP-Passwort nur mitsenden, wenn es neu gesetzt wird.",
        inputSchema: z.object({
          id: z.string(),
          label: z.string().optional(),
          origins: z.array(z.string()).optional(),
          smtp: z.union([smtpPatch, z.null()]).optional(),
          notifyPolicy: notifyPolicy.nullable().optional().describe("null = Einstellung der Instanz verwenden."),
        }),
      },
      async ({ id, ...patch }) => run(() => env.operator.updateProject(id, patch)),
    );
    server.registerTool(
      "delete_project",
      {
        description: "Project und alles darunter löschen.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) =>
        run(() => {
          env.operator.deleteProject(id);
          return { ok: true };
        }),
    );
    server.registerTool(
      "export_project_csv",
      {
        description: "Alle Submissions eines Projects als CSV.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.exportProjectCsv(id)),
    );
    server.registerTool(
      "test_project_smtp",
      {
        description: "Echte Testmail über das Project-SMTP senden.",
        inputSchema: z.object({ id: z.string(), to: z.string() }),
      },
      async ({ id, to }) =>
        run(async () => {
          await env.operator.testProjectSmtp(id, to);
          return { ok: true };
        }),
    );

    server.registerTool(
      "list_forms",
      {
        description: "Forms eines Projects auflisten, inkl. Access Key und Snippet.",
        inputSchema: z.object({ projectId: z.string() }),
      },
      async ({ projectId }) => run(() => env.operator.listForms(projectId, requestUrl)),
    );
    server.registerTool(
      "get_form",
      {
        description: "Ein Form lesen, inkl. Access Key und HTML-Snippet.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.getForm(id, requestUrl)),
    );
    server.registerTool(
      "create_form",
      {
        description: "Form anlegen. Gibt Access Key und Snippet zurück.",
        inputSchema: z.object({
          projectId: z.string(),
          name: z.string(),
          recipients: z.array(z.string()).min(1),
          smtp: smtpInput.optional(),
          turnstileSecret: z.string().optional(),
          notifyPolicy: notifyPolicy.nullable().optional(),
          fieldLabels: fieldLabels.nullable().optional(),
        }),
      },
      async ({ projectId, ...input }) => run(() => env.operator.createForm(projectId, input, requestUrl)),
    );
    server.registerTool(
      "update_form",
      {
        description: "Form ändern. Secrets nur mitsenden, wenn sie neu gesetzt werden; null löscht sie.",
        inputSchema: z.object({
          id: z.string(),
          name: z.string().optional(),
          recipients: z.array(z.string()).optional(),
          smtp: z.union([smtpPatch, z.null()]).optional(),
          turnstileSecret: z.string().nullable().optional(),
          notifyPolicy: notifyPolicy.nullable().optional(),
          fieldLabels: fieldLabels.nullable().optional(),
        }),
      },
      async ({ id, ...patch }) => run(() => env.operator.updateForm(id, patch, requestUrl)),
    );
    server.registerTool(
      "delete_form",
      {
        description: "Form und seine Submissions löschen.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) =>
        run(() => {
          env.operator.deleteForm(id);
          return { ok: true };
        }),
    );
    server.registerTool(
      "rotate_form_key",
      {
        description: "Access Key rotieren. Der alte Key ist sofort tot.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.rotateAccessKey(id, requestUrl)),
    );
    server.registerTool(
      "export_form_csv",
      {
        description: "Submissions eines Forms als CSV.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.exportFormCsv(id)),
    );
    server.registerTool(
      "test_form_smtp",
      {
        description: "Testmail über Form-SMTP oder das geerbte Project-SMTP.",
        inputSchema: z.object({ id: z.string(), to: z.string() }),
      },
      async ({ id, to }) =>
        run(async () => {
          await env.operator.testFormSmtp(id, to);
          return { ok: true };
        }),
    );

    server.registerTool(
      "list_submissions",
      {
        description:
          "Nachrichten lesen, neueste zuerst. Ohne formId/projectId über alle Websites. Filter sind kombinierbar; total ist die Gesamtzahl der Treffer.",
        inputSchema: z.object({
          ...submissionFilter,
          limit: z.number().optional().describe("1–200, Standard 50."),
          offset: z.number().optional(),
        }),
      },
      async (input) => run(() => env.operator.listSubmissions(input)),
    );
    server.registerTool(
      "get_stats",
      {
        description:
          "Auswertung: Zeitreihe (series), Summen nach Zustellstatus (totals), Vergleich mit dem gleich langen Zeitraum davor (previousTotal), Verteilung auf Formulare/Websites (byForm/byProject) und Feldauswertung (fields; values nur bei Auswahlfeldern). Standard: letzte 30 Tage.",
        inputSchema: z.object({
          ...submissionFilter,
          days: z.number().optional().describe("Zeitraum in Tagen bis jetzt (Standard 30). Wird durch since/until ersetzt."),
          bucket: z.enum(["day", "week", "month"]).optional().describe("Standard je nach Länge des Zeitraums."),
          timeZone: z.string().optional().describe("IANA-Zeitzone für die Tagesgrenzen, Standard Europe/Berlin."),
        }),
      },
      async ({ days, bucket, timeZone, since, until, ...filter }) =>
        run(() => env.operator.stats({ filter, days, bucket, timeZone, since, until })),
    );

    server.registerTool(
      "acknowledge_failures",
      {
        description:
          "Endgültig gescheiterte Zustellungen eines Formulars oder einer Website als zur Kenntnis genommen markieren. Entfernt den Warnhinweis in der Konsole.",
        inputSchema: z.object({ formId: z.string().optional(), projectId: z.string().optional() }),
      },
      async (filter) => run(() => env.operator.acknowledgeFailures(filter)),
    );

    server.registerTool(
      "resend_failures",
      {
        description: "Alle endgültig nicht zugestellten Nachrichten eines Formulars erneut zum Versand einreihen.",
        inputSchema: z.object({ formId: z.string() }),
      },
      async ({ formId }) =>
        run(() => {
          const result = env.operator.resendFailures(formId);
          void env.queue.tick();
          return result;
        }),
    );

    server.registerTool(
      "get_submission",
      {
        description: "Eine Submission im Detail.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.getSubmission(id)),
    );
    server.registerTool(
      "delete_submission",
      {
        description: "Eine Submission löschen.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) =>
        run(() => {
          env.operator.deleteSubmission(id);
          return { ok: true };
        }),
    );
    server.registerTool(
      "resend_submission",
      {
        description: "Mailversand für eine Submission erneut einreihen.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) =>
        run(() => {
          const view = env.operator.resendSubmission(id);
          void env.queue.tick();
          return view;
        }),
    );

    server.registerTool(
      "get_settings",
      { description: "Operator-Einstellungen (ohne SMTP-Passwort, mit MCP-Token).", inputSchema: z.object({}) },
      async () => run(() => env.operator.getSettings()),
    );
    server.registerTool(
      "rotate_mcp_token",
      {
        description: "Neues MCP-Bearer-Token erzeugen. Das bisherige ist sofort ungültig.",
        inputSchema: z.object({}),
      },
      async () => run(() => env.operator.rotateMcpToken()),
    );
    server.registerTool(
      "update_settings",
      {
        description: "Admin-SMTP, globale Benachrichtigung, optionale Aufbewahrung in Tagen.",
        inputSchema: z.object({
          adminSmtp: z.union([smtpPatch, z.null()]).optional(),
          notifyPolicy: notifyPolicy.optional(),
          retentionDays: z.number().nullable().optional(),
        }),
      },
      async (patch) => run(() => env.operator.updateSettings(patch)),
    );
    server.registerTool(
      "test_admin_smtp",
      {
        description: "Echte Testmail über das Admin-SMTP senden.",
        inputSchema: z.object({ to: z.string() }),
      },
      async ({ to }) =>
        run(async () => {
          await env.operator.testAdminSmtp(to);
          return { ok: true };
        }),
    );

    return server;
  });

  app.all("/mcp", async (c: Context) => {
    const token = bearerToken(c.req.header("authorization"));
    const expected = env.operator.mcpBearer();
    if (!expected || !token || !secretsEqual(token, expected)) {
      return c.body("Unauthorized", 401, { "www-authenticate": "Bearer" });
    }
    const rejected =
      hostHeaderValidationResponse(c.req.raw, mcpHosts(env.config)) ??
      originValidationResponse(c.req.raw, mcpOrigins(env.config));
    if (rejected) return rejected;
    return handler.fetch(c.req.raw);
  });
}
