import { useState } from "react";
import { Bot, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputCopy } from "@/components/ui/input-copy";
import { Tabs, TabsItem } from "@/components/ui/tabs";
import { CodeBlock, Section } from "./kit";
import { ConfirmDialog } from "./ConfirmDialog";
import { t } from "@/lib/i18n";

const CLIENTS = ["Claude Code", "Cursor", "Claude Desktop", "Other"] as const;

/** One client at a time: pick yours, copy one block. Four blocks stacked
 *  read as four steps when it is one. */
export function McpSetup({ token, origin, onRotate }: { token: string; origin: string; onRotate: () => Promise<void> }) {
  const [client, setClient] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const url = `${origin}/mcp`;
  const header = `Authorization: Bearer ${token}`;
  const configs: Record<(typeof CLIENTS)[number], { label: string; code: string }> = {
    "Claude Code": {
      label: t("Run in the terminal"),
      code: `claude mcp add --transport http snd ${url} --header "${header}"`,
    },
    Cursor: {
      label: ".cursor/mcp.json",
      code: JSON.stringify({ mcpServers: { snd: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    },
    "Claude Desktop": {
      label: "claude_desktop_config.json",
      code: JSON.stringify({ mcpServers: { snd: { command: "npx", args: ["-y", "mcp-remote", url, "--header", header] } } }, null, 2),
    },
    Other: { label: t("Address and header"), code: `${url}\n${header}` },
  };
  const current = configs[CLIENTS[client]!];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        icon={<Bot />}
        title={t("Connect AI agents")}
        description={t("Let an AI assistant handle websites, forms and stats for you.")}
      >
        <Tabs selectedIndex={client} onSelect={setClient} size="compact" className="w-max max-w-full">
          {CLIENTS.map((name, index) => (
            <TabsItem key={name} index={index} label={name === "Other" ? t("Other") : name} />
          ))}
        </Tabs>
        <CodeBlock code={current.code} label={current.label} />
      </Section>
      <Section
        icon={<KeyRound />}
        title={t("Access key for agents")}

        footer={
          <Button variant="secondary" size="compact" onClick={() => setConfirm(true)}>
            {t("Create new key …")}
          </Button>
        }
      >
        <InputCopy label={t("Key")} value={token} className="min-w-0 overflow-hidden" />
      </Section>
      <ConfirmDialog
        open={confirm}
        title={t("Create a new key?")}
        description={t("All connected agents lose access immediately and have to be set up again.")}
        confirmLabel={t("Replace key")}
        onOpenChange={setConfirm}
        onConfirm={onRotate}
      />
    </div>
  );
}
