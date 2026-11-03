import { createApp, type AppEnv } from "./app.js";
import type { Config } from "./config.js";
import { createSecretBox } from "./crypto.js";
import { createSubmitLimits } from "./limits.js";
import { MailQueue, type Mailer, type OutgoingMail, type SmtpAccount } from "./mail.js";
import { createOperator } from "./operator.js";
import { openMemoryStore } from "./store.js";
import type { TurnstileResult } from "./submit.js";

export type SentMail = { account: SmtpAccount; mail: OutgoingMail };

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    port: 3000,
    host: "127.0.0.1",
    dataDir: ":memory:",
    password: "test-password-ok",
    passwordIsDefault: false,
    mcpTokenSeed: "test-mcp-token-ok",
    secret: "test-secret-16ch",
    publicUrl: "https://snd.test",
    trustProxy: true,
    timeZone: "Europe/Berlin",
    ...over,
  };
}

export function recordingMailer() {
  const sent: SentMail[] = [];
  let failMessage: string | null = null;
  const blocked = new Set<string>();
  const mailer: Mailer = {
    async send(account, mail) {
      if (blocked.has(account.host) || failMessage) {
        const message = failMessage ?? "SMTP down";
        failMessage = null;
        throw new Error(message);
      }
      sent.push({ account, mail });
    },
  };
  return {
    mailer,
    sent,
    fail(message = "SMTP down") {
      failMessage = message;
    },
    block(host: string) {
      blocked.add(host);
    },
  };
}

export function makeApp(options?: {
  turnstile?: (secret: string, token: string) => Promise<TurnstileResult>;
  mail?: ReturnType<typeof recordingMailer>;
  now?: { value: number };
}) {
  const config = testConfig();
  const store = openMemoryStore();
  const box = createSecretBox(config.secret);
  const mail = options?.mail ?? recordingMailer();
  const clock = options?.now ?? { value: Date.parse("2026-11-02T12:00:00Z") };
  const now = () => clock.value;
  const operator = createOperator({ store, box, mailer: mail.mailer, config, now });
  operator.ensureMcpToken(config.mcpTokenSeed);
  const queue = new MailQueue(store, mail.mailer, box, now, config.timeZone);
  const env: AppEnv = {
    store,
    config,
    limits: createSubmitLimits(),
    operator,
    verifyTurnstile: options?.turnstile ?? (async () => "ok"),
    box,
    queue,
    now,
  };
  return { app: createApp(env), store, operator, box, mail, queue, clock, config };
}

export function cookieFrom(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  return header.split(";")[0] ?? "";
}
