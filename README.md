# snd

Self-hosted form-to-mail service for static websites. One instance, one operator, many websites. Managed through a web console, REST and MCP.

The software has no built-in domain. The reference instance runs at `https://snd.mchlr.de`.

## Run locally

```bash
cp .env.example .env
# In production: set SND_PASSWORD. Locally without .env the password is "snd".
npm install
npm test
npm run dev
```

- Public: `POST /submit`
- Operator: `/api/*` (cookie login against `SND_PASSWORD`, locally `snd` by default)
- Agent: `POST /mcp` with the bearer token from Settings → AI agents
- Health: `GET /health`

`SND_PASSWORD` is the login. `SND_SECRET` is the key for SMTP passwords in the database and for the session — separate from the login, so changing the password does not make stored mail credentials unreadable. Without `SND_SECRET`, snd writes one to `data/secret`; back that file up with the volume.

## Form on the website

Each form has two ready-made snippets (console: Form → Embed, MCP: `get_form`):

- **JavaScript (recommended):** a form with `data-snd` plus a small script. It sends with `fetch`, shows the result inside the form, and sends each field's title — from `data-label` or its `<label>` (radio buttons and checkboxes: the fieldset's `<legend>`) — as `label:<field>`, so the mail shows "Your message" instead of `message`.
- **HTML only:** a plain post without JavaScript. It needs a thank-you page in the hidden `redirect` field (on an allowed origin); snd shows no pages of its own. Titles go in hidden fields: `<input type="hidden" name="label:message" value="Your message">`.

Rules for any form:

- `access_key` identifies the form; `botcheck` is a spam trap that must stay empty.
- A field named `email` (or `replyto`) becomes the reply address, `subject` the mail subject.
- Without `redirect`, the request must send `Accept: application/json` and gets `{ success, message }`.
- Titles set in the console (Form → Settings → Field titles) win over sent ones.
- Any field names work (up to 50 fields plus their titles, 100 KB); file uploads are not supported.

## Language

Settings → General → Language switches between English and German. It applies to the console, the default notification mail (wording and date format) and the messages visitors get from `/submit`. MCP tool descriptions stay English.

## Mail templates

Every website can have its own notification templates; each form picks one or uses the built-in default. Templates use a small, logic-less Mustache subset:

- `{{field.email}}`, `{{form.name}}`, `{{received.date}}` … insert values, always escaped.
- `{{#fields}}{{title}}: {{value}}{{/fields}}` repeats for each submitted field.
- `{{^field.phone}}…{{/field.phone}}` renders when a value is empty.
- Unescaped output (`{{{x}}}`, `{{&x}}`), partials and delimiter changes are rejected when saving.

Templates are parsed and test-rendered on save. If one still fails while sending, snd sends the default instead, so no message is lost. The console shows a live preview with the website's latest message in a sandboxed frame. Agents start with the MCP tool `get_default_template`, which returns the default sources and the full variable reference, then use `create_template`, `preview_template` and `update_form { templateId }`.

## Operation

```bash
# .env plus SND_DOMAIN / CADDY_EMAIL in the environment
docker compose up -d
```

SQLite lives on the `snd_data` volume. The process writes a daily copy to `backup/`. Caddy terminates TLS.
