import { useState } from "react";
import { Bot, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputCopy } from "@/components/ui/input-copy";
import { Tabs, TabsItem } from "@/components/ui/tabs";
import { CodeBlock, Section } from "./kit";
import { ConfirmDialog } from "./ConfirmDialog";

const CLIENTS = ["Claude Code", "Cursor", "Claude Desktop", "Andere"] as const;

/** One client at a time: pick yours, copy one block. Four blocks stacked
 *  read as four steps when it is one. */
export function McpSetup({ token, origin, onRotate }: { token: string; origin: string; onRotate: () => Promise<void> }) {
  const [client, setClient] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const url = `${origin}/mcp`;
  const header = `Authorization: Bearer ${token}`;
  const configs: Record<(typeof CLIENTS)[number], { label: string; code: string }> = {
    "Claude Code": {
      label: "Im Terminal ausführen",
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
    Andere: { label: "Adresse und Header", code: `${url}\n${header}` },
  };
  const current = configs[CLIENTS[client]!];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        icon={<Bot />}
        title="KI-Agenten verbinden"
        description="Lass einen KI-Assistenten Websites, Formulare und Auswertungen für dich erledigen."
      >
        <Tabs selectedIndex={client} onSelect={setClient} size="compact" className="w-max max-w-full">
          {CLIENTS.map((name, index) => (
            <TabsItem key={name} index={index} label={name} />
          ))}
        </Tabs>
        <CodeBlock code={current.code} label={current.label} />
      </Section>
      <Section
        icon={<KeyRound />}
        title="Zugangsschlüssel für Agenten"

        footer={
          <Button variant="secondary" size="compact" onClick={() => setConfirm(true)}>
            Neuen Schlüssel erzeugen …
          </Button>
        }
      >
        <InputCopy label="Schlüssel" value={token} className="min-w-0 overflow-hidden" />
      </Section>
      <ConfirmDialog
        open={confirm}
        title="Neuen Schlüssel erzeugen?"
        description="Alle verbundenen Agenten verlieren sofort den Zugriff und müssen neu eingerichtet werden."
        confirmLabel="Schlüssel ersetzen"
        onOpenChange={setConfirm}
        onConfirm={onRotate}
      />
    </div>
  );
}
