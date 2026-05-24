# Teko

A calm, household-shared task tracker for Home Assistant. Recurring chores, one-off tasks, small projects — all in one place, shared with everyone in your household.

Authentication is handled by Home Assistant. No separate accounts, no passwords.

---

## Features

- Recurring chores with fixed or interval-from-last-completion schedules
- One-off tasks and hierarchical projects
- Streaks and household points (no leaderboards)
- Shared view across all household members
- Works on phone, tablet, and desktop through the HA sidebar

---

## Installation

Add `https://github.com/BickelLukas/teko` as a custom add-on repository in HA (**Settings → Add-ons → Add-on Store → ⋮ → Repositories**). Teko will appear in the store. Click **Install** — HA Supervisor pulls the pre-built image from GHCR automatically.

---

## Releasing

The `version` field in `config.yaml` maps directly to a Docker image tag in GHCR. **Do not bump the version without a corresponding release tag** — HA Supervisor will try to pull an image that doesn't exist.

### Release flow

From the repo root:

```bash
yarn release          # interactive — choose patch / minor / major / custom
yarn release patch    # bump patch non-interactively
yarn release 0.1.0    # set an explicit version
yarn release --dry-run patch   # preview without making changes
```

The command runs the full quality gate (lint + typecheck + tests), bumps the version in all package.json files and `addon/config.yaml` in lockstep, commits, tags, and pushes. CI then builds the multi-arch image and pushes it to GHCR.

After CI completes: in HA, **Settings → Add-ons → Teko → Update**.

---

## First-time setup

Click the **Teko** icon in the sidebar. Your HA identity is used automatically — no further setup needed. Other household members will be provisioned the first time they open Teko.

---

## Configuration options

None — Teko uses your HA users and stores all data in `/data/teko.db` (included in HA backups automatically).

---

## Troubleshooting

**Sidebar icon doesn't appear after install**
Refresh the HA frontend (hard reload). If it still doesn't appear, restart HA.

**Add-on crashes on start**
Check the add-on log in **Settings → Add-ons → Teko → Log**. The most common cause is a database permission issue with `/data/teko.db`.

**App loads but shows Unauthorized**
This happens when accessed outside of HA ingress (e.g., directly at `http://ha-host:3000`). Always open Teko through the HA sidebar.
