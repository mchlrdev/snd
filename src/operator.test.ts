import { describe, expect, it } from "vitest";
import { cookieFrom, makeApp } from "./test-helpers.js";

describe("Operator-API", () => {
  it("lehnt falsches Passwort ab und setzt nach Login ein Cookie", async () => {
    const { app, config } = makeApp();
    const bad = await app.request("https://snd.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "nope" }),
    });
    expect(bad.status).toBe(401);
    const ok = await app.request("https://snd.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: config.password }),
    });
    expect(ok.status).toBe(200);
    const cookie = cookieFrom(ok);
    const me = await app.request("https://snd.test/api/me", { headers: { cookie } });
    expect(me.status).toBe(200);
  });

  it("legt eine Seite ohne Origins an", async () => {
    const { operator } = makeApp();
    const project = operator.createProject({ label: "Leer" });
    expect(project.origins).toEqual([]);
    expect(project.notifyPolicy).toBeNull();
  });

  it("legt Project und Form an, ohne SMTP-Passwörter zurückzugeben", async () => {
    const { operator } = makeApp();
    const project = operator.createProject({
      label: "Kirche",
      origins: ["https://kirche.example"],
      smtp: {
        host: "smtp.example",
        port: 587,
        user: "mail",
        password: "super-secret",
        from: "pfarre@kirche.example",
      },
    });
    expect(project.smtp?.passwordSet).toBe(true);
    expect(JSON.stringify(project)).not.toContain("super-secret");
    const form = operator.createForm(project.id, {
      name: "Kontakt",
      recipients: ["pfarre@kirche.example"],
    });
    expect(form.accessKey.length).toBeGreaterThan(10);
    expect(form.snippet).toContain(form.accessKey);
    expect(form.snippet).toContain("https://snd.test/submit");
  });

  it("exportiert CSV und löscht eine Submission", async () => {
    const { app, operator, store } = makeApp();
    const project = operator.createProject({
      label: "Site",
      origins: ["https://site.example"],
      smtp: {
        host: "smtp.example",
        port: 587,
        user: "mail",
        password: "pw",
        from: "site@example.com",
      },
    });
    const form = operator.createForm(project.id, {
      name: "Kontakt",
      recipients: ["ops@example.com"],
    });
    const body = new URLSearchParams({
      access_key: form.accessKey,
      name: "Ada",
      email: "ada@example.com",
    }).toString();
    await app.request("https://snd.test/submit", {
      method: "POST",
      headers: {
        origin: "https://site.example",
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const csv = operator.exportFormCsv(form.id);
    expect(csv).toContain("ada@example.com");
    const listed = store.listSubmissions({ formId: form.id, limit: 10, offset: 0 });
    operator.deleteSubmission(listed.items[0]!.id);
    expect(store.countSubmissions({ formId: form.id })).toBe(0);
  });

  it("weist MCP ohne Bearer ab", async () => {
    const { app } = makeApp();
    const res = await app.request("https://snd.test/mcp", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("nimmt MCP-Bearer aus den Settings und invalidiert ihn beim Rotieren", async () => {
    const { app, operator } = makeApp();
    const token = operator.getSettings().mcpToken;
    expect(token).toBe("test-mcp-token-ok");
    const withToken = await app.request("https://snd.test/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(withToken.status).not.toBe(401);
    operator.rotateMcpToken();
    const stale = await app.request("https://snd.test/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(stale.status).toBe(401);
  });
});

