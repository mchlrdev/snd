import { useEffect, useMemo, useState } from "react";
import { Bell, Bot, Clock, Languages, Mail } from "lucide-react";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { api, type NotifyPolicy } from "../api";
import type { Locale } from "@/lib/i18n";
import { Section, StatusPill } from "../components/kit";
import { McpSetup } from "../components/McpSetup";
import { PageHeader, PageTabs, usePageTab, type PageTab } from "../components/PageHeader";
import { SaveFooter, useSave } from "../components/SaveFooter";
import { NotifyChoice } from "../components/SettingsWidgets";
import { emptySmtp, SmtpFields, smtpFromDraft, smtpProblem, SmtpTest, smtpChanged, type SmtpDraft } from "../components/SmtpFields";
import { useProjects } from "../projects-context";
import { t } from "@/lib/i18n";

const TABS: PageTab[] = [
  { key: "general", label: "General", icon: Languages },
  { key: "alerts", label: "Alerts", icon: Bell },
  { key: "retention", label: "Retention", icon: Clock },
  { key: "agents", label: "AI agents", icon: Bot },
];

export function SettingsPage() {
  const { settings, reload } = useProjects();
  const tab = usePageTab(TABS);
  if (!settings) return null;
  return (
    <>
      <PageHeader title={t("Settings")} tabs={<PageTabs tabs={TABS} index={tab.index} onSelect={tab.select} />} />
      {tab.key === "general" ? <General onSaved={reload} /> : null}
      {tab.key === "alerts" ? <Warnings onSaved={reload} /> : null}
      {tab.key === "retention" ? <Retention onSaved={reload} /> : null}
      {tab.key === "agents" ? (
        <McpSetup
          token={settings.mcpToken}
          origin={window.location.origin}
          onRotate={async () => {
            await api.rotateMcpToken();
            await reload();
          }}
        />
      ) : null}
    </>
  );
}

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];

/** One language for the console, the default mail template and the answers
 *  visitors get from the form. Language names stay in their own language. */
function General({ onSaved }: { onSaved: () => Promise<void> }) {
  const { settings } = useProjects();
  const [locale, setLocaleDraft] = useState<Locale>(settings?.locale ?? "en");
  const save = useSave();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        icon={<Languages />}
        title={t("Language")}
        description={t("Used for this console, the default notification mail and the messages visitors see after submitting.")}
        footer={
          <SaveFooter
            state={save.state}
            dirty={locale !== settings?.locale}
            onSave={() =>
              void save.run(async () => {
                await api.updateSettings({ locale });
                await onSaved();
              })
            }
          />
        }
      >
        <RadioGroup value={locale} onValueChange={(next) => setLocaleDraft(next as Locale)} className="max-w-md">
          {LANGUAGES.map((language, index) => (
            <RadioItem key={language.value} index={index} value={language.value} label={language.label} />
          ))}
        </RadioGroup>
      </Section>
    </div>
  );
}

function Warnings({ onSaved }: { onSaved: () => Promise<void> }) {
  const { settings } = useProjects();
  const admin = settings?.adminSmtp ?? null;
  const [smtp, setSmtp] = useState<SmtpDraft>(emptySmtp(admin));
  const [notify, setNotify] = useState<NotifyPolicy>(settings?.notifyPolicy ?? "immediate");
  const mailbox = useSave();
  const policy = useSave();

  useEffect(() => setSmtp(emptySmtp(admin)), [admin?.host, admin?.user, admin?.from, admin?.port]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => smtpChanged(admin, smtp), [admin, smtp]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        icon={<Bell />}
        title={t("Alert me when a message isn't delivered")}
        footer={
          <SaveFooter
            state={policy.state}
            dirty={notify !== settings?.notifyPolicy}
            onSave={() => void policy.run(async () => {
              await api.updateSettings({ notifyPolicy: notify });
              await onSaved();
            })}
          />
        }
      >
        <NotifyChoice value={notify} onChange={(next) => setNotify(next as NotifyPolicy)} />
      </Section>

      <Section
        icon={<Mail />}
        title={t("Mailbox for alerts")}

        footer={
          <SaveFooter
            state={mailbox.state}
            dirty={dirty}
            onSave={() => {
              const problem = smtpProblem(smtp, Boolean(admin?.passwordSet));
              if (problem) return mailbox.fail(problem);
              void mailbox.run(async () => {
                await api.updateSettings({ adminSmtp: smtpFromDraft(smtp) });
                setSmtp((draft) => ({ ...draft, password: "" }));
                await onSaved();
              });
            }}
            extra={
              admin ? (
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => void mailbox.run(async () => {
                    await api.updateSettings({ adminSmtp: null });
                    await onSaved();
                  })}
                >
                  {t("Disconnect")}
                </Button>
              ) : null
            }
          />
        }
      >
        {admin ? (
          <StatusPill tone="ok" className="self-start">{t("Alerts go to {address}", { address: admin.from })}</StatusPill>
        ) : notify !== "off" ? (
          <StatusPill tone="warn" className="self-start">{t("Without a mailbox you won't get alerts")}</StatusPill>
        ) : null}
        <SmtpFields value={smtp} onChange={setSmtp} passwordSet={Boolean(admin?.passwordSet)} />
        <SmtpTest disabled={!admin || dirty} defaultTo={admin?.from} onTest={(to) => api.testAdminSmtp(to)} />
      </Section>
    </div>
  );
}

function Retention({ onSaved }: { onSaved: () => Promise<void> }) {
  const { settings } = useProjects();
  const initial = settings?.retentionDays ? String(settings.retentionDays) : "";
  const [days, setDays] = useState(initial);
  const [limited, setLimited] = useState(Boolean(settings?.retentionDays));
  const save = useSave();
  const value = limited ? days.trim() : "";
  const invalid = limited && !/^[1-9]\d*$/.test(days.trim());

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        icon={<Clock />}
        title={t("Stored messages")}
        footer={
          <SaveFooter
            state={save.state}
            dirty={value !== initial}
            onSave={() => {
              if (invalid) return save.fail(t("Enter a whole number of days, e.g. 90."));
              void save.run(async () => {
                await api.updateSettings({ retentionDays: value ? Number(value) : null });
                await onSaved();
              });
            }}
          />
        }
      >
        <RetentionChoice limited={limited} onChange={setLimited} />
        {limited ? (
          <InputGroup className="w-full max-w-xs">
            <InputField
              index={0}
              label={t("Delete after (days)")}
              value={days}
              onChange={setDays}
              placeholder="90"
              inputMode="numeric"
              error={invalid && days ? t("Whole days only") : undefined}
            />
          </InputGroup>
        ) : null}
      </Section>
    </div>
  );
}


function RetentionChoice({ limited, onChange }: { limited: boolean; onChange: (next: boolean) => void }) {
  return (
    <RadioGroup value={limited ? "limited" : "forever"} onValueChange={(next) => onChange(next === "limited")} className="max-w-md">
      <RadioItem index={0} value="forever" label={t("Keep until I delete them")} />
      <RadioItem index={1} value="limited" label={t("Delete automatically after some days")} />
    </RadioGroup>
  );
}
