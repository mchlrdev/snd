# snd — Plan

Stand: 2026-11-02. Geschlossen: nichts mehr zu entscheiden, bevor gebaut wird. UI-Look kommt in Paper, wenn die Oberfläche an der Reihe ist.

## Was es ist

Open-Source-App. Referenz-Instanz: **https://snd.mchlr.de** auf dem Hostinger-VPS. Andere betreiben ihre eigene Kopie; in der Software steht keine feste Domain.

Statische Websites schicken Formulare an snd. snd speichert den Eintrag und schickt eine E-Mail. Du und dein Agent verwalten Websites, Formulare, Posteingang und Versand.

Kein Formular-Baukasten. Das HTML bleibt auf der Website. snd *sendet* nur, es ist kein Postfach.

Lizenz: MIT.

## Die Stücke

- **Project** = eine Website (erlaubte Adressen, ein Mailkonto, optionales Label).
- **Form** = ein Formular darauf (Empfänger, Access Key, optional eigenes Mailkonto, optional Turnstile, optional eigene Versand-Benachrichtigung).
- **Submission** = ein abgeschicktes Formular. Zählen, ansehen, löschen, CSV.
- **Operator** = wer die Instanz betreibt. Passwort und Agent-Token stehen in der Env, nicht in der Datenbank.

## Was der Besucher tut

Wie [Mektup](https://usemektup.com/forms/):

- `action` → `https://snd.mchlr.de/submit` (bzw. die Domain der jeweiligen Instanz)
- verstecktes `access_key`
- optional `redirect` → 303 auf eine Danke-Seite *dieser* Website
- oder JavaScript mit `Accept: application/json` → `{ success, message }`
- ohne beides: Fehler, keine snd-Dankeseite
- `email` / `replyto` → Reply-To; `subject` → Betreff; `botcheck` ausgefüllt → still verwerfen
- alle anderen Felder frei, landen in Mail und Inbox
- Absender und `redirect` nur von/auf die Origins des Projects

Grenzen: 50 Felder, 100 KB, 30 Absendungen/Minute pro IP, 60 pro Form. Key rotieren = alter Key sofort tot.

Turnstile optional pro Form: Secret gesetzt → snd prüft den Token bei Cloudflare. Cloudflare weg → „bitte nochmal“, kein ungeprüftes Durchlassen.

## Mail

Drei Konten in der App, jedes mit „Test senden“ (echte kurze Mail an eine Adresse, die du angibst):

1. **Admin-SMTP** — Betriebsmail an dich.
2. **Project-SMTP** — Standard für die Formulare dieser Website.
3. **Form-SMTP** — optional, ersetzt das Project-Konto vollständig.

SMTP-Passwörter: hineinschreiben, nie wieder anzeigen.

Ablauf:

1. Prüfen (Origin, Honeypot, Limits, optional Turnstile).
2. Submission speichern.
3. Besucher sieht sofort Erfolg — auch wenn die Mail noch nicht raus ist.
4. Mail in die Warteschlange, Retry 24 Stunden (8 Versuche).
5. Ob du bei Problemen Mail kriegst, hängt an der **Benachrichtigung**: global einstellbar, Werkseinstellung **sofort** (erster Fehlschlag). Pro Form überschreibbar, sonst gilt global. Auswahl: sofort / erst wenn aufgegeben / aus. Zusätzlich immer sichtbar in der Inbox (Status, erneut senden).

## Oberfläche (Paper, dann Fluid)

- Login gegen das Env-Passwort
- Projects, Forms, Inbox (Zahl, Liste, Detail, löschen, CSV, erneut senden)
- Form: Empfänger, Key + rotieren, Snippet, SMTP-Override, Turnstile optional, Benachrichtigung (oder „wie global“)
- Einstellungen: Admin-SMTP, globale Benachrichtigung, optionale Aufbewahrung (Tage; leer = bis zum Löschen)

Kein Passwort ändern in der UI. Kein Kunden-Login. UI und MCP in Parität. UI-Sprache: Deutsch.

## Agent (MCP)

Gleiche App, `/mcp`, Token aus der Env im Header. Agent legt Project/Form an, bekommt Key + Snippet, liest Inbox, löscht, testet SMTP, rotiert Access Keys. Öffentliches Absenden kann er nicht.

## Datenschutz

Felder, Form, Zeitpunkt, Versandstatus. Keine IP, kein Browser, kein Turnstile-Token.

Löschen: Eintrag, Formular (mit Einträgen), Project (alles darunter). CSV pro Form und Project. Keine Suche einer E-Mail über alle Websites.

Retention nur wenn Tage gesetzt sind.

## Betrieb

Hostinger-VPS, Docker Compose, Caddy für HTTPS. Eine Domain für UI, Submit und MCP: **snd.mchlr.de**. SQLite auf einem Volume, täglich Kopie.

Env (Beispielnamen): `SND_PASSWORD`, `SND_MCP_TOKEN`, `SND_SECRET` (SMTP-Passwörter at rest). Passwort vergessen = Env ändern und Container neu.

Im Repo: Compose-Datei, `.env.example`, keine Geheimnisse, keine fest verdrahtete Domain.

## Bau-Reihenfolge

1. Submit + Speichern + Origins + Honeypot + Limits
2. SMTP + Queue + Retry + Admin-Mail + Test + Benachrichtigung (global/Form)
3. Login (Env) + REST für Project/Form/Inbox/Settings
4. MCP `/mcp`
5. Operator-UI in Paper, danach Fluid (Install-Prompt vorher)
6. Compose auf dem VPS, DNS `snd.mchlr.de`, TLS, Backup

## Nicht in V1

Webhooks, Formular-Designer, Dankeseiten von snd, Autoresponder, Uploads, Kunden-Hierarchie, Analytics, Passkeys, mehrere Operatoren, snd als Postfach, KI-Spam, Auskunft über alle Websites hinweg.

## Technik

Ein TypeScript-Prozess, SQLite, Streamable HTTP MCP (`createMcpHandler` an `/mcp`, Bearer). SMTP-Passwörter mit `SND_SECRET` verschlüsselt. Queue in SQLite. Access Key öffentlich. UI-Session: Cookie, httpOnly, gültig solange das Env-Passwort passt.
