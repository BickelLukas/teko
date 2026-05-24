import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { buildApp } from "./app.js";
import { startScheduler } from "./scheduler/index.js";
import fs from "fs";
import path from "path";

// __dirname is the directory of the compiled entry point (dist/ in prod, src/ in dev).
// Migrations live one level up in drizzle/migrations — this path holds for both.
const migrationsFolder = path.join(__dirname, "../drizzle/migrations");

// In production, serve static files from public/ adjacent to index.js.
// PUBLIC_DIR env var overrides (useful if layout differs, e.g. Docker).
const defaultPublicDir = path.join(__dirname, "./public");

async function init() {
  const config = loadConfig();

  // Apply the public dir default now that we know __dirname at the entry point.
  if (config.nodeEnv === "production" && config.publicDir === null) {
    config.publicDir = defaultPublicDir;
  }

  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const { db } = createDb(config.dbPath, migrationsFolder);
  const app = await buildApp(db, config);
  startScheduler(db, app.log);
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
