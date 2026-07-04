import { randomBytes, createHash } from "crypto";

/** Raw bearer token shown to the user once, at creation time. High entropy, URL-safe. */
export function generateIntegrationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest — the only form persisted to the database. */
export function hashIntegrationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
