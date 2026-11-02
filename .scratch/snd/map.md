# snd spec

Label: `wayfinder:map`

## Destination

Spezifikation für **snd**: selbst gehosteter, später öffentlich MIT-lizenzierter Form-to-Mail-Dienst. Referenz-Instanz https://snd.mchlr.de auf dem Hostinger-VPS. Der Plan ist [spec.md](spec.md). Die Map ist klar: als Nächstes bauen, UI-Look in Paper wenn die Oberfläche ansteht.

## Notes

Plan: `spec.md`. Domain: `GLOSSARY.md`. Laien-Fragen an den Menschen; Technik in der Spec. UI zuerst in Paper; Fluid erst beim UI-Bau — dann Install-Prompt. Diese Map trägt keine Produkt-Implementierung.

## Decisions so far

- [MCP in einer TypeScript-Web-App](issues/06-mcp-in-typescript-web-app.md): Streamable HTTP am Pfad `/mcp`; Bearer davor; HTTP+SSE nicht verwenden.
- [SMTP-Vererbung, Tests und Geheimnisse](issues/01-smtp-inheritance.md): drei Konten (Admin, Project, Form ersetzt vollständig); Test sendet eine echte Mail; Passwörter write-only, `SND_SECRET`.
- [Retry und Admin-Benachrichtigung](issues/02-retry-and-admin-notify.md): Submission zuerst, Besucher sofort Erfolg, Queue 24h. Notify global (Default sofort), pro Form überschreibbar (sofort / aufgegeben / aus).
- [Submit-Limits, Turnstile, Key-Rotation](issues/03-submit-limits-turnstile-keys.md): 50 Felder / 100 KB / 30/min IP / 60/min Form; Key sofort tot; Turnstile optional, fail-closed.
- [Operator-Passwort und MCP-Token](issues/04-operator-password-and-mcp-token.md): beides Env (`SND_PASSWORD`, `SND_MCP_TOKEN`); kein Reset-Link.
- [MCP-Werkzeuge und Anschluss](issues/05-mcp-tools-and-connection.md): Parität mit der UI, `https://<instanz>/mcp`, Bearer.
- [DSGVO in snd](issues/07-dsgvo-in-snd.md): keine IP; CSV; löschen Eintrag/Form/Project; keine globale E-Mail-Suche; Retention nur konfiguriert.
- [Instanz: Domain, TLS, Prozess](issues/08-instance-domain-tls-process.md): snd.mchlr.de, Hostinger-VPS, Compose + Caddy, Open Source ohne fest verdrahtete Domain.

## Not yet specified

- Welche Fluid-Stücke die Paper-UI später braucht (nach dem Prototype)

## Out of scope

- Webhooks, Zapier, Slack
- Formular-Designer und snd-gehostete Dankeseiten
- Autoresponder / Kampagnen an Visitors
- Datei-Uploads
- Kunden-/Client-Hierarchie und Kunden-Login
- Analytics-Produkt (Funnels, Charts)
- Passkeys, Rollen, Multi-Operator
- snd als Mailhost (IMAP, Postfächer) — snd *sendet* nur
- AI-Spamfilter
- Auskunft „eine E-Mail auf allen Websites“
