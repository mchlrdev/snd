export function formSnippet(submitUrl: string, accessKey: string, redirect?: string): string {
  const redirectLine = redirect
    ? `  <input type="hidden" name="redirect" value="${escapeAttr(redirect)}">\n`
    : "";
  return `<form action="${escapeAttr(submitUrl)}" method="POST">
  <input type="hidden" name="access_key" value="${escapeAttr(accessKey)}">
${redirectLine}  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message" required></textarea>
  <input type="text" name="botcheck" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
  <button type="submit">Senden</button>
</form>`;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
