Type: grilling
Status: resolved

## Question

Ein TypeScript-Prozess, SQLite. Unter welcher Domain hängt snd, wer terminiert TLS, und sprechen UI, öffentlicher Submit und MCP dieselbe Origin? Was muss der Operator auf dem VPS anfassen außer Env und der SQLite-Datei?

## Answer

snd.mchlr.de auf dem Hostinger-VPS, Compose + Caddy, eine Origin für UI/Submit/MCP. Open Source: Domain nur Konfiguration. Env: Passwort, MCP-Token, `SND_SECRET`. Siehe [spec.md](../spec.md).
