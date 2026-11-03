import { useState } from "react";
import { ExternalLink, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import type { SmtpInput, SmtpView } from "../api";
import { errorText } from "../lib/format";

export type SmtpDraft = {
  host: string;
  port: string;
  user: string;
  from: string;
  password: string;
};

export function emptySmtp(view?: SmtpView | null): SmtpDraft {
  return {
    host: view?.host ?? "",
    port: view?.port ? String(view.port) : "",
    // A login equal to the address is shown once, as the address.
    user: view && view.user !== view.from ? view.user : "",
    from: view?.from ?? "",
    password: "",
  };
}

export function smtpFromDraft(draft: SmtpDraft): SmtpInput | null {
  if (!draft.host.trim()) return null;
  const from = draft.from.trim();
  return {
    host: draft.host.trim(),
    port: Number(draft.port) || 587,
    user: draft.user.trim() || from,
    from,
    password: draft.password || undefined,
  };
}

/** What is still missing before the account can be saved. */
export function smtpProblem(draft: SmtpDraft, passwordSet: boolean): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.from.trim())) return "Gib die E-Mail-Adresse des Postfachs an.";
  if (!draft.password && !passwordSet) return "Das Passwort fehlt.";
  if (!draft.host.trim()) return "Wähle deinen Anbieter oder trag den Server ein.";
  if (draft.port && !/^\d+$/.test(draft.port)) return "Der Port ist eine Zahl.";
  return null;
}

/** Whether the draft differs from what is saved. */
export function smtpChanged(view: SmtpView | null | undefined, draft: SmtpDraft): boolean {
  if (draft.password) return true;
  const next = smtpFromDraft(draft);
  if (!view || !next) return Boolean(view) !== Boolean(next);
  return next.host !== view.host || next.port !== view.port || next.user !== view.user || next.from !== view.from;
}

type Provider = { key: string; label: string; host: string; port: string; domains?: string[]; appPassword?: string };

const PROVIDERS: Provider[] = [
  { key: "ionos", label: "IONOS", host: "smtp.ionos.de", port: "587" },
  { key: "strato", label: "Strato", host: "smtp.strato.de", port: "465" },
  { key: "hostinger", label: "Hostinger", host: "smtp.hostinger.com", port: "465" },
  {
    key: "gmail",
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: "587",
    domains: ["gmail.com", "googlemail.com"],
    appPassword: "https://myaccount.google.com/apppasswords",
  },
  {
    key: "outlook",
    label: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: "587",
    domains: ["outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de"],
  },
  { key: "gmx", label: "GMX", host: "mail.gmx.net", port: "587", domains: ["gmx.de", "gmx.net", "gmx.at", "gmx.ch"] },
  { key: "webde", label: "WEB.DE", host: "smtp.web.de", port: "587", domains: ["web.de"] },
  { key: "custom", label: "Anderer Anbieter", host: "", port: "587" },
];

function providerForHost(host: string): string {
  if (!host.trim()) return "";
  return PROVIDERS.find((p) => p.host && p.host === host.trim())?.key ?? "custom";
}

function providerForAddress(address: string): Provider | undefined {
  const domain = address.split("@")[1]?.toLowerCase();
  return domain ? PROVIDERS.find((p) => p.domains?.includes(domain)) : undefined;
}

/** Most people know their e-mail address and password, not their SMTP
 *  server. Pick the provider and those two fields are all there is; the
 *  technical fields appear only for "Anderer Anbieter". */
