"""Sensor platform for the Teko integration."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import TekoConfigEntry
from .const import DOMAIN
from .coordinator import TekoDataUpdateCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TekoConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Teko sensors from a config entry."""
    coordinator = entry.runtime_data
    async_add_entities(
        [
            TekoOpenTasksSensor(coordinator, entry.entry_id),
            TekoOverdueTasksSensor(coordinator, entry.entry_id),
        ]
    )


class TekoSensorBase(CoordinatorEntity[TekoDataUpdateCoordinator], SensorEntity):
    """Shared device grouping for Teko sensors — one device per household."""

    _attr_has_entity_name = True
    _attr_native_unit_of_measurement = "tasks"

    def __init__(self, coordinator: TekoDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry_id)},
            name="Teko",
            manufacturer="Teko",
        )


class TekoOpenTasksSensor(TekoSensorBase):
    """Household-wide count of open (not yet done) tasks."""

    _attr_translation_key = "open_tasks"
    _attr_icon = "mdi:checkbox-marked-circle-outline"

    def __init__(self, coordinator: TekoDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id)
        self._attr_unique_id = f"{entry_id}_open_tasks"

    @property
    def native_value(self) -> int:
        return self.coordinator.data.open_count


class TekoOverdueTasksSensor(TekoSensorBase):
    """Household-wide count of overdue tasks."""

    _attr_translation_key = "overdue_tasks"
    _attr_icon = "mdi:alert-circle-outline"

    def __init__(self, coordinator: TekoDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id)
        self._attr_unique_id = f"{entry_id}_overdue_tasks"

    @property
    def native_value(self) -> int:
        return self.coordinator.data.overdue_count
