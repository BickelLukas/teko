import { loadConfig } from "./config";
import { createDb } from "./db/client";
import * as schema from "./db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const config = loadConfig();

const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const { db } = createDb(config.dbPath);

// Provision or find Alice
let alice = db.select().from(schema.users).where(eq(schema.users.ha_user_id, "dev-alice")).get();

if (!alice) {
  const id = randomUUID();
  db.insert(schema.users)
    .values({ id, ha_user_id: "dev-alice", name: "Alice", is_admin: true })
    .run();
  alice = db.select().from(schema.users).where(eq(schema.users.ha_user_id, "dev-alice")).get();
  if (!alice) {
    console.error("Failed to create/find user dev-alice after insert");
    process.exit(1);
  }
  console.log("Created user: Alice (dev-alice)");
} else {
  console.log("User Alice already exists, skipping.");
}

// Seed tasks only if none exist for Alice
const existing = db.select().from(schema.tasks).where(eq(schema.tasks.created_by, alice.id)).all();

if (existing.length === 0) {
  const taskData = [
    {
      title: "Take out the trash",
      description: "Kitchen and bathroom bins",
    },
    { title: "Do the laundry", description: null },
    {
      title: "Vacuum the living room",
      description: "Including under the couch",
    },
  ] as const;

  for (const t of taskData) {
    db.insert(schema.tasks)
      .values({
        id: randomUUID(),
        title: t.title,
        description: t.description,
        assignee_id: alice.id,
        created_by: alice.id,
        state: "eligible",
      })
      .run();
  }
  console.log(`Created ${taskData.length} sample tasks.`);
} else {
  console.log(`${existing.length} tasks already exist, skipping.`);
}

console.log("Seed complete.");
