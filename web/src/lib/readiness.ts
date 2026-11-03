import type { Form, Project } from "../api";

export type Check = { key: string; done: boolean; title: string; hint: string };

/**
 * Was einer Website fehlt, damit Nachrichten wirklich ankommen. Formularmails
 * gehen nur über das Postfach der Website oder des Formulars — das Postfach in
 * den Einstellungen ist ausschließlich für Warnungen an dich.
 */
export function websiteChecks(project: Project, forms: Form[]): Check[] {
  const mailReady = Boolean(project.smtp) || (forms.length > 0 && forms.every((form) => form.smtp));
  return [
    {
      key: "domain",
      done: project.origins.length > 0,
      title: "Adresse der Website eintragen",
      hint: "",
    },
    {
      key: "mail",
      done: mailReady,
      title: "E-Mail-Postfach verbinden",
      hint: "",
    },
    {
      key: "form",
      done: forms.length > 0,
      title: "Formular anlegen",
      hint: "",
    },
  ];
}

export function websiteReady(project: Project, forms: Form[]): boolean {
  return websiteChecks(project, forms).every((check) => check.done);
}

/** Probleme, die eine Zustellung für dieses Formular verhindern. */
export function formProblems(form: Form, project: Project | null): string[] {
  const out: string[] = [];
  if (project && project.origins.length === 0) out.push("Keine Adresse der Website eingetragen.");
  if (!form.smtp && project && !project.smtp) out.push("Kein E-Mail-Postfach verbunden.");
  return out;
}

/** One sentence for the sidebar/dashboard mark on a form, or null if fine. */
export function formWarning(form: Form, project: Project): string | null {
  if (form.failedCount > 0) {
    return form.failedCount === 1 ? "1 Nachricht ist nicht angekommen" : `${form.failedCount} Nachrichten sind nicht angekommen`;
  }
  return formProblems(form, project)[0] ?? null;
}
