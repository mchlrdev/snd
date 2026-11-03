# snd

Selbst gehosteter Form-to-Mail-Dienst für statische Websites. Eine Instanz, ein Operator, viele Websites. Verwaltung über REST und MCP.

Die Software enthält keine feste Domain. Die Referenz-Instanz läuft unter `https://snd.mchlr.de`.

## Start lokal

```bash
cp .env.example .env
# In Produktion: SND_PASSWORD setzen. Lokal ohne .env ist das Passwort „snd“.
npm install
npm test
npm run dev
```

- Öffentlich: `POST /submit`
- Operator: `/api/*` (Cookie-Login gegen `SND_PASSWORD`, lokal Default `snd`)
- Agent: `POST /mcp` mit Bearer aus Einstellungen (nicht mehr Pflicht in der Env)
- Health: `GET /health`

`SND_PASSWORD` ist das Login. `SND_SECRET` ist der Schlüssel für SMTP-Passwörter in der Datenbank und für die Session — unabhängig vom Login, damit ein Passwortwechsel die Mails nicht unlesbar macht. Fehlt `SND_SECRET`, schreibt snd ihn nach `data/secret` und du musst diese Datei mit dem Volume sichern.

## Formular auf der Website

```html
<form action="https://deine-instanz/submit" method="POST">
  <input type="hidden" name="access_key" value="…">
  <input type="hidden" name="redirect" value="https://deine-website/danke">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message" required></textarea>
  <input type="text" name="botcheck" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
  <button type="submit">Senden</button>
</form>
```

Ohne `redirect` muss der Aufruf `Accept: application/json` senden. snd liefert keine eigene Dankeseite.

## Betrieb

```bash
# .env und SND_DOMAIN / CADDY_EMAIL in der Umgebung
docker compose up -d
```

SQLite liegt auf dem Volume `snd_data`. Täglich schreibt der Prozess eine Kopie nach `backup/`. TLS terminiert Caddy.
