# ADR-0001: Two artifacts (add-on + integration), not one

**Date:** 2026-05-23  
**Status:** Accepted

## Context

Teko needs to integrate deeply with Home Assistant: expose entities, register services, fire events, appear in the sidebar, and authenticate against HA users. It also needs a real backend (database, scheduler, recurrence engine, web UI) where the actual work happens.

Two natural shapes for shipping this:

- **One artifact**: a single Python custom integration that owns everything, including a web UI and database.
- **Two artifacts**: a Docker add-on for the backend and UI, plus a small Python integration that adapts it to HA.

A third option — a pure add-on using MQTT discovery for HA-side entities and services — is addressed in [ADR-0002](0002-http-not-mqtt.md).

## Decision

Ship two artifacts from one monorepo:

1. **The add-on** contains the backend (Node + Fastify + SQLite), the React UI, the scheduler, the recurrence engine, and all business logic. It is fully functional standalone.
2. **The integration** is a thin Python adapter that registers entities, services, events, and the sidebar panel by talking to the add-on over the internal Docker network.

## Consequences

**Positive:**
- The heavy lifting happens in TypeScript, where the author is productive.
- The Python surface stays small (~500–800 lines), stable, and easy to maintain.
- The add-on can be developed and tested without HA running.
- The integration can be released independently of the add-on if needed.
- Users who don't want HA entities can install just the add-on.

**Negative:**
- Two installable artifacts means users install two things. Mitigated by clear documentation and HACS support for the integration.
- Two release pipelines, kept in lockstep by sharing a version and a CI workflow.

## Alternatives considered

- **One Python integration containing everything**: rejected because building a real backend (database, scheduler, web UI) in Python adds nothing the author wants, and the integration would become a large codebase rather than a thin adapter.
- **Pure add-on with no integration**: rejected because users would have to configure HA entities manually (YAML or MQTT). Not first-class.