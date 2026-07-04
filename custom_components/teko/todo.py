"""Todo platform for the Teko integration.

Read-only: item creation, completion, and reordering all happen in Teko
itself (the add-on is the source of truth). This entity is a glance/voice
surface, not a second place to edit tasks.
"""

from __future__ import annotations

from datetime import date

from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity
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
    """Set up the Teko to-do list from a config entry."""
    coordinator = entry.runtime_data
    async_add_entities([TekoTodoListEntity(coordinator, entry.entry_id)])


class TekoTodoListEntity(CoordinatorEntity[TekoDataUpdateCoordinator], TodoListEntity):
    """Open household tasks, presented as a read-only HA to-do list."""

    _attr_has_entity_name = True
    _attr_translation_key = "open_tasks"

    def __init__(self, coordinator: TekoDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry_id}_todo"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry_id)},
            name="Teko",
            manufacturer="Teko",
        )

    @property
    def todo_items(self) -> list[TodoItem]:
        return [
            TodoItem(
                uid=task.id,
                summary=task.title,
                status=TodoItemStatus.NEEDS_ACTION,
                due=date.fromisoformat(task.due_at) if task.due_at else None,
            )
            for task in self.coordinator.data.tasks
        ]
