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
  it("speichert und antwortet JSON", async () => {
    const { app, operator, store, mail, queue } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(app, {
      access_key: form.accessKey,
      name: "Ada",
      email: "ada@example.com",
      message: "Hallo",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: "Formular gesendet." });
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

  it("leitet mit 303 auf die Origin der Website um", async () => {
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

  it("lehnt fehlendes redirect ohne JSON ab", async () => {
    const { app, operator, store } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(
      app,
      { access_key: form.accessKey, name: "Ada" },
      { accept: "text/html" },
    );
    expect(res.status).toBe(400);
    expect(store.countSubmissions({ formId: form.id })).toBe(0);
    expect(await res.text()).toContain("Kein redirect");
  });

  it("lehnt fremde Origins ab", async () => {
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

  it("lehnt redirect auf eine fremde Origin ab", async () => {
    const { app, operator } = makeApp();
    const { form } = await seedForm(operator);
    const res = await post(app, {
      access_key: form.accessKey,
      name: "Ada",
      redirect: "https://evil.example/phish",
    });
    expect(res.status).toBe(400);
  });

  it("verwirft Honeypot still und speichert nicht", async () => {
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

  it("begrenzt die Feldanzahl", async () => {
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

  it("lässt den alten Access Key nach Rotation tot", async () => {
    const { app, operator } = makeApp();
    const { form } = await seedForm(operator);
    const oldKey = form.accessKey;
    const rotated = operator.rotateAccessKey(form.id);
    const dead = await post(app, { access_key: oldKey, name: "Ada" });
    expect(dead.status).toBe(400);
    const live = await post(app, { access_key: rotated.accessKey, name: "Ada" });
    expect(live.status).toBe(200);
  });

  it("prüft Turnstile fail-closed", async () => {
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
    expect(await res.json()).toMatchObject({ message: "Bitte nochmal absenden." });
  });
});
