# Teko — Architecture

This document captures the **decisions and principles** behind Teko's technical design — the things that aren't visible from reading the code.

For *what* Teko does, see [`PRODUCT.md`](PRODUCT.md). For code structure, schemas, and APIs: read the code. This document is for the *why*.

---

## System Shape

Teko is distributed as **two artifacts** built from one monorepo:

- **The add-on** — a Home Assistant add-on containing the backend, database, and web UI. The source of truth for all data and business logic.
- **The integration** — a Home Assistant custom integration that adapts the add-on into HA: registers entities, services, events, and the sidebar panel.

The add-on is fully functional on its own. The integration is what makes Teko a first-class citizen of Home Assistant.

```
┌──────────────────────────────────────────────────────────────────┐
│ Home Assistant                                                   │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐     │
│ │ Teko integration (Python)                                │     │
│ │ Adapts the add-on to HA: entities, services, events,     │     │
│ │ sidebar panel, config flow.                              │     │
│ └────────────────────────┬─────────────────────────────────┘     │
│                          │ HTTP + WebSocket                      │
│                          │ (internal network, bearer token)      │
│                          ▼                                       │
│ ┌──────────────────────────────────────────────────────────┐     │
│ │ Teko add-on (single Node process)                        │     │
│ │ - REST + WebSocket API                                   │     │
│ │ - Serves the React SPA                                   │     │
│ │ - Scheduler (recurrence, digests, scoring)               │     │
│ │ - SQLite database                                        │     │
│ └──────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node, TypeScript (strict), Fastify |
| Database | SQLite via Drizzle ORM |
| Recurrence | iCal RRULE (rrule.js) |
| Frontend | React + Vite, Tailwind, shadcn/ui, TanStack Query |
| Realtime | WebSocket |
| Validation | Zod (shared between backend and frontend) |
| Integration | Python (Home Assistant custom integration) |
| Packaging | Single Docker container; multi-stage build |
| Package manager | Yarn Berry (v4) via Corepack, `node-modules` linker |

Rationale for the consequential choices is captured as decision records below.

---

## Key Decisions

These are the choices that shape everything else. If you find yourself wanting to revisit one, write an ADR in `docs/DECISIONS/` rather than quietly changing course.

### Two artifacts, one product

The add-on does all the real work; the integration is a thin adapter. We rejected the alternatives of "add-on with MQTT discovery" (requires MQTT broker, friction) and "everything inside one Python integration" (loses the freedom to build the backend in TypeScript). The two-artifact model gives us a clean Node/TS codebase for the heavy lifting and a small Python surface for HA-native polish.

### One unified task model

Chores, projects, and one-off tasks share a single underlying entity. The discriminator is computed from the presence of a recurrence rule and/or a parent. The UX presents them as distinct concepts; the data layer treats them as one shape. This avoids duplicating recurrence, assignment, and completion logic across near-identical entities.

### iCal RRULE for recurrence, with a mode discriminator

Recurrence is stored as an RRULE string plus a mode (`fixed` or `after_completion`). The mode is essential because the same RRULE means different things depending on whether the next due date anchors to a fixed schedule or to the last completion. Completion windows extend this further (see `PRODUCT.md`).

### Communication: HTTP + WebSocket, not MQTT

The integration talks to the add-on over the internal Docker network using HTTP for requests and a long-lived WebSocket for push updates. We considered MQTT and rejected it: it would require users to set up a broker, manage credentials, and add a moving part for no real benefit at this scale.

### Single Docker container, single Node process

The add-on is one container running one process that serves the API, the WebSocket, the static SPA, and the scheduler. No nginx, no separate worker, no fullstack framework. Memory stays low (suitable for Raspberry Pi), startup is fast, and operational complexity is zero.

### Vite-built SPA, not Next.js (or similar)

The React frontend is a static SPA built by Vite and served by Fastify. We rejected Next.js because HA ingress uses dynamic URL prefixes that fight static `basePath` configuration, and because SSR/edge features add complexity without value inside a single-container add-on. The SPA reads its base path from `window.location.pathname` at startup, making ingress's prefix transparent.

### SQLite, not Postgres

A household-scale workload fits comfortably in a single SQLite file. Operational simplicity, no separate service, included in HA backups for free. We will revisit only if real-world usage hits SQLite's actual ceiling (highly unlikely).

### Home Assistant users are Teko users

Teko mirrors HA's user list and does not maintain its own credentials. The HA user ID is the immutable join key. Auto-provisioning on first contact, soft-deactivation on removal, no invitation flow. This is the most important decision in the entire auth design — everything else follows from it.

### Dev-mode auth is an explicit fourth context

Local development can't use ingress headers or real HA tokens, so the auth middleware has an explicit dev-mode branch that injects a mock user. It's gated by two environment variables, refuses to activate in production builds, and is documented as a first-class concept rather than a hack. The dev-only routes and UI components also do not exist in production builds (not registered, not bundled).

### English and German are equal first-class languages from v1

We are not retrofitting i18n. All strings are externalised. User locale is per-user, defaulting to HA's locale but overridable in Teko.

---

## Authentication

Four contexts, in priority order:

1. **Dev mode** (local development only). An explicit first branch in the auth middleware, gated by `NODE_ENV=development` *and* `DEV_MODE=true`. Injects a mock user. Refuses to activate in production. Logs a startup banner. Sends a response header on every request so it's impossible to miss.

2. **Ingress** (default for users). HA's ingress proxy authenticates the user and injects identity headers. The add-on trusts these only when they arrive through ingress (verified by the presence of the ingress path header). Auto-provisions Teko users on first contact.

3. **Bearer token** (integration ↔ add-on). The integration receives a long-lived token during config-flow pairing. Stored hashed at rest; sent on every request. Represents the integration acting on behalf of the system, not a user — request bodies specify which user is being acted upon.

4. **OAuth2** (future, hypothetical external clients). Not implemented in v1. The endpoint surface is designed to accommodate it later.

The middleware handles all four in a single deterministic flow: dev → ingress → bearer → OAuth2 → 401. Each branch short-circuits cleanly.

---

## HA Integration Surface

Detailed contracts (entity names, service schemas, event payloads) live in the integration code and HA's standard files (`services.yaml`, `manifest.json`). Documenting them here would guarantee drift. The principles:

- **Aggregate entities by default** (per-user counts, household totals, todo lists). Per-task entities are opt-in via a toggle in the task editor to avoid entity explosion.
- **Services cover the full task lifecycle** (create, complete, reschedule, assign). Service calls return; state changes propagate via events.
- **Events on HA's bus** carry every meaningful state change. Power users build automations from these.
- **Sidebar panel** auto-registered, points at the add-on's ingress URL.

When adding to this surface: update the integration code *and* the user-facing readme. Don't update this document.

---

## Recurrence Engine Principles

The recurrence logic is the most subtle piece of domain code. Principles to preserve:

- **Two modes, one engine.** Fixed schedule and after-completion are toggled per task, not implemented as separate code paths.
- **Same library, both runtimes.** `rrule.js` runs on backend (computing due dates) and frontend (describing rules to humans). No second implementation to drift.
- **State is derived, then cached.** A task's `not_yet | eligible | planned | overdue` state is computed from timestamps; the cached value is recomputed by the scheduler tick and on every state-mutating action.
- **Completion windows are first-class.** A zero-width window is the strict "due today" behaviour; non-zero windows are the calm default for infrequent chores. See `PRODUCT.md` for the user-facing model.

Implementation lives in the backend's domain module and is heavily unit-tested. Tests are the spec.

---

## Deployment

- One Docker container managed by HA's Supervisor.
- Multi-stage Dockerfile produces the runtime image. Frontend is built into the backend's static directory at build time; in production they are inseparable.
- SQLite database lives in the add-on's `/data` directory and is included in HA backups automatically.
- Multi-architecture images (`amd64`, `aarch64`, `armv7`) built in CI on tagged releases.

---

## Development Workflow

Three tiers, used as needed:

1. **Local-only**: backend + frontend on localhost, dev-mode auth, seeded SQLite. Covers ~90% of work. No HA required. Boot time under 5 seconds.
2. **HA Container**: a local HA instance in Docker alongside Teko, used to test integration code (entities, services, events). The integration's config flow has a dev path allowing manual entry of the add-on URL since Supervisor discovery isn't available without Supervisor.
3. **Real HA OS**: install built artifacts into a real HA OS instance before tagging releases. Catches Supervisor-specific issues.

The local-only tier is the bar for contributor onboarding: clone, install, seed, run. Anything that pushes new contributors past five minutes of setup is friction we should remove.

---

## Testing Philosophy

- **Domain logic is heavily unit-tested.** Recurrence, state computation, streaks, points, window math — these are pure functions and the heart of the product. Tests are the spec.
- **API routes have integration tests** against a test SQLite database.
- **The Python integration uses HA's official test fixture** (`pytest-homeassistant-custom-component`) for config flow, entity, and service tests.
- **UI gets light component testing** for non-trivial logic only. Visual / interaction testing happens manually during development.
- **End-to-end through real HA is manual** and reserved for pre-release validation.

Coverage targets are not enforced as numbers. The rule is: if it could regress silently and cause user harm, it has a test.

---

## Observability and Privacy

- Structured logs to stdout (captured by HA's add-on log view).
- A health endpoint reports version, uptime, queue depth, database size.
- **No external telemetry. No error reporting service. No usage tracking.** This is a household tool; nothing leaves the household.

---

## Security

- The add-on is not directly reachable from the network — only through HA (ingress for users, internal Docker network for the integration).
- Ingress identity headers are trusted only when they arrive through ingress.
- Bearer tokens for the integration are hashed at rest.
- Webhook tokens (used for actionable notification callbacks) are HMAC-signed with a server-side secret.
- All API inputs are validated through Zod schemas shared between backend and frontend.

---

## Versioning and Releases

- The add-on and integration share a single version, released in lockstep from the same commit.
- Semantic versioning. Pre-1.0: breaking changes allowed in minor versions.
- A tagged release produces: a multi-arch Docker image, an updated add-on `config.yaml`, an updated integration `manifest.json`, and a changelog entry. The release workflow encodes this — don't do it by hand.

---

## Architecture Decision Records

Non-obvious decisions live in `docs/DECISIONS/` as short ADRs. Write one when:

- You're choosing between options that are not obviously equivalent
- You're rejecting a popular alternative
- You're going to want to defend the choice in six months

Each ADR is one short markdown file with context, decision, and consequences. They are immutable once accepted; superseding decisions get new ADRs that reference the old.

---

## Open Questions

Deliberately deferred:

- **Multi-household support** — currently one Teko instance per household. Revisit if anyone runs HA for two homes.
- **Direct WebSocket subscription to HA Core** — would enable proactive features like auto-snooze when nobody's home. Not in v1.
- **Schema migration strategy for breaking changes** — Drizzle handles additive changes; restructuring will need a documented upgrade path when first needed.

---

## What Lives Where

| Question | Where to find the answer |
|---|---|
| What does Teko do? | [`PRODUCT.md`](PRODUCT.md) |
| Why is the architecture shaped this way? | This document |
| What's the data model? | The Drizzle schema in the backend |
| What API endpoints exist? | The route definitions in the backend |
| What HA entities/services are exposed? | The integration's code and `services.yaml` |
| How do I run this locally? | The root `README.md` and `package.json` scripts |
| What are the conventions for working on the codebase? | [`CLAUDE.md`](../CLAUDE.md) |
| Why was a specific decision made? | `docs/DECISIONS/` ADRs |
