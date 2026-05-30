import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { z } from "zod";

// drizzle's better-sqlite3 migrator decides what to apply by comparing each
// journal entry's `when` against the *largest* `created_at` already recorded in
// `__drizzle_migrations`. A migration is run only when `when` exceeds that
// maximum. So if the newest migration has a `when` smaller than an
// already-applied one, the migrator silently skips it forever — which is how a
// rename/rebuild migration can fail to run and leave the schema stale.
//
// This test pins the invariant the migrator relies on: the most recent
// migration must be the newest by timestamp.

const journalSchema = z.object({
  entries: z
    .array(
      z.object({
        idx: z.number().int(),
        when: z.number().int(),
        tag: z.string(),
      }),
    )
    .min(1),
});

const journalPath = path.join(process.cwd(), "drizzle/migrations/meta/_journal.json");

describe("migration journal", () => {
  const { entries } = journalSchema.parse(JSON.parse(readFileSync(journalPath, "utf8")));

  it("indexes are sequential starting at 0", () => {
    entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
    });
  });

  it("the newest migration has the largest `when` so the migrator never skips it", () => {
    const newest = entries.at(-1);
    expect(newest).toBeDefined();
    if (!newest) return;
    const previousMax = Math.max(...entries.slice(0, -1).map((e) => e.when), -Infinity);
    expect(newest.when).toBeGreaterThan(previousMax);
  });
});
