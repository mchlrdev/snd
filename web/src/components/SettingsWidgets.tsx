import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import type { NotifyPolicy } from "../api";
import { hostOf, NOTIFY_LABEL, toOrigin } from "../lib/format";
import { t } from "@/lib/i18n";

export function NotifyChoice({
  value,
  onChange,
  inheritLabel,
}: {
  value: NotifyPolicy | "inherit";
  onChange: (next: NotifyPolicy | "inherit") => void;
  inheritLabel?: string;
}) {
  const options: { value: NotifyPolicy | "inherit"; label: string }[] = [
    ...(inheritLabel ? [{ value: "inherit" as const, label: inheritLabel }] : []),
    { value: "immediate", label: t(NOTIFY_LABEL.immediate) },
    { value: "abandoned", label: t(NOTIFY_LABEL.abandoned) },
    { value: "off", label: t(NOTIFY_LABEL.off) },
  ];
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(next as NotifyPolicy | "inherit")} className="w-full max-w-lg">
      {options.map((option, index) => (
        <RadioItem key={option.value} index={index} value={option.value} label={option.label} />
      ))}
    </RadioGroup>
  );
}

/** A list you add to and remove from, one entry per chip. `parse` turns what
 *  was typed into one or more stored values, or an error message. */
function ChipList({
  value,
  onChange,
  label,
  placeholder,
  parse,
  group = (item) => item,
  display = (item) => item,
  inputMode,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
  placeholder: string;
  parse: (raw: string) => string[] | string;
  group?: (item: string) => string;
  display?: (key: string) => string;
  inputMode?: "url" | "email";
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();
  const groups = [...new Set(value.map(group))];

  function add() {
    const parts = draft.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const part of parts) {
      const parsed = parse(part);
      if (typeof parsed === "string") {
        setError(parsed);
        return;
      }
      for (const item of parsed) if (!next.includes(item)) next.push(item);
    }
    onChange(next);
    setDraft("");
    setError(undefined);
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {groups.map((key) => (
            <li
              key={key}
              className={cn(typeClass("body", "compact"), "flex h-7 items-center gap-0.5 rounded-full bg-background pr-0.5 pl-3 text-foreground shadow-[0_0_0_0.5px_var(--separator),0_1px_1px_rgb(0_0_0/0.04)]")}
            >
              {display(key)}
              <button
                type="button"
                aria-label={t("Remove {name}", { name: display(key) })}
                onClick={() => onChange(value.filter((item) => group(item) !== key))}
                className="ml-0.5 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-end gap-2">
        <InputGroup className="w-full max-w-none flex-1">
          <InputField
            index={0}
            label={label}
            value={draft}
            onChange={(next) => {
              setDraft(next);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            onBlur={() => draft.trim() && add()}
            placeholder={placeholder}
            inputMode={inputMode}
            autoComplete="off"
            spellCheck={false}
            error={error}
          />
        </InputGroup>
        <Button type="button" variant="secondary" leadingIcon={Plus} onClick={add} disabled={!draft.trim()}>
          {t("Add")}
        </Button>
      </div>
    </div>
  );
}

/** "example.com" → https://example.com and https://www.example.com, because
 *  visitors reach most sites both ways. Other subdomains stay as typed. */
export function originsFor(raw: string): string[] | string {
  const origin = toOrigin(raw);
  let url: URL;
  try {
    url = new URL(origin);
    if (!url.hostname.includes(".")) throw new Error();
  } catch {
    return t("That doesn't look like a web address.");
  }
  const host = url.host.replace(/^www\./, "");
  const isApex = host.split(".").length === 2 || url.host.startsWith("www.");
  const base = `${url.protocol}//${host}`;
  return isApex ? [base, `${url.protocol}//www.${host}`] : [origin];
}

function siteKey(origin: string): string {
  return hostOf(origin).replace(/^www\./, "");
}

export function OriginsEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <ChipList
      value={value}
      onChange={onChange}
      label={value.length ? t("Another address") : t("Website address")}
      placeholder={t("example.com")}
      inputMode="url"
      parse={originsFor}
      group={siteKey}
    />
  );
}

export function RecipientsEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <ChipList
      value={value}
      onChange={onChange}
      label={value.length ? t("Another address") : t("Email address")}
      placeholder={t("info@example.com")}
      inputMode="email"
      parse={(raw) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? [raw.toLowerCase()] : t("That is not an email address."))}
    />
  );
}
