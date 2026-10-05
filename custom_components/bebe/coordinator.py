"""Cálculo de KPIs a partir de la base de datos."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
import logging
from statistics import median
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import (
    CONF_FECHA_NACIMIENTO,
    CONF_NOMBRE,
    CONF_SEXO,
    CONF_UNIDAD,
    DOMAIN,
    ML_POR_KG_DIA,
    ML_POR_OZ,
    OZ_DIA_MAX,
)
from .db import BebeDB

_LOGGER = logging.getLogger(__name__)

DIAS_SERIE = 30


@dataclass
class BebeRuntime:
    """Estado en memoria de la integración (entry.runtime_data)."""

    db: BebeDB
    coordinator: BebeCoordinator
    oz_default: float
    tipo_default: str
    meta_oz_toma: float
    intervalo_indicado_h: float
    limite_biberon_h: float
    limite_materna_h: float
    caducidad_ambiente_h: float
    caducidad_refri_dias: float

    @property
    def limites(self) -> dict[str, float]:
        return {
            "formula": self.limite_biberon_h,
            "materna": self.limite_materna_h,
            "ambiente": self.caducidad_ambiente_h,
            "refrigerador": self.caducidad_refri_dias * 24,
        }


def _parse(iso: str) -> datetime:
    return dt_util.as_local(dt_util.parse_datetime(iso))


def _por_peso(peso_kg: float) -> float:
    """Referencia general por peso (~150 ml/kg/día, con tope), en oz/día."""
    return round(min(peso_kg * ML_POR_KG_DIA / ML_POR_OZ, OZ_DIA_MAX), 1)


def _logro(oz: float, minimo: float, ideal: float) -> int:
    """0 = no llegó al mínimo, 1 = mínimo, 2 = ideal (con margen de redondeo)."""
    return 2 if oz >= ideal - 0.05 else 1 if oz >= minimo - 0.05 else 0


class BebeCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Recalcula KPIs cada 5 min y después de cada registro."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, db: BebeDB) -> None:
        super().__init__(
            hass, _LOGGER, name=DOMAIN, update_interval=timedelta(minutes=5)
        )
        self.db = db
        self.entry = entry
        self.nacimiento = date.fromisoformat(entry.data[CONF_FECHA_NACIMIENTO])

    async def _async_update_data(self) -> dict[str, Any]:
        return await self.hass.async_add_executor_job(self._calcular)

    def _calcular(self) -> dict[str, Any]:
        rt: BebeRuntime = self.entry.runtime_data
        ahora = dt_util.now()
        hoy = ahora.date()
        inicio_serie = dt_util.start_of_local_day(hoy - timedelta(days=DIAS_SERIE - 1))
        tomas = self.db.tomas_desde(dt_util.as_utc(inicio_serie).isoformat())
        for t in tomas:
            t["_fin"] = _parse(t["fin"])

        # Serie diaria (día local)
        por_dia: dict[date, dict[str, float]] = {}
        for t in tomas:
            d = por_dia.setdefault(t["_fin"].date(), {"oz": 0.0, "tomas": 0, "exactas": 0})
            d["oz"] += t["oz_tomadas"]
            d["tomas"] += 1
            d["exactas"] += t["confianza"] == "exacto"
        serie = []
        for i in range(DIAS_SERIE):
            dia = hoy - timedelta(days=DIAS_SERIE - 1 - i)
            d = por_dia.get(dia, {"oz": 0.0, "tomas": 0, "exactas": 0})
            serie.append({
                "fecha": dia.isoformat(),
                "oz": round(d["oz"], 2),
                "tomas": d["tomas"],
                "exactas": d["exactas"],
            })

        hoy_d = por_dia.get(hoy, {"oz": 0.0, "tomas": 0, "exactas": 0})
        oz_24h = sum(t["oz_tomadas"] for t in tomas if t["_fin"] >= ahora - timedelta(hours=24))

        # Promedio de los últimos 7 días completos (sin hoy), solo días desde el primer registro
        primer_dia = min(por_dia) if por_dia else hoy
        dias_7 = [hoy - timedelta(days=i) for i in range(1, 8)]
        dias_validos = [d for d in dias_7 if d >= primer_dia]
        promedio_7d = (
            round(sum(por_dia.get(d, {"oz": 0})["oz"] for d in dias_validos) / len(dias_validos), 2)
            if dias_validos else None
        )

        # Intervalo típico: mediana entre tomas de las últimas 48 h (ignora huecos > 8 h)
        recientes = [t["_fin"] for t in tomas if t["_fin"] >= ahora - timedelta(hours=48)]
        intervalos = [
            (b - a).total_seconds() / 3600
            for a, b in zip(recientes, recientes[1:])
            if 0.5 <= (b - a).total_seconds() / 3600 <= 8
        ]
        intervalo_h = round(median(intervalos), 2) if len(intervalos) >= 3 else None

        ultima = self.db.ultima_toma()
        ultima_fin = _parse(ultima["fin"]) if ultima else None
        # La próxima toma sigue la indicación del pediatra, no el intervalo aprendido
        proxima = ultima_fin + timedelta(hours=rt.intervalo_indicado_h) if ultima_fin else None

        # Últimos 7 días (168 h): oz por toma y frecuencia
        hace7 = ahora - timedelta(days=7)
        t7 = [t for t in tomas if t["_fin"] >= hace7]
        dias_con_datos = max(1.0, min(7.0, (ahora - max(hace7, tomas[0]["_fin"])).total_seconds() / 86400)) if tomas else 1.0
        oz_por_toma = round(sum(t["oz_tomadas"] for t in t7) / len(t7), 2) if t7 else None
        tomas_por_dia = round(len(t7) / dias_con_datos, 1) if t7 else None

        # Biberones
        biberon = self.db.biberon_actual(rt.limites)
        en_pausa = self.db.biberones_en_pausa(rt.limites)
        b7 = self.db.biberones_rango(
            dt_util.as_utc(hace7).isoformat(timespec="seconds"),
            dt_util.as_utc(ahora + timedelta(days=1)).isoformat(timespec="seconds"),
            rt.limites,
        )
        cerrados7 = [b for b in b7 if b["estado"] in ("terminado", "incompleto")]
        inicio_hoy = dt_util.start_of_local_day(hoy)
        biberones_hoy = sum(1 for b in b7 if b["estado"] != "reserva" and _parse(b["preparado"]) >= inicio_hoy)
        pct_terminados = (
            round(sum(b["estado"] == "terminado" for b in cerrados7) / len(cerrados7) * 100)
            if cerrados7 else None
        )
        desechado_7d = round(sum(b["desechado"] for b in b7), 2)
        materna_desechada_7d = round(sum(b["desechado"] for b in b7 if b["tipo"] == "materna"), 2)

        # Leche materna: tomas por tipo hoy, extracción y reserva
        hoy_tomas = [t for t in tomas if t["_fin"] >= inicio_hoy]
        materna_hoy = round(sum(t["oz_tomadas"] for t in hoy_tomas if t["tipo"] == "materna"), 2)
        formula_hoy = round(sum(t["oz_tomadas"] for t in hoy_tomas if t["tipo"] != "materna"), 2)
        ext = self.db.extracciones_rango(
            dt_util.as_utc(hace7).isoformat(timespec="seconds"),
            dt_util.as_utc(ahora + timedelta(minutes=1)).isoformat(timespec="seconds"),
        )
        extraido_hoy = round(sum(e["oz_total"] for e in ext if _parse(e["fin"]) >= inicio_hoy), 2)
        dias_ext = max(1.0, min(7.0, (ahora - _parse(ext[0]["fin"])).total_seconds() / 86400)) if ext else 1.0
        extraido_dia = round(sum(e["oz_total"] for e in ext) / dias_ext, 2) if ext else None
        reservas = self.db.reservas(rt.limites)
        vigentes = [b for b in reservas if not b["caducado"]]
        proxima_caducidad = min((b["caduca"] for b in vigentes if b["caduca"]), default=None)

        # Pañales
        pn = self.db.panales_rango(
            dt_util.as_utc(hace7).isoformat(timespec="seconds"),
            dt_util.as_utc(ahora + timedelta(minutes=1)).isoformat(timespec="seconds"),
        )
        for x in pn:
            x["_fin"] = _parse(x["fin"])
        pn_hoy = [x for x in pn if x["_fin"] >= inicio_hoy]
        cuenta_hoy = {t: sum(1 for x in pn_hoy if x["tipo"] == t) for t in ("pipi", "popo", "ambos")}
        dias_pn = max(1.0, min(7.0, (ahora - pn[0]["_fin"]).total_seconds() / 86400)) if pn else 1.0
        fines = [x["_fin"] for x in pn if x["_fin"] >= ahora - timedelta(hours=48)]
        ints_pn = [(b - a).total_seconds() / 3600 for a, b in zip(fines, fines[1:]) if (b - a).total_seconds() > 300]
        ultimo_panal = self.db.ultimo_panal()
        ultimo_pipi = self.db.ultimo_panal(("pipi", "ambos"))
        ultima_popo = self.db.ultimo_panal(("popo", "ambos"))

        peso = self.db.ultima_medida("peso_kg")
        talla = self.db.ultima_medida("talla_cm")
        peso_kg = peso["peso_kg"] if peso else None
        tomas_meta = 24 / rt.intervalo_indicado_h
        meta = round(rt.meta_oz_toma * tomas_meta, 1)
        referencia_peso = _por_peso(peso_kg) if peso_kg else None
        referencia = self._referencia(rt, ahora, hoy, inicio_hoy, hoy_d["oz"], meta, proxima, serie, primer_dia)

        return {
            "referencia": referencia,
            "ultima": ultima,
            "ultima_fin": ultima_fin,
            "oz_hoy": round(hoy_d["oz"], 2),
            "tomas_hoy": hoy_d["tomas"],
            "exactas_hoy": hoy_d["exactas"],
            "oz_24h": round(oz_24h, 2),
            "promedio_7d": promedio_7d,
            "intervalo_h": intervalo_h,
            "proxima": proxima,
            "peso": peso,
            "talla": talla,
            "meta_oz_dia": meta,
            "tomas_meta": round(tomas_meta, 1),
            "referencia_peso_oz_dia": referencia_peso,
            "avance_meta": round(hoy_d["oz"] / meta * 100) if meta else None,
            "edad_dias": (hoy - self.nacimiento).days,
            "nombre": self.entry.data.get(CONF_NOMBRE),
            "nacimiento": self.entry.data[CONF_FECHA_NACIMIENTO],
            "sexo": self.entry.data.get(CONF_SEXO, "sin_especificar"),
            "unidad": self.entry.data.get(CONF_UNIDAD, "oz"),
            "oz_por_toma": oz_por_toma,
            "ritmo_oz_hora": round(oz_24h / 24, 2),
            "panales_hoy": len(pn_hoy),
            "panales_hoy_tipos": cuenta_hoy,
            "panales_por_dia": round(len(pn) / dias_pn, 1) if pn else None,
            "intervalo_panales_h": round(median(ints_pn), 2) if len(ints_pn) >= 2 else None,
            "ultimo_panal": ultimo_panal,
            "ultimo_pipi": _parse(ultimo_pipi["fin"]) if ultimo_pipi else None,
            "ultima_popo": ultima_popo,
            "tomas_por_dia": tomas_por_dia,
            "biberon": biberon,
            "en_pausa": en_pausa,
            "biberones_hoy": biberones_hoy,
            "pct_terminados": pct_terminados,
            "desechado_7d": desechado_7d,
            "materna_desechada_7d": materna_desechada_7d,
            "materna_hoy": materna_hoy,
            "formula_hoy": formula_hoy,
            "extraido_hoy": extraido_hoy,
            "extraido_dia": extraido_dia,
            "reservas": reservas,
            "reserva_oz": round(sum(b["restante"] for b in vigentes), 2),
            "proxima_caducidad": _parse(proxima_caducidad) if proxima_caducidad else None,
            "serie": serie,
        }

    def _referencia(self, rt: BebeRuntime, ahora: datetime, hoy: date, inicio_hoy: datetime, oz_hoy: float,
                    meta_pediatra: float, proxima: datetime | None, serie: list[dict[str, Any]],
                    primer_dia: date) -> dict[str, Any]:
        """Cuánto debería llevar a esta hora, según dos metas del día: la del pediatra y la de
        referencia por peso (cada día con el peso vigente ese día). La menor es el mínimo y la
        mayor el ideal, así que se intercambian solas cuando la de peso rebasa a la del pediatra."""
        pesos = [(_parse(m["fecha"]).date(), m["peso_kg"]) for m in self.db.medidas() if m["peso_kg"]]

        def metas(dia: date) -> tuple[float, float, str | None]:
            vigente = [p for f, p in pesos if f <= dia]
            por_peso = _por_peso(vigente[-1]) if vigente else None
            if por_peso is None:
                return meta_pediatra, meta_pediatra, None
            return min(por_peso, meta_pediatra), max(por_peso, meta_pediatra), (
                "peso" if por_peso <= meta_pediatra else "pediatra")

        for s in serie:
            minimo, ideal, _ = metas(date.fromisoformat(s["fecha"]))
            s.update(meta_minimo=minimo, meta_ideal=ideal, logro=_logro(s["oz"], minimo, ideal))
        # Últimos 7 días completos (sin hoy) desde el primer registro
        dias7 = [s for s in serie[-8:-1] if date.fromisoformat(s["fecha"]) >= primer_dia]

        minimo, ideal, fuente_minimo = metas(hoy)
        fin_hoy = dt_util.start_of_local_day(hoy + timedelta(days=1))
        dia = fin_hoy - inicio_hoy  # 23 o 25 h en días con cambio de horario

        def esperado(meta: float, cuando: datetime) -> float:
            return round(meta * ((cuando - inicio_hoy) / dia), 1)

        esp_min, esp_ideal = esperado(minimo, ahora), esperado(ideal, ahora)
        # Margen de una toma: justo antes de comer es normal ir una toma por debajo de la línea
        margen = rt.intervalo_indicado_h / 24
        if oz_hoy >= esp_ideal - ideal * margen:
            estado = "ideal"
        elif oz_hoy >= esp_min - minimo * margen:
            estado = "minimo"
        else:
            estado = "atrasado"

        # Tomas que quedan hoy según el intervalo indicado, desde la siguiente toma
        cuando = max(proxima, ahora) if proxima else ahora
        proximas = []
        while cuando < fin_hoy:
            proximas.append({"hora": cuando.isoformat(timespec="seconds"),
                             "minimo": esperado(minimo, cuando), "ideal": esperado(ideal, cuando)})
            cuando += timedelta(hours=rt.intervalo_indicado_h)
        n = len(proximas)

        def por_toma(meta: float) -> float | None:
            return round(max(0.0, meta - oz_hoy) / n, 2) if n else None

        return {
            "meta_minimo": minimo,
            "meta_ideal": ideal,
            "fuente_minimo": fuente_minimo,  # "peso", "pediatra" o None (sin peso registrado)
            "esperado_minimo": esp_min,
            "esperado_ideal": esp_ideal,
            "diferencia_minimo": round(oz_hoy - esp_min, 1),
            "diferencia_ideal": round(oz_hoy - esp_ideal, 1),
            "estado": estado,
            "logro_hoy": _logro(oz_hoy, minimo, ideal),
            "tomas_restantes": n,
            "por_toma_minimo": por_toma(minimo),
            "por_toma_ideal": por_toma(ideal),
            # Más de esto por toma ya no es "preparar un poco más": no se persigue la meta forzando
            "tope_por_toma": round(rt.meta_oz_toma + 1, 2),
            "proximas": proximas,
            "dias_7d": [{"fecha": s["fecha"], "oz": s["oz"], "logro": s["logro"]} for s in dias7],
            "dias_minimo_7d": sum(s["logro"] >= 1 for s in dias7),
            "dias_ideal_7d": sum(s["logro"] == 2 for s in dias7),
        }
