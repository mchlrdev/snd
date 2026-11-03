import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSecretBox } from "./crypto.js";
import { createSubmitLimits } from "./limits.js";
import { MailQueue, nodemailerMailer, runRetention } from "./mail.js";
import { createOperator } from "./operator.js";
import { openStore } from "./store.js";
import { verifyTurnstile } from "./submit.js";

const config = loadConfig();
const store = openStore(config.dataDir);
const box = createSecretBox(config.secret);
const mailer = nodemailerMailer();
const now = () => Date.now();
const operator = createOperator({ store, box, mailer, config, now });
operator.ensureMcpToken(config.mcpTokenSeed);
const queue = new MailQueue(store, mailer, box, now);
const app = createApp({
  store,
  config,
  limits: createSubmitLimits(),
  operator,
  verifyTurnstile,
  box,
  queue,
  now,
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host });
console.log(`snd lauscht auf ${config.host}:${config.port}`);
if (config.passwordIsDefault) {
  console.warn('SND_PASSWORD fehlt — lokales Passwort ist "snd".');
}

const mailTimer = setInterval(() => void queue.tick(), 5_000);
const retentionTimer = setInterval(() => runRetention(store, Date.now()), 60 * 60 * 1000);
const backupTimer = setInterval(() => void dailyBackup(store, config.dataDir), 60 * 60 * 1000);
void queue.tick();
void dailyBackup(store, config.dataDir);

async function dailyBackup(current: typeof store, dataDir: string): Promise<void> {
  const dir = join(dataDir, "backup");
  mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const dest = join(dir, `snd-${day}.sqlite`);
  try {
    await current.backup(dest);
  } catch (error) {
    console.error("Backup fehlgeschlagen:", error);
  }
}

function shutdown(): void {
  clearInterval(mailTimer);
  clearInterval(retentionTimer);
  clearInterval(backupTimer);
  server.close();
  store.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
