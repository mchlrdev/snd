import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

export const DEV_PASSWORD = "snd";

export type Config = {
  port: number;
  host: string;
  dataDir: string;
  password: string;
  passwordIsDefault: boolean;
  mcpTokenSeed: string | null;
  secret: string;
  publicUrl: string | null;
  trustProxy: boolean;
};

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production";
}

function resolveSecret(env: NodeJS.ProcessEnv, dataDir: string): string {
  const fromEnv = env.SND_SECRET?.trim() ?? "";
  if (fromEnv) {
    if (fromEnv.length < 16) {
      throw new Error("SND_SECRET muss mindestens 16 Zeichen haben.");
    }
    return fromEnv;
  }
  const file = join(dataDir, "secret");
  if (existsSync(file)) {
    const stored = readFileSync(file, "utf8").trim();
    if (stored.length < 16) {
      throw new Error("Gespeicherter Schlüssel in data/secret ist zu kurz.");
    }
    return stored;
  }
  const generated = randomBytes(32).toString("base64url");
  writeFileSync(file, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
  return generated;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolve(env.SND_DATA_DIR?.trim() || "./data");
  mkdirSync(dataDir, { recursive: true });
  const production = isProduction(env);
  const fromEnv = env.SND_PASSWORD?.trim() ?? "";
  if (!fromEnv && production) {
    throw new Error("SND_PASSWORD muss gesetzt sein.");
  }
  const passwordIsDefault = !fromEnv;
  const password = fromEnv || DEV_PASSWORD;
  const secret = resolveSecret(env, dataDir);
  const publicUrl = env.SND_PUBLIC_URL?.replace(/\/$/, "") || null;
  return {
    port: Number(env.SND_PORT ?? 3000),
    host: env.SND_HOST?.trim() || "127.0.0.1",
    dataDir,
    password,
    passwordIsDefault,
    mcpTokenSeed: env.SND_MCP_TOKEN?.trim() || null,
    secret,
    publicUrl,
    trustProxy: env.SND_TRUST_PROXY === "1" || env.SND_TRUST_PROXY === "true",
  };
}

export function instanceUrl(config: Config, requestUrl?: string): string {
  if (config.publicUrl) return config.publicUrl;
  if (requestUrl) {
    const url = new URL(requestUrl);
    return `${url.protocol}//${url.host}`;
  }
  return "http://127.0.0.1";
}

export function publicHostname(config: Config): string | null {
  if (!config.publicUrl) return null;
  try {
    return new URL(config.publicUrl).hostname;
  } catch {
    return null;
  }
}
