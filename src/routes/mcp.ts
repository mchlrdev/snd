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

const MCP_INSTRUCTIONS = `snd receives form submissions from static websites and emails them.

Setup: create_project (with the website's origins), then create_form. Embed the form's scriptSnippet on the site: adapt the fields and markup to the site, but keep form[data-snd] with its action, the hidden access_key, the botcheck spam trap, the [data-snd-status] element and the script.

Fields: any names work. Give every field a <label> (or data-label="…"); the script sends it as label:<field>, which becomes the field's title in the notification mail. For radio buttons and checkboxes the title comes from the fieldset's <legend>. A field named email sets the reply address; subject sets the mail subject. Without JavaScript, a form needs a hidden redirect field with a thank-you page on an allowed origin; snd shows no pages of its own.

Mail: templates per website (get_default_template, create_template, preview_template), chosen per form with update_form { templateId }.`;

const notifyPolicy = z.enum(["immediate", "abandoned", "off"]);

const fieldLabels = z
  .record(z.string(), z.string())
  .describe(
    'Custom titles per field name for the notification mail, e.g. { "message": "Your message" }. Replaces all existing titles; null clears them. ' +
      'Usually not needed: the website can send titles itself with hidden fields named "label:<field>" (e.g. name="label:message" value="Your message"). Titles set here win over sent ones.',
  );

const templateId = z
  .string()
  .nullable()
  .describe("Mail template of the same website (see list_templates); null uses the built-in default.");

