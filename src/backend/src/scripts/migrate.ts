import path from "path";
import fs from "fs";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";

// __dirname is scripts/ in both dev (src/scripts/) and prod (dist/scripts/).
// Migrations are two levels up: src/backend/drizzle/ or /app/backend/drizzle/.
const migrationsFolder = path.join(__dirname, "../../drizzle/migrations");

const config = loadConfig();

const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`Running migrations from ${migrationsFolder} on ${config.dbPath}`);
createDb(config.dbPath, migrationsFolder);
console.log("Migrations complete.");
