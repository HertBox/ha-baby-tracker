"""Panel "Baby Tracker" en la barra lateral: uno solo, con un selector cuando hay varios bebés."""

from __future__ import annotations

import hashlib
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .const import (
    COLOR_POPO_DEFAULT, CONF_COLOR_POPO, CONF_CONSISTENCIA_POPO, CONF_FECHA_NACIMIENTO, CONF_NOMBRE,
    CONF_SEXO, CONF_UNIDAD, CONSISTENCIA_POPO_DEFAULT, DOMAIN, NOMBRE_PROYECTO,
)

URL_PANEL = "bebe"
URL_ESTATICO = "/bebe_static"
WWW = Path(__file__).parent / "www"
CLAVES = {
    "sensor": ["ultima_toma", "proxima_toma", "oz_hoy", "tomas_hoy", "oz_24h", "promedio_7d",
               "intervalo", "meta_oz_dia", "avance_meta", "peso", "talla", "edad",
               "biberon_restante", "biberon_vence", "oz_por_toma", "tomas_por_dia",
               "biberones_hoy", "pct_terminados", "desechado_7d", "materna_hoy", "formula_hoy",
               "extraido_hoy", "extraido_dia", "reserva_oz", "reserva_caduca", "materna_desechada_7d",
               "ritmo_oz_hora", "ultimo_panal", "ultimo_pipi", "ultima_popo", "panales_hoy",
               "panales_por_dia", "intervalo_panales"],
    "number": ["oz_por_biberon", "meta_oz_toma", "intervalo_indicado", "limite_biberon",
               "limite_materna", "caducidad_ambiente", "caducidad_refri"],
}


def _version() -> str:
    # Cambia cuando cambia el JS, para que el navegador/app no use una copia vieja
    return hashlib.md5((WWW / "bebe-panel.js").read_bytes()).hexdigest()[:8]


def _config_bebe(hass: HomeAssistant, entry: ConfigEntry) -> dict:
    reg = er.async_get(hass)
    d = entry.data
    return {
        "entry_id": entry.entry_id,
        "nombre": d[CONF_NOMBRE],
        "nacimiento": d[CONF_FECHA_NACIMIENTO],
        "sexo": d.get(CONF_SEXO, "sin_especificar"),
        "unidad": d.get(CONF_UNIDAD, "oz"),
        "color_popo": d.get(CONF_COLOR_POPO, COLOR_POPO_DEFAULT),
        "consistencia_popo": d.get(CONF_CONSISTENCIA_POPO, CONSISTENCIA_POPO_DEFAULT),
        "entidades": {
            clave: reg.async_get_entity_id(dominio, DOMAIN, f"{entry.entry_id}_{clave}")
            for dominio, claves in CLAVES.items() for clave in claves
        },
    }


async def async_actualizar_panel(hass: HomeAssistant) -> None:
    """(Re)registra el panel con todos los bebés cargados; lo quita si no queda ninguno."""
    datos = hass.data.setdefault(DOMAIN, {})
    bebes: dict[str, ConfigEntry] = datos.setdefault("bebes", {})
    if URL_PANEL in hass.data.get(getattr(frontend, "DATA_PANELS", "frontend_panels"), {}):
        frontend.async_remove_panel(hass, URL_PANEL)
    if not bebes:
        return
    if not datos.get("estatico"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(URL_ESTATICO, str(WWW), cache_headers=False)]
        )
        datos["estatico"] = True
    version = await hass.async_add_executor_job(_version)
    lista = sorted((_config_bebe(hass, e) for e in bebes.values()), key=lambda b: b["nacimiento"])
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="bebe-panel",
        frontend_url_path=URL_PANEL,
        module_url=f"{URL_ESTATICO}/bebe-panel.js?v={version}",
        sidebar_title=NOMBRE_PROYECTO,
        sidebar_icon="mdi:baby-bottle",
        require_admin=False,
        config={"proyecto": NOMBRE_PROYECTO, "bebes": lista},
    )
