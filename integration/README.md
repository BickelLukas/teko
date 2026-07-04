# Teko integration

A Home Assistant custom integration that adapts the [Teko add-on](../addon/README.md) into HA: sensors, a to-do list, and (later) services and events. The add-on is the source of truth for all data — this integration is a thin, read-only adapter.

The integration lives at [`/custom_components/teko`](../custom_components/teko) (repo root, not under `integration/`) — that's a HACS requirement, not a choice: HACS only scans `custom_components/` at the root of a repository.

---

## Installation

### Via HACS (recommended)

Not yet in the default HACS store — add it as a custom repository:

1. In HA: **HACS → ⋮ (top right) → Custom repositories**.
2. **Repository**: `https://github.com/BickelLukas/teko`, **Category**: `Integration`. Click **Add**.
3. Find **Teko** in HACS and click **Download**.
4. Restart Home Assistant.

Once installed via HACS, updates show up in HACS like any other integration — no manual re-copying.

### Manual

Copy `custom_components/teko` from this repo into your HA config's `custom_components/` directory, then restart Home Assistant.

---

## Pairing

1. In Teko, go to **Settings → Home Assistant integration** and click **Generate token**. Copy it — it's shown once.
2. In HA, go to **Settings → Devices & Services**. If the Teko add-on is running, a **Teko discovered** card appears automatically — click **Configure** and paste the token.
   - If nothing is discovered (e.g. a dev HA instance without Supervisor), click **Add Integration → Teko** and enter the add-on's URL and the token manually.
3. Done. Sensors and the to-do list appear under the **Teko** device.

Teko is single-instance — one household, one config entry.

---

## Entities

- **`sensor.teko_open_tasks`** — household-wide count of open (not yet done) tasks
- **`sensor.teko_overdue_tasks`** — household-wide count of overdue tasks
- **`todo.teko_tasks`** — open tasks as a read-only HA to-do list (Assist voice compatible)

All editing (creating, completing, assigning) happens in Teko itself — the to-do list is a glance/voice surface, not a second place to manage tasks.

---

## Known limitations (v1)

- **Polling, not push.** The coordinator polls `/api/ha/summary` every 60s. The add-on doesn't expose a WebSocket event channel yet (see ADR-0002 / ARCHITECTURE.md) — this is a known deviation from the intended push model, to be replaced once that channel exists.
- **No services yet.** Creating/completing tasks from HA automations isn't implemented in this pass.