export function SmtpFields({
  value,
  onChange,
  passwordSet = false,
}: {
  value: SmtpDraft;
  onChange: (next: SmtpDraft) => void;
  passwordSet?: boolean;
}) {
  const [providerKey, setProviderKey] = useState(() => providerForHost(value.host));
  const provider = PROVIDERS.find((p) => p.key === providerKey);
  const set = (key: keyof SmtpDraft) => (next: string) => onChange({ ...value, [key]: next });

  function choose(key: string) {
    setProviderKey(key);
    const next = PROVIDERS.find((p) => p.key === key);
    if (!next) return;
    onChange({ ...value, host: next.host || (providerForHost(value.host) === "custom" ? value.host : ""), port: next.port });
  }

  return (
    <div className="flex flex-col gap-5">
      <InputGroup className="w-full max-w-none">
        <InputField
          index={0}
          label="E-Mail-Adresse"
          value={value.from}
          onChange={(next) => {
            const guess = providerForAddress(next);
            if (guess && !providerKey) {
              setProviderKey(guess.key);
              onChange({ ...value, from: next, host: guess.host, port: guess.port });
            } else {
              set("from")(next);
            }
          }}
          placeholder="kontakt@beispiel.de"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
        />
        <InputField
          index={1}
          label="Passwort"
          type="password"
          value={value.password}
          onChange={set("password")}
          placeholder={passwordSet ? "••••••••  (gespeichert)" : ""}
          autoComplete="new-password"
        />
      </InputGroup>

      <div className="flex flex-col gap-1.5">
        <span className={cn(typeClass("caption", "compact"), "pl-2.5 text-muted-foreground")}>Anbieter</span>
        <Select value={providerKey} onValueChange={choose}>
          <SelectTrigger placeholder="Anbieter wählen" className="w-full" />
          <SelectContent>
            {PROVIDERS.map((item, index) => (
              <SelectItem key={item.key} index={index} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {provider?.appPassword ? (
          <a
            href={provider.appPassword}
            target="_blank"
            rel="noreferrer"
            className={cn(typeClass("caption", "compact"), "inline-flex items-center gap-1 self-start pl-2.5 text-foreground underline underline-offset-2")}
          >
            App-Passwort bei Google erstellen <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>

      {providerKey === "custom" ? (
        <InputGroup className="w-full max-w-none">
          <InputField
            index={0}
            label="Server"
            value={value.host}
            onChange={set("host")}
            placeholder="smtp.beispiel.de"
            autoComplete="off"
            spellCheck={false}
          />
          <InputField index={1} label="Port" value={value.port} onChange={set("port")} placeholder="587" inputMode="numeric" />
          <InputField
            index={2}
            label="Benutzername"
            value={value.user}
            onChange={set("user")}
            placeholder={value.from || "wie die E-Mail-Adresse"}
            autoComplete="off"
            spellCheck={false}
          />
        </InputGroup>
      ) : null}
    </div>
  );
}

/** Sends a real test mail through the saved account, right next to it. */
export function SmtpTest({
  disabled,
  defaultTo = "",
  onTest,
}: {
  disabled?: boolean;
  defaultTo?: string;
  onTest: (to: string) => Promise<unknown>;
}) {
  const [to, setTo] = useState(defaultTo);
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "error"; message?: string }>({ kind: "idle" });
  if (disabled) return null;
  return (
    <div className="hairline-top -mx-4 flex flex-col gap-2 px-4 pt-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setState({ kind: "busy" });
          onTest(to.trim())
            .then(() => setState({ kind: "ok", message: `Testmail an ${to.trim()} ist raus – schau in dein Postfach.` }))
            .catch((err: unknown) => setState({ kind: "error", message: errorText(err, "Test fehlgeschlagen.") }));
        }}
      >
        <InputGroup className="w-full max-w-none flex-1">
          <InputField index={0} label="Testmail senden an" value={to} onChange={setTo} placeholder="du@beispiel.de" inputMode="email" />
        </InputGroup>
        <Button type="submit" variant="secondary" leadingIcon={Send} loading={state.kind === "busy"} disabled={!to.includes("@") || state.kind === "busy"}>
          Senden
        </Button>
      </form>
      {state.kind === "ok" ? (
        <p className={cn(typeClass("caption", "compact"), "text-[color-mix(in_oklab,var(--success)_70%,var(--foreground))]")} role="status">
          {state.message}
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className={cn(typeClass("caption", "compact"), "break-words text-destructive")} role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
