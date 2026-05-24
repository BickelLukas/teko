# ADR-0005: Equal rights for household members; no admin distinction in v0.x

**Date:** 2026-05-24  
**Status:** Accepted

## Context

Phase 10 introduced a user sync job that attempted to mirror HA's `is_admin` flag into Teko so that admin-only features could be gated appropriately. Investigation revealed that no viable path exists for add-ons to retrieve per-user admin status:

- `GET /auth/list_users` (Supervisor REST) — returns 403; not part of the add-on API surface.
- `GET /core/api/states` (HA Core REST) — returns person entity attributes (`user_id`, `friendly_name`, device trackers); does not expose admin status.
- WebSocket `config/auth/list` — technically works but requires `auth_api: true`, a sensitive permission, and adds significant complexity for marginal value.
- HA ingress headers (`X-Remote-User-Id`, `X-Remote-User-Display-Name`, `X-Remote-User-Name`) — do not carry admin information.
- Add-ons cannot query arbitrary users' admin status via HA Core because requests are made as the add-on, not as the requesting user.

In parallel, reviewing existing and planned features found that **no feature actually requires admin gating** — the `is_admin` column was introduced speculatively, against the design principle of deferring features until a concrete need exists.

## Decision

Drop the admin distinction entirely in v0.x. All household members have equal rights to all Teko features. The `is_admin` schema column is kept as a reserved field and is always `false`.

## Rationale

- No existing feature requires admin gating; protection against a hypothetical need is premature.
- Households are small and trusted. Admin roles solve enterprise problems, not household ones.
- Aligns with the design principle of no hierarchy among household members.
- Reversible: if dogfooding reveals a genuine need, admin can be added as a Teko-internal concept (e.g. first user becomes admin, can promote others). That would not require mirroring HA's flag.
- Keeping `is_admin: false` in the schema costs nothing and avoids a migration if we revisit.

## Consequences

**Positive:**
- Simpler implementation: sync reads only what the API actually provides.
- Lighter HA permissions: no `auth_api`, no elevated `hassio_role`. Higher security rating.
- No admin-gated surfaces in the UI; the product surface is consistent for all users.

**Negative:**
- If an admin-only feature is needed later, it requires a Teko-internal admin concept (not just reading a flag). This is considered acceptable — see Rationale above.

## Alternatives considered

- **WebSocket `config/auth/list` for admin sync** — rejected; requires `auth_api: true` (sensitive permission), adds a persistent WebSocket client, and the value is zero until a concrete admin-gated feature exists.
- **Per-ingress admin enrichment** — rejected; the data is not reachable via add-on APIs regardless of ingress.
- **Teko-internal admin toggle (first user is admin)** — deferred until a concrete need is proven by dogfooding.
