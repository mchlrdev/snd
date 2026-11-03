import { describe, expect, it } from "vitest";
import { fieldTitle, formatReceived, renderNotification } from "./notification.js";

const base = {
  projectLabel: "DEV Inkasso Italiano",
  formName: "Kontakt",
  createdAt: Date.parse("2026-11-03T11:41:51.528Z"),
  fields: { name: "Testi", email: "info@testi.org", message: "Zeile 1\r\nZeile 2" },
  fieldLabels: {},
};

describe("Benachrichtigung", () => {
  it("zeigt Datum und Uhrzeit lesbar in der eingestellten Zeitzone", () => {
    expect(formatReceived(base.createdAt, "Europe/Berlin")).toEqual({
      date: "Di., 3. November 2026",
      time: "12:41 Uhr",
    });
  });

  it("nimmt eigene Feldtitel vor bekannten Namen und dem Feldnamen", () => {
    expect(fieldTitle("message", { message: "Ihr Anliegen" })).toBe("Ihr Anliegen");
    expect(fieldTitle("email", {})).toBe("E-Mail");
    expect(fieldTitle("tel_mobil", {})).toBe("Tel mobil");
  });

  it("baut Text- und HTML-Fassung mit Titeln, Zeilenumbrüchen und Mail-Link", () => {
    const { text, html } = renderNotification({ ...base, fieldLabels: { name: "Vor- und Nachname" } }, "Europe/Berlin");
    expect(text).toContain("Neue Nachricht über Kontakt (DEV Inkasso Italiano)");
    expect(text).toContain("Di., 3. November 2026, 12:41 Uhr");
    expect(text).toContain("Vor- und Nachname\nTesti");
    expect(html).toContain("Vor- und Nachname");
    expect(html).toContain("Zeile 1<br>Zeile 2");
    expect(html).toContain('href="mailto:info@testi.org"');
    expect(html).toContain("12:41 Uhr");
  });

  it("maskiert alles, was aus dem Formular kommt", () => {
    const { html } = renderNotification({
      ...base,
      formName: "<b>Form</b>",
      fields: { '<img src=x onerror="alert(1)">': '<script>alert("x")</script>', email: 'a"b@x.de' },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>Form</b>");
    expect(html).toContain("&lt;script&gt;");
  });
});
