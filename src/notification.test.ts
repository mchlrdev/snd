import { describe, expect, it } from "vitest";
import {
  compileTemplate,
  defaultTemplate,
  fieldTitle,
  formatReceived,
  renderNotification,
  unknownVariables,
} from "./notification.js";

const base = {
  id: "s1",
  projectLabel: "DEV Inkasso Italiano",
  formName: "Contact",
  createdAt: Date.parse("2026-11-03T11:41:51.528Z"),
  fields: { name: "Testi", email: "info@testi.org", message: "Line 1\r\nLine 2" },
  fieldLabels: {},
  replyTo: "info@testi.org",
  subject: null,
};

describe("notification", () => {
  it("formats date and time readably in the configured time zone and language", () => {
    expect(formatReceived(base.createdAt, "Europe/Berlin")).toEqual({ date: "Tue, 3 November 2026", time: "12:41" });
    expect(formatReceived(base.createdAt, "Europe/Berlin", "de")).toEqual({ date: "Di., 3. November 2026", time: "12:41 Uhr" });
  });

  it("prefers own field titles over known names and the field name", () => {
    expect(fieldTitle("message", { message: "Your request" })).toBe("Your request");
    expect(fieldTitle("email", {})).toBe("Email");
    expect(fieldTitle("email", {}, "de")).toBe("E-Mail");
    expect(fieldTitle("tel_mobile", {})).toBe("Tel mobile");
  });

  it("builds text and HTML with titles, line breaks and a mail link", () => {
    const { subject, text, html } = renderNotification(
      { ...base, fieldLabels: { name: "Full name" } },
      { timeZone: "Europe/Berlin" },
    );
    expect(subject).toBe("New message: Contact");
    expect(text).toContain("New message via Contact (DEV Inkasso Italiano)\nTue, 3 November 2026, 12:41\n\nFull name\nTesti\n");
    expect(html).toContain("Full name");
    expect(html).toContain("Line 1<br>Line 2");
    expect(html).toContain('href="mailto:info@testi.org"');
    expect(html).toContain(">12:41<");
  });

  it("uses German for the default template when the instance is German", () => {
    const { subject, text, html } = renderNotification({ ...base, subject: "Frage" }, { locale: "de" });
    expect(subject).toBe("Frage");
    expect(text).toContain("Neue Nachricht über Contact (DEV Inkasso Italiano)");
    expect(text).toContain("E-Mail\ninfo@testi.org");
    expect(html).toContain('<html lang="de"');
    expect(html).toContain("12:41 Uhr");
  });

  it("escapes everything that comes from the form", () => {
    const { html, subject } = renderNotification({
      ...base,
      formName: "<b>Form</b>",
      fields: { '<img src=x onerror="alert(1)">': '<script>alert("x")</script>', email: 'a"b@x.de' },
      subject: "Hi\r\nBcc: evil@example.com",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>Form</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(subject).toBe("Hi Bcc: evil@example.com");
  });

  it("renders a custom template and falls back to the default when it breaks", () => {
    const template = {
      subject: "[{{project.label}}] {{field.name}}",
      html: "<p>{{#fields}}{{title}}={{value}};{{/fields}}</p>{{^field.phone}}no phone{{/field.phone}}",
      text: "",
    };
    const ok = renderNotification(base, { template });
    expect(ok.templateError).toBeNull();
    expect(ok.subject).toBe("[DEV Inkasso Italiano] Testi");
    expect(ok.html).toBe("<p>Name=Testi;Email=info@testi.org;Message=Line 1<br>Line 2;</p>no phone");
    expect(ok.text).toContain("New message via Contact");

    const broken = renderNotification(base, { template: { ...template, html: "{{#fields}}" } });
    expect(broken.templateError).toContain("never closed");
    expect(broken.html).toContain("New message via Contact");
  });

  it("parses the default templates and flags unknown variables", () => {
    for (const locale of ["en", "de"] as const) {
      expect(unknownVariables(compileTemplate(defaultTemplate(locale), locale))).toEqual([]);
    }
    const compiled = compileTemplate({ subject: "", html: "{{feld.email}} {{#fields}}{{value}}{{/fields}}", text: "" }, "en");
    expect(unknownVariables(compiled)).toEqual(["{{feld.email}} (line 1)"]);
  });
});
