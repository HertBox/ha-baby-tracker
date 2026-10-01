"""Sensores de KPIs."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfLength, UnitOfMass, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .const import ML_POR_OZ
from .coordinator import BebeCoordinator
from .entity import device_info


def _ultima(d: dict[str, Any], campo: str) -> Any:
    return d["ultima"][campo] if d["ultima"] else None


def _attrs_ultima(d: dict[str, Any]) -> dict[str, Any]:
    u = d["ultima"]
    if not u:
        return {}
    return {k: u[k] for k in (
        "id", "oz_tomadas", "oz_preparadas", "oz_sobrantes", "tipo",
        "confianza", "fuente", "registrado_por", "nota",
    )}


@dataclass(frozen=True, kw_only=True)
class BebeSensorDescription(SensorEntityDescription):
    valor: Callable[[dict[str, Any]], Any]
    atributos: Callable[[dict[str, Any]], dict[str, Any]] | None = None


SENSORES: tuple[BebeSensorDescription, ...] = (
    BebeSensorDescription(
        key="ultima_toma", translation_key="ultima_toma", icon="mdi:baby-bottle",
        device_class=SensorDeviceClass.TIMESTAMP,
        valor=lambda d: d["ultima_fin"], atributos=_attrs_ultima,
    ),
    BebeSensorDescription(
        key="ultima_toma_oz", translation_key="ultima_toma_oz", icon="mdi:cup-water",
        native_unit_of_measurement="oz", suggested_display_precision=2,
        valor=lambda d: _ultima(d, "oz_tomadas"),
    ),
    BebeSensorDescription(
        key="proxima_toma", translation_key="proxima_toma", icon="mdi:clock-outline",
        device_class=SensorDeviceClass.TIMESTAMP, valor=lambda d: d["proxima"],
    ),
    BebeSensorDescription(
        key="oz_hoy", translation_key="oz_hoy", icon="mdi:baby-bottle-outline",
        native_unit_of_measurement="oz", state_class=SensorStateClass.TOTAL,
        suggested_display_precision=1,
        valor=lambda d: d["oz_hoy"],
        atributos=lambda d: {
            "ml": round(d["oz_hoy"] * ML_POR_OZ),
            "tomas_exactas": d["exactas_hoy"],
            "serie_diaria": d["serie"],
        },
    ),
    BebeSensorDescription(
        key="tomas_hoy", translation_key="tomas_hoy", icon="mdi:counter",
        state_class=SensorStateClass.MEASUREMENT, valor=lambda d: d["tomas_hoy"],
    ),
    BebeSensorDescription(
        key="oz_24h", translation_key="oz_24h", icon="mdi:history",
        native_unit_of_measurement="oz", state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1, valor=lambda d: d["oz_24h"],
    ),
    BebeSensorDescription(
        key="promedio_7d", translation_key="promedio_7d", icon="mdi:chart-line",
        native_unit_of_measurement="oz", state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1, valor=lambda d: d["promedio_7d"],
    ),
    BebeSensorDescription(
        key="intervalo", translation_key="intervalo", icon="mdi:timer-sand",
        native_unit_of_measurement=UnitOfTime.HOURS, device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=1,
        valor=lambda d: d["intervalo_h"],
    ),
    BebeSensorDescription(
        key="meta_oz_dia", translation_key="meta_oz_dia", icon="mdi:target",
        native_unit_of_measurement="oz", suggested_display_precision=1,
        valor=lambda d: d["meta_oz_dia"],
        atributos=lambda d: {
            "fuente": "indicación del pediatra (oz por toma × tomas al día)",
            "tomas_al_dia": d["tomas_meta"],
            "referencia_por_peso_oz_dia": d["referencia_peso_oz_dia"],
        },
    ),
    BebeSensorDescription(
        key="avance_meta", translation_key="avance_meta", icon="mdi:progress-check",
        native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT,
        valor=lambda d: d["avance_meta"],
    ),
    BebeSensorDescription(
        key="peso", translation_key="peso", device_class=SensorDeviceClass.WEIGHT,
        native_unit_of_measurement=UnitOfMass.KILOGRAMS, suggested_display_precision=2,
        valor=lambda d: d["peso"]["peso_kg"] if d["peso"] else None,
        atributos=lambda d: {"fecha": d["peso"]["fecha"]} if d["peso"] else {},
    ),
    BebeSensorDescription(
        key="talla", translation_key="talla", device_class=SensorDeviceClass.DISTANCE,
        native_unit_of_measurement=UnitOfLength.CENTIMETERS, suggested_display_precision=1,
        valor=lambda d: d["talla"]["talla_cm"] if d["talla"] else None,
        atributos=lambda d: {"fecha": d["talla"]["fecha"]} if d["talla"] else {},
    ),
    BebeSensorDescription(
        key="biberon_restante", translation_key="biberon_restante", icon="mdi:baby-bottle",
        native_unit_of_measurement="oz", suggested_display_precision=2,
        valor=lambda d: d["biberon"]["restante"] if d["biberon"] else None,
        atributos=lambda d: {
            **({k: d["biberon"][k] for k in (
                "id", "tipo", "oz", "consumido", "n_tomas", "preparado", "primera_toma", "vence", "vencido", "estado",
            )} if d["biberon"] else {}),
            "en_pausa": [{k: b[k] for k in ("id", "tipo", "oz", "consumido", "restante", "primera_toma", "vence", "vencido")}
                         for b in d["en_pausa"]],
        },
    ),
    BebeSensorDescription(
        key="biberon_vence", translation_key="biberon_vence", icon="mdi:timer-alert-outline",
        device_class=SensorDeviceClass.TIMESTAMP,
        valor=lambda d: dt_util.parse_datetime(d["biberon"]["vence"])
        if d["biberon"] and d["biberon"]["vence"] else None,
    ),
    BebeSensorDescription(
        key="oz_por_toma", translation_key="oz_por_toma", icon="mdi:cup-water",
        native_unit_of_measurement="oz", state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=2, valor=lambda d: d["oz_por_toma"],
    ),
    BebeSensorDescription(
        key="tomas_por_dia", translation_key="tomas_por_dia", icon="mdi:repeat",
        state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=1,
        valor=lambda d: d["tomas_por_dia"],
    ),
    BebeSensorDescription(
        key="biberones_hoy", translation_key="biberones_hoy", icon="mdi:baby-bottle-outline",
        state_class=SensorStateClass.MEASUREMENT, valor=lambda d: d["biberones_hoy"],
    ),
    BebeSensorDescription(
        key="pct_terminados", translation_key="pct_terminados", icon="mdi:check-circle-outline",
        native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT,
        valor=lambda d: d["pct_terminados"],
    ),
    BebeSensorDescription(
        key="desechado_7d", translation_key="desechado_7d", icon="mdi:delete-outline",
        native_unit_of_measurement="oz", state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1, valor=lambda d: d["desechado_7d"],
    ),
    BebeSensorDescription(
        key="materna_hoy", translation_key="materna_hoy", icon="mdi:mother-nurse",
        native_unit_of_measurement="oz", state_class=SensorStateClass.TOTAL,
        suggested_display_precision=1, valor=lambda d: d["materna_hoy"],
    ),
    BebeSensorDescription(
        key="formula_hoy", translation_key="formula_hoy", icon="mdi:baby-bottle",
        native_unit_of_measurement="oz", state_class=SensorStateClass.TOTAL,
        suggested_display_precision=1, valor=lambda d: d["formula_hoy"],
    ),
    BebeSensorDescription(
        key="extraido_hoy", translation_key="extraido_hoy", icon="mdi:water-plus",
        native_unit_of_measurement="oz", state_class=SensorStateClass.TOTAL,
        suggested_display_precision=1, valor=lambda d: d["extraido_hoy"],
    ),
    BebeSensorDescription(
        key="extraido_dia", translation_key="extraido_dia", icon="mdi:chart-line",
        native_unit_of_measurement="oz", state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1, valor=lambda d: d["extraido_dia"],
    ),
    BebeSensorDescription(
        key="reserva_oz", translation_key="reserva_oz", icon="mdi:fridge-outline",
        native_unit_of_measurement="oz", state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1, valor=lambda d: d["reserva_oz"],
        atributos=lambda d: {
            "biberones": [{k: b[k] for k in ("id", "oz", "ubicacion", "hecho", "caduca", "caducado")}
                          for b in d["reservas"]],
            "vigentes": sum(1 for b in d["reservas"] if not b["caducado"]),
            "caducados": sum(1 for b in d["reservas"] if b["caducado"]),
        },
    ),
    BebeSensorDescription(
        key="reserva_caduca", translation_key="reserva_caduca", icon="mdi:timer-sand-complete",
        device_class=SensorDeviceClass.TIMESTAMP, valor=lambda d: d["proxima_caducidad"],
    ),
    BebeSensorDescription(
        key="materna_desechada_7d", translation_key="materna_desechada_7d", icon="mdi:delete-outline",
        native_unit_of_measurement="oz", state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1, valor=lambda d: d["materna_desechada_7d"],
    ),
    BebeSensorDescription(
        key="ritmo_oz_hora", translation_key="ritmo_oz_hora", icon="mdi:speedometer",
        native_unit_of_measurement="oz/h", state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=2, valor=lambda d: d["ritmo_oz_hora"],
        atributos=lambda d: {"meta_oz_hora": round(d["meta_oz_dia"] / 24, 2) if d["meta_oz_dia"] else None},
    ),
    BebeSensorDescription(
        key="ultimo_panal", translation_key="ultimo_panal", icon="mdi:human-baby-changing-table",
        device_class=SensorDeviceClass.TIMESTAMP,
        valor=lambda d: dt_util.parse_datetime(d["ultimo_panal"]["fin"]) if d["ultimo_panal"] else None,
        atributos=lambda d: {k: d["ultimo_panal"][k] for k in ("id", "tipo", "color", "consistencia", "registrado_por")}
        if d["ultimo_panal"] else {},
    ),
    BebeSensorDescription(
        key="ultimo_pipi", translation_key="ultimo_pipi", icon="mdi:water",
        device_class=SensorDeviceClass.TIMESTAMP, valor=lambda d: d["ultimo_pipi"],
    ),
    BebeSensorDescription(
        key="ultima_popo", translation_key="ultima_popo", icon="mdi:emoticon-poop",
        device_class=SensorDeviceClass.TIMESTAMP,
        valor=lambda d: dt_util.parse_datetime(d["ultima_popo"]["fin"]) if d["ultima_popo"] else None,
        atributos=lambda d: {k: d["ultima_popo"][k] for k in ("color", "consistencia")} if d["ultima_popo"] else {},
    ),
    BebeSensorDescription(
        key="panales_hoy", translation_key="panales_hoy", icon="mdi:counter",
        state_class=SensorStateClass.MEASUREMENT, valor=lambda d: d["panales_hoy"],
        atributos=lambda d: d["panales_hoy_tipos"],
    ),
    BebeSensorDescription(
        key="panales_por_dia", translation_key="panales_por_dia", icon="mdi:chart-bar",
        state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=1,
        valor=lambda d: d["panales_por_dia"],
    ),
    BebeSensorDescription(
        key="intervalo_panales", translation_key="intervalo_panales", icon="mdi:timer-sand",
        native_unit_of_measurement=UnitOfTime.HOURS, device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=1,
        valor=lambda d: d["intervalo_panales_h"],
    ),
    BebeSensorDescription(
        key="edad", translation_key="edad", icon="mdi:cake-variant",
        native_unit_of_measurement=UnitOfTime.DAYS, valor=lambda d: d["edad_dias"],
        atributos=lambda d: {"nombre": d["nombre"], "nacimiento": d["nacimiento"], "sexo": d["sexo"], "unidad": d["unidad"]},
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = entry.runtime_data.coordinator
    async_add_entities(BebeSensor(coordinator, entry, desc) for desc in SENSORES)


# Sensores que llevan bebe_id / nombre / unidad (los que usan los blueprints)
CON_DATOS_BEBE = {"ultima_toma", "proxima_toma", "reserva_oz", "reserva_caduca", "biberon_restante", "ultimo_panal"}


class BebeSensor(CoordinatorEntity[BebeCoordinator], SensorEntity):
    _attr_has_entity_name = True
    # La serie diaria es grande y ya vive en bebe.db; no duplicarla en el historial de HA
    _unrecorded_attributes = frozenset({"serie_diaria"})
    entity_description: BebeSensorDescription

    def __init__(self, coordinator: BebeCoordinator, entry: ConfigEntry,
                 desc: BebeSensorDescription) -> None:
        super().__init__(coordinator)
        self.entity_description = desc
        self._attr_unique_id = f"{entry.entry_id}_{desc.key}"
        self._attr_device_info = device_info(entry)
        self._entry_id = entry.entry_id

    @property
    def native_value(self) -> Any:
        return self.entity_description.valor(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        attrs = dict(self.entity_description.atributos(self.coordinator.data)) if self.entity_description.atributos else {}
        if self.entity_description.key in CON_DATOS_BEBE:
            # Para blueprints: de qué bebé es el sensor y en qué unidad mostrar cantidades
            d = self.coordinator.data
            attrs.update({"bebe_id": self._entry_id, "nombre": d["nombre"], "unidad": d["unidad"]})
        return attrs or None
