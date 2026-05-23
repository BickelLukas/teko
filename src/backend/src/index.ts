import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { buildApp } from "./app.js";
import { startScheduler } from "./scheduler/index.js";
import fs from "fs";
import path from "path";

async function init() {
  const config = loadConfig();

  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const { db } = createDb(config.dbPath);
  const app = await buildApp(db, config);
  startScheduler(db, app.log);
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
