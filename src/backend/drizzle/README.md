# Database migrations

Drizzle ORM + SQLite. Migrations live in `migrations/` and are **append-only** —
never edit a migration after it's merged. The schema source of truth is
[`../src/db/schema.ts`](../src/db/schema.ts).

## How to generate a migration

1. **Edit the schema** in `src/db/schema.ts` (add/drop/retype columns, tables, etc.).

2. **Generate the migration.** `drizzle-kit generate` diffs the schema against the
   latest snapshot in `migrations/meta/` and writes a new `<n>_*.sql`, a
   `meta/<n>_snapshot.json`, and a `meta/_journal.json` entry.

   - **Interactive shell (a human at a terminal):**
     ```
     yarn workspace @teko/backend db:generate --name my_change
     ```
     Answer the column-conflict prompts ("is X created or renamed from Y?") yourself.

   - **Non-interactive shell (CI, or an AI agent):** the prompt above requires a TTY
     and will abort with *"Interactive prompts require a TTY terminal"*. Use the
     headless wrapper, which auto-accepts the **default** for every prompt
     (default = "+ create column", i.e. NOT a rename):
     ```
     yarn workspace @teko/backend db:generate:auto --name my_change
     ```
     See [`../scripts/generate-migration.cjs`](../scripts/generate-migration.cjs).

3. **Review the generated SQL — always.** The generator is correct for simple
   add/drop, but it **cannot**:
   - Express a value conversion on a type change (e.g. integer-ms → `YYYY-MM-DD`
     needs a `strftime` cast). Hand-edit the `INSERT ... SELECT` in the recreate
     block. See [`migrations/0010_date_only.sql`](migrations/0010_date_only.sql).
   - Tell a genuine **rename** from a drop+create. The headless wrapper always picks
     "create", which would silently drop a renamed column's data. If you renamed a
     column, fix the generated SQL by hand.

4. **Never hand-edit `meta/_journal.json` or `meta/*_snapshot.json`.** Let the
   tooling write them. If only the SQL is wrong, fix the SQL — the journal and
   snapshot stay tool-authored. (The snapshot is what future `generate` runs diff
   against; keeping it accurate is what makes the lineage self-heal.)

5. **Verify.** Integration tests apply every migration in order against a fresh
   SQLite DB:
   ```
   yarn workspace @teko/backend test
   ```
   `src/db/migrations.test.ts` also asserts the newest journal entry has the
   largest `when` timestamp (so the migrator never skips it).

## Known wart

Snapshots for `0007`–`0009` are missing (those migrations were hand-authored
without running the tool), so before `0010` the latest snapshot drizzle knew was
`0006`. A fresh `generate` therefore produced SQL that tried to redo `0007`–`0009`.
`0010`'s tool-written snapshot reflects the true current schema, so the lineage
self-heals from `0010` onward — future `generate` runs diff against `0010` and
produce clean deltas. If you ever see a generated migration re-doing old work,
the snapshot lineage is the cause; trust the schema + the SQL files, not the
snapshot gaps.
