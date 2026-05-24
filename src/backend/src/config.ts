export type Config = {
  port: number;
  nodeEnv: string;
  devMode: boolean;
  devUserId: string;
  devUserName: string;
  dbPath: string;
  publicDir: string | null;
  supervisorToken: string | null;
  userSyncIntervalMinutes: number;
};

export function loadConfig(): Config {
  const nodeEnv = process.env["NODE_ENV"] ?? "development";
  const rawDevMode = process.env["DEV_MODE"] === "true";

  if (rawDevMode && nodeEnv === "production") {
    throw new Error(
      "FATAL: DEV_MODE=true is not allowed when NODE_ENV=production. " +
        "This is a safety check. Never run with DEV_MODE=true in production.",
    );
  }

  // Dev auth requires BOTH flags. NODE_ENV=test is honored so vitest can drive
  // the dev branch; production is rejected above; anything else with DEV_MODE=true
  // but NODE_ENV unset/staging/etc. silently runs in non-dev mode.
  const devMode = rawDevMode && (nodeEnv === "development" || nodeEnv === "test");

  const rawPort = parseInt(process.env["PORT"] ?? "3000", 10);
  if (isNaN(rawPort) || rawPort < 1 || rawPort > 65535) {
    throw new Error(
      `Invalid PORT "${process.env["PORT"]}": must be an integer between 1 and 65535`,
    );
  }

  // DATABASE_PATH is the canonical env var (matches HA add-on conventions).
  // DB_PATH is kept as a fallback for existing .env files.
  const dbPath = process.env["DATABASE_PATH"] ?? process.env["DB_PATH"] ?? "./data/teko.db";

  // In production, Fastify serves the bundled SPA. Computed in index.ts from
  // __dirname so it resolves correctly in both local prod test and Docker.
  // Overridable via PUBLIC_DIR env var.
  const publicDir = nodeEnv === "production" ? (process.env["PUBLIC_DIR"] ?? null) : null;

  const rawIntervalMinutes = parseInt(process.env["USER_SYNC_INTERVAL_MINUTES"] ?? "30", 10);
  const userSyncIntervalMinutes =
    isNaN(rawIntervalMinutes) || rawIntervalMinutes < 1 ? 30 : rawIntervalMinutes;

  // SUPERVISOR_TOKEN is injected by HA Supervisor when the add-on runs.
  // In dev mode it is never present; treat as null to skip sync entirely.
  const supervisorToken = devMode ? null : (process.env["SUPERVISOR_TOKEN"] ?? null);

  return {
    port: rawPort,
    nodeEnv,
    devMode,
    devUserId: process.env["DEV_USER_ID"] ?? "dev-alice",
    devUserName: process.env["DEV_USER_NAME"] ?? "Alice",
    dbPath,
    publicDir,
    supervisorToken,
    userSyncIntervalMinutes,
  };
}
