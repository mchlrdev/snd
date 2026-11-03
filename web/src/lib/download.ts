/** Downloads an authenticated export. A plain link would lose the error if
 *  the session expired; this surfaces it instead of saving an error page. */
export async function downloadCsv(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Export fehlgeschlagen.");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename.replace(/[\\/:*?"<>|]+/g, "-");
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
