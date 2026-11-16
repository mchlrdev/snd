import { t } from "./i18n";
function attr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/** Plain HTML form that works without JavaScript: it posts, snd stores the
 *  message, then sends the visitor to the website's thank-you page. The
 *  JavaScript version comes from the server (form.scriptSnippet). */
export function htmlSnippet(opts: { submitUrl: string; accessKey: string; redirect: string; turnstile: boolean }): string {
  const lines = [
    `<form action="${attr(opts.submitUrl)}" method="POST">`,
    `  <input type="hidden" name="access_key" value="${attr(opts.accessKey)}">`,
  ];
  if (opts.redirect) lines.push(`  <input type="hidden" name="redirect" value="${attr(opts.redirect)}">`);
  lines.push(
    ``,
    `  <label>${t("Name")} <input type="text" name="name" required></label>`,
    `  <label>${t("Email")} <input type="email" name="email" required></label>`,
    `  <label>${t("Message")} <textarea name="message" required></textarea></label>`,
    `  <!-- ${t("Optional: the field's title in the notification mail")} -->`,
    `  <input type="hidden" name="label:message" value="${attr(t("Your message"))}">`,
    ``,
    `  <!-- ${t("Spam trap: stays invisible and empty")} -->`,
    `  <input type="text" name="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">`,
  );
  if (opts.turnstile) {
    lines.push(`  <div class="cf-turnstile" data-sitekey="${t("YOUR_TURNSTILE_SITE_KEY")}"></div>`);
  }
  lines.push(`  <button type="submit">${t("Send")}</button>`, `</form>`);
  if (opts.turnstile) {
    lines.push(`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`);
  }
  return lines.join("\n");
}
