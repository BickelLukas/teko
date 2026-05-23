export type Config = {
  port: number;
  nodeEnv: string;
  devMode: boolean;
  devUserId: string;
  devUserName: string;
  dbPath: string;
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

  return {
    port: rawPort,
    nodeEnv,
    devMode,
    devUserId: process.env["DEV_USER_ID"] ?? "dev-alice",
    devUserName: process.env["DEV_USER_NAME"] ?? "Alice",
    dbPath: process.env["DB_PATH"] ?? "./data/teko.db",
  };
}
