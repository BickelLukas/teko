import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { buildApp } from "./app";
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
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
