# ADR-0002: HTTP + WebSocket between integration and add-on (not MQTT)

**Date:** 2026-05-23  
**Status:** Accepted

## Context

The integration and the add-on need to communicate bidirectionally: the integration issues commands (create, complete, snooze tasks) and receives state updates (task completed, became overdue, streak milestone).

Two reasonable channels:

- **MQTT**: HA's standard pattern for add-on integration. Discovery topics auto-create entities; command topics receive instructions.
- **Direct HTTP + WebSocket**: the integration calls the add-on's REST API for commands and subscribes to a WebSocket for events.

## Decision

Use HTTP for commands and a long-lived WebSocket for push updates, both over the internal Docker network between integration and add-on. Authentication is via a bearer token issued during config-flow pairing.

## Consequences

**Positive:**
- No MQTT broker dependency. Many HA users don't run one; for those who do, configuring credentials adds friction.
- The add-on already exposes a REST API for its own React UI; the integration reuses it.
- WebSocket gives real-time push without polling.
- Setup is dramatically simpler: install both artifacts, click "Add Integration," done.
- Easier to debug: HTTP traffic is inspectable with standard tools.

**Negative:**
- We don't get MQTT discovery's "entities appear automatically" magic — the integration must register entities explicitly. In practice this is one platform file per entity type, well within Python integration norms.
- The integration must handle reconnection logic for the WebSocket. Standard pattern, low risk.

## Alternatives considered

- **MQTT with discovery**: rejected because requiring users to set up and credential a broker is a major adoption barrier. The convenience for users who already run MQTT does not justify the friction for those who don't.