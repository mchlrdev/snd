/**
 * A small, logic-less Mustache subset for notification mail templates.
 *
 * Supported:
 *   {{path}}            value, always escaped by the caller's escape function
 *   {{#path}}…{{/path}}  section: repeats for each item of a list, renders once
 *                        for any other non-empty value
 *   {{^path}}…{{/path}}  inverted section: renders when the value is empty
 *   {{! comment }}       ignored
 *   {{.}}                the current item inside a section
 *
 * Deliberately not supported, and rejected when parsing: unescaped output
 * ({{{x}}} and {{&x}}), partials ({{>x}}), delimiter changes ({{=…=}}),
 * blocks ({{$x}}, {{<x}}) and lambdas. Lookups only read own properties of
 * plain data, so nothing on a prototype (constructor, __proto__) is reachable.
 * Submitted values come from anonymous visitors; this is what keeps them from
 * injecting markup into the mail.
 */

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
    this.name = "TemplateError";
  }
}

type Node =
  | { kind: "text"; text: string }
  | { kind: "var"; path: string[]; line: number }
  | { kind: "section"; path: string[]; inverted: boolean; children: Node[]; line: number };

export type Template = { nodes: Node[]; paths: { path: string[]; line: number; depth: number }[] };

const PATH = /^(\.|[A-Za-z0-9_][A-Za-z0-9_-]*(\.[A-Za-z0-9_][A-Za-z0-9_-]*)*)$/;
const MAX_DEPTH = 8;
const MAX_OUTPUT = 2 * 1024 * 1024;

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

function parsePath(raw: string, line: number): string[] {
  if (!PATH.test(raw)) throw new TemplateError(`"{{${raw}}}" is not a valid variable name`, line);
  return raw === "." ? ["."] : raw.split(".");
}

type Token =
  | { kind: "text"; text: string }
  | { kind: "tag"; sigil: "" | "#" | "^" | "/" | "!"; name: string; line: number; start: number; end: number };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < source.length) {
    const open = source.indexOf("{{", pos);
    if (open === -1) {
      tokens.push({ kind: "text", text: source.slice(pos) });
      break;
    }
    if (open > pos) tokens.push({ kind: "text", text: source.slice(pos, open) });
    const line = lineAt(source, open);
    if (source[open + 2] === "{") {
      throw new TemplateError("unescaped output {{{…}}} is not allowed; use {{…}}", line);
    }
    const close = source.indexOf("}}", open + 2);
    if (close === -1) throw new TemplateError("a tag opened with {{ is never closed", line);
    let inner = source.slice(open + 2, close).trim();
    const first = inner[0] ?? "";
    let sigil: "" | "#" | "^" | "/" | "!" = "";
    if (first === "#" || first === "^" || first === "/" || first === "!") {
      sigil = first;
      inner = inner.slice(1).trim();
    } else if (first === "&") {
      throw new TemplateError("unescaped output {{&…}} is not allowed; use {{…}}", line);
    } else if (first === ">") {
      throw new TemplateError("partials {{>…}} are not supported", line);
    } else if (first === "=") {
      throw new TemplateError("changing delimiters {{=…=}} is not supported", line);
    } else if (first === "$" || first === "<") {
      throw new TemplateError(`blocks {{${first}…}} are not supported`, line);
    }
    if (!inner && sigil !== "!") throw new TemplateError("empty tag {{}}", line);
    tokens.push({ kind: "tag", sigil, name: inner, line, start: open, end: close + 2 });
    pos = close + 2;
  }
  return stripStandalone(tokens);
}

/** Section, closing and comment tags alone on a line take the whole line with
 *  them, so templates for plain-text mails can be laid out one tag per line. */
