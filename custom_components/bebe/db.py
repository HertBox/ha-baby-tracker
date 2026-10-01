"""Almacenamiento SQLite y reglas de biberón. Todo es síncrono: llamarlo en el executor.

Modelo:
- biberon: lo que se preparó (oz). Está abierto mientras no se cierre y no se haya consumido completo.
- toma: una vez que el bebé come; suma oz a un biberón.
Fechas en ISO 8601 UTC ("...+00:00"), comparables como texto.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

# Horas: "formula"/"materna" desde la primera toma; "ambiente"/"refrigerador" desde que se hizo
Limites = dict

VERSION_ESQUEMA = 5
EPS = 1e-6

ESQUEMA = """
CREATE TABLE IF NOT EXISTS tomas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inicio TEXT,
    fin TEXT NOT NULL,
    oz_preparadas REAL,
    oz_sobrantes REAL,
    oz_tomadas REAL NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'formula',
    confianza TEXT NOT NULL DEFAULT 'exacto',
    fuente TEXT,
    registrado_por TEXT,
    nota TEXT,
    creado TEXT NOT NULL,
    modificado TEXT,
    borrado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tomas_fin ON tomas(fin);
CREATE TABLE IF NOT EXISTS biberones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preparado TEXT NOT NULL,
    oz REAL NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'formula',
    cerrado TEXT,
    nota TEXT,
    creado TEXT NOT NULL,
    borrado INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS extracciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fin TEXT NOT NULL,
    oz_izq REAL,
    oz_der REAL,
    duracion_min REAL,
    nota TEXT,
    registrado_por TEXT,
    creado TEXT NOT NULL,
    borrado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_extracciones_fin ON extracciones(fin);
CREATE TABLE IF NOT EXISTS panales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fin TEXT NOT NULL,
    tipo TEXT NOT NULL,
    color TEXT,
    consistencia TEXT,
    nota TEXT,
    fuente TEXT,
    registrado_por TEXT,
    creado TEXT NOT NULL,
    modificado TEXT,
    borrado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_panales_fin ON panales(fin);
CREATE TABLE IF NOT EXISTS medidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    peso_kg REAL,
    talla_cm REAL,
    perimetro_cm REAL,
    nota TEXT,
    registrado_por TEXT,
    creado TEXT NOT NULL,
    borrado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_medidas_fecha ON medidas(fecha);
"""

CAMPOS_TOMA = (
    "inicio", "fin", "oz_tomadas", "tipo", "confianza", "fuente",
    "registrado_por", "nota", "biberon_id",
)

SQL_BIBERON = """
SELECT b.*, COALESCE(SUM(t.oz_tomadas), 0) AS consumido, COUNT(t.id) AS n_tomas,
       MIN(t.fin) AS primera_toma, MAX(t.fin) AS ultima_toma
FROM biberones b
LEFT JOIN tomas t ON t.biberon_id = b.id AND t.borrado = 0
WHERE b.borrado = 0 {filtro}
GROUP BY b.id
"""


class ErrorBebe(ValueError):
    """Error de validación que se muestra al usuario; `clave` está en la sección "exceptions" de las traducciones."""

    def __init__(self, clave: str, **datos: Any) -> None:
        super().__init__(clave)
        self.clave = clave
        self.datos = {k: str(v) for k, v in datos.items()}


def ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def marca_iso() -> str:
    """Como ahora_iso pero con microsegundos: ordena acciones hechas en el mismo segundo."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def _r(v: float) -> float:
    return round(v + 0.0, 2)


def estado_biberon(b: dict[str, Any]) -> str:
    if b["consumido"] >= b["oz"] - EPS:
        return "terminado"
    return "incompleto" if b["cerrado"] else "abierto"


def _limites(lim: Limites | float | None) -> Limites | None:
    if lim is None or isinstance(lim, dict):
        return lim
    return {"formula": lim, "materna": lim, "ambiente": 4.0, "refrigerador": 96.0}


def _enriquecer(b: dict[str, Any], lim: Limites | float | None = None) -> dict[str, Any]:
    b = dict(b)
    lim = _limites(lim)
    ahora = datetime.now(timezone.utc)
    b["consumido"] = _r(b["consumido"])
    b["restante"] = _r(max(0.0, b["oz"] - b["consumido"]))
    b["estado"] = "reserva" if b.get("en_reserva") else estado_biberon(b)
    b["desechado"] = b["restante"] if b["estado"] == "incompleto" else 0.0
    b["vence"], b["vencido"], b["caduca"], b["caducado"] = None, False, None, False
    if lim is None:
        return b
    # Caducidad por guardado (leche materna): desde que se hizo, según dónde está
    if b.get("hecho") and b.get("ubicacion") in ("ambiente", "refrigerador"):
        caduca = _dt(b["hecho"]) + timedelta(hours=lim[b["ubicacion"]])
        b["caduca"] = caduca.isoformat(timespec="seconds")
        b["caducado"] = b["estado"] in ("reserva", "abierto") and ahora > caduca
    # Límite desde la primera toma (fórmula / materna), acotado por la caducidad de guardado
    if b["primera_toma"]:
        limite = lim["materna"] if b.get("tipo") == "materna" else lim["formula"]
        vence = _dt(b["primera_toma"]) + timedelta(hours=limite)
        if b["caduca"]:
            vence = min(vence, _dt(b["caduca"]))
        b["vence"] = vence.isoformat(timespec="seconds")
        b["vencido"] = b["estado"] == "abierto" and ahora > vence
    return b


