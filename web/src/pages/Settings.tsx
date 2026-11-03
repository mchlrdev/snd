import { useEffect, useMemo, useState } from "react";
import { Bell, Bot, Clock, Mail } from "lucide-react";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { api, type NotifyPolicy } from "../api";
import { Section, StatusPill } from "../components/kit";
import { McpSetup } from "../components/McpSetup";
import { PageHeader, PageTabs, usePageTab, type PageTab } from "../components/PageHeader";
import { SaveFooter, useSave } from "../components/SaveFooter";
import { NotifyChoice } from "../components/SettingsWidgets";
import { emptySmtp, SmtpFields, smtpFromDraft, smtpProblem, SmtpTest, smtpChanged, type SmtpDraft } from "../components/SmtpFields";
import { useProjects } from "../projects-context";

const TABS: PageTab[] = [
  { key: "warnungen", label: "Warnungen", icon: Bell },
  { key: "aufbewahrung", label: "Aufbewahrung", icon: Clock },
  { key: "agenten", label: "KI-Agenten", icon: Bot },
];

export function SettingsPage() {
  const { settings, reload } = useProjects();
  const tab = usePageTab(TABS);
  if (!settings) return null;
  return (
    <>
      <PageHeader title="Einstellungen" tabs={<PageTabs tabs={TABS} index={tab.index} onSelect={tab.select} />} />
      {tab.key === "warnungen" ? <Warnings onSaved={reload} /> : null}
      {tab.key === "aufbewahrung" ? <Retention onSaved={reload} /> : null}
      {tab.key === "agenten" ? (
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
        title="Warnen, wenn eine Nachricht nicht ankommt"
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
        title="Postfach für Warnungen"

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
                  Trennen
                </Button>
              ) : null
            }
          />
        }
      >
        {admin ? (
          <StatusPill tone="ok" className="self-start">Warnungen gehen an {admin.from}</StatusPill>
        ) : notify !== "off" ? (
          <StatusPill tone="warn" className="self-start">Ohne Postfach bekommst du keine Warnungen</StatusPill>
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
        title="Gespeicherte Nachrichten"
        footer={
          <SaveFooter
            state={save.state}
            dirty={value !== initial}
            onSave={() => {
              if (invalid) return save.fail("Gib eine ganze Zahl von Tagen an, z. B. 90.");
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
              label="Löschen nach (Tagen)"
              value={days}
              onChange={setDays}
              placeholder="90"
              inputMode="numeric"
              error={invalid && days ? "Nur ganze Tage" : undefined}
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
      <RadioItem index={0} value="forever" label="Behalten, bis ich sie lösche" />
      <RadioItem index={1} value="limited" label="Automatisch löschen nach einigen Tagen" />
    </RadioGroup>
  );
}
