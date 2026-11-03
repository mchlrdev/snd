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

describe("Mail-Queue", () => {
  it("schickt Text und HTML mit den Feldtiteln der Form", async () => {
    const mail = recordingMailer();
    const { app, operator, queue } = makeApp({ mail });
    const { form } = setupSite(operator);
    operator.updateForm(form.id, { fieldLabels: { message: "Ihr Anliegen", name: "  " } });
    await submitOnce(app, form.accessKey);
    await queue.tick();
    const sent = mail.sent[0]?.mail;
    expect(sent?.replyTo).toBe("ada@example.com");
    expect(sent?.text).toContain("Ihr Anliegen\nHallo");
    expect(sent?.text).toContain("Name\nAda");
    expect(sent?.html).toContain("Ihr Anliegen");
    expect(sent?.html).toContain("Mo., 2. November 2026");
    expect(operator.getForm(form.id).fieldLabels).toEqual({ message: "Ihr Anliegen" });
    expect(operator.getForm(form.id).seenFields).toEqual(["name", "email", "message"]);
  });

  it("benachrichtigt den Operator beim ersten Fehlschlag", async () => {
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
    expect(mail.sent[0]?.mail.subject).toContain("fehlgeschlagen");
  });

  it("gibt nach 8 Versuchen auf und mailt nur dann, wenn die Form das so will", async () => {
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
    expect(mail.sent[0]?.mail.subject).toContain("aufgegeben");
  });

  it("Form-SMTP ersetzt das Project-Konto vollständig", async () => {
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
