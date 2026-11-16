import { describe, expect, it } from "vitest";
import { escapeHtmlMultiline, parseTemplate, renderTemplate, TemplateError, type TemplateValue } from "./template.js";

function render(source: string, data: TemplateValue, escape: (value: string) => string = escapeHtmlMultiline): string {
  return renderTemplate(parseTemplate(source), data, escape);
}

describe("template engine", () => {
  it("inserts escaped values and reads nested paths", () => {
    expect(render("Hi {{user.name}}!", { user: { name: "<Ada & Bob>" } })).toBe("Hi &lt;Ada &amp; Bob&gt;!");
    expect(render("{{missing}}|{{user.missing}}", { user: {} })).toBe("|");
    expect(render("{{a}}", { a: "x\ny" })).toBe("x<br>y");
  });

  it("repeats sections over lists and skips empty values", () => {
    const data = { items: [{ v: "a" }, { v: "b" }], empty: [], flag: true, off: false, text: "" };
    expect(render("{{#items}}[{{v}}]{{/items}}", data)).toBe("[a][b]");
    expect(render("{{#empty}}x{{/empty}}{{^empty}}none{{/empty}}", data)).toBe("none");
    expect(render("{{#flag}}on{{/flag}}{{#off}}off{{/off}}{{^text}}blank{{/text}}", data)).toBe("onblank");
    expect(render("{{#list}}{{.}},{{/list}}", { list: ["x", "y"] })).toBe("x,y,");
  });

  it("looks up outer names inside sections", () => {
    expect(render("{{#items}}{{v}}@{{site}} {{/items}}", { site: "s", items: [{ v: "a" }] })).toBe("a@s ");
  });

  it("never reaches prototype properties", () => {
    expect(render("{{constructor}}{{toString}}{{a.__proto__}}{{a.constructor.name}}", { a: {} })).toBe("");
    const map = Object.create(null) as Record<string, TemplateValue>;
    map.__proto__ = "own";
    expect(render("{{m.__proto__}}", { m: map })).toBe("own");
  });

  it("rejects raw output, partials and delimiter changes", () => {
    for (const source of ["{{{x}}}", "{{&x}}", "{{>x}}", "{{=<% %>=}}", "{{$x}}"]) {
      expect(() => parseTemplate(source)).toThrow(TemplateError);
    }
  });

  it("reports unbalanced sections with a line number", () => {
    expect(() => parseTemplate("a\n{{#x}}")).toThrow("line 2: section {{#x}} is never closed");
    expect(() => parseTemplate("{{#x}}{{/y}}")).toThrow("does not match");
    expect(() => parseTemplate("{{/x}}")).toThrow("never opened");
    expect(() => parseTemplate("{{ bad name }}")).toThrow("not a valid variable name");
    expect(() => parseTemplate("{{x")).toThrow("never closed");
  });

  it("removes lines that only hold a section tag", () => {
    const source = "Head\n{{#items}}\n- {{v}}\n{{/items}}\nTail\n";
    expect(render(source, { items: [{ v: "a" }, { v: "b" }] }, (v) => v)).toBe("Head\n- a\n- b\nTail\n");
  });
});
