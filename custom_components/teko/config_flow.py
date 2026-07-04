"""Config flow for the Teko integration.

Normal path: the add-on announces itself via Supervisor discovery at startup
(see ARCHITECTURE.md), so `async_step_hassio` fires automatically with the
add-on's internal host/port pre-filled — the user only pastes the pairing
token. `async_step_user` (manual URL + token entry) is a fallback for the
no-Supervisor dev tier, where discovery isn't available.

Single-instance only (manifest.json: single_config_entry) — Teko is one
household task tracker per HA installation.
"""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from .api import TekoApiClient, TekoApiError, TekoAuthError
from .const import CONF_TOKEN, CONF_URL, DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_URL): str,
        vol.Required(CONF_TOKEN): str,
    }
)

STEP_TOKEN_ONLY_SCHEMA = vol.Schema({vol.Required(CONF_TOKEN): str})


async def _validate(hass: HomeAssistant, url: str, token: str) -> str | None:
    """Return an error code, or None on success."""
    session = async_get_clientsession(hass)
    client = TekoApiClient(session, url, token)
    try:
        await client.async_get_summary()
    except TekoAuthError:
        return "invalid_auth"
    except TekoApiError:
        return "cannot_connect"
    except Exception:
        _LOGGER.exception("Unexpected error validating Teko pairing token")
        return "unknown"
    return None


class TekoConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Teko."""

    VERSION = 1

    _discovery_url: str | None = None

    # ── Manual entry (dev tier / no Supervisor) ─────────────────────────────

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle manual pairing: add-on URL + bearer token."""
        errors: dict[str, str] = {}

        if user_input is not None:
            error = await _validate(self.hass, user_input[CONF_URL], user_input[CONF_TOKEN])
            if error is None:
                return self.async_create_entry(title="Teko", data=user_input)
            errors["base"] = error

        return self.async_show_form(
            step_id="user", data_schema=STEP_USER_DATA_SCHEMA, errors=errors
        )

    # ── Supervisor discovery ────────────────────────────────────────────────

    async def async_step_hassio(self, discovery_info: HassioServiceInfo) -> ConfigFlowResult:
        """Handle discovery pushed by the add-on via Supervisor at startup."""
        host = discovery_info.config[CONF_HOST]
        port = discovery_info.config[CONF_PORT]
        self._discovery_url = f"http://{host}:{port}"
        return await self.async_step_hassio_confirm()

    async def async_step_hassio_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Ask only for the pairing token — the URL came from discovery."""
        errors: dict[str, str] = {}
        assert self._discovery_url is not None

        if user_input is not None:
            error = await _validate(self.hass, self._discovery_url, user_input[CONF_TOKEN])
            if error is None:
                return self.async_create_entry(
                    title="Teko",
                    data={CONF_URL: self._discovery_url, CONF_TOKEN: user_input[CONF_TOKEN]},
                )
            errors["base"] = error

        return self.async_show_form(
            step_id="hassio_confirm",
            data_schema=STEP_TOKEN_ONLY_SCHEMA,
            description_placeholders={"url": self._discovery_url},
            errors=errors,
        )