const submissionFilter = {
  formId: z.string().optional().describe("Only this form."),
  projectId: z.string().optional().describe("Only this website (project)."),
  status: z
    .enum(["delivered", "pending", "failed"])
    .optional()
    .describe("delivered = delivered by mail, pending = still being retried, failed = finally not delivered."),
  since: z.number().optional().describe("From this time (ms since epoch, inclusive)."),
  until: z.number().optional().describe("Until this time (ms since epoch, exclusive)."),
  query: z.string().optional().describe("Full-text search across all field values."),
  field: z.string().optional().describe("Field name for an exact value filter, e.g. 'subject'."),
  value: z.string().optional().describe("Value for `field`."),
  unacknowledged: z.boolean().optional().describe("Only failed deliveries that are not acknowledged yet."),
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
    const server = new McpServer({ name: "snd", version: "0.1.0" }, { instructions: MCP_INSTRUCTIONS });

    server.registerTool(
      "list_projects",
      { description: "List all projects of this instance.", inputSchema: z.object({}) },
      async () => run(() => env.operator.listProjects()),
    );
    server.registerTool(
      "get_project",
      {
        description: "Read one project.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.getProject(id)),
    );
    server.registerTool(
      "create_project",
      {
        description:
          "Create a website (project). origins = allowed addresses such as https://example.com; without an origin no form accepts submissions.",
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
        description: "Update a project. Only send the SMTP password when it changes.",
        inputSchema: z.object({
          id: z.string(),
          label: z.string().optional(),
          origins: z.array(z.string()).optional(),
          smtp: z.union([smtpPatch, z.null()]).optional(),
          notifyPolicy: notifyPolicy.nullable().optional().describe("null = use the instance setting."),
        }),
      },
      async ({ id, ...patch }) => run(() => env.operator.updateProject(id, patch)),
    );
    server.registerTool(
      "delete_project",
      {
        description: "Delete a project and everything in it.",
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
        description: "All submissions of a project as CSV.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.exportProjectCsv(id)),
    );
    server.registerTool(
      "test_project_smtp",
      {
        description: "Send a real test mail through the project SMTP.",
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
        description: "List a project's forms, including access key and embed snippets (see get_form).",
        inputSchema: z.object({ projectId: z.string() }),
      },
      async ({ projectId }) => run(() => env.operator.listForms(projectId, requestUrl)),
    );
    server.registerTool(
      "get_form",
      {
        description:
          "Read one form, including access key and two embed snippets. scriptSnippet (recommended) is a complete form plus script: it sends with fetch, shows the result inside the form and sends each field's title (from data-label or its <label>) as label:<field>, so the mail shows readable titles. snippet is a plain HTML post that needs a thank-you page in the hidden redirect field.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.getForm(id, requestUrl)),
    );
    server.registerTool(
      "create_form",
      {
        description: "Create a form. Returns access key and embed snippets (see get_form; prefer scriptSnippet).",
        inputSchema: z.object({
          projectId: z.string(),
          name: z.string(),
          recipients: z.array(z.string()).min(1),
          smtp: smtpInput.optional(),
          turnstileSecret: z.string().optional(),
          notifyPolicy: notifyPolicy.nullable().optional(),
          fieldLabels: fieldLabels.nullable().optional(),
          templateId: templateId.optional(),
        }),
      },
      async ({ projectId, ...input }) => run(() => env.operator.createForm(projectId, input, requestUrl)),
    );
    server.registerTool(
      "update_form",
      {
        description: "Update a form. Only send secrets when they change; null clears them.",
        inputSchema: z.object({
          id: z.string(),
          name: z.string().optional(),
          recipients: z.array(z.string()).optional(),
          smtp: z.union([smtpPatch, z.null()]).optional(),
          turnstileSecret: z.string().nullable().optional(),
          notifyPolicy: notifyPolicy.nullable().optional(),
          fieldLabels: fieldLabels.nullable().optional(),
          templateId: templateId.optional(),
        }),
      },
      async ({ id, ...patch }) => run(() => env.operator.updateForm(id, patch, requestUrl)),
    );
    server.registerTool(
      "delete_form",
      {
        description: "Delete a form and its submissions.",
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
        description: "Rotate the access key. The old key stops working immediately.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.rotateAccessKey(id, requestUrl)),
    );
    server.registerTool(
      "export_form_csv",
      {
        description: "A form's submissions as CSV.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.exportFormCsv(id)),
    );
    server.registerTool(
      "test_form_smtp",
      {
        description: "Send a test mail through the form SMTP or the inherited project SMTP.",
        inputSchema: z.object({ id: z.string(), to: z.string() }),
      },
      async ({ id, to }) =>
        run(async () => {
          await env.operator.testFormSmtp(id, to);
          return { ok: true };
        }),
    );

    server.registerTool(
      "get_default_template",
      {
        description:
          "Read this first before writing a mail template. Returns the built-in notification template (subject, html, text) in the instance language and the full reference of the template syntax and variables. Use it as the starting point for a custom template.",
        inputSchema: z.object({}),
      },
      async () => run(() => env.operator.defaultTemplate()),
    );
    server.registerTool(
      "list_templates",
      {
        description: "List a website's mail templates, with how many forms use each.",
        inputSchema: z.object({ projectId: z.string() }),
      },
      async ({ projectId }) => run(() => env.operator.listTemplates(projectId)),
    );
    server.registerTool(
      "get_template",
      { description: "Read one mail template including its sources.", inputSchema: z.object({ id: z.string() }) },
      async ({ id }) => run(() => env.operator.getTemplate(id)),
    );
    server.registerTool(
      "create_template",
      {
        description:
          "Create a mail template for a website. Without html it starts as a copy of the default. The template is parsed and test-rendered; syntax errors are returned with part and line, unknown variables as warnings. Assign it to forms with update_form { templateId }.",
        inputSchema: z.object({
          projectId: z.string(),
          name: z.string(),
          subject: z.string().optional().describe("Subject template; empty uses the default subject."),
          html: z.string().optional().describe("Email-safe HTML template."),
          text: z.string().optional().describe("Plain-text template; empty uses the default text."),
        }),
      },
      async ({ projectId, ...input }) => run(() => env.operator.createTemplate(projectId, input)),
    );
    server.registerTool(
      "update_template",
      {
        description: "Change a mail template. Only the given parts change. Forms using it send with the new version right away.",
        inputSchema: z.object({
          id: z.string(),
          name: z.string().optional(),
          subject: z.string().optional(),
          html: z.string().optional(),
          text: z.string().optional(),
        }),
      },
      async ({ id, ...patch }) => run(() => env.operator.updateTemplate(id, patch)),
    );
    server.registerTool(
      "delete_template",
      {
        description: "Delete a mail template. Forms that used it fall back to the built-in default.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) =>
        run(() => {
          env.operator.deleteTemplate(id);
          return { ok: true };
        }),
    );
    server.registerTool(
      "preview_template",
      {
        description:
          "Render a template without saving or sending. Pass templateId for a saved one (optionally overriding parts), or projectId with subject/html/text for a draft, or nothing for the default. Uses submissionId, else the website's latest submission, else example data. Returns subject, html, text, warnings and which sample was used.",
        inputSchema: z.object({
          templateId: z.string().optional(),
          projectId: z.string().optional(),
          subject: z.string().optional(),
          html: z.string().optional(),
          text: z.string().optional(),
          submissionId: z.string().optional(),
        }),
      },
      async (input) => run(() => env.operator.previewTemplate(input)),
    );

    server.registerTool(
      "list_submissions",
      {
        description:
          "Read submissions, newest first. Without formId/projectId across all websites. Filters can be combined; total is the number of matches.",
        inputSchema: z.object({
          ...submissionFilter,
          limit: z.number().optional().describe("1–200, default 50."),
          offset: z.number().optional(),
        }),
      },
      async (input) => run(() => env.operator.listSubmissions(input)),
    );
    server.registerTool(
      "get_stats",
      {
        description:
          "Stats: time series (series), totals by delivery status (totals), comparison with the equally long period before (previousTotal), split by form/website (byForm/byProject) and field breakdown (fields; values only for choice fields). Default: last 30 days.",
        inputSchema: z.object({
          ...submissionFilter,
          days: z.number().optional().describe("Range in days up to now (default 30). Overridden by since/until."),
          bucket: z.enum(["day", "week", "month"]).optional().describe("Default depends on the length of the range."),
          timeZone: z.string().optional().describe("IANA time zone for day boundaries, default Europe/Berlin."),
        }),
      },
      async ({ days, bucket, timeZone, since, until, ...filter }) =>
        run(() => env.operator.stats({ filter, days, bucket, timeZone, since, until })),
    );

    server.registerTool(
      "acknowledge_failures",
      {
        description:
          "Mark finally failed deliveries of a form or website as acknowledged. Removes the warning in the console.",
        inputSchema: z.object({ formId: z.string().optional(), projectId: z.string().optional() }),
      },
      async (filter) => run(() => env.operator.acknowledgeFailures(filter)),
    );

    server.registerTool(
      "resend_failures",
      {
        description: "Requeue all finally undelivered submissions of a form for sending.",
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
        description: "One submission in detail.",
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => run(() => env.operator.getSubmission(id)),
    );
    server.registerTool(
      "delete_submission",
      {
        description: "Delete one submission.",
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
        description: "Requeue the mail for one submission.",
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
      { description: "Operator settings (without SMTP password, with MCP token).", inputSchema: z.object({}) },
      async () => run(() => env.operator.getSettings()),
    );
    server.registerTool(
      "rotate_mcp_token",
      {
        description: "Create a new MCP bearer token. The previous one stops working immediately.",
        inputSchema: z.object({}),
      },
      async () => run(() => env.operator.rotateMcpToken()),
    );
    server.registerTool(
      "update_settings",
      {
        description: "Admin SMTP, global notification policy, optional retention in days, instance language.",
        inputSchema: z.object({
          adminSmtp: z.union([smtpPatch, z.null()]).optional(),
          notifyPolicy: notifyPolicy.optional(),
          retentionDays: z.number().nullable().optional(),
          locale: z
            .enum(["en", "de"])
            .optional()
            .describe("Language of the console, the default mail template and visitor responses."),
        }),
      },
      async (patch) => run(() => env.operator.updateSettings(patch)),
    );
    server.registerTool(
      "test_admin_smtp",
      {
        description: "Send a real test mail through the admin SMTP.",
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
