# ADR-0004: Home Assistant users are Teko users

**Date:** 2026-05-23  
**Status:** Accepted

## Context

Teko is a household tool used by multiple people. It needs to know who's who: to assign tasks, attribute completions, send personal notifications, and compute per-user streaks.

The question is whether Teko maintains its own user system (with passwords, signup, invitations) or piggybacks on Home Assistant's existing user system.

## Decision

Teko has no separate user system. Every Teko user mirrors a Home Assistant user. The HA user's UUID is the immutable join key. Other fields (display name, locale, notification preferences) are either cached from HA or Teko-specific UX preferences attached to that identity.

User provisioning is automatic:

- A user appears in Teko the first time they open it through HA ingress.
- A user removed from HA is soft-deactivated in Teko on the next sync; their history is preserved.
- There is no invitation flow, no password reset, no user CRUD UI.

## Consequences

**Positive:**
- Zero credential management. No passwords, no reset flows, no "forgot username" emails.
- Auth follows HA's existing security posture. Teko inherits MFA, trusted networks, and whatever else HA users have configured.
- New household members are added once (in HA) and immediately work in Teko.
- The auth surface is small enough to reason about completely.

**Negative:**
- Teko cannot be meaningfully used without HA. This is fine — see the project's design principles.
- We have to handle the case where the HA admin removes a user who has assigned tasks. We do this by soft-deactivating and preserving the task history with the old user ID for attribution.

## Alternatives considered

- **Teko's own user system**: rejected outright. Duplicates work that HA already does well, adds attack surface, and violates the "Teko is built for HA, not just deployed inside it" principle.
- **OAuth2 against HA, but with separate Teko-side accounts**: rejected as a worst-of-both-worlds option. The OAuth2 dance only makes sense for external clients (deferred until needed); for the ingress-served UI, the ingress headers already carry identity.