class BebeDB:
    """Acceso a /config/bebe.db."""

    def __init__(self, path: str) -> None:
        self.path = path

    def _con(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        return con

    # ------------------------------------------------------------ esquema
    def inicializar(self, oz_biberon: float = 3.0, limite_h: float = 1.5) -> None:
        self._copia_antes_de_migrar()
        with self._con() as con:
            con.executescript(ESQUEMA)
            columnas = {r["name"] for r in con.execute("PRAGMA table_info(tomas)")}
            if "biberon_id" not in columnas:
                con.execute("ALTER TABLE tomas ADD COLUMN biberon_id INTEGER")
            con.execute("CREATE INDEX IF NOT EXISTS idx_tomas_biberon ON tomas(biberon_id)")
            cols_b = {r["name"] for r in con.execute("PRAGMA table_info(biberones)")}
            for col, tipo in (("hecho", "TEXT"), ("ubicacion", "TEXT"),
                              ("en_reserva", "INTEGER NOT NULL DEFAULT 0"), ("extraccion_id", "INTEGER"),
                              ("activado", "TEXT")):
                if col not in cols_b:
                    con.execute(f"ALTER TABLE biberones ADD COLUMN {col} {tipo}")
            version = con.execute("PRAGMA user_version").fetchone()[0]
            if version < 2:
                self._agrupar_tomas_viejas(con, oz_biberon, limite_h)
            if version < 4:
                # activado = cuándo pasó a ser el biberón en curso (para elegir entre varios abiertos)
                con.execute("UPDATE biberones SET activado = preparado WHERE activado IS NULL")
            if version < VERSION_ESQUEMA:
                con.execute(f"PRAGMA user_version = {VERSION_ESQUEMA}")

    def _copia_antes_de_migrar(self) -> None:
        """Si la base existe y su esquema es anterior, guarda una copia antes de migrarla."""
        import os
        if not os.path.exists(self.path):
            return
        con = sqlite3.connect(self.path)
        try:
            version = con.execute("PRAGMA user_version").fetchone()[0]
            if 0 < version < VERSION_ESQUEMA:
                destino = sqlite3.connect(f"{self.path}.antes-v{VERSION_ESQUEMA}")
                con.backup(destino)
                destino.close()
        finally:
            con.close()

    def _agrupar_tomas_viejas(self, con: sqlite3.Connection, oz: float, limite_h: float) -> None:
        """Agrupa tomas sin biberón como continuaciones, con máximo `oz` por biberón."""
        tomas = con.execute(
            "SELECT id, fin, oz_tomadas, tipo FROM tomas "
            "WHERE borrado = 0 AND biberon_id IS NULL ORDER BY fin"
        ).fetchall()
        grupos: list[list[sqlite3.Row]] = []
        for t in tomas:
            g = grupos[-1] if grupos else None
            if g is None or sum(x["oz_tomadas"] for x in g) + t["oz_tomadas"] > oz + EPS:
                grupos.append([t])
            else:
                g.append(t)
        for i, g in enumerate(grupos):
            total = sum(x["oz_tomadas"] for x in g)
            ultimo = i == len(grupos) - 1  # el último queda abierto: el siguiente registro lo continúa
            bid = con.execute(
                "INSERT INTO biberones (preparado, oz, tipo, cerrado, nota, creado) VALUES (?, ?, ?, ?, ?, ?)",
                (g[0]["fin"], max(oz, total), g[0]["tipo"], None if ultimo else g[-1]["fin"],
                 "Agrupado de registros anteriores", ahora_iso()),
            ).lastrowid
            con.executemany("UPDATE tomas SET biberon_id = ? WHERE id = ?", [(bid, x["id"]) for x in g])

    # ------------------------------------------------------------ biberones
    def _biberon(self, con: sqlite3.Connection, bid: int) -> dict[str, Any] | None:
        f = con.execute(SQL_BIBERON.format(filtro="AND b.id = ?"), (bid,)).fetchone()
        return dict(f) if f else None

    def _abiertos(self, con: sqlite3.Connection) -> list[dict[str, Any]]:
        """Biberones abiertos con leche: el primero es el biberón en curso, el resto están en pausa."""
        filas = con.execute(
            SQL_BIBERON.format(filtro="AND b.cerrado IS NULL AND b.en_reserva = 0")
            + f" HAVING consumido < b.oz - {EPS} ORDER BY COALESCE(b.activado, b.preparado) DESC, b.id DESC"
        ).fetchall()
        return [dict(f) for f in filas]

    def _abierto(self, con: sqlite3.Connection) -> dict[str, Any] | None:
        abiertos = self._abiertos(con)
        return abiertos[0] if abiertos else None

    def _cerrar(self, con: sqlite3.Connection, b: dict[str, Any], cuando: str) -> None:
        """Cierra un biberón. Una fórmula sin tomas se descarta (p. ej. un "nuevo" por error);
        la leche materna sin tomas sí se cierra, porque tirarla es leche desechada."""
        if b["n_tomas"] == 0 and b["tipo"] != "materna":
            con.execute("UPDATE biberones SET borrado = 1 WHERE id = ?", (b["id"],))
        else:
            con.execute("UPDATE biberones SET cerrado = ? WHERE id = ?", (cuando, b["id"]))

    def _cerrar_abiertos(self, con: sqlite3.Connection, cuando: str) -> None:
        for b in con.execute(SQL_BIBERON.format(filtro="AND b.cerrado IS NULL AND b.en_reserva = 0")).fetchall():
            self._cerrar(con, dict(b), cuando)

    def _crear(self, con: sqlite3.Connection, oz: float, tipo: str, preparado: str,
               cerrado: str | None = None) -> dict[str, Any]:
        if cerrado is None:
            self._cerrar_abiertos(con, preparado)
        bid = con.execute(
            "INSERT INTO biberones (preparado, oz, tipo, cerrado, creado, activado) VALUES (?, ?, ?, ?, ?, ?)",
            (preparado, oz, tipo, cerrado, ahora_iso(), preparado),
        ).lastrowid
        return self._biberon(con, bid)

    def biberon_actual(self, lim: Limites | float) -> dict[str, Any] | None:
        with self._con() as con:
            b = self._abierto(con)
        return _enriquecer(b, lim) if b else None

    def biberones_en_pausa(self, lim: Limites | float) -> list[dict[str, Any]]:
        with self._con() as con:
            return [_enriquecer(b, lim) for b in self._abiertos(con)[1:]]

    def reanudar_biberon(self, bid: int, lim: Limites | float) -> dict[str, Any]:
        """Un biberón en pausa vuelve a ser el biberón en curso."""
        with self._con() as con:
            if not any(b["id"] == bid for b in self._abiertos(con)):
                raise ErrorBebe("biberon_no_abierto", id=bid)
            anterior = self._abierto(con)
            con.execute("UPDATE biberones SET activado = ? WHERE id = ?", (marca_iso(), bid))
            b = self._biberon(con, bid)
            anterior = self._biberon(con, anterior["id"]) if anterior and anterior["id"] != bid else None
        return {"biberon": _enriquecer(b, lim), "anterior": _enriquecer(anterior, lim) if anterior else None}

    def obtener_biberon(self, bid: int, lim: Limites | float | None = None) -> dict[str, Any] | None:
        with self._con() as con:
            b = self._biberon(con, bid)
        return _enriquecer(b, lim) if b else None

    def nuevo_biberon(self, oz: float, tipo: str, lim: Limites | float) -> dict[str, Any]:
        with self._con() as con:
            anterior = self._abierto(con)
            nuevo = self._crear(con, oz, tipo, ahora_iso())
            anterior = self._biberon(con, anterior["id"]) if anterior else None
        return {
            "biberon": _enriquecer(nuevo, lim),
            "anterior": _enriquecer(anterior, lim) if anterior else None,
        }

    def cerrar_biberon(self, bid: int | None, lim: Limites | float) -> dict[str, Any]:
        with self._con() as con:
            b = self._biberon(con, bid) if bid else self._abierto(con)
            if not b:
                raise ErrorBebe("sin_biberon_abierto")
            self._cerrar(con, b, ahora_iso())
            cerrado = self._biberon(con, b["id"])
        if cerrado is None:  # fórmula sin tomas: se descartó sin contar como desperdicio
            return {**_enriquecer(b, lim), "estado": "descartado", "desechado": 0.0}
        return _enriquecer(cerrado, lim)

    def borrar_biberon(self, bid: int) -> dict[str, Any]:
        """Deshace un biberón sin tomas y reabre el que se cerró al crearlo."""
        with self._con() as con:
            b = self._biberon(con, bid)
            if not b:
                raise ErrorBebe("biberon_no_existe", id=bid)
            if b["n_tomas"]:
                raise ErrorBebe("biberon_con_tomas")
            con.execute("UPDATE biberones SET borrado = 1 WHERE id = ?", (bid,))
            prev = con.execute(
                "SELECT id FROM biberones WHERE borrado = 0 AND en_reserva = 0 AND id < ? AND cerrado = ? "
                "ORDER BY id DESC LIMIT 1", (bid, b["preparado"]),
            ).fetchone()
            if prev:
                con.execute("UPDATE biberones SET cerrado = NULL WHERE id = ?", (prev["id"],))
        return {"id": bid, "reabierto": prev["id"] if prev else None}

    def corregir_biberon(self, bid: int, cambios: dict[str, Any], lim: Limites | float) -> dict[str, Any]:
        """reserva_id: el biberón salió de esa leche de la reserva; pasa a ser materna con sus datos
        (cuándo se hizo, dónde, extracción) y el de la reserva se quita sin contar como desechado."""
        cambios = dict(cambios)
        with self._con() as con:
            if cambios.get("reserva_id"):
                r = self._de_reserva(con, cambios["reserva_id"])
                actual = self._biberon(con, bid)
                if not actual or actual["en_reserva"]:
                    raise ErrorBebe("biberon_no_existe", id=bid)
                cambios.update(tipo="materna", hecho=r["hecho"], ubicacion=r["ubicacion"],
                               oz=cambios.get("oz") or max(r["oz"], actual["consumido"]))
                con.execute("UPDATE biberones SET extraccion_id = ? WHERE id = ?", (r["extraccion_id"], bid))
                con.execute("UPDATE biberones SET borrado = 1 WHERE id = ?", (r["id"],))
        campos = [c for c in ("oz", "tipo", "nota", "hecho", "ubicacion") if c in cambios]
        with self._con() as con:
            if campos:
                con.execute(
                    f"UPDATE biberones SET {', '.join(f'{c} = ?' for c in campos)} WHERE id = ? AND borrado = 0",
                    [cambios[c] for c in campos] + [bid],
                )
            if "tipo" in cambios:
                # Las tomas son del tipo de leche de su biberón
                con.execute("UPDATE tomas SET tipo = ? WHERE biberon_id = ? AND borrado = 0", (cambios["tipo"], bid))
            if "hecho" in cambios:
                # En reserva, la fecha de preparación es la de cuando se hizo
                con.execute("UPDATE biberones SET preparado = hecho WHERE id = ? AND en_reserva = 1", (bid,))
            if cambios.get("reabrir"):
                con.execute("UPDATE biberones SET cerrado = NULL WHERE id = ?", (bid,))
            b = self._biberon(con, bid)
        if not b:
            raise ErrorBebe("biberon_no_existe", id=bid)
        return _enriquecer(b, lim)

    def biberones_rango(self, desde: str, hasta: str, lim: Limites | float) -> list[dict[str, Any]]:
        with self._con() as con:
            filas = con.execute(
                SQL_BIBERON.format(filtro="AND b.preparado >= ? AND b.preparado < ?")
                + " ORDER BY b.preparado", (desde, hasta),
            ).fetchall()
        return [_enriquecer(dict(f), lim) for f in filas]

    # ------------------------------------------------------------ leche materna
    def guardar_leche(self, oz: float, hecho: str, ubicacion: str, lim: Limites,
                      extraccion_id: int | None = None, nota: str | None = None) -> dict[str, Any]:
        """Biberón de materna en reserva: no es el biberón en curso hasta que se use."""
        with self._con() as con:
            bid = self._insertar_reserva(con, oz, hecho, ubicacion, extraccion_id, nota)
            b = self._biberon(con, bid)
        return _enriquecer(b, lim)

    def _insertar_reserva(self, con, oz, hecho, ubicacion, extraccion_id, nota) -> int:
        return con.execute(
            "INSERT INTO biberones (preparado, oz, tipo, nota, creado, hecho, ubicacion, en_reserva, extraccion_id) "
            "VALUES (?, ?, 'materna', ?, ?, ?, ?, 1, ?)",
            (hecho, oz, nota, ahora_iso(), hecho, ubicacion, extraccion_id),
        ).lastrowid

    def _de_reserva(self, con: sqlite3.Connection, bid: int) -> dict[str, Any]:
        b = self._biberon(con, bid)
        if not b or not b["en_reserva"]:
            raise ErrorBebe("no_en_reserva", id=bid)
        return b

    def reservas(self, lim: Limites) -> list[dict[str, Any]]:
        with self._con() as con:
            filas = con.execute(
                SQL_BIBERON.format(filtro="AND b.en_reserva = 1") + " ORDER BY b.hecho"
            ).fetchall()
        return [_enriquecer(dict(f), lim) for f in filas]

    def usar_reserva(self, bid: int | None, lim: Limites, pausar_actual: bool = True) -> dict[str, Any]:
        """El biberón de reserva pasa a ser el biberón en curso (sin id: el más antiguo sin caducar).
        pausar_actual=True: el biberón que estaba en curso queda en pausa; False: se cierra (se tira)."""
        disponibles = self.reservas(lim)
        if bid is None:
            vigentes = [b for b in disponibles if not b["caducado"]]
            if not (vigentes or disponibles):
                raise ErrorBebe("sin_reserva")
            bid = (vigentes or disponibles)[0]["id"]
        elif not any(b["id"] == bid for b in disponibles):
            raise ErrorBebe("no_en_reserva", id=bid)
        ahora = ahora_iso()
        with self._con() as con:
            anterior = self._abierto(con)
            if not pausar_actual:
                self._cerrar_abiertos(con, ahora)
            con.execute("UPDATE biberones SET en_reserva = 0, preparado = ?, activado = ? WHERE id = ?",
                        (ahora, marca_iso(), bid))
            b = self._biberon(con, bid)
            anterior = self._biberon(con, anterior["id"]) if anterior else None
        return {"biberon": _enriquecer(b, lim), "anterior": _enriquecer(anterior, lim) if anterior else None}

    def mover_reserva(self, bid: int, ubicacion: str, lim: Limites) -> dict[str, Any]:
        with self._con() as con:
            cur = con.execute(
                "UPDATE biberones SET ubicacion = ? WHERE id = ? AND en_reserva = 1 AND borrado = 0",
                (ubicacion, bid),
            )
            if not cur.rowcount:
                raise ErrorBebe("no_en_reserva", id=bid)
            b = self._biberon(con, bid)
        return _enriquecer(b, lim)

    def descartar_reserva(self, bid: int, lim: Limites) -> dict[str, Any]:
        """Desecha un biberón de reserva (cuenta como leche desechada)."""
        with self._con() as con:
            cur = con.execute(
                "UPDATE biberones SET en_reserva = 0, cerrado = ? WHERE id = ? AND en_reserva = 1 AND borrado = 0",
                (ahora_iso(), bid),
            )
            if not cur.rowcount:
                raise ErrorBebe("no_en_reserva", id=bid)
            b = self._biberon(con, bid)
        return _enriquecer(b, lim)

    def registrar_extraccion(self, *, fin: str, oz_izq: float | None, oz_der: float | None,
                             duracion_min: float | None, nota: str | None, usuario: str | None,
                             biberones: list[float], ubicacion: str, lim: Limites) -> dict[str, Any]:
        if not (oz_izq or oz_der):
            raise ErrorBebe("falta_lado")
        with self._con() as con:
            eid = con.execute(
                "INSERT INTO extracciones (fin, oz_izq, oz_der, duracion_min, nota, registrado_por, creado) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (fin, oz_izq, oz_der, duracion_min, nota, usuario, ahora_iso()),
            ).lastrowid
            ids = [self._insertar_reserva(con, oz, fin, ubicacion, eid, None) for oz in biberones if oz > 0]
            bibs = [_enriquecer(self._biberon(con, i), lim) for i in ids]
        return {"id": eid, "fin": fin, "oz_total": _r((oz_izq or 0) + (oz_der or 0)), "biberones": bibs}

    def extracciones_rango(self, desde: str, hasta: str) -> list[dict[str, Any]]:
        with self._con() as con:
            filas = con.execute(
                "SELECT e.*, COALESCE(e.oz_izq, 0) + COALESCE(e.oz_der, 0) AS oz_total "
                "FROM extracciones e WHERE e.borrado = 0 AND e.fin >= ? AND e.fin < ? ORDER BY e.fin",
                (desde, hasta),
            ).fetchall()
        return [dict(f) for f in filas]

    def borrar_extraccion(self, eid: int) -> bool:
        """Borra la extracción y sus biberones que sigan sin usar en la reserva."""
        with self._con() as con:
            cur = con.execute("UPDATE extracciones SET borrado = 1 WHERE id = ? AND borrado = 0", (eid,))
            con.execute("UPDATE biberones SET borrado = 1 WHERE extraccion_id = ? AND en_reserva = 1", (eid,))
            return cur.rowcount > 0

    # ------------------------------------------------------------ tomas
    def registrar(
        self, *, fin: str, oz: float | None, tipo: str | None, fuente: str, confianza: str,
        usuario: str | None, nota: str | None, nuevo_biberon: bool, oz_sobrantes: float | None,
        acumular_s: int, oz_default: float, lim: Limites | float, en_vivo: bool,
        tipo_biberon: str = "formula", reserva_id: int | None = None, pausar_actual: bool = True,
    ) -> dict[str, Any]:
        """Registra oz tomadas en el biberón que corresponda.

        - oz=None y oz_sobrantes dado: tomó lo que quedaba menos lo que sobró (0 = "lo que quedaba").
        - Siempre es continuación del biberón abierto; solo se crea uno nuevo si no hay abierto,
          si se pide (nuevo_biberon) o si la cantidad excede lo que queda. El exceso va primero a un
          biberón en pausa y, si no hay, a uno nuevo de fórmula.
        - acumular_s > 0: si la última toma del biberón es de la misma fuente y de hace menos de
          acumular_s segundos, se suma a ella (toques seguidos del botón = una toma).
        - en_vivo solo afecta si se avisa de "biberón nuevo" (no para tomas con hora pasada).
        - reserva_id: la toma es de ese biberón de la reserva, que pasa a ser el biberón en curso;
          el que estaba en curso queda en pausa (pausar_actual) o se cierra.
        - La toma es del tipo de leche de su biberón; `tipo` solo decide el de un biberón nuevo.
        """
        with self._con() as con:
            anterior = None
            creado = False
            b = None if nuevo_biberon or reserva_id else self._abierto(con)
            if reserva_id:
                self._de_reserva(con, reserva_id)
                anterior = self._abierto(con)
                if not pausar_actual:
                    self._cerrar_abiertos(con, fin)
                con.execute("UPDATE biberones SET en_reserva = 0, preparado = ?, activado = ? WHERE id = ?",
                            (fin, marca_iso(), reserva_id))
                b = self._biberon(con, reserva_id)
                creado = True
            elif b is None:
                ult = con.execute(
                    "SELECT id FROM biberones WHERE borrado = 0 AND en_reserva = 0 ORDER BY id DESC LIMIT 1"
                ).fetchone()
                anterior = self._biberon(con, ult["id"]) if ult else None
                # Un biberón nuevo es del tipo indicado o, si no, del tipo de leche principal del bebé
                b = self._crear(con, oz_default, tipo or tipo_biberon, fin)
                creado = True

            restante = b["oz"] - b["consumido"]
            if oz is None:
                if oz_sobrantes is None:
                    raise ErrorBebe("falta_cuanto")
                oz = restante - oz_sobrantes
            oz = _r(oz)
            if oz <= 0:
                raise ErrorBebe("cantidad_positiva")

            en_b = _r(min(oz, restante))
            exceso = _r(oz - en_b)
            toma_id = self._sumar_toma(con, b["id"], en_b, fin, b["tipo"], fuente, confianza,
                                       usuario, nota, acumular_s)
            ids = [toma_id]
            biberon_nuevo = creado and en_vivo
            while exceso > 0:
                anterior = self._biberon(con, b["id"])
                # El exceso sigue en un biberón en pausa (p. ej. la fórmula tras la materna);
                # si no hay, en uno nuevo del tipo de leche principal del bebé
                siguiente = next((x for x in self._abiertos(con) if x["id"] != b["id"]), None)
                if siguiente:
                    b = siguiente
                    con.execute("UPDATE biberones SET activado = ? WHERE id = ?", (fin, b["id"]))
                else:
                    b = self._crear(con, max(oz_default, exceso), tipo_biberon, fin)
                    biberon_nuevo = True
                parte = _r(min(exceso, b["oz"] - b["consumido"]))
                toma_id = self._sumar_toma(con, b["id"], parte, fin, b["tipo"], fuente, confianza,
                                           usuario, nota, acumular_s)
                ids.append(toma_id)
                exceso = _r(exceso - parte)
                b = self._biberon(con, b["id"])
            if anterior:
                anterior = self._biberon(con, anterior["id"])
            toma = dict(con.execute("SELECT * FROM tomas WHERE id = ?", (toma_id,)).fetchone())
            b = self._biberon(con, b["id"])
        return {
            "id": toma["id"], "fin": toma["fin"], "oz_tomadas": toma["oz_tomadas"],
            "confianza": toma["confianza"], "fuente": toma["fuente"],
            "oz_registradas": oz, "tomas": ids,
            "biberon": _enriquecer(b, lim),
            "biberon_nuevo": biberon_nuevo,
            "anterior": _enriquecer(anterior, lim) if anterior else None,
        }

    def _sumar_toma(self, con, bid, oz, fin, tipo, fuente, confianza, usuario, nota, acumular_s) -> int:
        if acumular_s > 0:
            ult = con.execute(
                "SELECT * FROM tomas WHERE biberon_id = ? AND borrado = 0 ORDER BY fin DESC, id DESC LIMIT 1",
                (bid,),
            ).fetchone()
            if ult and ult["fuente"] == fuente and 0 <= (_dt(fin) - _dt(ult["fin"])).total_seconds() <= acumular_s:
                con.execute(
                    "UPDATE tomas SET oz_tomadas = ?, fin = ?, modificado = ? WHERE id = ?",
                    (_r(ult["oz_tomadas"] + oz), fin, ahora_iso(), ult["id"]),
                )
                return ult["id"]
        return con.execute(
            "INSERT INTO tomas (fin, oz_tomadas, tipo, confianza, fuente, registrado_por, nota, biberon_id, creado) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (fin, oz, tipo, confianza, fuente, usuario, nota, bid, ahora_iso()),
        ).lastrowid

    def obtener_toma(self, toma_id: int) -> dict[str, Any] | None:
        with self._con() as con:
            fila = con.execute("SELECT * FROM tomas WHERE id = ? AND borrado = 0", (toma_id,)).fetchone()
        return dict(fila) if fila else None

    def actualizar_toma(self, toma_id: int, cambios: dict[str, Any]) -> bool:
        campos = [c for c in CAMPOS_TOMA if c in cambios]
        if not campos:
            return False
        sets = ", ".join(f"{c} = ?" for c in campos)
        with self._con() as con:
            cur = con.execute(
                f"UPDATE tomas SET {sets}, modificado = ? WHERE id = ? AND borrado = 0",
                [cambios[c] for c in campos] + [ahora_iso(), toma_id],
            )
            return cur.rowcount > 0

    def mover_toma(self, toma_id: int, destino: str, oz_default: float) -> int:
        """destino='nuevo': la toma (y las posteriores de su biberón) pasan a un biberón nuevo.
        destino='anterior': la toma se une al biberón anterior."""
        with self._con() as con:
            t = con.execute("SELECT * FROM tomas WHERE id = ? AND borrado = 0", (toma_id,)).fetchone()
            if not t:
                raise ErrorBebe("toma_no_existe", id=toma_id)
            origen = self._biberon(con, t["biberon_id"]) if t["biberon_id"] else None
            if destino == "nuevo":
                abierto = origen is not None and origen["cerrado"] is None
                nuevo = con.execute(
                    "INSERT INTO biberones (preparado, oz, tipo, cerrado, creado) VALUES (?, ?, ?, ?, ?)",
                    (t["fin"], origen["oz"] if origen else oz_default, t["tipo"],
                     None if abierto else (origen["cerrado"] if origen else t["fin"]), ahora_iso()),
                ).lastrowid
                if origen:
                    con.execute(
                        "UPDATE tomas SET biberon_id = ? WHERE biberon_id = ? AND borrado = 0 AND (fin > ? OR id = ?)",
                        (nuevo, origen["id"], t["fin"], toma_id),
                    )
                    if abierto:
                        con.execute("UPDATE biberones SET cerrado = ? WHERE id = ?", (t["fin"], origen["id"]))
                else:
                    con.execute("UPDATE tomas SET biberon_id = ? WHERE id = ?", (nuevo, toma_id))
                destino_id = nuevo
            elif destino == "anterior":
                prev = con.execute(
                    "SELECT id FROM biberones WHERE borrado = 0 AND en_reserva = 0 AND id < ? ORDER BY id DESC LIMIT 1",
                    (t["biberon_id"] or 10**12,),
                ).fetchone()
                if not prev:
                    raise ErrorBebe("sin_biberon_anterior")
                destino_id = prev["id"]
                d = self._biberon(con, destino_id)
                if d["consumido"] + t["oz_tomadas"] > d["oz"] + EPS:
                    raise ErrorBebe("anterior_sin_espacio", libre=_r(d["oz"] - d["consumido"]))
                con.execute("UPDATE tomas SET biberon_id = ? WHERE id = ?", (destino_id, toma_id))
            else:
                raise ErrorBebe("destino_invalido")
            if origen:
                resto = self._biberon(con, origen["id"])
                if resto and resto["n_tomas"] == 0:
                    # Si el origen quedó vacío y estaba abierto, el destino hereda su estado
                    if resto["cerrado"] is None:
                        con.execute("UPDATE biberones SET cerrado = NULL WHERE id = ?", (destino_id,))
                    con.execute("UPDATE biberones SET borrado = 1 WHERE id = ?", (origen["id"],))
        return destino_id

    def borrar_toma(self, toma_id: int) -> bool:
        """Borrado lógico. Un biberón cerrado que se queda sin tomas se descarta."""
        with self._con() as con:
            t = con.execute("SELECT biberon_id FROM tomas WHERE id = ? AND borrado = 0", (toma_id,)).fetchone()
            if not t:
                return False
            con.execute("UPDATE tomas SET borrado = 1, modificado = ? WHERE id = ?", (ahora_iso(), toma_id))
            if t["biberon_id"]:
                b = self._biberon(con, t["biberon_id"])
                if b and b["n_tomas"] == 0 and b["cerrado"]:
                    con.execute("UPDATE biberones SET borrado = 1 WHERE id = ?", (b["id"],))
            return True

    def restaurar_toma(self, toma_id: int) -> bool:
        with self._con() as con:
            t = con.execute("SELECT biberon_id FROM tomas WHERE id = ? AND borrado = 1", (toma_id,)).fetchone()
            if not t:
                return False
            con.execute("UPDATE tomas SET borrado = 0, modificado = ? WHERE id = ?", (ahora_iso(), toma_id))
            if t["biberon_id"]:
                con.execute("UPDATE biberones SET borrado = 0 WHERE id = ?", (t["biberon_id"],))
            return True

    def tomas_desde(self, desde_utc: str) -> list[dict[str, Any]]:
        with self._con() as con:
            filas = con.execute(
                "SELECT * FROM tomas WHERE borrado = 0 AND fin >= ? ORDER BY fin", (desde_utc,)
            ).fetchall()
        return [dict(f) for f in filas]

    def tomas_rango(self, desde_utc: str, hasta_utc: str, borradas: bool = False) -> list[dict[str, Any]]:
        filtro = "" if borradas else "borrado = 0 AND "
        with self._con() as con:
            filas = con.execute(
                f"SELECT * FROM tomas WHERE {filtro}fin >= ? AND fin < ? ORDER BY fin",
                (desde_utc, hasta_utc),
            ).fetchall()
        return [dict(f) for f in filas]

    def ultima_toma(self) -> dict[str, Any] | None:
        with self._con() as con:
            fila = con.execute(
                "SELECT * FROM tomas WHERE borrado = 0 ORDER BY fin DESC, id DESC LIMIT 1"
            ).fetchone()
        return dict(fila) if fila else None

    # ------------------------------------------------------------ pañales
    CAMPOS_PANAL = ("fin", "tipo", "color", "consistencia", "nota", "fuente", "registrado_por")

    def agregar_panal(self, datos: dict[str, Any]) -> dict[str, Any]:
        campos = [c for c in self.CAMPOS_PANAL if datos.get(c) is not None]
        with self._con() as con:
            pid = con.execute(
                f"INSERT INTO panales ({', '.join(campos)}, creado) VALUES ({', '.join('?' * len(campos))}, ?)",
                [datos[c] for c in campos] + [ahora_iso()],
            ).lastrowid
            return dict(con.execute("SELECT * FROM panales WHERE id = ?", (pid,)).fetchone())

    def actualizar_panal(self, pid: int, cambios: dict[str, Any]) -> dict[str, Any]:
        campos = [c for c in self.CAMPOS_PANAL if c in cambios]
        with self._con() as con:
            if campos:
                cur = con.execute(
                    f"UPDATE panales SET {', '.join(f'{c} = ?' for c in campos)}, modificado = ? "
                    "WHERE id = ? AND borrado = 0",
                    [cambios[c] for c in campos] + [ahora_iso(), pid],
                )
                if not cur.rowcount:
                    raise ErrorBebe("panal_no_existe", id=pid)
            fila = con.execute("SELECT * FROM panales WHERE id = ? AND borrado = 0", (pid,)).fetchone()
        if not fila:
            raise ErrorBebe("panal_no_existe", id=pid)
        return dict(fila)

    def borrar_panal(self, pid: int) -> bool:
        with self._con() as con:
            cur = con.execute(
                "UPDATE panales SET borrado = 1, modificado = ? WHERE id = ? AND borrado = 0", (ahora_iso(), pid)
            )
            return cur.rowcount > 0

    def panales_rango(self, desde: str, hasta: str) -> list[dict[str, Any]]:
        with self._con() as con:
            filas = con.execute(
                "SELECT * FROM panales WHERE borrado = 0 AND fin >= ? AND fin < ? ORDER BY fin", (desde, hasta)
            ).fetchall()
        return [dict(f) for f in filas]

    def ultimo_panal(self, tipos: tuple[str, ...] = ("pipi", "popo", "ambos")) -> dict[str, Any] | None:
        with self._con() as con:
            fila = con.execute(
                f"SELECT * FROM panales WHERE borrado = 0 AND tipo IN ({', '.join('?' * len(tipos))}) "
                "ORDER BY fin DESC, id DESC LIMIT 1", tipos,
            ).fetchone()
        return dict(fila) if fila else None

    # ------------------------------------------------------------ medidas
    def agregar_medida(self, datos: dict[str, Any]) -> int:
        campos = [
            c for c in ("fecha", "peso_kg", "talla_cm", "perimetro_cm", "nota", "registrado_por")
            if datos.get(c) is not None
        ]
        sql = (
            f"INSERT INTO medidas ({', '.join(campos)}, creado) "
            f"VALUES ({', '.join('?' * len(campos))}, ?)"
        )
        with self._con() as con:
            return con.execute(sql, [datos[c] for c in campos] + [ahora_iso()]).lastrowid

    def medidas(self) -> list[dict[str, Any]]:
        with self._con() as con:
            filas = con.execute("SELECT * FROM medidas WHERE borrado = 0 ORDER BY fecha").fetchall()
        return [dict(f) for f in filas]

    def borrar_medida(self, medida_id: int) -> bool:
        with self._con() as con:
            cur = con.execute("UPDATE medidas SET borrado = 1 WHERE id = ? AND borrado = 0", (medida_id,))
            return cur.rowcount > 0

    def ultima_medida(self, campo: str) -> dict[str, Any] | None:
        """Última medida que tenga el campo dado (peso_kg, talla_cm, perimetro_cm)."""
        with self._con() as con:
            fila = con.execute(
                f"SELECT * FROM medidas WHERE borrado = 0 AND {campo} IS NOT NULL "
                "ORDER BY fecha DESC LIMIT 1"
            ).fetchone()
        return dict(fila) if fila else None
