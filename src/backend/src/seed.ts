import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import * as schema from "./db/schema.js";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { addDays, subDays, startOfMonth, addMonths, startOfDay } from "date-fns";

const config = loadConfig();

if (!config.devMode) {
  console.error(
    "ERROR: seed.ts must only run in dev mode (NODE_ENV=development && DEV_MODE=true).\n" +
      "In production, users are populated by the HA Supervisor sync on startup.",
  );
  process.exit(1);
}

console.log("[DEV] Seeding 3 dev users (Alice, Bob, Charlie).");
console.log("[DEV] These will NOT be synced from HA in dev mode.");

const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const { db } = createDb(config.dbPath, path.join(__dirname, "../drizzle/migrations"));

// ── Reset all seed data ───────────────────────────────────────────────────────
// Idempotent: delete everything tied to seed ha_user_ids and recreate.

const SEED_HA_IDS = ["dev-alice", "dev-bob", "dev-charlie"];

const existingUsers = db
  .select()
  .from(schema.users)
  .where(inArray(schema.users.ha_user_id, SEED_HA_IDS))
  .all();

if (existingUsers.length > 0) {
  const existingIds = existingUsers.map((u) => u.id);
  // Delete completions for tasks created by seed users
  const seedTasks = db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(inArray(schema.tasks.created_by, existingIds))
    .all();
  if (seedTasks.length > 0) {
    db.delete(schema.completions)
      .where(
        inArray(
          schema.completions.task_id,
          seedTasks.map((t) => t.id),
        ),
      )
      .run();
  }
  db.delete(schema.tasks).where(inArray(schema.tasks.created_by, existingIds)).run();
  db.delete(schema.users).where(inArray(schema.users.ha_user_id, SEED_HA_IDS)).run();
  console.log("Cleared existing seed data.");
}

// ── Create users ─────────────────────────────────────────────────────────────

const aliceId = randomUUID();
const bobId = randomUUID();
const charlieId = randomUUID();

db.insert(schema.users)
  .values([
    {
      id: aliceId,
      ha_user_id: "dev-alice",
      name: "Alice",
      display_name: null,
      locale: "en",
      is_admin: true,
      is_active: true,
    },
    {
      id: bobId,
      ha_user_id: "dev-bob",
      name: "Bob",
      display_name: null,
      locale: "en",
      is_admin: false,
      is_active: true,
    },
    {
      id: charlieId,
      ha_user_id: "dev-charlie",
      name: "Charlie",
      display_name: null,
      locale: "de",
      is_admin: false,
      is_active: true,
    },
  ])
  .run();

console.log("Created users: Alice (dev-alice), Bob (dev-bob), Charlie (dev-charlie)");

// ── Seed tasks ────────────────────────────────────────────────────────────────

const now = new Date();
const today = startOfDay(now);

// Recurring chores

// Trash every 7 days — unassigned, eligible now
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Take out the trash",
    description: "Kitchen and bathroom bins",
    assignee_id: null,
    created_by: aliceId,
    state: "eligible",
    recurrence_rule: "FREQ=WEEKLY;INTERVAL=1",
    recurrence_mode: "after_completion",
    completion_window_days: 2,
    due_at: today,
    points: 1,
  })
  .run();

// Rent on the 1st of each month — assigned to Alice, not_yet unless today is near the 1st
const nextFirst = startOfMonth(addMonths(today, 1));
const prevFirst = startOfMonth(today);
const rentDue = today.getDate() <= 3 ? prevFirst : nextFirst;
const rentState = rentDue <= today ? "eligible" : "not_yet";
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Pay rent",
    description: null,
    assignee_id: aliceId,
    created_by: aliceId,
    state: rentState,
    recurrence_rule: "FREQ=MONTHLY;BYMONTHDAY=1",
    recurrence_mode: "fixed",
    completion_window_days: 3,
    due_at: rentDue,
    points: 2,
  })
  .run();

// Trim the bushes every 6 months — assigned to Bob
const bushesLastDone = subDays(today, 170);
const bushesDue = addDays(bushesLastDone, 180);
const bushesState = bushesDue <= today ? "eligible" : "not_yet";
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Trim the bushes",
    description: "Front garden and backyard hedges",
    assignee_id: bobId,
    created_by: aliceId,
    state: bushesState,
    recurrence_rule: "FREQ=MONTHLY;INTERVAL=6",
    recurrence_mode: "after_completion",
    completion_window_days: 14,
    due_at: bushesDue,
    points: 3,
  })
  .run();

// Weekly vacuuming — assigned to Charlie, overdue (due 3 days ago)
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Vacuum the living room",
    description: "Including under the couch",
    assignee_id: charlieId,
    created_by: aliceId,
    state: "overdue",
    recurrence_rule: "FREQ=WEEKLY;INTERVAL=1",
    recurrence_mode: "after_completion",
    completion_window_days: 2,
    due_at: subDays(today, 3),
    points: 1,
  })
  .run();

// Dishwasher filter cleaning every 4 weeks — unassigned, eligible
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Clean the dishwasher filter",
    description: null,
    assignee_id: null,
    created_by: bobId,
    state: "eligible",
    recurrence_rule: "FREQ=WEEKLY;INTERVAL=4",
    recurrence_mode: "after_completion",
    completion_window_days: 5,
    due_at: subDays(today, 1),
    points: 1,
  })
  .run();

// Laundry — assigned to Bob, due today
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Do the laundry",
    description: null,
    assignee_id: bobId,
    created_by: bobId,
    state: "eligible",
    recurrence_rule: "FREQ=WEEKLY;INTERVAL=1",
    recurrence_mode: "after_completion",
    completion_window_days: 1,
    due_at: today,
    points: 1,
  })
  .run();

// Grocery run — unassigned, coming up in 2 days
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Do the grocery run",
    description: "Check the shared list in the fridge",
    assignee_id: null,
    created_by: charlieId,
    state: "not_yet",
    recurrence_rule: "FREQ=WEEKLY;INTERVAL=1",
    recurrence_mode: "after_completion",
    completion_window_days: 2,
    due_at: addDays(today, 2),
    points: 1,
  })
  .run();

// One-off tasks

// Alice: call the plumber — overdue
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Call the plumber about the kitchen tap",
    description: null,
    assignee_id: aliceId,
    created_by: aliceId,
    state: "overdue",
    due_at: subDays(today, 2),
    points: null,
  })
  .run();

// Bob: pick up dry cleaning — due today
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Pick up dry cleaning",
    description: null,
    assignee_id: bobId,
    created_by: bobId,
    state: "eligible",
    due_at: today,
    points: null,
  })
  .run();

// Charlie: schedule car service — coming up
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Book car service appointment",
    description: null,
    assignee_id: charlieId,
    created_by: charlieId,
    state: "not_yet",
    due_at: addDays(today, 5),
    points: null,
  })
  .run();

// Unassigned: replace smoke detector batteries
db.insert(schema.tasks)
  .values({
    id: randomUUID(),
    title: "Replace smoke detector batteries",
    description: "All rooms",
    assignee_id: null,
    created_by: aliceId,
    state: "eligible",
    due_at: subDays(today, 1),
    points: 1,
  })
  .run();

console.log("Created 11 seed tasks across all users.");
console.log("Seed complete.");
