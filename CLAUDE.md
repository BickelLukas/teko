This file is the operating manual for AI-assisted development on Teko. Read it at the start of every non-trivial session.

---

## Project Summary

Teko is a household task tracker that runs as a Home Assistant add-on plus a companion HA integration. Two artifacts, one monorepo. The add-on (Node + Fastify + SQLite + React) does the real work; the integration (Python) adapts it to HA.

The product is opinionated: calm, household-shared, no leaderboards, HA-native. Read the design principles before writing code.

---

## Required Reading

Always read these at the start of any non-trivial session, in this order:

1. `README.md` — what Teko is and the design principles
2. `docs/PRODUCT.md` — what Teko does, vocabulary, non-goals
3. `docs/ARCHITECTURE.md` — how it's built and key decisions
4. `docs/DECISIONS/` — the specific ADRs relevant to what you're working on

If a session is about a specific subsystem, also skim the relevant code module before proposing changes.

---

## Tech Stack at a Glance

- **Backend:** Node, TypeScript strict, Fastify, Drizzle ORM, SQLite, rrule.js
- **Frontend:** React, Vite, TypeScript, Tailwind, shadcn/ui, TanStack Query
- **Shared:** Zod schemas in `shared/` — single source of truth for types and runtime validation
- **Integration:** Python 3.14+, Home Assistant custom integration patterns
- **Tests:** Vitest (TS), pytest + `pytest-homeassistant-custom-component` (Python)

If you're considering reaching for something not on this list, pause and check with the human first.

---

## Coding Conventions

### TypeScript

- **Strict mode is mandatory.** No disabling `strict`, `noUncheckedIndexedAccess`, or `noImplicitAny`.
- **No `any`, ever.** Use `unknown` and narrow. If a third-party type is missing, write a minimal declaration.
- **No type assertions (`as X`) without justification.** Prefer Zod parsing at boundaries.
- **Prefer `type` over `interface`** unless declaration merging is genuinely needed.
- **Discriminated unions over optional fields** when modeling states (e.g. task state machine).
- **Functions over classes** for domain logic. Classes are fine for stateful clients (DB, HTTP).

### Validation and types

- **Zod schemas in `shared/` are the source of truth.** Types are derived via `z.infer<>`.
- **Validate at every external boundary**: HTTP requests, WebSocket messages, environment variables, data read back from SQLite if untyped.
- **Inside the trusted core, rely on types.** Don't double-validate.

### Database (Drizzle)

- Use Drizzle's typed query builder for everything.
- The `sql` template tag is allowed for queries the builder can't express cleanly. **Never** concatenate strings into SQL.
- Migrations are append-only and committed. Never edit a migration after it's been merged.
- Soft-delete patterns where appropriate (users, tasks). Don't hard-delete data that history references.

### Dates and times

- **Use `date-fns` for all date math.** Never use native `Date` arithmetic (`+`, `-`, comparisons with `getTime()` for math).
- **All timestamps stored in UTC.** Convert for display only.
- **Recurrence math goes through `rrule.js`.** Don't roll your own.

### React / frontend

- **Functional components, hooks.** No class components.
- **TanStack Query for all server state.** Don't `useEffect` + `fetch`.
- **Forms via React Hook Form + Zod resolver.**
- **shadcn/ui components first**, custom components only when the primitive doesn't exist.
- **Tailwind classes on the outermost element** of a component when possible; avoid scattering them through nested elements.
- **No CSS-in-JS libraries.** Tailwind only.

### Python (integration)

- **Async everywhere.** HA is async; integrations must be too.
- **Type hints on every function signature.** Run `mypy` in CI.
- **Use HA's `DataUpdateCoordinator` pattern** for managing data fetched from the add-on.
- **Use `voluptuous` schemas** for service definitions, matching HA conventions.
- **No HTTP polling.** Subscribe to the add-on's WebSocket for state updates.

### General

- **Small files over large files.** A 600-line file is a smell.
- **Explicit over clever.** Code is read more than written.
- **Comments explain why, not what.** If the code needs a comment to explain what it's doing, rewrite it.
- **No dead code.** Delete commented-out blocks. Git remembers.

