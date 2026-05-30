// Headless wrapper around `drizzle-kit generate`.
//
// WHY THIS EXISTS
// drizzle-kit's column-conflict prompt ("is X created or renamed from Y?")
// requires a TTY. In a non-interactive shell (CI, an AI agent's shell, piped
// input) it aborts with:
//   "Interactive prompts require a TTY terminal".
// This wrapper fakes a TTY, stubs setRawMode, and feeds Enter keypresses so each
// prompt takes its DEFAULT option, which is always "+ create column" (i.e. treat
// the column as new, NOT a rename).
//
// SAFETY — READ BEFORE USING
// Accepting the default means a genuine column RENAME is recorded as drop+create,
// which loses that column's data. After running this you MUST review the generated
// drizzle/migrations/<n>_*.sql by hand and fix any column that was actually renamed
// or whose type changed and needs a value conversion (the generator cannot express
// e.g. a strftime date cast — see 0010_date_only.sql for the pattern).
//
// USAGE
//   node scripts/generate-migration.cjs --name my_change
// or via the package script:
//   yarn db:generate:auto --name my_change

const path = require("path");
const { PassThrough } = require("stream");

// Fake an interactive stdin we control.
const fakeIn = new PassThrough();
fakeIn.isTTY = true;
fakeIn.setRawMode = () => fakeIn;
Object.defineProperty(process, "stdin", { value: fakeIn, configurable: true });

process.stdout.isTTY = true;
if (!process.stdout.columns) process.stdout.columns = 100;
process.stderr.isTTY = true;

// Send "return" keypresses; one consumed per prompt, extras are harmless.
let n = 0;
const tick = setInterval(() => {
  fakeIn.write("\r");
  if (++n > 12) clearInterval(tick);
}, 150);

// Forward any extra CLI args (e.g. --name foo) to drizzle-kit.
const passthrough = process.argv.slice(2);
process.argv = [process.execPath, "drizzle-kit", "generate", ...passthrough];

// drizzle-kit doesn't export bin.cjs via package "exports"; require by path.
require(path.join(__dirname, "../../../node_modules/drizzle-kit/bin.cjs"));
