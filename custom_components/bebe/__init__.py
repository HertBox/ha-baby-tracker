"""Integración Bebé: biberones, tomas, medidas y KPIs."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import ServiceValidationError
import homeassistant.helpers.config_validation as cv
from homeassistant.util import dt as dt_util

from .const import (
    CONF_DB,
    CONF_NOMBRE,
    COLOR_POPO_DEFAULT,
    CONF_COLOR_POPO,
    CONF_CONSISTENCIA_POPO,
    CONSISTENCIA_POPO_DEFAULT,
    CONF_OZ_DEFAULT,
    CONF_TIPO_DEFAULT,
    COLORES_POPO,
    CONFIANZAS,
    CONSISTENCIAS_POPO,
    DB_FILENAME,
    DOMAIN,
    EVENTO_MEDIDA,
    EVENTO_TOMA,
    INTERVALO_INDICADO_DEFAULT_H,
    CADUCIDAD_AMBIENTE_DEFAULT_H,
    CADUCIDAD_REFRI_DEFAULT_DIAS,
    LIMITE_BIBERON_DEFAULT_H,
    LIMITE_MATERNA_DEFAULT_H,
    META_OZ_TOMA_DEFAULT,
    TIPOS,
    TIPOS_PANAL,
    TOLERANCIA_FUTURO_MIN,
    UBICACIONES,
    VENTANA_EN_VIVO_MIN,
)
from .coordinator import BebeCoordinator, BebeRuntime
from .db import BebeDB, ErrorBebe
from .panel import async_actualizar_panel

PLATFORMS = [Platform.NUMBER, Platform.SENSOR]

OZ = vol.All(vol.Coerce(float), vol.Range(min=0, max=12))
OZ_POS = vol.All(vol.Coerce(float), vol.Range(min=0.05, max=12))

ESQUEMA_REGISTRAR = vol.Schema({
    vol.Optional("fin"): cv.datetime,
    vol.Optional("oz_tomadas"): OZ_POS,
    # "Quedó X en el biberón": tomó lo que quedaba menos X (0 = se acabó lo que quedaba)
    vol.Optional("oz_sobrantes"): OZ,
    vol.Optional("nuevo_biberon", default=False): cv.boolean,
    # Toques seguidos del botón: sumar a la última toma si fue hace menos de N segundos
    vol.Optional("acumular_segundos", default=0): vol.All(vol.Coerce(int), vol.Range(min=0, max=600)),
    vol.Optional("tipo"): vol.In(TIPOS),
    vol.Optional("confianza", default="exacto"): vol.In(CONFIANZAS),
    vol.Optional("fuente", default="manual"): cv.string,
    vol.Optional("nota"): cv.string,
})

ESQUEMA_CORREGIR = vol.Schema({
    vol.Optional("id"): cv.positive_int,
    vol.Optional("fin"): cv.datetime,
    vol.Optional("oz_tomadas"): OZ_POS,
    vol.Optional("tipo"): vol.In(TIPOS),
    vol.Optional("confianza"): vol.In(CONFIANZAS),
    vol.Optional("nota"): cv.string,
    vol.Optional("mover"): vol.In(["nuevo", "anterior"]),
})

ESQUEMA_ID = vol.Schema({vol.Optional("id"): cv.positive_int})
ESQUEMA_ID_REQ = vol.Schema({vol.Required("id"): cv.positive_int})

ESQUEMA_NUEVO_BIBERON = vol.Schema({
    vol.Optional("oz"): OZ_POS,
    vol.Optional("tipo"): vol.In(TIPOS),
})

ESQUEMA_CORREGIR_BIBERON = vol.Schema({
    vol.Required("id"): cv.positive_int,
    vol.Optional("hecho"): cv.datetime,
    vol.Optional("ubicacion"): vol.In(UBICACIONES),
    vol.Optional("oz"): OZ_POS,
    vol.Optional("tipo"): vol.In(TIPOS),
    vol.Optional("nota"): cv.string,
    vol.Optional("reabrir"): cv.boolean,
})

ESQUEMA_GUARDAR_LECHE = vol.Schema({
    vol.Required("oz"): OZ_POS,
    vol.Optional("hecho"): cv.datetime,
    vol.Optional("ubicacion", default="refrigerador"): vol.In(UBICACIONES),
    vol.Optional("nota"): cv.string,
})

ESQUEMA_USAR_RESERVA = vol.Schema({
    vol.Optional("id"): cv.positive_int,
    # True: el biberón en curso queda en pausa para seguir después; False: se tira
    vol.Optional("pausar_actual", default=True): cv.boolean,
})

ESQUEMA_MOVER_RESERVA = vol.Schema({
    vol.Required("id"): cv.positive_int,
    vol.Required("ubicacion"): vol.In(UBICACIONES),
})

ESQUEMA_EXTRACCION = vol.Schema({
    vol.Optional("fin"): cv.datetime,
    vol.Optional("oz_izq"): OZ,
    vol.Optional("oz_der"): OZ,
    vol.Optional("duracion_min"): vol.All(vol.Coerce(float), vol.Range(min=0, max=180)),
    vol.Optional("nota"): cv.string,
    # Cómo se reparte en biberones de reserva; sin indicarlo, un biberón con el total
    vol.Optional("biberones"): vol.All(cv.ensure_list, [OZ_POS]),
    vol.Optional("guardar", default=True): cv.boolean,
    vol.Optional("ubicacion", default="refrigerador"): vol.In(UBICACIONES),
})

ESQUEMA_PANAL = vol.Schema({
    vol.Required("tipo"): vol.In(TIPOS_PANAL),
    vol.Optional("fin"): cv.datetime,
    vol.Optional("color"): vol.In(COLORES_POPO),
    vol.Optional("consistencia"): vol.In(CONSISTENCIAS_POPO),
    vol.Optional("nota"): cv.string,
    vol.Optional("fuente", default="manual"): cv.string,
})

ESQUEMA_CORREGIR_PANAL = vol.Schema({
    vol.Required("id"): cv.positive_int,
    vol.Optional("tipo"): vol.In(TIPOS_PANAL),
    vol.Optional("fin"): cv.datetime,
    vol.Optional("color"): vol.In(COLORES_POPO),
    vol.Optional("consistencia"): vol.In(CONSISTENCIAS_POPO),
    vol.Optional("nota"): cv.string,
})

ESQUEMA_LISTAR = vol.Schema({
    vol.Required("desde"): cv.datetime,
    vol.Required("hasta"): cv.datetime,
    vol.Optional("borradas", default=False): cv.boolean,
})

ESQUEMA_MEDIDA = vol.Schema({
    vol.Optional("fecha"): cv.datetime,
    vol.Optional("peso_kg"): vol.All(vol.Coerce(float), vol.Range(min=0.5, max=30)),
    vol.Optional("talla_cm"): vol.All(vol.Coerce(float), vol.Range(min=20, max=130)),
    vol.Optional("perimetro_cm"): vol.All(vol.Coerce(float), vol.Range(min=20, max=60)),
    vol.Optional("nota"): cv.string,
})


def _local(valor: datetime) -> datetime:
    """Horas sin zona se interpretan en la zona de HA."""
    return valor.replace(tzinfo=dt_util.get_default_time_zone()) if valor.tzinfo is None else valor


def _a_utc(valor: datetime | None, campo: str, futuro_ok: bool = False) -> str | None:
    if valor is None:
        return None
    valor = _local(valor)
    if not futuro_ok and valor > dt_util.utcnow() + timedelta(minutes=TOLERANCIA_FUTURO_MIN):
        raise ServiceValidationError(f"'{campo}' está en el futuro: {valor.isoformat()}")
    return dt_util.as_utc(valor).isoformat(timespec="seconds")


async def _usuario(hass: HomeAssistant, call: ServiceCall) -> str | None:
    if call.context.user_id and (u := await hass.auth.async_get_user(call.context.user_id)):
        return u.name
    return None


def _entrada(hass: HomeAssistant, call: ServiceCall | None = None) -> ConfigEntry:
    """Bebé al que va la llamada: campo "bebe" (id de la entrada o nombre); con un solo bebé es opcional."""
    bebes: dict[str, ConfigEntry] = hass.data.get(DOMAIN, {}).get("bebes", {})
    if not bebes:
        raise ServiceValidationError("La integración Baby Tracker no está cargada")
    buscado = str(call.data.get("bebe", "")).strip() if call else ""
    if not buscado:
        if len(bebes) == 1:
            return next(iter(bebes.values()))
        raise ServiceValidationError(
            "Hay varios bebés: indica cuál en el campo 'bebe' ("
            + ", ".join(e.data[CONF_NOMBRE] for e in bebes.values()) + ")"
        )
    if buscado in bebes:
        return bebes[buscado]
    for e in bebes.values():
        if e.data[CONF_NOMBRE].casefold() == buscado.casefold():
            return e
    raise ServiceValidationError(f"No encuentro al bebé '{buscado}'")


def _runtime(hass: HomeAssistant, call: ServiceCall | None = None) -> BebeRuntime:
    return _entrada(hass, call).runtime_data


async def _db(hass: HomeAssistant, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Ejecuta una operación de la BD en el executor y traduce errores de validación."""
    try:
        return await hass.async_add_executor_job(lambda: fn(*args, **kwargs))
    except ErrorBebe as err:
        raise ServiceValidationError(str(err)) from err


