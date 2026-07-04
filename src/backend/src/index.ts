import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { buildApp } from "./app.js";
import { startScheduler } from "./scheduler/index.js";
import { createSupervisorClient } from "./ha/supervisor.js";
import { syncUsers } from "./ha/user-sync.js";
import { updateSyncState } from "./ha/sync-state.js";
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

  const supervisorClient = config.supervisorToken
    ? createSupervisorClient(config.supervisorToken)
    : null;

  // Startup user sync — runs before the server accepts requests so the user
  // list is current before the first ingress request arrives.
  if (supervisorClient) {
    try {
      const haUsers = await supervisorClient.getUsers();
      updateSyncState(true, null);
      const counts = syncUsers(haUsers, db);
      updateSyncState(true, new Date());
      console.log(
        `[startup] User sync complete: +${counts.added} added, ~${counts.updated} updated, -${counts.deactivated} deactivated, ↩${counts.reactivated} reactivated`,
      );
    } catch (err) {
      updateSyncState(false, null);
      console.warn(
        "[startup] User sync failed (will retry on schedule):",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const app = await buildApp(db, config, supervisorClient);
  startScheduler(db, app.log, supervisorClient, config.userSyncIntervalMinutes);
  await app.listen({ port: config.port, host: "0.0.0.0" });

  // Announce ourselves to the Teko HA integration via Supervisor discovery so
  // its config flow can pre-fill the add-on's internal host/port. Best-effort:
  // the integration falls back to manual URL entry if this fails.
  if (supervisorClient) {
    try {
      const info = await supervisorClient.getInfo();
      if (info.hostname) {
        await supervisorClient.pushDiscovery(info.hostname, config.port);
        app.log.info(`[startup] Pushed Supervisor discovery (${info.hostname}:${config.port})`);
      } else {
        app.log.warn("[startup] Supervisor did not report a hostname; skipping discovery push");
      }
    } catch (err) {
      app.log.warn(
        { err },
        "[startup] Supervisor discovery push failed (integration falls back to manual entry)",
      );
    }
  }
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
