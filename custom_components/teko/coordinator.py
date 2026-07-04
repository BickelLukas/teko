"""Data update coordinator for the Teko integration."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import TekoApiClient, TekoApiError, TekoAuthError, TekoSummary
from .const import CONF_TOKEN, CONF_URL, DOMAIN, SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)


class TekoDataUpdateCoordinator(DataUpdateCoordinator[TekoSummary]):
    """Polls the add-on's task summary on a fixed interval."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL,
        )
        self.config_entry = entry
        session = async_get_clientsession(hass)
        self.client = TekoApiClient(session, entry.data[CONF_URL], entry.data[CONF_TOKEN])

    async def _async_update_data(self) -> TekoSummary:
        try:
            return await self.client.async_get_summary()
        except TekoAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except TekoApiError as err:
            raise UpdateFailed(str(err)) from err
