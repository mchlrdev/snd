import { describe, expect, it } from "vitest";
import { submissionsToCsv } from "./csv.js";
import { SESSION_MAX_AGE_MS } from "./crypto.js";
import { cookieFrom, makeApp } from "./test-helpers.js";

async function login(app: ReturnType<typeof makeApp>["app"], password: string, ip = "203.0.113.9") {
  return app.request("https://snd.test/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ password }),
  });
}

describe("operator API security", () => {
  it("expires sessions after 30 days", async () => {
    const { app, config, clock } = makeApp();
    const cookie = cookieFrom(await login(app, config.password));
    expect((await app.request("https://snd.test/api/me", { headers: { cookie } })).status).toBe(200);
    clock.value += SESSION_MAX_AGE_MS + 1;
    expect((await app.request("https://snd.test/api/me", { headers: { cookie } })).status).toBe(401);
  });

  it("throttles password guessing per IP", async () => {
    const { app, config } = makeApp();
    for (let i = 0; i < 10; i++) expect((await login(app, "falsch")).status).toBe(401);
    expect((await login(app, config.password)).status).toBe(429);
    expect((await login(app, config.password, "198.51.100.7")).status).toBe(200);
  });

  it("rejects writing requests from foreign origins", async () => {
    const { app, config } = makeApp();
    const cookie = cookieFrom(await login(app, config.password));
    const cross = await app.request("https://snd.test/api/projects", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: "https://evil.snd.test", host: "snd.test" },
      body: JSON.stringify({ label: "x" }),
    });
    expect(cross.status).toBe(403);
    const same = await app.request("https://snd.test/api/projects", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: "https://snd.test", host: "snd.test" },
      body: JSON.stringify({ label: "x" }),
    });
    expect(same.status).toBe(201);
  });

  it("sets protective headers on the console, not on /submit", async () => {
    const { app } = makeApp();
    const res = await app.request("https://snd.test/health");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const submit = await app.request("https://snd.test/submit", { method: "OPTIONS" });
    expect(submit.headers.get("x-frame-options")).toBeNull();
  });

  it("defuses formulas in the CSV export", () => {
    const csv = submissionsToCsv([
      {
        id: "1",
        formId: "f",
        fields: { name: "=HYPERLINK(\"http://x\")", note: "+1", ok: "Hallo" },
        replyTo: null,
        subject: null,
        createdAt: 0,
        mailStatus: "sent",
        mailAttempts: 1,
        lastError: null,
        nextAttemptAt: null,
      },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(",'+1,");
  });
});
