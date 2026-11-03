import { randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

export function newAccessKey(): string {
  return randomBytes(24).toString("base64url");
}

export function newMcpToken(): string {
  return randomBytes(32).toString("base64url");
}
