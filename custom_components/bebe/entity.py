"""Entidad base: agrupa todo bajo un dispositivo con el nombre del bebé."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo

from .const import CONF_NOMBRE, DOMAIN


def device_info(entry: ConfigEntry) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=entry.data[CONF_NOMBRE],
        manufacturer="Baby Tracker",
        entry_type=DeviceEntryType.SERVICE,
    )