function stripStandalone(tokens: Token[]): Token[] {
  const last = tokens.length - 1;
  for (let i = 0; i <= last; i++) {
    const token = tokens[i]!;
    if (token.kind !== "tag" || token.sigil === "") continue;
    const before = i > 0 ? tokens[i - 1]! : null;
    const after = i < last ? tokens[i + 1]! : null;
    let lineStart = 0;
    if (before) {
      if (before.kind !== "text") continue;
      const nl = before.text.lastIndexOf("\n");
      // Without a line break before it, the tag is only alone if nothing precedes it.
      if (nl === -1 && i !== 1) continue;
      if (!/^[ \t]*$/.test(before.text.slice(nl + 1))) continue;
      lineStart = nl + 1;
    }
    let consumed = 0;
    if (after) {
      if (after.kind !== "text") continue;
      const match = /^[ \t]*(\r?\n)/.exec(after.text);
      if (match) consumed = match[0].length;
      else if (i + 1 === last && /^[ \t]*$/.test(after.text)) consumed = after.text.length;
      else continue;
    }
    if (before?.kind === "text") before.text = before.text.slice(0, lineStart);
    if (after?.kind === "text") after.text = after.text.slice(consumed);
  }
  return tokens;
}

export function parseTemplate(source: string): Template {
  const tokens = tokenize(source);
  const root: Node[] = [];
  const stack: { node: Extract<Node, { kind: "section" }>; name: string }[] = [];
  const paths: Template["paths"] = [];
  const current = () => (stack.length ? stack[stack.length - 1]!.node.children : root);
  for (const token of tokens) {
    if (token.kind === "text") {
      if (token.text) current().push({ kind: "text", text: token.text });
      continue;
    }
    if (token.sigil === "!") continue;
    if (token.sigil === "/") {
      const open = stack.pop();
      if (!open) throw new TemplateError(`{{/${token.name}}} closes a section that was never opened`, token.line);
      if (open.name !== token.name) {
        throw new TemplateError(`{{/${token.name}}} does not match the open section {{#${open.name}}}`, token.line);
      }
      continue;
    }
    const path = parsePath(token.name, token.line);
    paths.push({ path, line: token.line, depth: stack.length });
    if (token.sigil === "") {
      current().push({ kind: "var", path, line: token.line });
      continue;
    }
    if (stack.length >= MAX_DEPTH) throw new TemplateError(`sections are nested more than ${MAX_DEPTH} deep`, token.line);
    const node: Extract<Node, { kind: "section" }> = {
      kind: "section",
      path,
      inverted: token.sigil === "^",
      children: [],
      line: token.line,
    };
    current().push(node);
    stack.push({ node, name: token.name });
  }
  const unclosed = stack.pop();
  if (unclosed) throw new TemplateError(`section {{#${unclosed.name}}} is never closed`, unclosed.node.line);
  return { nodes: root, paths };
}

/** Plain JSON-like data: strings, numbers, booleans, null, arrays, objects. */
export type TemplateValue = string | number | boolean | null | undefined | TemplateValue[] | { [key: string]: TemplateValue };

function isRecord(value: unknown): value is Record<string, TemplateValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lookup(stack: TemplateValue[], path: string[]): TemplateValue {
  if (path[0] === ".") return stack[stack.length - 1];
  const [head, ...rest] = path as [string, ...string[]];
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i];
    if (isRecord(frame) && Object.hasOwn(frame, head)) {
      let value: TemplateValue = frame[head];
      for (const key of rest) {
        if (!isRecord(value) || !Object.hasOwn(value, key)) return undefined;
        value = value[key];
      }
      return value;
    }
  }
  return undefined;
}

function isEmpty(value: TemplateValue): boolean {
  if (value == null || value === false || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asText(value: TemplateValue): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function renderTemplate(template: Template, data: TemplateValue, escape: (value: string) => string): string {
  let out = "";
  const walk = (nodes: Node[], stack: TemplateValue[]) => {
    for (const node of nodes) {
      if (node.kind === "text") out += node.text;
      else if (node.kind === "var") out += escape(asText(lookup(stack, node.path)));
      else {
        const value = lookup(stack, node.path);
        const empty = isEmpty(value);
        if (node.inverted) {
          if (empty) walk(node.children, stack);
        } else if (!empty) {
          if (Array.isArray(value)) for (const item of value) walk(node.children, [...stack, item]);
          else if (value === true) walk(node.children, stack);
          else walk(node.children, [...stack, value]);
        }
      }
      if (out.length > MAX_OUTPUT) throw new TemplateError("the rendered mail is larger than 2 MB", "line" in node ? node.line : 0);
    }
  };
  walk(template.nodes, [data]);
  return out;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** HTML escaping that also keeps line breaks of multi-line values visible. */
export function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n?|\n/g, "<br>");
}
