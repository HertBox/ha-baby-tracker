"""Configuración desde la UI: alta del bebé y opción "Configurar" para editar sus datos."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    COLOR_POPO_DEFAULT,
    COLORES_POPO,
    CONF_COLOR_POPO,
    CONF_CONSISTENCIA_POPO,
    CONSISTENCIA_POPO_DEFAULT,
    CONSISTENCIAS_POPO,
    CONF_FECHA_NACIMIENTO,
    CONF_NOMBRE,
    CONF_OZ_DEFAULT,
    CONF_SEXO,
    CONF_TIPO_DEFAULT,
    CONF_UNIDAD,
    DOMAIN,
    SEXOS,
    TIPOS,
    UNIDADES,
)


def _esquema_bebe(actual: dict[str, Any]) -> dict:
    fecha = (
        vol.Required(CONF_FECHA_NACIMIENTO, default=actual[CONF_FECHA_NACIMIENTO])
        if actual.get(CONF_FECHA_NACIMIENTO) else vol.Required(CONF_FECHA_NACIMIENTO)
    )
    return {
        vol.Required(CONF_NOMBRE, default=actual.get(CONF_NOMBRE, "")): selector.TextSelector(),
        fecha: selector.DateSelector(),
        vol.Optional(CONF_SEXO, default=actual.get(CONF_SEXO, "sin_especificar")): selector.SelectSelector(
            selector.SelectSelectorConfig(options=SEXOS, translation_key="sexo")
        ),
        vol.Optional(CONF_UNIDAD, default=actual.get(CONF_UNIDAD, "oz")): selector.SelectSelector(
            selector.SelectSelectorConfig(options=UNIDADES, translation_key="unidad")
        ),
        vol.Optional(CONF_COLOR_POPO, default=actual.get(CONF_COLOR_POPO, COLOR_POPO_DEFAULT)): selector.SelectSelector(
            selector.SelectSelectorConfig(options=[c for c in COLORES_POPO if c != "no_se"], translation_key="color_popo")
        ),
        vol.Optional(CONF_CONSISTENCIA_POPO, default=actual.get(CONF_CONSISTENCIA_POPO, CONSISTENCIA_POPO_DEFAULT)): selector.SelectSelector(
            selector.SelectSelectorConfig(options=[c for c in CONSISTENCIAS_POPO if c != "no_se"], translation_key="consistencia_popo")
        ),
    }


class BebeConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title=user_input[CONF_NOMBRE], data=user_input)
        esquema = vol.Schema({
            **_esquema_bebe({}),
            vol.Required(CONF_OZ_DEFAULT, default=3.0): selector.NumberSelector(
                selector.NumberSelectorConfig(min=0.5, max=10, step=0.5, unit_of_measurement="oz")
            ),
            vol.Required(CONF_TIPO_DEFAULT, default="formula"): selector.SelectSelector(
                selector.SelectSelectorConfig(options=TIPOS, translation_key="tipo")
            ),
        })
        return self.async_show_form(step_id="user", data_schema=esquema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return BebeOptionsFlow()


class BebeOptionsFlow(OptionsFlow):
    """Editar nombre, fecha de nacimiento y sexo sin reinstalar."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self.hass.config_entries.async_update_entry(
                self.config_entry, data={**self.config_entry.data, **user_input}, title=user_input[CONF_NOMBRE]
            )
            # Recargar para que el panel, el dispositivo y la edad usen los datos nuevos
            self.hass.async_create_task(self.hass.config_entries.async_reload(self.config_entry.entry_id))
            return self.async_create_entry(data={})
        return self.async_show_form(step_id="init", data_schema=vol.Schema(_esquema_bebe(dict(self.config_entry.data))))
