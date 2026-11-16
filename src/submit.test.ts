import { describe, expect, it } from "vitest";
import { makeApp } from "./test-helpers.js";

const ORIGIN = "https://site.example";

async function seedForm(
  operator: ReturnType<typeof makeApp>["operator"],
  over: { turnstileSecret?: string } = {},
) {
  const project = operator.createProject({
    label: "Site",
    origins: [ORIGIN],
    smtp: {
      host: "smtp.example",
      port: 587,
      user: "mailer",
      password: "pw",
      from: "site@example.com",
    },
  });
  const form = operator.createForm(project.id, {
    name: "Kontakt",
    recipients: ["ops@example.com"],
    turnstileSecret: over.turnstileSecret,
  });
  return { project, form };
}

function post(app: ReturnType<typeof makeApp>["app"], body: Record<string, string>, headers: Record<string, string> = {}) {
  const encoded = new URLSearchParams(body).toString();
  return app.request("https://snd.test/submit", {
    method: "POST",
    headers: {
      origin: ORIGIN,
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: encoded,
  });
}

describe("POST /submit", () => {
  it("stores and answers with JSON", async () => {
    const { app, operator, store, mail, queue } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(app, {
      access_key: form.accessKey,
      name: "Ada",
      email: "ada@example.com",
      message: "Hallo",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: "Form submitted." });
    const listed = store.listSubmissions({ formId: form.id, limit: 10, offset: 0 });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.fields).toMatchObject({
      name: "Ada",
      email: "ada@example.com",
      message: "Hallo",
    });
    expect(listed.items[0]?.replyTo).toBe("ada@example.com");
    await queue.tick();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.mail.to).toEqual(["ops@example.com"]);
    expect(mail.sent[0]?.mail.replyTo).toBe("ada@example.com");
    expect(mail.sent[0]?.account.password).toBe("pw");
  });

  it("redirects with 303 to the website's origin", async () => {
    const { app, operator } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(
      app,
      {
        access_key: form.accessKey,
        name: "Ada",
        redirect: "https://site.example/danke",
      },
      { accept: "text/html" },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://site.example/danke");
  });

  it("rejects a missing redirect without JSON", async () => {
    const { app, operator, store } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(app, { access_key: form.accessKey, name: "Ada" }, { accept: "text/html" });
    expect(res.status).toBe(400);
    expect(store.countSubmissions({ formId: form.id })).toBe(0);
    expect(await res.text()).toContain("No redirect");
  });

  it("stores field titles sent as label:<field> and uses them in the mail", async () => {
    const { app, operator, mail, queue } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(app, {
      access_key: form.accessKey,
      message: "Hi",
      "label:message": "  Your request\n",
      "label:ghost": "Not a field",
    });
    expect(res.status).toBe(200);
    const listed = operator.listSubmissions({ formId: form.id, limit: 10, offset: 0 });
    expect(listed.items[0]?.fields).toEqual({ message: "Hi" });
    expect(listed.items[0]?.fieldLabels).toEqual({ message: "Your request" });
    expect(operator.getForm(form.id).sentLabels).toEqual({ message: "Your request" });
    await queue.tick();
    expect(mail.sent[0]?.mail.text).toContain("Your request\nHi");

    // A title set in the console wins.
    await operator.updateForm(form.id, { fieldLabels: { message: "Request" } });
    await post(app, { access_key: form.accessKey, message: "Again", "label:message": "Your request" });
    await queue.tick();
    expect(mail.sent[1]?.mail.text).toContain("Request\nAgain");
  });

  it("rejects foreign origins", async () => {
    const { app, operator, store } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(
      app,
      { access_key: form.accessKey, name: "Ada" },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
    expect(store.countSubmissions({ formId: form.id })).toBe(0);
  });

  it("rejects a redirect to a foreign origin", async () => {
    const { app, operator } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(app, {
      access_key: form.accessKey,
      name: "Ada",
      redirect: "https://evil.example/phish",
    });
    expect(res.status).toBe(400);
  });

  it("silently drops honeypot hits without storing", async () => {
    const { app, operator, store, mail, queue } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(app, {
      access_key: form.accessKey,
      name: "Bot",
      botcheck: "filled",
    });
    expect(res.status).toBe(200);
    expect(store.countSubmissions({ formId: form.id })).toBe(0);
    await queue.tick();
    expect(mail.sent).toHaveLength(0);
  });

  it("limits the number of fields", async () => {
    const { app, operator } = makeApp();
    const { form } = await seedForm(operator);
    const fields: Record<string, string> = { access_key: form.accessKey };
    for (let i = 0; i < 50; i++) fields[`f${i}`] = "x";
    const res = await post(app, fields);
    expect(res.status).toBe(400);
  });

  it("begrenzt Absendungen pro IP", async () => {
    const { app, operator } = makeApp();
    const { form } = await seedForm(operator);
    let last = 200;
    for (let i = 0; i < 31; i++) {
      const res = await post(
        app,
        { access_key: form.accessKey, name: `n${i}` },
        { "x-forwarded-for": "203.0.113.9" },
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("kills the old access key after rotation", async () => {
    const { app, operator } = makeApp();
    const { form } = await seedForm(operator);
    const oldKey = form.accessKey;
    const rotated = operator.rotateAccessKey(form.id);
    const dead = await post(app, { access_key: oldKey, name: "Ada" });
    expect(dead.status).toBe(400);
    const live = await post(app, { access_key: rotated.accessKey, name: "Ada" });
    expect(live.status).toBe(200);
  });

  it("checks Turnstile fail-closed", async () => {
    const { app, operator } = makeApp({
      turnstile: async () => "unavailable",
    });
    const { form } = await seedForm(operator, { turnstileSecret: "cf-secret" });
    const res = await post(app, {
      access_key: form.accessKey,
      name: "Ada",
      "cf-turnstile-response": "token",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ message: "Please submit again." });
  });
});

describe("POST /submit in German", () => {
  it("answers visitors in the instance language", async () => {
    const { app, operator } = makeApp();
    operator.updateSettings({ locale: "de" });
    const res = await app.request("https://snd.test/submit", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: "access_key=nope",
    });
    expect(await res.json()).toMatchObject({ message: "Formular nicht gefunden." });
  });
});
