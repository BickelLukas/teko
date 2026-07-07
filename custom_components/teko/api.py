"""Thin async client for the Teko add-on's HA-facing endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import aiohttp


class TekoApiError(Exception):
    """Raised when the add-on cannot be reached."""


class TekoAuthError(Exception):
    """Raised when the bearer token is rejected."""


@dataclass
class TekoTask:
    """A single open task, as returned by the summary endpoint."""

    id: str
    title: str
    due_at: str | None
    state: str


@dataclass
class TekoSummary:
    """Household-wide task summary consumed by sensors and the to-do list.

    The three counts mirror Teko's own Today page buckets exactly: overdue,
    today (actionable now), eligible (early completion window, due later).
    """

    eligible_count: int
    today_count: int
    overdue_count: int
    tasks: list[TekoTask]


class TekoApiClient:
    """Talks to GET /api/ha/summary on the add-on."""

    def __init__(self, session: aiohttp.ClientSession, base_url: str, token: str) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._token = token

    async def async_get_summary(self) -> TekoSummary:
        """Fetch the current eligible/today/overdue task summary."""
        url = f"{self._base_url}/api/ha/summary"
        headers = {"Authorization": f"Bearer {self._token}"}

        try:
            async with self._session.get(url, headers=headers) as resp:
                if resp.status == 401:
                    raise TekoAuthError("Bearer token rejected by the Teko add-on")
                resp.raise_for_status()
                data: dict[str, Any] = await resp.json()
        except aiohttp.ClientError as err:
            raise TekoApiError(f"Could not reach the Teko add-on: {err}") from err

        return TekoSummary(
            eligible_count=data["eligible_count"],
            today_count=data["today_count"],
            overdue_count=data["overdue_count"],
            tasks=[
                TekoTask(id=t["id"], title=t["title"], due_at=t["due_at"], state=t["state"])
                for t in data["tasks"]
            ],
        )
