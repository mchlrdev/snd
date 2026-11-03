function attr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/** Plain HTML form that works without JavaScript: it posts, snd stores the
 *  message, then sends the visitor to the thank-you page. */
export function htmlSnippet(opts: { submitUrl: string; accessKey: string; redirect: string; turnstile: boolean }): string {
  const lines = [
    `<form action="${attr(opts.submitUrl)}" method="POST">`,
    `  <input type="hidden" name="access_key" value="${attr(opts.accessKey)}">`,
  ];
  if (opts.redirect) lines.push(`  <input type="hidden" name="redirect" value="${attr(opts.redirect)}">`);
  lines.push(
    ``,
    `  <label>Name <input type="text" name="name" required></label>`,
    `  <label>E-Mail <input type="email" name="email" required></label>`,
    `  <label>Nachricht <textarea name="message" required></textarea></label>`,
    ``,
    `  <!-- Spam-Falle: bleibt unsichtbar und leer -->`,
    `  <input type="text" name="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">`,
  );
  if (opts.turnstile) {
    lines.push(`  <div class="cf-turnstile" data-sitekey="DEIN_TURNSTILE_SITE_KEY"></div>`);
  }
  lines.push(`  <button type="submit">Senden</button>`, `</form>`);
  if (opts.turnstile) {
    lines.push(`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`);
  }
  return lines.join("\n");
}

/** For sites that send with JavaScript and show their own success message. */
export function fetchSnippet(opts: { submitUrl: string; accessKey: string }): string {
  return `const data = new FormData(form);
data.set("access_key", "${opts.accessKey}");

const res = await fetch("${opts.submitUrl}", {
  method: "POST",
  headers: { Accept: "application/json" },
  body: data,
});
const { success, message } = await res.json();`;
}
