import type { Form, Project } from "../api";
import { t } from "./i18n";

export type Check = { key: string; done: boolean; title: string; hint: string };

/**
 * What a website still lacks before submissions really arrive. Form mails only
 * go through the website's or the form's mailbox; the mailbox in the settings
 * is only for warnings to you.
 */
export function websiteChecks(project: Project, forms: Form[]): Check[] {
  const mailReady = Boolean(project.smtp) || (forms.length > 0 && forms.every((form) => form.smtp));
  return [
    {
      key: "domain",
      done: project.origins.length > 0,
      title: t("Add the website address"),
      hint: "",
    },
    {
      key: "mail",
      done: mailReady,
      title: t("Connect a mailbox"),
      hint: "",
    },
    {
      key: "form",
      done: forms.length > 0,
      title: t("Create a form"),
      hint: "",
    },
  ];
}

export function websiteReady(project: Project, forms: Form[]): boolean {
  return websiteChecks(project, forms).every((check) => check.done);
}

/** Problems that prevent delivery for this form. */
export function formProblems(form: Form, project: Project | null): string[] {
  const out: string[] = [];
  if (project && project.origins.length === 0) out.push(t("No website address added."));
  if (!form.smtp && project && !project.smtp) out.push(t("No mailbox connected."));
  return out;
}

/** One sentence for the sidebar/dashboard mark on a form, or null if fine. */
export function formWarning(form: Form, project: Project): string | null {
  if (form.failedCount > 0) {
    return form.failedCount === 1 ? t("1 message was not delivered") : t("{n} messages were not delivered", { n: form.failedCount });
  }
  return formProblems(form, project)[0] ?? null;
}
