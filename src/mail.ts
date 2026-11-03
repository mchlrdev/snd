import { createTransport } from "nodemailer";
import type { SecretBox } from "./crypto.js";
import type { Store } from "./store.js";
import { DEFAULT_TIMEZONE, renderNotification } from "./notification.js";
import type { MailJob, SmtpRecord } from "./types.js";

export const MAX_MAIL_ATTEMPTS = 8;

export const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  45 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
];

export type SmtpAccount = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export type OutgoingMail = {
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
};

export type Mailer = {
  send(account: SmtpAccount, mail: OutgoingMail): Promise<void>;
};

export function nodemailerMailer(): Mailer {
  return {
    async send(account, mail) {
      const transport = createTransport({
        host: account.host,
        port: account.port,
        secure: account.port === 465,
        auth: account.user ? { user: account.user, pass: account.password } : undefined,
      });
      try {
        await transport.sendMail({
          from: account.from,
          to: mail.to,
          replyTo: mail.replyTo,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        });
      } finally {
        transport.close();
      }
    },
  };
}

export function decryptSmtp(box: SecretBox, record: SmtpRecord): SmtpAccount {
  return {
    host: record.host,
    port: record.port,
    user: record.user,
    password: record.passEnc ? box.decrypt(record.passEnc) : "",
    from: record.from,
  };
}

export function resolveSmtp(job: MailJob): SmtpRecord | null {
  return job.formSmtp ?? job.projectSmtp;
}

export class MailQueue {
  private busy = false;

  constructor(
    private readonly store: Store,
    private readonly mailer: Mailer,
    private readonly box: SecretBox,
    private readonly now: () => number,
    private readonly timeZone: string = DEFAULT_TIMEZONE,
  ) {}

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const jobs = this.store.dueMailJobs(this.now(), 20);
      for (const job of jobs) {
        await this.process(job);
      }
    } finally {
      this.busy = false;
    }
  }

  async process(job: MailJob): Promise<void> {
    const attempts = job.mailAttempts + 1;
    const smtp = resolveSmtp(job);
    try {
      if (!smtp) throw new Error("Kein SMTP-Konto konfiguriert.");
      const account = decryptSmtp(this.box, smtp);
      const body = renderNotification(job, this.timeZone);
      await this.mailer.send(account, {
        to: job.recipients,
        replyTo: job.replyTo ?? undefined,
        subject: job.subject?.trim() || `Neue Nachricht: ${job.formName}`,
        text: body.text,
        html: body.html,
      });
      this.store.updateMailState(job.id, {
        mailStatus: "sent",
        mailAttempts: attempts,
        lastError: null,
        nextAttemptAt: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= MAX_MAIL_ATTEMPTS) {
        this.store.updateMailState(job.id, {
          mailStatus: "abandoned",
          mailAttempts: attempts,
          lastError: message,
          nextAttemptAt: null,
        });
        await this.notifyOperator(job, attempts, message, "abandoned");
      } else {
        this.store.updateMailState(job.id, {
          mailStatus: "failed",
          mailAttempts: attempts,
          lastError: message,
          nextAttemptAt: this.now() + RETRY_DELAYS_MS[attempts - 1]!,
        });
        if (attempts === 1) {
          await this.notifyOperator(job, attempts, message, "immediate");
        }
      }
    }
  }

  private async notifyOperator(
    job: MailJob,
    attempts: number,
    error: string,
    event: "immediate" | "abandoned",
  ): Promise<void> {
    const policy = job.formNotifyPolicy ?? job.projectNotifyPolicy ?? job.globalNotifyPolicy;
    if (policy === "off") return;
    if (policy === "immediate" && event !== "immediate") return;
    if (policy === "abandoned" && event !== "abandoned") return;
    const settings = this.store.getSettings();
    if (!settings.adminSmtp) return;
    try {
      const account = decryptSmtp(this.box, settings.adminSmtp);
      const subject =
        event === "abandoned"
          ? `snd: Versand aufgegeben (${job.formName})`
          : `snd: Versand fehlgeschlagen (${job.formName})`;
      await this.mailer.send(account, {
        to: [account.from],
        subject,
        text: [
          `Project: ${job.projectLabel}`,
          `Form: ${job.formName}`,
          `Submission: ${job.id}`,
          `Versuch: ${attempts}/${MAX_MAIL_ATTEMPTS}`,
          `Fehler: ${error}`,
        ].join("\n"),
      });
    } catch {
      // Operator-Mail darf den Queue-Lauf nicht abbrechen.
    }
  }
}

export async function sendTestMail(
  mailer: Mailer,
  box: SecretBox,
  smtp: SmtpRecord,
  to: string,
): Promise<void> {
  const account = decryptSmtp(box, smtp);
  await mailer.send(account, {
    to: [to],
    subject: "snd Test",
    text: "Diese Nachricht bestätigt, dass das SMTP-Konto in snd funktioniert.\n",
  });
}

export function runRetention(store: Store, now: number): number {
  const settings = store.getSettings();
  if (!settings.retentionDays || settings.retentionDays <= 0) return 0;
  const cutoff = now - settings.retentionDays * 24 * 60 * 60 * 1000;
  return store.deleteSubmissionsOlderThan(cutoff);
}
