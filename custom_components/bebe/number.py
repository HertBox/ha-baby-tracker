"""Valores ajustables desde la UI: oz por biberón e indicación del pediatra."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.number import (
    NumberEntityDescription,
    NumberMode,
    RestoreNumber,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import device_info


@dataclass(frozen=True, kw_only=True)
class BebeNumberDescription(NumberEntityDescription):
    # Atributo de BebeRuntime que refleja este valor
    campo: str


NUMEROS: tuple[BebeNumberDescription, ...] = (
    BebeNumberDescription(
        key="oz_por_biberon", translation_key="oz_por_biberon", campo="oz_default",
        icon="mdi:baby-bottle-outline", native_min_value=0.5, native_max_value=10,
        native_step=0.5, native_unit_of_measurement="oz", mode=NumberMode.BOX,
    ),
    BebeNumberDescription(
        key="meta_oz_toma", translation_key="meta_oz_toma", campo="meta_oz_toma",
        icon="mdi:target", native_min_value=0.5, native_max_value=10,
        native_step=0.5, native_unit_of_measurement="oz", mode=NumberMode.BOX,
    ),
    BebeNumberDescription(
        key="intervalo_indicado", translation_key="intervalo_indicado",
        campo="intervalo_indicado_h", icon="mdi:timer-cog-outline",
        native_min_value=1, native_max_value=6, native_step=0.5,
        native_unit_of_measurement=UnitOfTime.HOURS, mode=NumberMode.BOX,
    ),
    BebeNumberDescription(
        key="limite_biberon", translation_key="limite_biberon", campo="limite_biberon_h",
        icon="mdi:timer-alert-outline", native_min_value=0.5, native_max_value=4, native_step=0.25,
        native_unit_of_measurement=UnitOfTime.HOURS, mode=NumberMode.BOX,
    ),
    BebeNumberDescription(
        key="limite_materna", translation_key="limite_materna", campo="limite_materna_h",
        icon="mdi:mother-nurse", native_min_value=0.5, native_max_value=4, native_step=0.25,
        native_unit_of_measurement=UnitOfTime.HOURS, mode=NumberMode.BOX,
    ),
    BebeNumberDescription(
        key="caducidad_ambiente", translation_key="caducidad_ambiente", campo="caducidad_ambiente_h",
        icon="mdi:thermometer", native_min_value=0.5, native_max_value=8, native_step=0.5,
        native_unit_of_measurement=UnitOfTime.HOURS, mode=NumberMode.BOX,
    ),
    BebeNumberDescription(
        key="caducidad_refri", translation_key="caducidad_refri", campo="caducidad_refri_dias",
        icon="mdi:fridge-outline", native_min_value=0.5, native_max_value=8, native_step=0.5,
        native_unit_of_measurement=UnitOfTime.DAYS, mode=NumberMode.BOX,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities(BebeNumber(entry, desc) for desc in NUMEROS)


class BebeNumber(RestoreNumber):
    _attr_has_entity_name = True
    entity_description: BebeNumberDescription

    def __init__(self, entry: ConfigEntry, desc: BebeNumberDescription) -> None:
        self._entry = entry
        self.entity_description = desc
        self._attr_unique_id = f"{entry.entry_id}_{desc.key}"
        self._attr_device_info = device_info(entry)
        self._attr_native_value = getattr(entry.runtime_data, desc.campo)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (ultimo := await self.async_get_last_number_data()) and ultimo.native_value:
            await self.async_set_native_value(ultimo.native_value)

    async def async_set_native_value(self, value: float) -> None:
        self._attr_native_value = value
        setattr(self._entry.runtime_data, self.entity_description.campo, value)
        self.async_write_ha_state()
        # La meta y la próxima toma dependen de estos valores
        await self._entry.runtime_data.coordinator.async_refresh()