async def _despues(hass: HomeAssistant, rt: BebeRuntime, accion: str, datos: dict[str, Any]) -> None:
    await rt.coordinator.async_refresh()
    entry = rt.coordinator.entry
    hass.bus.async_fire(EVENTO_TOMA, {"accion": accion, "bebe": entry.entry_id,
                                      "nombre": entry.data[CONF_NOMBRE], **datos})


# ------------------------------------------------------------------ tomas
async def _registrar_toma(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    d = call.data
    if "oz_tomadas" not in d and "oz_sobrantes" not in d:
        raise ServiceValidationError("Indica oz_tomadas, u oz_sobrantes (0 = se acabó lo que quedaba)")
    fin_dt = _local(d.get("fin") or dt_util.now())
    fin = _a_utc(fin_dt, "fin")
    en_vivo = abs(dt_util.utcnow() - fin_dt) <= timedelta(minutes=VENTANA_EN_VIVO_MIN)
    r = await _db(
        hass, rt.db.registrar,
        fin=fin, oz=d.get("oz_tomadas"), oz_sobrantes=d.get("oz_sobrantes"),
        tipo=d.get("tipo"), fuente=d["fuente"], confianza=d["confianza"],
        usuario=await _usuario(hass, call), nota=d.get("nota"),
        nuevo_biberon=d["nuevo_biberon"], acumular_s=d["acumular_segundos"],
        oz_default=rt.oz_default, lim=rt.limites, en_vivo=en_vivo, tipo_biberon=rt.tipo_default,
    )
    await _despues(hass, rt, "registrada", {"id": r["id"], "biberon_id": r["biberon"]["id"],
                                            "biberon_nuevo": r["biberon_nuevo"]})
    return r


async def _id_o_ultima(hass: HomeAssistant, rt: BebeRuntime, call: ServiceCall) -> int:
    if "id" in call.data:
        return call.data["id"]
    ultima = await _db(hass, rt.db.ultima_toma)
    if not ultima:
        raise ServiceValidationError("No hay tomas registradas")
    return ultima["id"]


async def _corregir_toma(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    toma_id = await _id_o_ultima(hass, rt, call)
    if not await _db(hass, rt.db.obtener_toma, toma_id):
        raise ServiceValidationError(f"No existe la toma {toma_id}")
    cambios = {k: v for k, v in call.data.items() if k in ("oz_tomadas", "tipo", "confianza", "nota")}
    if "fin" in call.data:
        cambios["fin"] = _a_utc(call.data["fin"], "fin")
    if cambios:
        await _db(hass, rt.db.actualizar_toma, toma_id, cambios)
    if "mover" in call.data:
        await _db(hass, rt.db.mover_toma, toma_id, call.data["mover"], rt.oz_default)
    toma = await _db(hass, rt.db.obtener_toma, toma_id)
    biberon = (
        await _db(hass, rt.db.obtener_biberon, toma["biberon_id"], rt.limites)
        if toma.get("biberon_id") else None
    )
    await _despues(hass, rt, "corregida", {"id": toma_id})
    return {**toma, "biberon": biberon}


async def _borrar_toma(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    toma_id = await _id_o_ultima(hass, rt, call)
    toma = await _db(hass, rt.db.obtener_toma, toma_id)
    if not toma or not await _db(hass, rt.db.borrar_toma, toma_id):
        raise ServiceValidationError(f"No existe la toma {toma_id}")
    await _despues(hass, rt, "borrada", {"id": toma_id})
    return {"id": toma_id, "oz_tomadas": toma["oz_tomadas"], "fin": toma["fin"]}


async def _restaurar_toma(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    if "id" not in call.data:
        raise ServiceValidationError("Indica el 'id' de la toma a restaurar")
    if not await _db(hass, rt.db.restaurar_toma, call.data["id"]):
        raise ServiceValidationError(f"La toma {call.data['id']} no está borrada")
    await _despues(hass, rt, "restaurada", {"id": call.data["id"]})
    return {"id": call.data["id"]}


# ------------------------------------------------------------------ biberones
async def _nuevo_biberon(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    r = await _db(hass, rt.db.nuevo_biberon, call.data.get("oz", rt.oz_default),
                  call.data.get("tipo", rt.tipo_default), rt.limites)
    await _despues(hass, rt, "biberon_nuevo", {"biberon_id": r["biberon"]["id"]})
    return r


async def _reanudar_biberon(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    r = await _db(hass, rt.db.reanudar_biberon, call.data["id"], rt.limites)
    await _despues(hass, rt, "biberon_reanudado", {"biberon_id": call.data["id"]})
    return r


async def _cerrar_biberon(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    b = await _db(hass, rt.db.cerrar_biberon, call.data.get("id"), rt.limites)
    await _despues(hass, rt, "biberon_cerrado", {"biberon_id": b["id"]})
    return b


async def _borrar_biberon(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    r = await _db(hass, rt.db.borrar_biberon, call.data["id"])
    await _despues(hass, rt, "biberon_borrado", {"biberon_id": call.data["id"]})
    return r


async def _corregir_biberon(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    cambios = {k: v for k, v in call.data.items() if k != "id"}
    if "hecho" in cambios:
        cambios["hecho"] = _a_utc(cambios["hecho"], "hecho")
    b = await _db(hass, rt.db.corregir_biberon, call.data["id"], cambios, rt.limites)
    await _despues(hass, rt, "biberon_corregido", {"biberon_id": b["id"]})
    return b


# ------------------------------------------------------------------ leche materna
async def _guardar_leche(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    hecho = _a_utc(call.data.get("hecho") or dt_util.now(), "hecho")
    b = await _db(hass, rt.db.guardar_leche, call.data["oz"], hecho, call.data["ubicacion"],
                  rt.limites, None, call.data.get("nota"))
    await _despues(hass, rt, "reserva", {"biberon_id": b["id"]})
    return b


async def _usar_reserva(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    r = await _db(hass, rt.db.usar_reserva, call.data.get("id"), rt.limites, call.data["pausar_actual"])
    await _despues(hass, rt, "biberon_nuevo", {"biberon_id": r["biberon"]["id"]})
    return r


async def _mover_reserva(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    b = await _db(hass, rt.db.mover_reserva, call.data["id"], call.data["ubicacion"], rt.limites)
    await _despues(hass, rt, "reserva", {"biberon_id": b["id"]})
    return b


async def _descartar_reserva(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    b = await _db(hass, rt.db.descartar_reserva, call.data["id"], rt.limites)
    await _despues(hass, rt, "reserva", {"biberon_id": b["id"]})
    return b


async def _registrar_extraccion(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    d = call.data
    total = (d.get("oz_izq") or 0) + (d.get("oz_der") or 0)
    biberones = d.get("biberones") or ([total] if total > 0 else [])
    r = await _db(
        hass, rt.db.registrar_extraccion,
        fin=_a_utc(d.get("fin") or dt_util.now(), "fin"), oz_izq=d.get("oz_izq"), oz_der=d.get("oz_der"),
        duracion_min=d.get("duracion_min"), nota=d.get("nota"), usuario=await _usuario(hass, call),
        biberones=biberones if d["guardar"] else [], ubicacion=d["ubicacion"], lim=rt.limites,
    )
    await _despues(hass, rt, "extraccion", {"id": r["id"]})
    return r


async def _borrar_extraccion(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    if not await _db(hass, rt.db.borrar_extraccion, call.data["id"]):
        raise ServiceValidationError(f"No existe la extracción {call.data['id']}")
    await _despues(hass, rt, "extraccion", {"id": call.data["id"]})
    return {"id": call.data["id"]}


# ------------------------------------------------------------------ pañales
async def _registrar_panal(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    d: dict[str, Any] = dict(call.data)
    d["fin"] = _a_utc(d.get("fin") or dt_util.now(), "fin")
    if d["tipo"] == "pipi":  # color y consistencia solo aplican a la popó
        d.pop("color", None)
        d.pop("consistencia", None)
    else:  # si no se indican, se usa la popó "normal" configurada para el bebé
        datos = _entrada(hass, call).data
        d.setdefault("color", datos.get(CONF_COLOR_POPO, COLOR_POPO_DEFAULT))
        d.setdefault("consistencia", datos.get(CONF_CONSISTENCIA_POPO, CONSISTENCIA_POPO_DEFAULT))
    d["registrado_por"] = await _usuario(hass, call)
    p = await _db(hass, rt.db.agregar_panal, d)
    await _despues(hass, rt, "panal", {"id": p["id"], "tipo": p["tipo"]})
    return p


async def _corregir_panal(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    cambios = {k: v for k, v in call.data.items() if k != "id"}
    if "fin" in cambios:
        cambios["fin"] = _a_utc(cambios["fin"], "fin")
    p = await _db(hass, rt.db.actualizar_panal, call.data["id"], cambios)
    await _despues(hass, rt, "panal", {"id": p["id"], "tipo": p["tipo"]})
    return p


async def _borrar_panal(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    if not await _db(hass, rt.db.borrar_panal, call.data["id"]):
        raise ServiceValidationError(f"No existe el pañal {call.data['id']}")
    await _despues(hass, rt, "panal", {"id": call.data["id"]})
    return {"id": call.data["id"]}


async def _listar_panales(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    desde, hasta = _rango(call)
    return {"panales": await _db(hass, rt.db.panales_rango, desde, hasta)}


# ------------------------------------------------------------------ consultas
def _rango(call: ServiceCall) -> tuple[str, str]:
    return (_a_utc(call.data["desde"], "desde", futuro_ok=True),
            _a_utc(call.data["hasta"], "hasta", futuro_ok=True))


async def _listar_tomas(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    desde, hasta = _rango(call)
    return {"tomas": await _db(hass, rt.db.tomas_rango, desde, hasta, call.data["borradas"])}


async def _listar_reservas(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    return {"reservas": await _db(hass, rt.db.reservas, rt.limites)}


async def _listar_extracciones(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    desde, hasta = _rango(call)
    return {"extracciones": await _db(hass, rt.db.extracciones_rango, desde, hasta)}


async def _listar_biberones(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    desde, hasta = _rango(call)
    return {"biberones": await _db(hass, rt.db.biberones_rango, desde, hasta, rt.limites)}


# ------------------------------------------------------------------ medidas
async def _registrar_medida(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    d: dict[str, Any] = dict(call.data)
    if not any(k in d for k in ("peso_kg", "talla_cm", "perimetro_cm")):
        raise ServiceValidationError("Indica al menos peso_kg, talla_cm o perimetro_cm")
    d["fecha"] = _a_utc(d.get("fecha") or dt_util.now(), "fecha")
    d["registrado_por"] = await _usuario(hass, call)
    medida_id = await _db(hass, rt.db.agregar_medida, d)
    await rt.coordinator.async_refresh()
    hass.bus.async_fire(EVENTO_MEDIDA, {"id": medida_id, "bebe": rt.coordinator.entry.entry_id, **d})
    return {"id": medida_id}


async def _listar_medidas(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    return {"medidas": await _db(hass, rt.db.medidas)}


async def _borrar_medida(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    rt = _runtime(hass, call)
    if not await _db(hass, rt.db.borrar_medida, call.data["id"]):
        raise ServiceValidationError(f"No existe la medida {call.data['id']}")
    await rt.coordinator.async_refresh()
    return {"id": call.data["id"]}


Handler = Callable[[HomeAssistant, ServiceCall], Awaitable[ServiceResponse]]

SERVICIOS: dict[str, tuple[Handler, vol.Schema]] = {
    "registrar_toma": (_registrar_toma, ESQUEMA_REGISTRAR),
    "corregir_toma": (_corregir_toma, ESQUEMA_CORREGIR),
    "borrar_toma": (_borrar_toma, ESQUEMA_ID),
    "restaurar_toma": (_restaurar_toma, ESQUEMA_ID),
    "nuevo_biberon": (_nuevo_biberon, ESQUEMA_NUEVO_BIBERON),
    "cerrar_biberon": (_cerrar_biberon, ESQUEMA_ID),
    "reanudar_biberon": (_reanudar_biberon, ESQUEMA_ID_REQ),
    "borrar_biberon": (_borrar_biberon, ESQUEMA_ID_REQ),
    "corregir_biberon": (_corregir_biberon, ESQUEMA_CORREGIR_BIBERON),
    "guardar_leche": (_guardar_leche, ESQUEMA_GUARDAR_LECHE),
    "usar_reserva": (_usar_reserva, ESQUEMA_USAR_RESERVA),
    "mover_reserva": (_mover_reserva, ESQUEMA_MOVER_RESERVA),
    "descartar_reserva": (_descartar_reserva, ESQUEMA_ID_REQ),
    "registrar_extraccion": (_registrar_extraccion, ESQUEMA_EXTRACCION),
    "borrar_extraccion": (_borrar_extraccion, ESQUEMA_ID_REQ),
    "registrar_panal": (_registrar_panal, ESQUEMA_PANAL),
    "corregir_panal": (_corregir_panal, ESQUEMA_CORREGIR_PANAL),
    "borrar_panal": (_borrar_panal, ESQUEMA_ID_REQ),
    "registrar_medida": (_registrar_medida, ESQUEMA_MEDIDA),
    "borrar_medida": (_borrar_medida, ESQUEMA_ID_REQ),
}
CONSULTAS: dict[str, tuple[Handler, vol.Schema]] = {
    "listar_tomas": (_listar_tomas, ESQUEMA_LISTAR),
    "listar_biberones": (_listar_biberones, ESQUEMA_LISTAR),
    "listar_reservas": (_listar_reservas, vol.Schema({})),
    "listar_extracciones": (_listar_extracciones, ESQUEMA_LISTAR.extend({vol.Optional("borradas"): cv.boolean})),
    "listar_medidas": (_listar_medidas, vol.Schema({})),
    "listar_panales": (_listar_panales, ESQUEMA_LISTAR.extend({vol.Optional("borradas"): cv.boolean})),
}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Cada bebé tiene su propia base; el primero (instalaciones de antes) usa bebe.db
    db = BebeDB(hass.config.path(entry.data.get(CONF_DB, DB_FILENAME)))
    await hass.async_add_executor_job(db.inicializar, entry.data[CONF_OZ_DEFAULT], LIMITE_BIBERON_DEFAULT_H)
    coordinator = BebeCoordinator(hass, entry, db)
    entry.runtime_data = BebeRuntime(
        db=db,
        coordinator=coordinator,
        oz_default=entry.data[CONF_OZ_DEFAULT],
        tipo_default=entry.data[CONF_TIPO_DEFAULT],
        meta_oz_toma=META_OZ_TOMA_DEFAULT,
        intervalo_indicado_h=INTERVALO_INDICADO_DEFAULT_H,
        limite_biberon_h=LIMITE_BIBERON_DEFAULT_H,
        limite_materna_h=LIMITE_MATERNA_DEFAULT_H,
        caducidad_ambiente_h=CADUCIDAD_AMBIENTE_DEFAULT_H,
        caducidad_refri_dias=CADUCIDAD_REFRI_DEFAULT_DIAS,
    )
    await coordinator.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    bebes = hass.data.setdefault(DOMAIN, {}).setdefault("bebes", {})
    bebes[entry.entry_id] = entry
    # Las acciones son del dominio: se registran una vez para todos los bebés
    if not hass.services.has_service(DOMAIN, "registrar_toma"):
        for grupo, soporte in ((SERVICIOS, SupportsResponse.OPTIONAL), (CONSULTAS, SupportsResponse.ONLY)):
            for nombre, (fn, esquema) in grupo.items():
                async def _handler(call: ServiceCall, fn: Handler = fn) -> ServiceResponse:
                    return await fn(hass, call)
                hass.services.async_register(
                    DOMAIN, nombre, _handler, schema=esquema.extend({vol.Optional("bebe"): cv.string}),
                    supports_response=soporte,
                )
    await async_actualizar_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        bebes = hass.data.get(DOMAIN, {}).get("bebes", {})
        bebes.pop(entry.entry_id, None)
        if not bebes:
            for nombre in list(hass.services.async_services_for_domain(DOMAIN)):
                hass.services.async_remove(DOMAIN, nombre)
        await async_actualizar_panel(hass)
    return ok
