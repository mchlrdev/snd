import { useState } from "react";
import { ExternalLink, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import type { SmtpInput, SmtpView } from "../api";
import { errorText } from "../lib/format";
import { t } from "@/lib/i18n";

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.from.trim())) return t("Enter the mailbox's email address.");
  if (!draft.password && !passwordSet) return t("The password is missing.");
  if (!draft.host.trim()) return t("Pick your provider or enter the server.");
  if (draft.port && !/^\d+$/.test(draft.port)) return t("The port must be a number.");
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
  { key: "custom", label: "Other provider", host: "", port: "587" },
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
 *  technical fields appear only for "Other provider". */
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
          label={t("Email address")}
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
          placeholder={t("contact@example.com")}
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
        />
        <InputField
          index={1}
          label={t("Password")}
          type="password"
          value={value.password}
          onChange={set("password")}
          placeholder={passwordSet ? t("••••••••  (saved)") : ""}
          autoComplete="new-password"
        />
      </InputGroup>

      <div className="flex flex-col gap-1.5">
        <span className={cn(typeClass("caption", "compact"), "pl-2.5 text-muted-foreground")}>{t("Provider")}</span>
        <Select value={providerKey} onValueChange={choose}>
          <SelectTrigger placeholder={t("Choose provider")} className="w-full" />
          <SelectContent>
            {PROVIDERS.map((item, index) => (
              <SelectItem key={item.key} index={index} value={item.key}>
                {t(item.label)}
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
            {t("Create an app password at Google")} <ExternalLink className="size-3" />
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
            placeholder={t("smtp.example.com")}
            autoComplete="off"
            spellCheck={false}
          />
          <InputField index={1} label="Port" value={value.port} onChange={set("port")} placeholder="587" inputMode="numeric" />
          <InputField
            index={2}
            label={t("Username")}
            value={value.user}
            onChange={set("user")}
            placeholder={value.from || t("same as the email address")}
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
            .then(() => setState({ kind: "ok", message: t("Test mail to {to} is on its way – check your inbox.", { to: to.trim() }) }))
            .catch((err: unknown) => setState({ kind: "error", message: errorText(err, t("Test failed.")) }));
        }}
      >
        <InputGroup className="w-full max-w-none flex-1">
          <InputField index={0} label={t("Send test mail to")} value={to} onChange={setTo} placeholder={t("you@example.com")} inputMode="email" />
        </InputGroup>
        <Button type="submit" variant="secondary" leadingIcon={Send} loading={state.kind === "busy"} disabled={!to.includes("@") || state.kind === "busy"}>
          {t("Send")}
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
