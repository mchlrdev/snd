import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEV_PASSWORD, loadConfig } from "./config.js";

function emptyDir(): string {
  return mkdtempSync(join(tmpdir(), "snd-config-"));
}

describe("loadConfig", () => {
  it("uses the password snd locally and creates data/secret", () => {
    const dataDir = emptyDir();
    const config = loadConfig({ SND_DATA_DIR: dataDir });
    expect(config.password).toBe(DEV_PASSWORD);
    expect(config.passwordIsDefault).toBe(true);
    expect(config.mcpTokenSeed).toBeNull();
    expect(config.secret.length).toBeGreaterThanOrEqual(16);
    expect(readFileSync(join(dataDir, "secret"), "utf8").trim()).toBe(config.secret);
    const again = loadConfig({ SND_DATA_DIR: dataDir });
    expect(again.secret).toBe(config.secret);
  });

  it("verlangt SND_PASSWORD in Produktion", () => {
    const dataDir = emptyDir();
    expect(() => loadConfig({ NODE_ENV: "production", SND_DATA_DIR: dataDir })).toThrow(/SND_PASSWORD/);
  });

  it("takes SND_SECRET from the environment when set", () => {
    const dataDir = emptyDir();
    const config = loadConfig({
      SND_PASSWORD: "op",
      SND_SECRET: "explicit-secret-16",
      SND_DATA_DIR: dataDir,
    });
    expect(config.secret).toBe("explicit-secret-16");
    expect(config.passwordIsDefault).toBe(false);
  });
});