---

## Design Principle Reminders

These are doctrine from `README.md` and `PRODUCT.md`. They are enforced through code review, not aspiration.

### Self-motivation, never competition

- **Never** add a leaderboard, ranking view, or per-user comparison as a default surface.
- **Never** add notifications that reference another household member's behaviour.
- Per-user contribution data may exist, but it must require deliberate navigation to see and must not invite ranking (no sorting by "most done").
- If a feature request says "show who's done the most," push back and reference the design principles.

### The product disappears into the work

- **The name "Teko" appears in branding only.** Logo, sidebar title, README, releases.
- **The name "Teko" does NOT appear in UI copy, microcopy, notifications, or user-facing vocabulary.**
- Users add a "task," not a "teko." They have "chores," not "tekos." They are notified about their "tasks," not their "Teko items."
- Technical namespacing (event names, service domains, package names, file paths) may use `teko` as a prefix — this is functional, not branding.
- Rule of thumb: if a user could replace "Teko" with any other product name and the sentence still makes sense, the sentence is fine.

### HA-native, always

- HA users are Teko users. Never add a Teko-side login form, password field, or signup flow.
- Identity is derived from HA in every context (ingress headers, integration bearer token, future OAuth2).
- The `ha_user_id` column is immutable and the foreign key for all user-attributed data.
- Notifications go through HA's notify services. Don't add a separate push service.

### Calm by default

- Notifications are minimal, specific, and actionable. Read the examples in `docs/PRODUCT.md`.
- Animations are subtle. No bouncing badges. No red dots unless something is genuinely overdue.
- The default state of any new feature is "off" or "least intrusive." Users opt into more.

### Multilingual from day one

- All user-visible strings go through i18n from the moment they exist. Never write English strings directly into JSX or notification templates.
- Both `en.json` and `de.json` are updated in the same commit when adding strings.
- If you don't know the German translation, leave a placeholder marked `TODO(i18n)` and flag it in the PR — don't guess.

---

## Auth Invariants

Auth is the most important subsystem to keep clean. The following invariants are absolute:

- **Four contexts, one middleware, deterministic order:** dev mode → ingress → bearer token → (future) OAuth2 → 401.
- **The dev branch comes first and short-circuits.** Active only when `NODE_ENV` is `development` or `test` AND `DEV_MODE=true`. Any other combination (including production) disables the dev branch entirely.
- **The config loader must refuse to start with `DEV_MODE=true` and `NODE_ENV=production`.** This check exists; do not weaken it.
- **Dev-only routes do not exist in production builds.** They are conditionally registered, not 404'd. Don't change this pattern.
- **Ingress headers are trusted only when accompanied by the ingress path header.** Don't add code paths that trust them otherwise.
- **Bearer tokens are hashed at rest.** Never log a token. Never return a token in a response except the one-time pairing response.
- **Never add a login form.** Never add a password field. If you find yourself doing this, stop and re-read the auth section in `docs/ARCHITECTURE.md`.

---

## Dev Mode Safety

A separate section because dev mode is the easiest place to ship a security hole.

- **Three safeguards exist; keep all three:** build-time check, startup banner, response header.
- **Never commit `.env.development`.** Only `.env.example` is checked in.
- **The `DevUserSwitcher` component renders only when both `import.meta.env.DEV` is true AND the backend reports dev mode via response header.** Don't simplify this to one check.
- **Dev-mode endpoints are namespaced under `/api/_dev/`** and registered only when `config.devMode === true`. Don't add dev functionality outside this namespace.

---

## Commands

Scripts are defined in the root `package.json` and individual workspace
`package.json` files. Read them there — they are the source of truth.

Key entry points to know:
- `yarn dev` — local development (backend + frontend)
- `yarn test` — run all tests
- `yarn lint` — run linter
- `yarn build` — production build

For anything else, check `package.json`.

---

### Packages

When installing packages, always install them using yarn add instead of just adding them to the package.json to ensure you install the latest version.

---

## Testing Expectations

