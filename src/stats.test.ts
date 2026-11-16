import { describe, expect, it } from "vitest";
import { bucketKey, bucketKeys, computeStats } from "./stats.js";
import { iconCandidates, publicHttpUrl, sniffImage } from "./favicon.js";
import { makeApp } from "./test-helpers.js";

const DAY = 86_400_000;

describe("stats", () => {
  it("builds day, week and month buckets in the time zone", () => {
    const t = Date.parse("2026-11-02T23:30:00Z"); // already 3 Nov in Berlin
    expect(bucketKey(t, "day", "Europe/Berlin")).toBe("2026-11-03");
    expect(bucketKey(t, "week", "Europe/Berlin")).toBe("2026-11-02");
    expect(bucketKey(t, "month", "Europe/Berlin")).toBe("2026-11");
    expect(bucketKeys(t - 6 * DAY, t + 1, "day", "Europe/Berlin")).toHaveLength(7);
  });

  it("counts by status and detects choice fields", () => {
    const base = Date.parse("2026-11-01T10:00:00Z");
    const rows = ["Torte", "Torte", "Brot", "Torte"].map((topic, i) => ({
      createdAt: base + i * DAY,
      mailStatus: i === 3 ? ("abandoned" as const) : ("sent" as const),
      formId: "f",
      projectId: "p",
      fields: { thema: topic, nachricht: `freier Text ${i}` },
    }));
    const stats = computeStats({ rows, previousTotal: 2, since: Date.parse("2026-11-01T00:00:00Z"), until: Date.parse("2026-11-05T00:00:00Z"), bucket: "day", timeZone: "UTC" });
    expect(stats.totals).toEqual({ total: 4, delivered: 3, pending: 0, failed: 1 });
    expect(stats.series.map((p) => p.total)).toEqual([1, 1, 1, 1]);
    expect(stats.fields.find((f) => f.name === "thema")?.values).toEqual([
      { value: "Torte", count: 3 },
      { value: "Brot", count: 1 },
    ]);
    expect(stats.fields.find((f) => f.name === "nachricht")?.values).toBeNull();
  });

  it("filters by field value and status through operator and MCP", async () => {
    const { operator, store, clock, app } = makeApp();
    const project = operator.createProject({ label: "A", origins: ["https://a.example"] });
    const form = operator.createForm(project.id, { name: "Kontakt", recipients: ["x@a.example"] });
    for (const thema of ["Torte", "Brot", "Torte"]) {
      store.createSubmission({ formId: form.id, fields: { thema }, replyTo: null, subject: null, now: clock.value - DAY });
    }
    expect(operator.stats({ filter: { formId: form.id, field: "thema", value: "Torte" } }).totals.total).toBe(2);
    expect(operator.listSubmissions({ query: "Brot" }).total).toBe(1);
    expect(operator.listSubmissions({ status: "delivered" }).total).toBe(0);

    const res = await app.request("https://snd.test/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer test-mcp-token-ok",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        host: "snd.test",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_stats", arguments: { projectId: project.id, days: 7 } },
      }),
    });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('\\"total\\": 3');
  });
});

describe("Favicons", () => {
  it("only accepts public addresses", () => {
    expect(publicHttpUrl("https://beispiel.de")).not.toBeNull();
    for (const bad of ["http://localhost", "http://127.0.0.1", "http://10.0.0.2", "http://192.168.1.1", "file:///etc/passwd", "http://[::1]"]) {
      expect(publicHttpUrl(bad)).toBeNull();
    }
  });

  it("detects images by their bytes and ranks icon links", () => {
    expect(sniffImage(Buffer.from("<!doctype html>"))).toBeNull();
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    const urls = iconCandidates(
      `<link rel="icon" href="/a.png" sizes="16x16"><link rel="apple-touch-icon" href="/touch.png"><link rel="stylesheet" href="/x.css">`,
      new URL("https://b.de/"),
    );
    expect(urls.map((u) => u.pathname)).toEqual(["/touch.png", "/a.png"]);
  });
});
