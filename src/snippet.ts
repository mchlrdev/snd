import type { Locale } from "./i18n.js";

// ---------------------------------------------------------------------------
// Ready-to-paste forms. `formSnippet` posts without JavaScript and needs a
// thank-you page (`redirect`). `scriptSnippet` is the recommended one: it
// sends with fetch, shows the result in the form, and sends each field's
// title along (`label:<field>`), so the mail needs no setup in snd.
// Both are given to agents through MCP (get_form, create_form).
// ---------------------------------------------------------------------------

const TEXT = {
  en: {
    name: "Name",
    email: "Email",
    message: "Message",
    send: "Send",
    sent: "Thank you! Your message has been sent.",
    failed: "Sending failed. Please try again.",
    trap: "Spam trap: stays invisible and empty",
    noJs: "Optional, for visitors without JavaScript: your thank-you page",
    title: "Optional: the field's title in the notification mail",
  },
  de: {
    name: "Name",
    email: "E-Mail",
    message: "Nachricht",
    send: "Senden",
    sent: "Vielen Dank! Deine Nachricht wurde gesendet.",
    failed: "Senden fehlgeschlagen. Bitte versuche es noch einmal.",
    trap: "Spam-Falle: bleibt unsichtbar und leer",
    noJs: "Optional, für Besucher ohne JavaScript: deine Danke-Seite",
    title: "Optional: Titel des Felds in der Benachrichtigung",
  },
} satisfies Record<Locale, Record<string, string>>;

export function formSnippet(submitUrl: string, accessKey: string, locale: Locale = "en", redirect?: string): string {
  const text = TEXT[locale];
  return `<form action="${escapeAttr(submitUrl)}" method="POST">
  <input type="hidden" name="access_key" value="${escapeAttr(accessKey)}">
  <input type="hidden" name="redirect" value="${escapeAttr(redirect ?? "https://your-website/thanks")}">
  <label>${text.name} <input type="text" name="name" autocomplete="name" required></label>
  <label>${text.email} <input type="email" name="email" autocomplete="email" required></label>
  <label>${text.message} <textarea name="message" required></textarea></label>
  <!-- ${text.title} -->
  <input type="hidden" name="label:message" value="${escapeAttr(text.message)}">
  <!-- ${text.trap} -->
  <input type="text" name="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
  <button type="submit">${text.send}</button>
</form>`;
}

export function scriptSnippet(opts: { submitUrl: string; accessKey: string; locale?: Locale; turnstile?: boolean }): string {
  const text = TEXT[opts.locale ?? "en"];
  const turnstileDiv = opts.turnstile ? `  <div class="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY"></div>\n` : "";
  const turnstileScript = opts.turnstile
    ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>\n`
    : "";
  const turnstileReset = opts.turnstile ? `\n        window.turnstile?.reset();` : "";
  return `<form data-snd action="${escapeAttr(opts.submitUrl)}" method="POST">
  <input type="hidden" name="access_key" value="${escapeAttr(opts.accessKey)}">
  <!-- ${text.noJs}
  <input type="hidden" name="redirect" value="https://your-website/thanks"> -->
  <label>${text.name} <input type="text" name="name" autocomplete="name" required></label>
  <label>${text.email} <input type="email" name="email" autocomplete="email" required></label>
  <label>${text.message} <textarea name="message" required></textarea></label>
  <!-- ${text.trap} -->
  <input type="text" name="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
${turnstileDiv}  <button type="submit">${text.send}</button>
  <p data-snd-status role="status" aria-live="polite"></p>
</form>
${turnstileScript}<script>
(() => {
  const SENT = ${JSON.stringify(text.sent)};
  const FAILED = ${JSON.stringify(text.failed)};

  // A field's title for the notification mail: data-label, else the text of
  // its <label> (for radio buttons and checkboxes: the fieldset's <legend>).
  const titleOf = (field) => {
    if (field.dataset.label) return field.dataset.label;
    const choice = field.type === "radio" || field.type === "checkbox";
    const source = choice ? field.closest("fieldset")?.querySelector("legend") : field.labels?.[0];
    if (!source) return "";
    const copy = source.cloneNode(true);
    copy.querySelectorAll("input, select, textarea, button").forEach((el) => el.remove());
    return copy.textContent.replace(/\\s+/g, " ").replace(/\\s*\\*\\s*$/, "").trim();
  };

  for (const form of document.querySelectorAll("form[data-snd]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector("[data-snd-status]");
      const button = form.querySelector("[type=submit]");
      const data = new FormData(form);
      for (const field of form.elements) {
        if (!field.name || field.type === "hidden" || field.name === "botcheck") continue;
        const key = "label:" + field.name;
        const title = titleOf(field);
        if (title && !data.has(key)) data.set(key, title);
      }
      if (button) button.disabled = true;
      try {
        const res = await fetch(form.action, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: data,
        });
        const result = await res.json();
        if (status) status.textContent = result.success ? SENT : result.message || FAILED;
        if (result.success) form.reset();
      } catch {
        if (status) status.textContent = FAILED;
      } finally {
        if (button) button.disabled = false;${turnstileReset}
      }
    });
  }
})();
</script>`;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