- **Pure domain logic (recurrence, state, streaks, points, windows): high coverage, written first.** These are the heart of the product. Tests are the spec.
- **API routes: integration tests against test SQLite.** Cover happy path, validation failures, auth failures.
- **UI components: light testing for non-trivial logic only.** Don't test that a button renders a string. Do test conditional rendering, state-dependent behaviour, and form validation.
- **Integration (Python): use `pytest-homeassistant-custom-component`.** Config flow, entity setup, service handlers. Don't write tests that boot a real HA.

When asked to implement domain logic, write the tests first based on the cases the human gives you, then implement. When asked to implement UI glue, skip tests unless logic is non-trivial.

---

## Things to Never Do

A non-exhaustive list of things that have come up in design and are settled. If a request seems to ask for one of these, push back before coding.

- Add a per-user leaderboard or ranked comparison view.
- Add a login form, password field, or signup flow.
- Send a notification that mentions another household member's behaviour.
- Use the name "Teko" in UI copy, notifications, or microcopy.
- Introduce MQTT as a dependency.
- Switch to Next.js or another fullstack framework.
- Add `any` types or `as` assertions to silence the type checker.
- Hard-delete user or task data.
- Add an external telemetry, analytics, or error-reporting service.
- Roll a custom recurrence engine instead of using `rrule.js`.
- Add native `Date` arithmetic instead of using `date-fns`.
- Concatenate strings into SQL.
- Add a "type" enum to the tasks table — the type is derived from `recurrence_rule`, `planned_for`, and `next_due_at` (see ADR-0003 and ADR-0006).
- Store tags as a JSON array on the tasks row — tags are first-class normalized entities in `tags` + `task_tags` tables (see ADR-0008).
- Add inline tag creation in task forms — tags are curated in Settings → Tags only.
- Use arbitrary hex colors for tags — the palette is a fixed set of 10 keys in `shared/src/palette.ts`.
- Use OR semantics for tag filtering — AND semantics are intentional (more tags = narrower result).
- Reintroduce hierarchical Projects — see ADR-0006. If a future feature seems to want hierarchy, propose it as a separate ADR first.
- Ship a feature with English strings hardcoded.
- Add a sidebar navigation entry that promotes Teko's own concepts over the user's household concepts.

If a request requires one of these, surface the conflict and discuss before proceeding.

---

## How to Approach Work in a Session

### Starting a session

1. Read the required docs listed at the top of this file.
2. Confirm understanding of the specific task with the human before generating code.
3. If the task touches a subsystem you haven't worked in this session, skim its code first.

### During work

- **Small, reviewable changes.** Don't grow a 1000-line uncommitted diff. Surface progress in logical chunks.
- **Ask before introducing a new dependency.** Even a small one.
- **Ask before introducing a new top-level concept** (a new domain entity, a new event type, a new service). These are decisions the human should make.
- **When stuck, say so.** Don't generate plausible-looking code that you're unsure about. Better to ask.

### Ending a piece of work

- **Run lint, typecheck, and tests** and report the results.
- **List the files changed** with a one-line summary each.
- **Surface anything noticed but not addressed** — code smells, missing tests, design tensions — even if out of scope. Don't quietly leave them.
- **Suggest what should land in this commit** vs. what should be follow-up.

---

## How to Update This File

This file is living documentation. When you observe a pattern Claude (or you) repeatedly gets wrong, add a line here. When a convention changes, update the relevant section.

Rules for updating:

- **Keep it short.** Every line should earn its place. If a guideline is obvious from reading the code, don't restate it here.
- **Prefer principles over specifics.** "Use Drizzle's typed query builder" is better than listing forbidden query patterns.
- **No code examples longer than 3 lines.** Code goes in the codebase, not in this file.
- **No file-path-specific guidance.** Paths change; principles don't.

If this file grows past ~400 lines, it's drifted into territory that belongs in the architecture doc or the code itself.

---

## When in Doubt

The order of authority:

1. The design principles in `README.md`
2. The non-goals in `docs/PRODUCT.md`
3. The accepted ADRs in `docs/DECISIONS/`
4. The conventions in this file
5. Standard practice in the chosen tech stack

If those conflict with a request, surface the conflict. The human decides.