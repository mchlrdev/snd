import { describe, expect, it } from "vitest";
import { RETRY_DELAYS_MS } from "./mail.js";
import { makeApp, recordingMailer } from "./test-helpers.js";

const ORIGIN = "https://site.example";

function setupSite(operator: ReturnType<typeof makeApp>["operator"]) {
  operator.updateSettings({
    adminSmtp: {
      host: "smtp.admin",
      port: 587,
      user: "admin",
      password: "admin-pw",
      from: "ops@snd.test",
    },
    notifyPolicy: "immediate",
  });
  const project = operator.createProject({
    label: "Site",
    origins: [ORIGIN],
    smtp: {
      host: "smtp.site",
      port: 587,
      user: "site",
      password: "site-pw",
      from: "site@example.com",
    },
  });
  const form = operator.createForm(project.id, {
    name: "Kontakt",
    recipients: ["hello@example.com"],
  });
  return { project, form };
}

async function submitOnce(app: ReturnType<typeof makeApp>["app"], accessKey: string) {
  const body = new URLSearchParams({
    access_key: accessKey,
    name: "Ada",
    email: "ada@example.com",
    message: "Hallo",
  }).toString();
  return app.request("https://snd.test/submit", {
    method: "POST",
    headers: {
      origin: ORIGIN,
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

describe("mail queue", () => {
  it("sends text and HTML with the form's field titles", async () => {
    const mail = recordingMailer();
    const { app, operator, queue } = makeApp({ mail });
    const { form } = setupSite(operator);
    operator.updateForm(form.id, { fieldLabels: { message: "Your request", name: "  " } });
    await submitOnce(app, form.accessKey);
    await queue.tick();
    const sent = mail.sent[0]?.mail;
    expect(sent?.replyTo).toBe("ada@example.com");
    expect(sent?.text).toContain("Your request\nHallo");
    expect(sent?.text).toContain("Name\nAda");
    expect(sent?.html).toContain("Your request");
    expect(sent?.html).toContain("Mon, 2 November 2026");
    expect(operator.getForm(form.id).fieldLabels).toEqual({ message: "Your request" });
    expect(operator.getForm(form.id).seenFields).toEqual(["name", "email", "message"]);
  });

  it("alerts the operator on the first failure", async () => {
    const mail = recordingMailer();
    const { app, operator, store, queue } = makeApp({ mail });
    const { form } = setupSite(operator);
    mail.fail("connection refused");
    const res = await submitOnce(app, form.accessKey);
    expect(res.status).toBe(200);
    await queue.tick();
    const listed = store.listSubmissions({ formId: form.id, limit: 10, offset: 0 });
    expect(listed.items[0]?.mailStatus).toBe("failed");
    expect(listed.items[0]?.mailAttempts).toBe(1);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.account.from).toBe("ops@snd.test");
    expect(mail.sent[0]?.mail.subject).toContain("delivery failed");
  });

  it("gives up after 8 attempts and only mails then when the form asks for it", async () => {
    const mail = recordingMailer();
    const { app, operator, store, queue, clock } = makeApp({ mail });
    const { form } = setupSite(operator);
    operator.updateForm(form.id, { notifyPolicy: "abandoned" });
    mail.block("smtp.site");
    await submitOnce(app, form.accessKey);
    for (let i = 0; i < 8; i++) {
      await queue.tick();
      clock.value += (RETRY_DELAYS_MS[i] ?? 0) + 1;
    }
    const listed = store.listSubmissions({ formId: form.id, limit: 10, offset: 0 });
    expect(listed.items[0]?.mailStatus).toBe("abandoned");
    expect(listed.items[0]?.mailAttempts).toBe(8);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.mail.subject).toContain("delivery abandoned");
  });

  it("form SMTP fully replaces the project account", async () => {
    const mail = recordingMailer();
    const { app, operator, queue } = makeApp({ mail });
    const { form } = setupSite(operator);
    operator.updateForm(form.id, {
      smtp: {
        host: "smtp.form",
        port: 465,
        user: "form",
        password: "form-pw",
        from: "form@example.com",
      },
    });
    await submitOnce(app, form.accessKey);
    await queue.tick();
    expect(mail.sent[0]?.account.host).toBe("smtp.form");
    expect(mail.sent[0]?.account.password).toBe("form-pw");
  });
});

describe("mail templates", () => {
  it("sends with the form's template and falls back to the default once it is deleted", async () => {
    const mail = recordingMailer();
    const { app, operator, queue } = makeApp({ mail });
    const { project, form } = setupSite(operator);
    const template = operator.createTemplate(project.id, {
      name: "Plain",
      subject: "{{field.name}} wrote",
      html: "<p>{{field.message}}</p><p>{{field.nope}}</p>",
    });
    expect(template.warnings).toEqual([]);
    operator.updateForm(form.id, { templateId: template.id });
    await submitOnce(app, form.accessKey);
    await queue.tick();
    expect(mail.sent[0]?.mail.subject).toBe("Ada wrote");
    expect(mail.sent[0]?.mail.html).toBe("<p>Hallo</p><p></p>");
    expect(mail.sent[0]?.mail.text).toContain("New message via Kontakt");

    operator.deleteTemplate(template.id);
    expect(operator.getForm(form.id).templateId).toBeNull();
    await submitOnce(app, form.accessKey);
    await queue.tick();
    expect(mail.sent[1]?.mail.subject).toBe("New message: Kontakt");
  });

  it("rejects broken templates and templates of another website", () => {
    const { operator } = makeApp({ mail: recordingMailer() });
    const { project, form } = setupSite(operator);
    expect(() => operator.createTemplate(project.id, { name: "x", html: "{{#fields}}" })).toThrow(/html: line 1/);
    expect(() => operator.createTemplate(project.id, { name: "x", html: "{{{raw}}}" })).toThrow(/unescaped/);
    const other = operator.createProject({ label: "Other" });
    const foreign = operator.createTemplate(other.id, { name: "Foreign" });
    expect(() => operator.updateForm(form.id, { templateId: foreign.id })).toThrow(/does not belong/);
  });

  it("previews drafts with example data and switches the default to German", () => {
    const { operator } = makeApp({ mail: recordingMailer() });
    const { project } = setupSite(operator);
    const draft = operator.previewTemplate({ projectId: project.id, html: "<b>{{field.name}}</b> {{feld.x}}" });
    expect(draft.sample).toBe("example");
    expect(draft.html).toBe("<b>Jane Doe</b> ");
    expect(draft.warnings).toEqual(["{{feld.x}} (line 1)"]);
    operator.updateSettings({ locale: "de" });
    expect(operator.defaultTemplate().subject).toContain("Neue Nachricht:");
    expect(operator.previewTemplate({}).html).toContain("Erika Mustermann");
  });
});
