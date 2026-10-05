// Panel "Bebé" para Home Assistant: registro y edición de tomas, medidas y gráficas.
// Web component sin dependencias; usa las variables de tema de HA (claro/oscuro).

// ---------- Idioma: español en el código, inglés vía diccionario (según el idioma de HA) ----------
let IDIOMA = "es";
// t("texto en español {var}", {var: valor}) → texto en el idioma activo
const t = (s, v = {}) => (IDIOMA === "es" ? s : (EN[s] ?? s)).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));

const TIPOS = { formula: "Fórmula", materna: "Materna", mixta: "Mixta" };
const CONFIANZAS = { exacto: "Exacto", estimado: "Estimado", inferido: "Inferido" };
const FUENTES = {
  boton: "Botón", alexa: "Alexa", notificacion: "Notificación",
  app: "Panel", manual: "Manual", prueba: "Prueba",
};
const ML_POR_OZ = 29.5735;
// Unidad de captura/visualización (Configurar); la base siempre guarda oz
let UNIDAD = "oz";
const U = () => UNIDAD;
const esMl = () => UNIDAD === "ml";
const aUnidad = (oz) => (esMl() ? oz * ML_POR_OZ : oz);
const aOz = (v) => (esMl() ? v / ML_POR_OZ : v);
// Número en la unidad (sin sufijo) y cantidad con sufijo
const cantN = (oz, d = 2) => (oz === null || oz === undefined || oz === "" || isNaN(oz)) ? "—"
  : esMl() ? String(Math.round(oz * ML_POR_OZ)) : num(oz, d);
const cant = (oz, d = 2) => { const n = cantN(oz, d); return n === "—" ? n : `${n} ${U()}`; };
const PASO = () => (esMl() ? 5 : 0.25);
const MAXC = () => (esMl() ? 360 : 12);
const TIPOS_PANAL = { pipi: "💧 Pipí", popo: "💩 Popó", ambos: "💧💩 Ambos" };
const COLORES = [["amarillo", "Amarillo", "#f2c230"], ["verde", "Verde", "#6f9a3a"], ["cafe", "Café", "#8b5a2b"],
  ["naranja", "Naranja", "#f08a24"], ["negro", "Negro", "#222"], ["rojo", "Rojo", "#c62828"],
  ["blanco", "Blanco / gris", "#d9d9d9"], ["no_se", "No sé", "transparent"]];
const CONSISTENCIAS = [["liquida", "Líquida"], ["grumosa", "Grumosa"], ["pastosa", "Pastosa"], ["dura", "Dura"], ["no_se", "No sé"]];
const NOMBRE_COLOR = Object.fromEntries(COLORES.map(([k, t]) => [k, t]));
const NOMBRE_CONS = Object.fromEntries(CONSISTENCIAS);

const pad = (n) => String(n).padStart(2, "0");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 1) => (v === null || v === undefined || v === "" || isNaN(v))
  ? "—" : Number(v).toFixed(d).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
const fechaISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const aInputLocal = (d) => `${fechaISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const aServicio = (v) => v.replace("T", " ") + (v.length === 16 ? ":00" : "");
const hora = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const inicioDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
let DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
let MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Traduce las etiquetas de las tablas fijas (tipos, colores, días…) una sola vez
function aplicarIdioma(lang) {
  IDIOMA = String(lang || "es").toLowerCase().startsWith("es") ? "es" : "en";
  if (IDIOMA === "es") return;
  for (const obj of [TIPOS, CONFIANZAS, FUENTES, TIPOS_PANAL]) for (const k of Object.keys(obj)) obj[k] = t(obj[k]);
  for (const fila of [...COLORES, ...CONSISTENCIAS]) fila[1] = t(fila[1]);
  for (const k of Object.keys(NOMBRE_COLOR)) NOMBRE_COLOR[k] = t(NOMBRE_COLOR[k]);
  for (const k of Object.keys(NOMBRE_CONS)) NOMBRE_CONS[k] = t(NOMBRE_CONS[k]);
  DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
}

function relativo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  const tt = h ? `${h} h ${pad(m)} min` : `${m} min`;
  return min >= 0 ? t("hace {t}", { t: tt }) : t("en {t}", { t: tt });
}

function edadTexto(dias) {
  if (dias === null || dias === undefined || isNaN(dias)) return "—";
  dias = Number(dias);
  if (dias < 14) return t("{n} días", { n: dias });
  const sem = Math.floor(dias / 7), d = dias % 7;
  if (dias < 90) return t("{s} sem{d} ({n} días)", { s: sem, d: d ? ` ${d} d` : "", n: dias });
  const meses = Math.floor(dias / 30.44);
  return t("{m} meses ({s} sem)", { m: meses, s: sem });
}

// Gráfica de barras SVG; series apiladas; línea de meta opcional.
// lineas: metas que pueden cambiar por barra [{nombre, valores: [...], clase, abajo}] (línea escalonada)
function barras({ etiquetas, series, meta, lineas = [], unidad, alto = 180 }) {
  const W = 640, H = alto, izq = 34, abajo = 26, arriba = 12;
  const n = etiquetas.length || 1;
  const totales = etiquetas.map((_, i) => series.reduce((s, se) => s + (se.valores[i] || 0), 0));
  const max = Math.max(1, meta || 0, ...totales, ...lineas.flatMap((l) => l.valores.filter((v) => v))) * 1.12;
  const y = (v) => arriba + (H - arriba - abajo) * (1 - v / max);
  const ancho = (W - izq - 8) / n, bw = Math.max(4, ancho * 0.66);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="grafica" role="img">`;
  for (let k = 0; k <= 4; k++) {
    const v = (max / 1.12) * k / 4, yy = y(v);
    svg += `<line x1="${izq}" x2="${W - 4}" y1="${yy}" y2="${yy}" class="rejilla"/>`
         + `<text x="${izq - 4}" y="${yy + 3}" class="eje" text-anchor="end">${num(v, v < 10 ? 1 : 0)}</text>`;
  }
  etiquetas.forEach((et, i) => {
    const x = izq + ancho * i + (ancho - bw) / 2;
    let base = 0;
    series.forEach((se) => {
      const v = se.valores[i] || 0;
      if (v > 0) {
        svg += `<rect x="${x}" y="${y(base + v)}" width="${bw}" height="${y(base) - y(base + v)}" rx="2" `
             + `style="fill:${se.color};opacity:${se.opacidad ?? 1}"><title>${esc(et)}: ${num(v, 2)} ${unidad} ${esc(se.nombre)}</title></rect>`;
      }
      base += v;
    });
    if (totales[i] > 0 && n <= 16) {
      svg += `<text x="${x + bw / 2}" y="${y(totales[i]) - 3}" class="valor" text-anchor="middle">${num(totales[i], 1)}</text>`;
    }
    if (n <= 16 || i % Math.ceil(n / 12) === 0) {
      svg += `<text x="${x + bw / 2}" y="${H - 8}" class="eje" text-anchor="middle">${esc(et)}</text>`;
    }
  });
  lineas.forEach((l) => {
    let d = "", ultimo = null;
    l.valores.forEach((v, i) => {
      if (!v) { ultimo = null; return; }
      const x0 = izq + ancho * i, x1 = x0 + ancho, yy = y(v);
      d += `${ultimo === null ? "M" : "L"}${x0},${yy} L${x1},${yy} `;
      ultimo = v;
    });
    const fin = [...l.valores].reverse().find((v) => v);
    if (!d || !fin) return;
    svg += `<path d="${d}" class="${l.clase}" fill="none"><title>${esc(l.nombre)}</title></path>`
         + `<text x="${W - 6}" y="${y(fin) + (l.abajo ? 13 : -4)}" class="${l.clase}-txt" text-anchor="end">${esc(l.nombre)} ${num(fin, 1)}</text>`;
  });
  if (meta) {
    svg += `<line x1="${izq}" x2="${W - 4}" y1="${y(meta)}" y2="${y(meta)}" class="meta"/>`
         + `<text x="${W - 6}" y="${y(meta) - 4}" class="meta-txt" text-anchor="end">${t("meta")} ${num(meta, 1)}</text>`;
  }
  return svg + "</svg>";
}

// Gráfica de línea SVG (x numérico = días de edad).
function linea({ puntos, unidad, alto = 170 }) {
  if (puntos.length === 0) return `<p class="vacio">${t("Sin datos todavía.")}</p>`;
  const W = 640, H = alto, izq = 40, abajo = 24, arriba = 12;
  const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y);
  const x0 = Math.min(0, ...xs), x1 = Math.max(x0 + 7, ...xs);
  const y0 = Math.min(...ys) * 0.97, y1 = Math.max(...ys) * 1.03 || 1;
  const X = (v) => izq + (W - izq - 10) * (v - x0) / (x1 - x0);
  const Y = (v) => arriba + (H - arriba - abajo) * (1 - (v - y0) / ((y1 - y0) || 1));
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="grafica" role="img">`;
  for (let k = 0; k <= 3; k++) {
    const v = y0 + (y1 - y0) * k / 3;
    svg += `<line x1="${izq}" x2="${W - 4}" y1="${Y(v)}" y2="${Y(v)}" class="rejilla"/>`
         + `<text x="${izq - 4}" y="${Y(v) + 3}" class="eje" text-anchor="end">${num(v, 2)}</text>`;
  }
  svg += `<polyline points="${puntos.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}" class="linea"/>`;
  puntos.forEach((p) => {
    svg += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="4" class="punto"><title>${t("Día")} ${p.x}: ${num(p.y, 2)} ${unidad}</title></circle>`
         + `<text x="${X(p.x)}" y="${H - 8}" class="eje" text-anchor="middle">${p.x}d</text>`;
  });
  return svg + "</svg>";
}

class BebePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = "hoy";
    this._dia = inicioDia(new Date());
    this._periodo = "dia";
    this._tomasDia = [];
    this._medidas = [];
    this._listo = false;
  }

  set panel(p) {
    // Un panel para todos los bebés; se recuerda el último elegido en este dispositivo
    this._bebes = p.config.bebes || [p.config];
    let sel = null;
    try { sel = localStorage.getItem("baby_tracker_bebe"); } catch (e) { /* sin almacenamiento */ }
    this._elegirBebe(this._bebes.find((b) => b.entry_id === sel) || this._bebes[0], false);
  }

  _elegirBebe(b, repintar = true) {
    this._cfg = b;
    UNIDAD = b.unidad === "ml" ? "ml" : "oz";
    try { localStorage.setItem("baby_tracker_bebe", b.entry_id); } catch (e) { /* sin almacenamiento */ }
    if (repintar && this._listo) {
      const n = this.shadowRoot.getElementById("titulo-nombre"); if (n) n.textContent = b.nombre;
      this.shadowRoot.querySelectorAll("#selector-bebe button").forEach((x) => x.classList.toggle("activa", x.dataset.bebe === b.entry_id));
      this._actualizarEdad();
      this._pintar();
    }
  }

  _actualizarEdad() {
    const te = this.shadowRoot && this.shadowRoot.getElementById("titulo-edad");
    if (te) { const d = this._val("edad"); te.textContent = d !== null ? `· ${edadTexto(d)}` : ""; }
  }
  set narrow(n) { this._narrow = n; if (this._menu) this._menu.narrow = n; }
  set hass(h) {
    this._hass = h;
    if (this._menu) this._menu.hass = h;
    if (!this._listo) { aplicarIdioma(h.language); this._listo = true; this._montar(); return; }
    this._actualizarEdad();
    if (this._tab === "hoy") this._pintarResumen();
    if (this._tab === "materna") this._pintarKpisMaterna();
  }

  connectedCallback() { this._timer = setInterval(() => this._tab === "hoy" && this._pintarResumen(), 30000); }
  disconnectedCallback() {
    clearInterval(this._timer);
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  // ---------- utilidades ----------
  _st(clave) { const id = this._cfg.entidades[clave]; return id ? this._hass.states[id] : undefined; }
  _val(clave) { const s = this._st(clave); return s && !["unknown", "unavailable"].includes(s.state) ? s.state : null; }
  _num(clave) { const v = this._val(clave); return v === null ? null : Number(v); }

  async _servicio(servicio, datos, respuesta = false) {
    const r = await this._hass.callWS({
      type: "call_service", domain: "bebe", service: servicio,
      service_data: { ...datos, ...(this._cfg.entry_id ? { bebe: this._cfg.entry_id } : {}) }, return_response: respuesta,
    });
    return respuesta ? r.response : r;
  }

  _aviso(mensaje) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: mensaje }, bubbles: true, composed: true }));
  }

  async _accion(fn, ok) {
    try { const r = await fn(); if (ok) this._aviso(ok); return r; }
    catch (e) { this._aviso(`${t("Error")}: ${e.message || e}`); throw e; }
  }

  // ---------- estructura ----------
  async _montar() {
    this.shadowRoot.innerHTML = `<style>${ESTILOS}</style>
      <div class="barra">
        <span id="menu"></span>
        <div class="titulo"><span id="titulo-nombre">${esc(this._cfg.nombre)}</span> <span class="titulo-edad" id="titulo-edad"></span></div>
      </div>
      ${this._bebes.length > 1 ? `<div class="selector-bebe" id="selector-bebe">${this._bebes.map((b) =>
        `<button data-bebe="${b.entry_id}" class="${b.entry_id === this._cfg.entry_id ? "activa" : ""}">${esc(b.nombre)}</button>`).join("")}</div>` : ""}
      <nav class="tabs">
        ${[["hoy", "Hoy"], ["tomas", "Tomas"], ["materna", "Materna"], ["medidas", "Medidas"], ["graficas", "Gráficas"], ["ajustes", "Ajustes"]]
          .map(([k, e]) => `<button data-tab="${k}" class="${k === this._tab ? "activa" : ""}">${t(e)}</button>`).join("")}
      </nav>
      <main id="contenido"></main>
      <div id="dialogo"></div>`;
    this._menu = document.createElement("ha-menu-button");
    this._menu.hass = this._hass; this._menu.narrow = this._narrow;
    this.shadowRoot.getElementById("menu").appendChild(this._menu);
    const selector = this.shadowRoot.getElementById("selector-bebe");
    if (selector) selector.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-bebe]"); if (!b) return;
      this._elegirBebe(this._bebes.find((x) => x.entry_id === b.dataset.bebe));
    });
    this.shadowRoot.querySelector(".tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tab]"); if (!b) return;
      this._tab = b.dataset.tab;
      this.shadowRoot.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("activa", x === b));
      this._pintar();
    });
    try {
      this._unsub = await this._hass.connection.subscribeEvents(() => {
        if (this._tab === "tomas") this._cargarTomas();
        if (this._tab === "materna") this._cargarMaterna();
        if (this._tab === "graficas") this._pintarGraficas();
      }, "bebe_toma_registrada");
    } catch (e) { /* sin suscripción: se actualiza al cambiar de pestaña */ }
    this._pintar();
  }

  _pintar() {
    const c = this.shadowRoot.getElementById("contenido");
    if (this._tab === "hoy") { c.innerHTML = this._htmlHoy(); this._pintarResumen(); this._eventosHoy(); }
    if (this._tab === "ajustes") { c.innerHTML = this._htmlAjustes(); this._eventosAjustes(); }
    if (this._tab === "tomas") { c.innerHTML = `<div id="tomas"></div>`; this._cargarTomas(); }
    if (this._tab === "materna") { c.innerHTML = this._htmlMaterna(); this._eventosMaterna(); this._cargarMaterna(); }
    if (this._tab === "medidas") { c.innerHTML = this._htmlMedidas(); this._eventosMedidas(); this._cargarMedidas(); }
    if (this._tab === "graficas") { c.innerHTML = this._htmlGraficas(); this._eventosGraficas(); this._pintarGraficas(); }
  }

  // ---------- Hoy ----------
  _htmlHoy() {
    return `
      <section class="hero" id="hero"></section>
      <section class="tarjeta" id="biberon"></section>
      <section class="tarjeta" id="panal"></section>
      <section class="kpis" id="kpis"></section>
      <section class="tarjeta">
        <details id="detalle">
          <summary>${t("Registrar con otra hora…")}</summary>
          ${this._formToma({ fin: aInputLocal(new Date()), oz_tomadas: "", tipo: "formula" }, "nueva", true)}
          <button class="primario" id="guardar-nueva">${t("Guardar toma")}</button>
        </details>
      </section>`;
  }

  _biberon() {
    const s = this._st("biberon_restante");
    if (!s || ["unknown", "unavailable"].includes(s.state)) return null;
    return { restante: Number(s.state), ...s.attributes };
  }

  _pintarBiberon() {
    const el = this.shadowRoot.getElementById("biberon"); if (!el) return;
    const b = this._biberon(), ozDef = this._num("oz_por_biberon") ?? 3;
    const rs = this._st("reserva_oz"), reservaN = rs ? rs.attributes.vigentes : 0;
    const quedan = b ? b.restante : ozDef;
    const chips = [[0.5, "½"], [1, "1"], [1.5, "1½"], [2, "2"], [2.5, "2½"]].filter(([v]) => v < quedan);
    el.innerHTML = `
      <div class="fila-titulo"><h2>${t("Biberón en curso")} ${b ? `<span class="badge ${b.tipo || "formula"}">${TIPOS[b.tipo] || TIPOS.formula}</span>` : ""}</h2></div>
      <div class="nuevos">
        <button class="secundario chico" id="nuevo-bib">＋ ${TIPOS.formula} ${cant(ozDef, 1)}</button>
        <button class="secundario chico" id="nuevo-materna" ${reservaN ? "" : "disabled"}>＋ ${TIPOS.materna}${reservaN ? ` ${t("({n} en reserva)", { n: reservaN })}` : ` ${t("(sin reserva)")}`}</button>
      </div>
      ${b ? `
        <div class="progreso grande-p"><div style="width:${Math.min(100, b.consumido / b.oz * 100)}%"></div></div>
        <div class="bib-info"><b>${t("{a} de {b}", { a: cantN(b.consumido, 2), b: cant(b.oz, 2) })}</b>
          <button class="icono lapiz" id="editar-oz" title="${t("Cambiar el tamaño de este biberón")}" aria-label="${t("Cambiar tamaño")}">✏️</button>
          · ${t("quedan")} <b>${cant(b.restante, 2)}</b></div>
        <div class="sub">${b.primera_toma ? t(b.n_tomas === 1 ? "Primera toma {h} · 1 toma" : "Primera toma {h} · {n} tomas", { h: hora(b.primera_toma), n: b.n_tomas }) : t("Preparado {h} · sin tomas aún", { h: hora(b.preparado) })}
          ${b.vence ? ` · ${t("límite")} ${hora(b.vence)}` : ""}</div>
        ${b.vencido ? `<div class="alerta-txt">⚠️ ${t("Ya pasó el límite desde su primera toma: considera preparar uno nuevo.")}</div>` : ""}`
      : `<div class="sub">${t("No hay biberón abierto: la siguiente toma empieza uno de {c}.", { c: cant(ozDef, 1) })}</div>`}
      ${(b && b.en_pausa ? b.en_pausa : []).map((p) => `
        <div class="pausa ${p.vencido ? "vencida" : ""}">
          <div><b>${t("En pausa:")}</b> ${TIPOS[p.tipo] || p.tipo} · ${t("{a} de {b}", { a: cantN(p.consumido, 2), b: cant(p.oz, 2) })}
            <div class="sub">${p.vencido ? `<span class="rojo">${t("Ya pasó su límite ({h}): mejor tírala.", { h: hora(p.vence) })}</span>` : p.vence ? t("Usar antes de {h}", { h: hora(p.vence) }) : ""}
              · ${t("lo que sobre de la actual se sumará aquí")}</div></div>
          <div class="acciones">
            <button class="chip" data-reanudar="${p.id}" ${p.vencido ? "disabled" : ""}>${t("Continuar")}</button>
            <button class="chip peligro-chip" data-tirar="${p.id}">${t("Tirar lo que queda ({c})", { c: cant(p.restante, 2) })}</button>
          </div>
        </div>`).join("")}
      <div class="etq pregunta">${t("¿Cuánto tomó?")}</div>
      <div class="chips" id="chips-toma">
        ${chips.map(([v, e]) => `<button class="chip" data-oz="${v}">${esMl() ? cant(v) : `${e} oz`}</button>`).join("")}
        <button class="chip fuerte" data-oz="resto">${t("Lo que quedaba ({c})", { c: cant(quedan, 2) })}</button>
        <button class="chip" data-oz="otro">${t("Otro…")}</button>
      </div>`;
    el.querySelector("#nuevo-bib").onclick = () => this._nuevoBiberon();
    const lapiz = el.querySelector("#editar-oz");
    if (lapiz) lapiz.onclick = async () => {
      // Solo este biberón (caso especial); las oz por defecto de Ajustes no cambian
      const v = prompt(t("¿De cuánto es este biberón? ({u}; ya tomó {c})", { u: U(), c: cant(b.consumido, 2) }), cantN(b.oz, 2));
      if (v === null) return;
      const oz = aOz(parseFloat(v.replace(",", ".")));
      if (!(oz > 0 && oz <= 12)) { this._aviso(t("Cantidad no válida")); return; }
      if (oz < b.consumido) { this._aviso(t("No puede ser menor a lo que ya tomó ({c})", { c: cant(b.consumido, 2) })); return; }
      await this._accion(() => this._servicio("corregir_biberon", { id: b.id, oz }, true), t("Este biberón ahora es de {c}", { c: cant(oz, 2) }));
    };
    el.querySelector("#nuevo-materna").onclick = () => this._usarReserva(null);
    el.querySelectorAll("[data-reanudar]").forEach((x) => x.onclick = async () => {
      await this._accion(() => this._servicio("reanudar_biberon", { id: Number(x.dataset.reanudar) }, true), t("Seguimos con ese biberón"));
    });
    el.querySelectorAll("[data-tirar]").forEach((x) => x.onclick = async () => {
      if (!confirm(t("¿Tirar lo que queda de ese biberón?"))) return;
      await this._accion(() => this._servicio("cerrar_biberon", { id: Number(x.dataset.tirar) }, true), t("Biberón tirado"));
    });
    el.querySelector("#chips-toma").onclick = async (e) => {
      const bt = e.target.closest("button[data-oz]"); if (!bt) return;
      if (bt.dataset.oz === "otro") {
        const v = prompt(`${t("¿Cuánto tomó?")} (${U()})`, "");
        if (v === null) return;
        const oz = aOz(parseFloat(v.replace(",", ".")));
        if (!(oz > 0 && oz <= 12)) { this._aviso(t("Cantidad no válida")); return; }
        return this._registrarRapido({ oz_tomadas: oz });
      }
      this._registrarRapido(bt.dataset.oz === "resto" ? { oz_sobrantes: 0 } : { oz_tomadas: Number(bt.dataset.oz) });
    };
  }

  async _registrarRapido(datos) {
    const botones = this.shadowRoot.querySelectorAll("#chips-toma button");
    botones.forEach((x) => { x.disabled = true; });
    try {
      const r = await this._accion(() => this._servicio("registrar_toma", { ...datos, fuente: "app" }, true));
      const b = r.biberon;
      this._aviso(t("Tomó {c} · biberón {a}/{b}", { c: cant(r.oz_registradas, 2), a: cantN(b.consumido, 2), b: cant(b.oz, 2) })
        + (r.biberon_nuevo && r.anterior ? ` · ${t("se empezó un biberón nuevo")}` : ""));
    } finally { botones.forEach((x) => { x.disabled = false; }); }
  }

  async _nuevoBiberon() {
    // El tamaño sale de Ajustes (oz por biberón); el anterior queda incompleto
    const r = await this._accion(() => this._servicio("nuevo_biberon", {}, true));
    const a = r.anterior;
    this._aviso(t("Biberón nuevo de {c}", { c: cant(r.biberon.oz, 1) })
      + (a && a.estado === "incompleto" ? ` · ${t("el anterior quedó en {a}/{b}", { a: cantN(a.consumido, 2), b: cant(a.oz, 2) })}` : ""));
  }

  _pintarResumen() {
    this._pintarHero();
    this._pintarBiberon();
    this._pintarPanal();
    const k = this.shadowRoot.getElementById("kpis"); if (!k) return;
    const ozHoy = this._num("oz_hoy") ?? 0, meta = this._num("meta_oz_dia");
    const avance = meta ? Math.min(100, Math.round(ozHoy / meta * 100)) : 0;
    const pct = this._num("pct_terminados"), ritmo = this._num("ritmo_oz_hora");
    const ph = this._st("panales_hoy"), tp = ph ? ph.attributes : {};
    k.innerHTML = `
      ${this._htmlMetaHoy(ozHoy) || `<div class="kpi completo">
        <div class="etq">${t("Hoy: {a} de {b} · {c} tomas · {d} biberones · {e} pañales", { a: cantN(ozHoy, 1), b: cant(meta, 1), c: this._val("tomas_hoy") ?? 0, d: this._val("biberones_hoy") ?? 0, e: this._val("panales_hoy") ?? 0 })}</div>
        <div class="progreso"><div style="width:${avance}%"></div></div>
        <div class="sub">${t("{p}% de la meta", { p: avance })} · ${Math.round(ozHoy * ML_POR_OZ)} ml</div>
      </div>`}
      <div class="kpi"><div class="etq">${t("Ritmo (últimas 24 h)")}</div><div class="num">${cantN(ritmo, 2)} <small>${U()}/h</small></div>
        <div class="sub">${t("meta")} ${meta ? cant(meta / 24, 2) : "—"}/h</div></div>
      <div class="kpi"><div class="etq">${t("Por toma (7 d)")}</div><div class="num">${cantN(this._num("oz_por_toma"), 2)} <small>${U()}</small></div>
        <div class="sub">${t("{n} tomas/día · cada {h} h", { n: num(this._num("tomas_por_dia"), 1), h: num(this._num("intervalo"), 1) })}</div></div>
      <div class="kpi"><div class="etq">${t("Pañales hoy")}</div><div class="num sm">💧 ${tp.pipi ?? 0} · 💩 ${tp.popo ?? 0} · ${t("ambos")} ${tp.ambos ?? 0}</div>
        <div class="sub">${t("{n}/día (7 d) · cada {h} h", { n: num(this._num("panales_por_dia"), 1), h: num(this._num("intervalo_panales"), 1) })}</div></div>
      <div class="kpi"><div class="etq">${t("Biberones terminados (7 d)")}</div><div class="num">${pct === null ? "—" : `${pct}<small>%</small>`}</div>
        <div class="sub">${t("desechado")} ${cant(this._num("desechado_7d"), 1)}</div></div>
      <div class="kpi"><div class="etq">${t("Edad")}</div><div class="num sm">${edadTexto(this._val("edad"))}</div></div>
      <div class="kpi"><div class="etq">${t("Peso · Talla")}</div><div class="num sm">${num(this._num("peso"), 2)} kg · ${num(this._num("talla"), 1)} cm</div></div>`;
  }

  // Avance del día contra dos metas: mínimo e ideal (la menor y la mayor entre la del pediatra y la de peso)
  _htmlMetaHoy(ozHoy) {
    const s = this._st("referencia_ahora");
    if (!s || ["unknown", "unavailable"].includes(s.state)) return "";
    const r = { esperado_minimo: Number(s.state), ...s.attributes };
    const pctDe = (v) => Math.max(0, Math.min(100, v / r.meta_ideal * 100));
    const rango = (a, b) => (a === b ? `~${cant(a, 1)}` : `~${cantN(a, 1)}–${cant(b, 1)}`);
    const una = r.meta_minimo === r.meta_ideal;
    const fuenteMin = r.fuente_minimo === "peso" ? t("por peso") : t("pediatra");
    const fuenteIdeal = r.fuente_minimo === "peso" ? t("pediatra") : t("por peso");
    const estados = {
      ideal: ["✅", una ? t("Va al ritmo de la meta") : t("Va al ritmo del ideal")],
      minimo: ["🟡", t("Arriba del mínimo, abajo del ideal")],
      atrasado: ["🔴", una ? t("Va abajo de la meta ({d})", { d: cant(r.diferencia_minimo, 1) }) : t("Va abajo del mínimo ({d})", { d: cant(r.diferencia_minimo, 1) })],
    };
    const [icono, texto] = r.logro_hoy === 2 ? ["🎉", una ? t("Ya cumplió la meta del día") : t("Ya cumplió el ideal del día")]
      : r.logro_hoy === 1 && !una ? ["✅", t("Ya cumplió el mínimo del día")] : estados[r.estado] || estados.minimo;
    const porToma = (v) => (v === null || v === undefined ? "—" : v === 0 ? "✓"
      : v > r.tope_por_toma ? t("más de {c} (no alcanza sin forzar)", { c: cant(r.tope_por_toma, 1) }) : `~${cant(v, 1)}`);
    const dias = r.dias_7d || [];
    return `
      <div class="kpi completo">
        <div class="etq">${t("Hoy: {a} · {c} tomas · {d} biberones · {e} pañales", { a: cant(ozHoy, 1), c: this._val("tomas_hoy") ?? 0, d: this._val("biberones_hoy") ?? 0, e: this._val("panales_hoy") ?? 0 })}</div>
        <div class="progreso ref" title="${t("Zona sombreada: dónde debería ir a esta hora")}">
          <div class="relleno ${r.estado}" style="width:${pctDe(ozHoy)}%"></div>
          <div class="banda" style="left:${pctDe(r.esperado_minimo)}%;width:${Math.max(1, pctDe(r.esperado_ideal) - pctDe(r.esperado_minimo))}%"></div>
          ${una ? "" : `<div class="marca" style="left:${pctDe(r.meta_minimo)}%"></div>`}
        </div>
        <div class="estado-ref ${r.estado}">${icono} ${texto}</div>
        <div class="sub">${t("A esta hora debería llevar {r}", { r: rango(r.esperado_minimo, r.esperado_ideal) })}</div>
        <div class="sub">${una
          ? t("Meta del día: {a} ({f})", { a: cant(r.meta_minimo, 1), f: t("pediatra") }) + ` · ${t("registra su peso para tener también la referencia por peso")}`
          : t("Meta del día: mínimo {a} ({fa}) · ideal {b} ({fb})", { a: cant(r.meta_minimo, 1), fa: fuenteMin, b: cant(r.meta_ideal, 1), fb: fuenteIdeal })}</div>
        ${r.tomas_restantes ? `<div class="sub">${una
          ? t("Para llegar: {a} por toma en {n} tomas", { a: porToma(r.por_toma_minimo), n: r.tomas_restantes })
          : t("Para llegar: mínimo {a} · ideal {b} por toma en {n} tomas", { a: porToma(r.por_toma_minimo), b: porToma(r.por_toma_ideal), n: r.tomas_restantes })}</div>` : ""}
        ${(r.proximas || []).length ? `<div class="proximas">${r.proximas.map((p) =>
          `<span class="chip-ref"><b>${hora(p.hora)}</b> ${rango(p.minimo, p.ideal)}</span>`).join("")}</div>` : ""}
        ${dias.length ? `<div class="dias7"><span class="sub">${t("Últimos {n} días", { n: dias.length })}</span>
          ${dias.map((d) => `<span class="punto l${d.logro}" title="${DIAS[new Date(`${d.fecha}T12:00`).getDay()]} ${d.fecha.slice(8)}: ${cant(d.oz, 1)}"></span>`).join("")}
          <span class="sub">${una ? t("meta {a}/{n}", { a: r.dias_minimo_7d, n: dias.length })
            : t("mínimo {a}/{n} · ideal {b}/{n}", { a: r.dias_minimo_7d, b: r.dias_ideal_7d, n: dias.length })}</span></div>` : ""}
      </div>`;
  }

  // Lo más importante: última toma y siguiente
  _pintarHero() {
    const el = this.shadowRoot.getElementById("hero"); if (!el) return;
    const ultima = this._st("ultima_toma"), prox = this._val("proxima_toma");
    const u = ultima && !["unknown", "unavailable"].includes(ultima.state) ? ultima : null;
    const vencida = prox && new Date(prox) < new Date();
    el.innerHTML = `
      <div class="hero-col">
        <div class="etq">${t("Última toma")}</div>
        <div class="hero-hora">${u ? hora(u.state) : "—"}</div>
        <div class="sub">${u ? `${relativo(u.state)} · ${cant(u.attributes.oz_tomadas, 2)}` : t("Sin registros")}</div>
      </div>
      <div class="hero-col ${vencida ? "vencida" : ""}">
        <div class="etq">${t("Siguiente toma")}</div>
        <div class="hero-hora">${prox ? hora(prox) : "—"}</div>
        <div class="sub">${prox ? (vencida ? `${t("ya toca")} · ${relativo(prox)}` : relativo(prox)) : ""}</div>
      </div>`;
  }

  // ---------- Pañales ----------
  _pintarPanal() {
    const el = this.shadowRoot.getElementById("panal"); if (!el) return;
    const u = this._st("ultimo_panal"), pipi = this._val("ultimo_pipi");
    const ok = u && !["unknown", "unavailable"].includes(u.state);
    const a = ok ? u.attributes : {};
    el.innerHTML = `
      <div class="fila-titulo"><h2>🧷 ${t("Pañal")}</h2>
        <span class="sub">${ok ? `${t("último")} ${hora(u.state)} (${relativo(u.state)}) · ${TIPOS_PANAL[a.tipo] || ""}${a.color ? ` · ${NOMBRE_COLOR[a.color] || a.color}` : ""}` : t("sin registros")}</span></div>
      ${pipi ? `<div class="sub">${t("Último pipí")} ${relativo(pipi)}</div>` : ""}
      <div class="chips grandes" id="chips-panal">
        <button class="chip" data-p="pipi">${TIPOS_PANAL.pipi}</button>
        <button class="chip" data-p="popo">${TIPOS_PANAL.popo}</button>
        <button class="chip" data-p="ambos">${TIPOS_PANAL.ambos}</button>
      </div>`;
    el.querySelector("#chips-panal").onclick = (e) => {
      const b = e.target.closest("button[data-p]"); if (!b) return;
      this._registrarPanal(b.dataset.p);
    };
  }

  async _registrarPanal(tipo, fin = null) {
    let extra = {};
    if (tipo !== "pipi") {
      extra = await this._preguntarPopo();
      if (!extra) return;
    }
    const datos = { tipo, fuente: "app", ...extra, ...(fin ? { fin } : {}) };
    const p = await this._accion(() => this._servicio("registrar_panal", datos, true));
    this._aviso(`${t("Pañal registrado:")} ${TIPOS_PANAL[p.tipo]}${p.color ? ` · ${NOMBRE_COLOR[p.color]}` : ""}${this._avisoColor(p.color)}`);
    return p;
  }

  _avisoColor(color) {
    const dias = this._num("edad") ?? 99;
    if (color === "rojo" || color === "blanco" || (color === "negro" && dias > 5)) {
      return ` — ${t("este color conviene comentarlo con el pediatra")}`;
    }
    return "";
  }

  // Color y consistencia de la popó; devuelve {color, consistencia} o null si se cancela
  _preguntarPopo(actual = {}) {
    return new Promise((resolver) => {
      // Preselecciona la popó habitual configurada para el bebé (Configurar)
      const sel = { color: actual.color || this._cfg.color_popo || null,
                    consistencia: actual.consistencia || this._cfg.consistencia_popo || null };
      const { dlg, cerrar } = this._modal(`
        <h2>${t("¿Cómo fue la popó?")}</h2>
        <div class="etq">${t("Color")}</div>
        <div class="chips" id="op-color">${COLORES.map(([k, e, c]) =>
          `<button class="chip ${sel.color === k ? "activa" : ""}" data-c="${k}"><span class="muestra" style="background:${c}"></span>${e}</button>`).join("")}</div>
        <div class="etq sep-etq">${t("Consistencia")}</div>
        <div class="chips" id="op-cons">${CONSISTENCIAS.map(([k, e]) =>
          `<button class="chip ${sel.consistencia === k ? "activa" : ""}" data-k="${k}">${e}</button>`).join("")}</div>
        <div class="botones"><span class="flex"></span>
          <button class="secundario" id="cancelar">${t("Cancelar")}</button>
          <button class="primario" id="ok-popo">${t("Guardar")}</button></div>`);
      const marcar = (cont, attr, val) => cont.querySelectorAll("button").forEach((x) => x.classList.toggle("activa", x.dataset[attr] === val));
      dlg.querySelector("#op-color").onclick = (e) => { const b = e.target.closest("[data-c]"); if (!b) return; sel.color = b.dataset.c; marcar(dlg.querySelector("#op-color"), "c", sel.color); };
      dlg.querySelector("#op-cons").onclick = (e) => { const b = e.target.closest("[data-k]"); if (!b) return; sel.consistencia = b.dataset.k; marcar(dlg.querySelector("#op-cons"), "k", sel.consistencia); };
      dlg.querySelector("#ok-popo").onclick = () => {
        if (!sel.color || !sel.consistencia) { this._aviso(t("Elige color y consistencia (o \"No sé\")")); return; }
        cerrar(); resolver(sel);
      };
      dlg.querySelector("#cancelar").onclick = () => { cerrar(); resolver(null); };
      dlg.querySelector(".fondo").addEventListener("click", (e) => { if (e.target.classList.contains("fondo")) resolver(null); });
    });
  }

  _editarPanal(p, base) {
    const nuevo = !p;
    const datos = nuevo
      ? { tipo: "pipi", fin: aInputLocal(base), color: this._cfg.color_popo, consistencia: this._cfg.consistencia_popo }
      : { ...p, fin: aInputLocal(new Date(p.fin)) };
    const { dlg, cerrar } = this._modal(`
      <h2>${nuevo ? t("Nuevo pañal") : t("Pañal de las {h}", { h: hora(p.fin) })}</h2>
      <form class="form" id="form-panal" onsubmit="return false">
        <label class="completo">${t("Hora")}<input type="datetime-local" name="fin" value="${datos.fin}"></label>
        <label class="completo">${t("Tipo")}<select name="tipo">${Object.entries(TIPOS_PANAL).map(([k, v]) => `<option value="${k}" ${k === datos.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>${t("Color")}<select name="color"><option value="">—</option>${COLORES.map(([k, e]) => `<option value="${k}" ${k === datos.color ? "selected" : ""}>${e}</option>`).join("")}</select></label>
        <label>${t("Consistencia")}<select name="consistencia"><option value="">—</option>${CONSISTENCIAS.map(([k, e]) => `<option value="${k}" ${k === datos.consistencia ? "selected" : ""}>${e}</option>`).join("")}</select></label>
        <label class="completo">${t("Nota")}<input type="text" name="nota" value="${esc(datos.nota || "")}"></label>
      </form>
      <div class="botones">${nuevo ? "" : `<button class="peligro" id="borrar-panal">${t("Borrar")}</button>`}<span class="flex"></span>
        <button class="secundario" id="cancelar">${t("Cancelar")}</button><button class="primario" id="guardar-panal">${t("Guardar")}</button></div>`);
    const listo = () => { cerrar(); if (this._tab === "tomas") this._cargarTomas(); };
    dlg.querySelector("#guardar-panal").onclick = async () => {
      const f = dlg.querySelector("#form-panal");
      const d = { fin: aServicio(f.fin.value), tipo: f.tipo.value };
      if (d.tipo !== "pipi") {
        if (!f.color.value || !f.consistencia.value) { this._aviso(t("Para popó elige color y consistencia (o \"No sé\")")); return; }
        d.color = f.color.value; d.consistencia = f.consistencia.value;
      }
      if (f.nota.value.trim()) d.nota = f.nota.value.trim();
      if (nuevo) await this._accion(() => this._servicio("registrar_panal", { ...d, fuente: "app" }, true), t("Pañal agregado") + this._avisoColor(d.color));
      else await this._accion(() => this._servicio("corregir_panal", { id: p.id, ...d }, true), t("Pañal actualizado") + this._avisoColor(d.color));
      listo();
    };
    const b = dlg.querySelector("#borrar-panal");
    if (b) b.onclick = async () => {
      if (!confirm(t("¿Borrar este pañal?"))) return;
      await this._accion(() => this._servicio("borrar_panal", { id: p.id }, true), t("Pañal borrado"));
      listo();
    };
  }

  _eventosHoy() {
    const r = this.shadowRoot;
    r.getElementById("guardar-nueva").addEventListener("click", async () => {
      const f = r.getElementById("form-nueva");
      let datos = this._leerForm(f, true);
      if (!datos) return;
      datos = await this._tomaMaterna(datos);
      if (!datos) return;
      await this._accion(() => this._servicio("registrar_toma", { ...datos, fuente: "app" }, true), t("Toma guardada"));
      r.getElementById("detalle").open = false;
    });
  }

  // ---------- Formulario de toma ----------
  _formToma(tm, id, conNuevo = false) {
    return `<form class="form" id="form-${id}" onsubmit="return false">
      <label class="completo">${t("Hora")}<input type="datetime-local" name="fin" value="${tm.fin}" required></label>
      <label>${t("Tomó")} (${U()})<input type="number" name="oz_tomadas" step="${PASO()}" min="${PASO()}" max="${MAXC()}" inputmode="decimal" value="${tm.oz_tomadas === "" || tm.oz_tomadas == null ? "" : cantN(tm.oz_tomadas, 2)}" required></label>
      <label>${t("Tipo")}<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === tm.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="completo">${t("Nota")}<input type="text" name="nota" value="${esc(tm.nota || "")}" placeholder="${t("opcional")}"></label>
      ${conNuevo ? `<label class="check completo"><input type="checkbox" name="nuevo_biberon"> ${t("Es de un biberón nuevo")}</label>` : ""}
    </form>`;
  }

  _leerForm(f, conNuevo = false) {
    if (!f.fin.value) { this._aviso(t("Indica la hora")); return null; }
    const oz = aOz(parseFloat(String(f.oz_tomadas.value).replace(",", ".")));
    if (!(oz > 0 && oz <= 12)) { this._aviso(t("Indica cuánto tomó")); return null; }
    const d = { fin: aServicio(f.fin.value), oz_tomadas: oz, tipo: f.tipo.value };
    if (f.nota.value.trim()) d.nota = f.nota.value.trim();
    if (conNuevo && f.nuevo_biberon && f.nuevo_biberon.checked) d.nuevo_biberon = true;
    return d;
  }

  // ---------- Tomas por día, agrupadas por biberón ----------
  async _cargarTomas() {
    const cont = this.shadowRoot.getElementById("tomas"); if (!cont) return;
    const desde = this._dia, hasta = sumarDias(this._dia, 1);
    let tomas = [], biberones = [], panales = [];
    try {
      const rango = { desde: `${fechaISO(desde)} 00:00:00`, hasta: `${fechaISO(hasta)} 00:00:00` };
      tomas = (await this._servicio("listar_tomas", rango, true)).tomas;
      panales = (await this._servicio("listar_panales", rango, true)).panales;
      biberones = (await this._servicio("listar_biberones",
        { desde: `${fechaISO(sumarDias(desde, -1))} 00:00:00`, hasta: rango.hasta }, true)).biberones;
    } catch (e) { this._aviso(`${t("Error al cargar")}: ${e.message}`); }
    this._tomasDia = tomas;
    this._bibs = Object.fromEntries(biberones.map((b) => [b.id, b]));
    const grupos = [];
    tomas.forEach((tm) => {
      let g = grupos.find((x) => x.id === (tm.biberon_id || 0));
      if (!g) { g = { id: tm.biberon_id || 0, b: this._bibs[tm.biberon_id], tomas: [] }; grupos.push(g); }
      g.tomas.push(tm);
    });
    const total = tomas.reduce((s, tm) => s + tm.oz_tomadas, 0);
    const meta = this._num("meta_oz_dia");
    const esHoy = fechaISO(this._dia) === fechaISO(new Date());
    const ESTADO = { abierto: t("En curso"), terminado: t("Terminado"), incompleto: t("Incompleto") };
    cont.innerHTML = `
      <div class="navdia">
        <button id="prev" aria-label="${t("Día anterior")}">‹</button>
        <input type="date" id="fecha" value="${fechaISO(this._dia)}" max="${fechaISO(new Date())}">
        <button id="next" aria-label="${t("Día siguiente")}" ${esHoy ? "disabled" : ""}>›</button>
        ${esHoy ? "" : `<button id="hoy" class="chip">${t("Hoy")}</button>`}
      </div>
      <section class="tarjeta">
        <div class="resumen-dia">
          <div><b>${cantN(total, 1)}</b> ${U()}${meta ? ` ${t("de")} ${cantN(meta, 1)}` : ""}</div>
          <div><b>${tomas.length}</b> ${t("tomas")}</div>
          <div><b>${grupos.filter((g) => g.id).length}</b> ${t("biberones")}</div>
        </div>
        ${grupos.length ? grupos.slice().reverse().map((g) => `
          <div class="grupo">
            ${g.b ? `<div class="bib-cab" data-bib="${g.b.id}">
                <span>🍼 <b>${cantN(g.b.consumido, 2)} / ${cant(g.b.oz, 2)}</b> ${TIPOS[g.b.tipo] || ""}</span>
                <span class="badge ${g.b.estado}">${ESTADO[g.b.estado] || g.b.estado}</span>
                <span class="sub">${g.b.estado === "incompleto" ? t("se desecharon {c}", { c: cant(g.b.desechado, 2) }) : g.b.estado === "abierto" ? t("quedan {c}", { c: cant(g.b.restante, 2) }) : ""}</span>
              </div>` : `<div class="bib-cab"><span class="sub">${t("Sin biberón")}</span></div>`}
            <ul class="lista">${g.tomas.slice().reverse().map((tm) => `
              <li data-id="${tm.id}">
                <span class="hora">${hora(tm.fin)}</span>
                <span class="oz">${cant(tm.oz_tomadas, 2)}</span>
                <span class="meta-t">${TIPOS[tm.tipo] || tm.tipo}${tm.nota ? ` · ${esc(tm.nota)}` : ""}</span>
                <span class="badge ${tm.confianza}">${CONFIANZAS[tm.confianza] || tm.confianza}</span>
                <span class="fuente">${FUENTES[tm.fuente] || esc(tm.fuente || "")}</span>
              </li>`).join("")}</ul>
          </div>`).join("") : `<p class="vacio">${t("Sin tomas este día.")}</p>`}
        <button class="secundario" id="agregar">${t("+ Agregar toma a este día")}</button>
      </section>
      <section class="tarjeta">
        <div class="fila-titulo"><h2>🧷 ${t("Pañales del día")}</h2><span class="sub">${panales.length} · 💧 ${panales.filter((x) => x.tipo === "pipi").length} · 💩 ${panales.filter((x) => x.tipo === "popo").length} · ${t("ambos")} ${panales.filter((x) => x.tipo === "ambos").length}</span></div>
        ${panales.length ? `<ul class="lista">${panales.slice().reverse().map((x) => `
          <li data-panal="${x.id}">
            <span class="hora">${hora(x.fin)}</span>
            <span class="oz">${TIPOS_PANAL[x.tipo] || x.tipo}</span>
            <span class="meta-t">${x.color ? `${NOMBRE_COLOR[x.color] || x.color} · ${NOMBRE_CONS[x.consistencia] || x.consistencia || ""}` : ""}${x.nota ? ` · ${esc(x.nota)}` : ""}</span>
            <span class="fuente">${esc(x.registrado_por || "")}</span>
          </li>`).join("")}</ul>` : `<p class="vacio">${t("Sin pañales este día.")}</p>`}
        <button class="secundario" id="agregar-panal">${t("+ Agregar pañal a este día")}</button>
      </section>`;
    const $ = (id) => cont.querySelector(`#${id}`);
    $("prev").onclick = () => { this._dia = sumarDias(this._dia, -1); this._cargarTomas(); };
    if (!esHoy) {
      $("next").onclick = () => { this._dia = sumarDias(this._dia, 1); this._cargarTomas(); };
      $("hoy").onclick = () => { this._dia = inicioDia(new Date()); this._cargarTomas(); };
    }
    $("fecha").onchange = (e) => { if (e.target.value) { this._dia = inicioDia(new Date(e.target.value + "T00:00")); this._cargarTomas(); } };
    cont.querySelectorAll("li[data-id]").forEach((li) => {
      li.onclick = () => this._editarToma(this._tomasDia.find((tm) => tm.id === Number(li.dataset.id)));
    });
    cont.querySelectorAll("[data-bib]").forEach((el) => {
      el.onclick = () => this._editarBiberon(this._bibs[Number(el.dataset.bib)]);
    });
    $("agregar").onclick = () => {
      const base = esHoy ? new Date() : new Date(this._dia.getTime() + 12 * 3600 * 1000);
      this._editarToma(null, base);
    };
    this._panalesDia = panales;
    cont.querySelectorAll("li[data-panal]").forEach((li) => {
      li.onclick = () => this._editarPanal(this._panalesDia.find((x) => x.id === Number(li.dataset.panal)));
    });
    $("agregar-panal").onclick = () => {
      const base = esHoy ? new Date() : new Date(this._dia.getTime() + 12 * 3600 * 1000);
      this._editarPanal(null, base);
    };
  }

  _modal(html) {
    const dlg = this.shadowRoot.getElementById("dialogo");
    dlg.innerHTML = `<div class="fondo"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    const cerrar = () => { dlg.innerHTML = ""; };
    dlg.querySelector(".fondo").addEventListener("click", (e) => { if (e.target.classList.contains("fondo")) cerrar(); });
    const c = dlg.querySelector("#cancelar"); if (c) c.onclick = cerrar;
    return { dlg, cerrar };
  }

  _editarToma(tm, base) {
    const nueva = !tm;
    const datos = nueva
      ? { fin: aInputLocal(base), oz_tomadas: "", tipo: "formula" }
      : { ...tm, fin: aInputLocal(new Date(tm.fin)) };
    const { dlg, cerrar } = this._modal(`
      <h2>${nueva ? t("Nueva toma") : t("Toma de las {h}", { h: hora(tm.fin) })}</h2>
      ${this._formToma(datos, "edit", nueva)}
      ${nueva ? "" : `<label class="conf">${t("Confianza")}<select id="confianza">${Object.entries(CONFIANZAS)
        .map(([k, v]) => `<option value="${k}" ${k === tm.confianza ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <p class="sub">${t("Registrada por")} ${esc(tm.registrado_por || "—")} · ${FUENTES[tm.fuente] || esc(tm.fuente || "")}</p>
      <div class="botones mover">
        <button class="secundario" id="mover-nuevo">${t("Mover a biberón nuevo")}</button>
        <button class="secundario" id="mover-anterior">${t("Unir al biberón anterior")}</button>
      </div>`}
      <div class="botones">
        ${nueva ? "" : `<button class="peligro" id="borrar">${t("Borrar")}</button>`}
        <span class="flex"></span>
        <button class="secundario" id="cancelar">${t("Cancelar")}</button>
        <button class="primario" id="guardar">${t("Guardar")}</button>
      </div>`);
    const f = dlg.querySelector("#form-edit");
    const conf = dlg.querySelector("#confianza");
    if (conf) f.addEventListener("input", (e) => { if (e.target.name === "oz_tomadas") conf.value = "exacto"; });
    const listo = (msg) => (async () => { cerrar(); this._cargarTomas(); if (msg) this._aviso(msg); })();
    dlg.querySelector("#guardar").onclick = async () => {
      let d = this._leerForm(f, nueva); if (!d) return;
      if (nueva) {
        d = await this._tomaMaterna(d); if (!d) return;
        await this._accion(() => this._servicio("registrar_toma", { ...d, fuente: "app" }, true), t("Toma agregada"));
      } else {
        d.confianza = conf.value;
        if (!d.nota) d.nota = "";
        await this._accion(() => this._servicio("corregir_toma", { id: tm.id, ...d }, true), t("Toma actualizada"));
      }
      listo();
    };
    if (nueva) return;
    dlg.querySelector("#borrar").onclick = async () => {
      if (!confirm(t("¿Borrar la toma de las {h} ({c})?", { h: hora(tm.fin), c: cant(tm.oz_tomadas, 2) }))) return;
      await this._accion(() => this._servicio("borrar_toma", { id: tm.id }, true), t("Toma borrada"));
      listo();
    };
    dlg.querySelector("#mover-nuevo").onclick = async () => {
      await this._accion(() => this._servicio("corregir_toma", { id: tm.id, mover: "nuevo" }, true),
        t("Movida (con las siguientes del mismo biberón) a un biberón nuevo"));
      listo();
    };
    dlg.querySelector("#mover-anterior").onclick = async () => {
      await this._accion(() => this._servicio("corregir_toma", { id: tm.id, mover: "anterior" }, true), t("Unida al biberón anterior"));
      listo();
    };
  }

  _editarBiberon(b) {
    if (!b) return;
    const { dlg, cerrar } = this._modal(`
      <h2>${t("Biberón de las {h}", { h: hora(b.preparado) })}</h2>
      <p class="sub">${t(b.n_tomas === 1 ? "{a} de {b} en 1 toma" : "{a} de {b} en {n} tomas", { a: cantN(b.consumido, 2), b: cant(b.oz, 2), n: b.n_tomas })}
        ${b.primera_toma ? ` · ${hora(b.primera_toma)}–${hora(b.ultima_toma)}` : ""}</p>
      <form class="form" id="form-bib" onsubmit="return false">
        <label>${t("Tamaño")} (${U()})<input type="number" name="oz" step="${PASO()}" min="${PASO()}" max="${MAXC()}" inputmode="decimal" value="${cantN(b.oz, 2)}"></label>
        <label>${t("Tipo")}<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === b.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="completo">${t("Nota")}<input type="text" name="nota" value="${esc(b.nota || "")}"></label>
      </form>
      <div class="botones">
        ${b.estado === "abierto" ? `<button class="peligro" id="cerrar-bib">${t("Cerrar (desechar {c})", { c: cant(b.restante, 2) })}</button>` : ""}
        ${b.estado === "incompleto" ? `<button class="secundario" id="reabrir-bib">${t("Reabrir")}</button>` : ""}
        <span class="flex"></span>
        <button class="secundario" id="cancelar">${t("Cancelar")}</button>
        <button class="primario" id="guardar-bib">${t("Guardar")}</button>
      </div>`);
    const listo = () => { cerrar(); this._cargarTomas(); };
    dlg.querySelector("#guardar-bib").onclick = async () => {
      const f = dlg.querySelector("#form-bib");
      const oz = aOz(parseFloat(f.oz.value));
      const d = { id: b.id, oz, tipo: f.tipo.value, nota: f.nota.value.trim() };
      if (d.tipo === "materna" && b.tipo !== "materna" && b.estado !== "reserva") {
        // Pasó a leche materna: ¿salió de la reserva? Entonces se descuenta de ella
        const rid = await this._elegirReserva(true);
        if (rid === null) return;
        if (rid !== "no") { d.reserva_id = rid; if (Math.abs(oz - b.oz) < 0.01) delete d.oz; }
      }
      await this._accion(() => this._servicio("corregir_biberon", d, true), t("Biberón actualizado"));
      listo();
    };
    const c = dlg.querySelector("#cerrar-bib");
    if (c) c.onclick = async () => { await this._accion(() => this._servicio("cerrar_biberon", { id: b.id }, true), t("Biberón cerrado")); listo(); };
    const ro = dlg.querySelector("#reabrir-bib");
    if (ro) ro.onclick = async () => { await this._accion(() => this._servicio("corregir_biberon", { id: b.id, reabrir: true }, true), t("Biberón reabierto")); listo(); };
  }

  // ---------- Ajustes ----------
  _htmlAjustes() {
    const v = (k) => this._num(k) ?? "";
    return `
      <section class="tarjeta">
        <h2>${t("Biberón e indicación del pediatra")}</h2>
        <form class="form" id="form-ajustes" onsubmit="return false">
          <label>${t("Oz por biberón")} <small>${t("(se guarda en oz)")}</small>
            <input type="number" name="oz_por_biberon" step="0.5" min="0.5" max="10" inputmode="decimal" value="${v("oz_por_biberon")}">
            <span class="ayuda">${t("Tamaño de cada biberón nuevo.")}</span></label>
          <label>${t("Fórmula empezada: límite (h)")}
            <input type="number" name="limite_biberon" step="0.25" min="0.5" max="4" inputmode="decimal" value="${v("limite_biberon")}">
            <span class="ayuda">${t("Después de esto se sugiere preparar otro.")}</span></label>
          <label>${t("Materna empezada: límite (h)")}
            <input type="number" name="limite_materna" step="0.25" min="0.5" max="4" inputmode="decimal" value="${v("limite_materna")}"></label>
          <label>${t("Materna a temp. ambiente (h)")}
            <input type="number" name="caducidad_ambiente" step="0.5" min="0.5" max="8" inputmode="decimal" value="${v("caducidad_ambiente")}"></label>
          <label>${t("Materna en refrigerador (días)")}
            <input type="number" name="caducidad_refri" step="0.5" min="0.5" max="8" inputmode="decimal" value="${v("caducidad_refri")}"></label>
          <label>${t("Meta oz por toma")}
            <input type="number" name="meta_oz_toma" step="0.5" min="0.5" max="10" inputmode="decimal" value="${v("meta_oz_toma")}"></label>
          <label>${t("Cada cuántas horas")}
            <input type="number" name="intervalo_indicado" step="0.5" min="1" max="6" inputmode="decimal" value="${v("intervalo_indicado")}"></label>
        </form>
        <p class="sub" id="prevista"></p>
        <button class="primario" id="guardar-ajustes">${t("Guardar ajustes")}</button>
      </section>
      <section class="tarjeta"><h2>${t("Lo que dicen los últimos 7 días")}</h2><div id="sugerencia" class="sub"></div></section>`;
  }

  _eventosAjustes() {
    const f = this.shadowRoot.getElementById("form-ajustes");
    const prev = () => {
      const m = parseFloat(f.meta_oz_toma.value), i = parseFloat(f.intervalo_indicado.value);
      this.shadowRoot.getElementById("prevista").textContent = (m && i)
        ? t("Meta diaria: {c} ({n} tomas al día). El recordatorio sonará {h} h después de cada toma.", { c: cant(m * 24 / i, 1), n: num(24 / i, 1), h: num(i, 1) })
        : "";
    };
    f.addEventListener("input", prev); prev();
    this.shadowRoot.getElementById("guardar-ajustes").onclick = async () => {
      const cambios = ["oz_por_biberon", "limite_biberon", "limite_materna", "caducidad_ambiente", "caducidad_refri",
        "meta_oz_toma", "intervalo_indicado"]
        .filter((k) => f[k].value !== "" && Number(f[k].value) !== this._num(k));
      if (!cambios.length) { this._aviso(t("Sin cambios")); return; }
      await this._accion(async () => {
        for (const k of cambios) {
          await this._hass.callService("number", "set_value", { entity_id: this._cfg.entidades[k], value: Number(f[k].value) });
        }
      }, t("Ajustes guardados"));
    };
    this._pintarSugerencia();
  }

  _pintarSugerencia() {
    const el = this.shadowRoot.getElementById("sugerencia"); if (!el) return;
    const ozToma = this._num("oz_por_toma"), porDia = this._num("tomas_por_dia"), pct = this._num("pct_terminados");
    const desechado = this._num("desechado_7d"), ozBib = this._num("oz_por_biberon"), meta = this._num("meta_oz_toma");
    if (ozToma === null) { el.textContent = t("Todavía no hay suficientes registros."); return; }
    const lineas = [t("Toma en promedio <b>{c}</b> por toma, unas <b>{n}</b> veces al día.", { c: cant(ozToma, 2), n: num(porDia, 1) })];
    if (pct !== null) lineas.push(t("Terminó el <b>{p}%</b> de sus biberones; se desecharon <b>{c}</b> de fórmula.", { p: pct, c: cant(desechado, 1) }));
    if (pct !== null && pct < 50 && ozBib) lineas.push(t("Muchos biberones quedan incompletos: podrían preparar menos (≈{c}) para desperdiciar menos.", { c: cant(Math.max(0.5, ozBib - 0.5), 1) }));
    if (pct !== null && pct >= 80) lineas.push(t("Se termina casi todos sus biberones: buen dato para comentar con el pediatra por si conviene aumentar."));
    if (meta && ozToma < meta * 0.6) lineas.push(t("Come en tomas pequeñas ({c} vs meta {m}): es normal que coma más seguido.", { c: cant(ozToma, 2), m: cant(meta, 1) }));
    el.innerHTML = lineas.map((l) => `<p>${l}</p>`).join("")
      + `<p class="ayuda">${t("Son referencias de tus registros; cualquier cambio de cantidad, consúltalo con su pediatra.")}</p>`;
  }

  // ---------- Leche materna: reserva y extracciones ----------
  _htmlMaterna() {
    return `
      <section class="kpis" id="kpis-materna"></section>
      <section class="tarjeta">
        <div class="fila-titulo"><h2>${t("Reserva")}</h2><span class="sub" id="reserva-total"></span></div>
        <div id="reserva"></div>
        <details id="det-guardar">
          <summary>${t("＋ Guardar biberón de leche materna")}</summary>
          <form class="form" id="form-guardar" onsubmit="return false">
            <label>${t("Cantidad")} (${U()})<input type="number" name="oz" step="${PASO()}" min="${PASO()}" max="${MAXC()}" inputmode="decimal" required></label>
            <label>${t("Dónde")}<select name="ubicacion"><option value="refrigerador">${t("Refrigerador")}</option><option value="ambiente">${t("Temperatura ambiente")}</option></select></label>
            <label class="completo">${t("Se hizo a las")}<input type="datetime-local" name="hecho" value="${aInputLocal(new Date())}"></label>
          </form>
          <button class="primario" id="btn-guardar">${t("Guardar en reserva")}</button>
        </details>
      </section>
      <section class="tarjeta">
        <h2>${t("Registrar extracción")}</h2>
        <form class="form" id="form-ext" onsubmit="return false">
          <label class="completo">${t("Terminó a las")}<input type="datetime-local" name="fin" value="${aInputLocal(new Date())}"></label>
          <label>${t("Izquierdo")} (${U()})<input type="number" name="oz_izq" step="${PASO()}" min="0" max="${MAXC()}" inputmode="decimal"></label>
          <label>${t("Derecho")} (${U()})<input type="number" name="oz_der" step="${PASO()}" min="0" max="${MAXC()}" inputmode="decimal"></label>
          <label>${t("Duración (min)")}<input type="number" name="duracion_min" step="1" min="0" max="180" inputmode="numeric"></label>
          <label>${t("Dónde se guarda")}<select name="ubicacion"><option value="refrigerador">${t("Refrigerador")}</option><option value="ambiente">${t("Temperatura ambiente")}</option></select></label>
          <label class="check completo"><input type="checkbox" name="guardar" checked> ${t("Guardar en biberones de reserva")}</label>
          <label class="completo">${t("Repartir en biberones (opcional)")}<input type="text" name="reparto" placeholder="${t("ej. 2 + 1.5  (vacío = un biberón con todo)")}"></label>
        </form>
        <button class="primario" id="btn-ext">${t("Guardar extracción")}</button>
        <h2 class="sep">${t("Extracciones recientes")}</h2>
        <div id="extracciones"></div>
      </section>`;
  }

  _pintarKpisMaterna() {
    const k = this.shadowRoot.getElementById("kpis-materna"); if (!k) return;
    const s = this._st("reserva_oz"), cad = this._val("reserva_caduca");
    const vig = s ? s.attributes.vigentes : 0, caducados = s ? s.attributes.caducados : 0;
    const mh = this._num("materna_hoy") ?? 0, fh = this._num("formula_hoy") ?? 0;
    k.innerHTML = `
      <div class="kpi"><div class="etq">${t("En reserva")}</div><div class="num">${cantN(this._num("reserva_oz"), 1)} <small>${U()}</small></div>
        <div class="sub">${t(vig === 1 ? "1 biberón" : "{n} biberones", { n: vig })}${caducados ? ` · <span class="rojo">${t(caducados === 1 ? "1 caducado" : "{n} caducados", { n: caducados })}</span>` : ""}</div></div>
      <div class="kpi"><div class="etq">${t("Próxima caducidad")}</div><div class="num sm">${cad ? `${hora(cad)}` : "—"}</div>
        <div class="sub">${cad ? relativo(cad) : ""}</div></div>
      <div class="kpi"><div class="etq">${t("Extraído hoy")}</div><div class="num">${cantN(this._num("extraido_hoy"), 1)} <small>${U()}</small></div>
        <div class="sub">${t("promedio {c}/día (7 d)", { c: cant(this._num("extraido_dia"), 1) })}</div></div>
      <div class="kpi"><div class="etq">${t("Tomó hoy")}</div><div class="num sm">${t("{a} materna · {b} fórmula", { a: cantN(mh, 1), b: cantN(fh, 1) })}</div>
        <div class="sub">${t("{p}% materna · desechada 7 d: {c}", { p: mh + fh ? Math.round(mh / (mh + fh) * 100) : 0, c: cant(this._num("materna_desechada_7d"), 1) })}</div></div>`;
  }

  async _cargarMaterna() {
    this._pintarKpisMaterna();
    const hoy = inicioDia(new Date());
    let reservas = [], ext = [];
    try {
      reservas = (await this._servicio("listar_reservas", {}, true)).reservas;
      ext = (await this._servicio("listar_extracciones",
        { desde: `${fechaISO(sumarDias(hoy, -2))} 00:00:00`, hasta: `${fechaISO(sumarDias(hoy, 1))} 00:00:00` }, true)).extracciones;
    } catch (e) { this._aviso(`${t("Error al cargar")}: ${e.message}`); }
    const r = this.shadowRoot;
    const LUGAR = { refrigerador: t("Refrigerador"), ambiente: t("Ambiente") };
    const total = reservas.filter((b) => !b.caducado).reduce((s, b) => s + b.oz, 0);
    r.getElementById("reserva-total").textContent = reservas.length ? t("{c} vigentes", { c: cant(total, 1) }) : "";
    r.getElementById("reserva").innerHTML = reservas.length ? `<ul class="lista">${reservas.map((b, i) => {
      const d = new Date(b.hecho || b.preparado);
      const pronto = b.caduca && !b.caducado && (new Date(b.caduca) - Date.now()) < 6 * 3600 * 1000;
      return `<li class="reserva ${b.caducado ? "caducada" : ""}">
        <span class="hora">${cant(b.oz, 2)}</span>
        <span class="oz">${d.getDate()} ${MESES[d.getMonth()]} ${hora(b.hecho || b.preparado)} · <span class="badge ${b.ubicacion}">${LUGAR[b.ubicacion] || "—"}</span></span>
        <span class="meta-t ${b.caducado ? "rojo" : pronto ? "naranja" : ""}">${b.caducado ? `${t("Caducó")} ${relativo(b.caduca)}` : b.caduca ? `${t("Caduca")} ${relativo(b.caduca)}` : ""}${i === 0 && !b.caducado ? ` · ${t("la más antigua")}` : ""}</span>
        <span class="acciones">
          <button class="chip" data-usar="${b.id}" ${b.caducado ? "disabled" : ""}>${t("Usar")}</button>
          <button class="chip" data-mover="${b.id}" data-a="${b.ubicacion === "refrigerador" ? "ambiente" : "refrigerador"}">${b.ubicacion === "refrigerador" ? t("A ambiente") : t("Al refri")}</button>
          <button class="chip peligro-chip" data-descartar="${b.id}">${t("Desechar")}</button>
        </span>
      </li>`;
    }).join("")}</ul>` : `<p class="vacio">${t("No hay leche materna en reserva.")}</p>`;
    r.querySelectorAll("[data-usar]").forEach((b) => b.onclick = () => this._usarReserva(Number(b.dataset.usar)));
    r.querySelectorAll("[data-mover]").forEach((b) => b.onclick = async () => {
      await this._accion(() => this._servicio("mover_reserva", { id: Number(b.dataset.mover), ubicacion: b.dataset.a }, true), t("Movido"));
      this._cargarMaterna();
    });
    r.querySelectorAll("[data-descartar]").forEach((b) => b.onclick = async () => {
      if (!confirm(t("¿Desechar este biberón de leche materna?"))) return;
      await this._accion(() => this._servicio("descartar_reserva", { id: Number(b.dataset.descartar) }, true), t("Desechado"));
      this._cargarMaterna();
    });
    r.getElementById("extracciones").innerHTML = ext.length ? `<ul class="lista">${ext.slice().reverse().map((e) => {
      const d = new Date(e.fin);
      return `<li class="medida">
        <span class="hora">${hora(e.fin)}</span>
        <span class="oz">${cant(e.oz_total, 2)}</span>
        <span class="meta-t">${DIAS[d.getDay()]} ${d.getDate()} · ${t("izq")} ${cantN(e.oz_izq, 2)} · ${t("der")} ${cantN(e.oz_der, 2)}${e.duracion_min ? ` · ${num(e.duracion_min, 0)} min` : ""}</span>
        <button class="icono" data-borrar-ext="${e.id}" aria-label="${t("Borrar")}">✕</button>
      </li>`;
    }).join("")}</ul>` : `<p class="vacio">${t("Sin extracciones en los últimos 3 días.")}</p>`;
    r.querySelectorAll("[data-borrar-ext]").forEach((b) => b.onclick = async () => {
      if (!confirm(t("¿Borrar esta extracción? También se quitan sus biberones de reserva sin usar."))) return;
      await this._accion(() => this._servicio("borrar_extraccion", { id: Number(b.dataset.borrarExt) }, true), t("Extracción borrada"));
      this._cargarMaterna();
    });
  }

  _eventosMaterna() {
    const r = this.shadowRoot;
    r.getElementById("btn-guardar").onclick = async () => {
      const f = r.getElementById("form-guardar");
      const oz = aOz(parseFloat(String(f.oz.value).replace(",", ".")));
      if (!(oz > 0)) { this._aviso(t("Indica la cantidad")); return; }
      await this._accion(() => this._servicio("guardar_leche",
        { oz, ubicacion: f.ubicacion.value, hecho: aServicio(f.hecho.value) }, true), t("Guardado en reserva"));
      f.oz.value = ""; r.getElementById("det-guardar").open = false;
      this._cargarMaterna();
    };
    r.getElementById("btn-ext").onclick = async () => {
      const f = r.getElementById("form-ext");
      const n = (x) => (x.value === "" ? null : parseFloat(String(x.value).replace(",", ".")));
      const d = { fin: aServicio(f.fin.value), guardar: f.guardar.checked, ubicacion: f.ubicacion.value };
      if (n(f.oz_izq) !== null) d.oz_izq = aOz(n(f.oz_izq));
      if (n(f.oz_der) !== null) d.oz_der = aOz(n(f.oz_der));
      if (n(f.duracion_min) !== null) d.duracion_min = n(f.duracion_min);
      if (!d.oz_izq && !d.oz_der) { this._aviso(t("Indica la cantidad de al menos un lado")); return; }
      const reparto = (f.reparto.value.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0).map(aOz);
      if (reparto.length) d.biberones = reparto;
      const res = await this._accion(() => this._servicio("registrar_extraccion", d, true));
      this._aviso(t("Extracción de {c}", { c: cant(res.oz_total, 2) }) + (res.biberones.length ? ` · ${t("{n} biberón(es) a la reserva", { n: res.biberones.length })}` : ""));
      f.oz_izq.value = ""; f.oz_der.value = ""; f.duracion_min.value = ""; f.reparto.value = "";
      f.fin.value = aInputLocal(new Date());
      this._cargarMaterna();
    };
  }

  // Si hay un biberón en curso con leche: true = dejarlo en pausa, false = tirarlo, null = cancelar
  async _preguntarPausa() {
    const b = this._biberon();
    if (!(b && b.restante > 0)) return true;
    const r = await this._elegir(
      t("Hay un biberón de {tipo} en curso ({a} de {b}). ¿Qué hacemos con él?", { tipo: TIPOS[b.tipo] || TIPOS.formula, a: cantN(b.consumido, 2), b: cant(b.oz, 2) }),
      [["pausa", t("Materna primero y guardar el actual para después"), "primario"],
       ["tirar", t("Tirar el actual ({c})", { c: cant(b.restante, 2) }), "peligro"]]);
    return r === null ? null : r === "pausa";
  }

  // Qué biberón de la reserva se usa: id, "no" (no salió de la reserva) o null (cancelar).
  // Sin conNinguna y con un solo biberón vigente, se usa ese sin preguntar.
  async _elegirReserva(conNinguna = false) {
    let rs = [];
    try { rs = (await this._servicio("listar_reservas", {}, true)).reservas.filter((b) => !b.caducado); }
    catch (e) { this._aviso(`${t("Error al cargar")}: ${e.message}`); return null; }
    if (!rs.length) return conNinguna ? "no" : null;
    rs.sort((a, b) => new Date(a.caduca || a.hecho) - new Date(b.caduca || b.hecho));  // primero la que caduca antes
    if (rs.length === 1 && !conNinguna) return rs[0].id;
    const LUGAR = { refrigerador: t("Refrigerador"), ambiente: t("Ambiente") };
    const op = rs.map((b, i) => {
      const d = new Date(b.hecho || b.preparado);
      return [String(b.id), `${cant(b.oz, 2)} · ${d.getDate()} ${MESES[d.getMonth()]} ${hora(b.hecho || b.preparado)} · ${LUGAR[b.ubicacion] || "—"}`
        + (b.caduca ? ` · ${t("Caduca")} ${relativo(b.caduca)}` : ""), i === 0 ? "primario" : "secundario"];
    });
    if (conNinguna) op.push(["no", t("No es de la reserva"), "secundario"]);
    const r = await this._elegir(t("¿Qué biberón de leche materna de la reserva se usó?"), op);
    return r === null || r === "no" ? r : Number(r);
  }

  // Toma de leche materna que empieza biberón: preguntar si salió de la reserva para descontarla
  async _tomaMaterna(d) {
    const b = this._biberon();
    if (d.tipo !== "materna" || (!d.nuevo_biberon && b && b.restante > 0 && b.tipo === "materna")) return d;
    const id = await this._elegirReserva(true);
    if (id === null) return null;
    if (id === "no") return { ...d, nuevo_biberon: true };
    const pausar = await this._preguntarPausa();
    if (pausar === null) return null;
    const { nuevo_biberon, ...resto } = d;
    return { ...resto, reserva_id: id, pausar_actual: pausar };
  }

  async _usarReserva(id) {
    if (!id) { id = await this._elegirReserva(); if (!id) return; }
    const b = this._biberon();
    const pausar = await this._preguntarPausa();
    if (pausar === null) return;
    const r = await this._accion(() => this._servicio("usar_reserva", { id, pausar_actual: pausar }, true));
    this._aviso(t("Biberón en curso: leche materna {c}", { c: cant(r.biberon.oz, 2) }) + (b && b.restante > 0 ? ` · ${pausar ? t("el anterior quedó en pausa") : t("el anterior se tiró")}` : ""));
    if (this._tab === "materna") this._cargarMaterna();
  }

  // Diálogo con opciones; devuelve la clave elegida o null si se cancela
  _elegir(texto, opciones) {
    return new Promise((resolver) => {
      const { dlg, cerrar } = this._modal(`
        <p>${esc(texto)}</p>
        <div class="opciones">${opciones.map(([k, e, c]) => `<button class="${c}" data-op="${k}">${esc(e)}</button>`).join("")}
          <button class="secundario" id="cancelar">${t("Cancelar")}</button></div>`);
      dlg.querySelectorAll("[data-op]").forEach((x) => x.onclick = () => { cerrar(); resolver(x.dataset.op); });
      dlg.querySelector("#cancelar").onclick = () => { cerrar(); resolver(null); };
      dlg.querySelector(".fondo").addEventListener("click", (e) => { if (e.target.classList.contains("fondo")) resolver(null); });
    });
  }


  // ---------- Medidas ----------
  _htmlMedidas() {
    return `
      <section class="tarjeta">
        <h2>${t("Nueva medida")}</h2>
        <form class="form" id="form-medida" onsubmit="return false">
          <label class="completo">${t("Fecha")}<input type="datetime-local" name="fecha" value="${aInputLocal(new Date())}"></label>
          <label>${t("Peso (kg)")}<input type="number" name="peso_kg" step="0.01" min="0.5" max="30" inputmode="decimal"></label>
          <label>${t("Talla (cm)")}<input type="number" name="talla_cm" step="0.1" min="20" max="130" inputmode="decimal"></label>
          <label>${t("Perímetro cefálico (cm)")}<input type="number" name="perimetro_cm" step="0.1" min="20" max="60" inputmode="decimal"></label>
          <label>${t("Nota")}<input type="text" name="nota" placeholder="${t("p. ej. cita pediatra")}"></label>
        </form>
        <button class="primario" id="guardar-medida">${t("Guardar medida")}</button>
      </section>
      <section class="tarjeta"><h2>${t("Peso (kg) por edad")}</h2><div id="g-peso"></div></section>
      <section class="tarjeta"><h2>${t("Talla (cm) por edad")}</h2><div id="g-talla"></div></section>
      <section class="tarjeta"><h2>${t("Historial")}</h2><div id="lista-medidas"></div></section>`;
  }

  _eventosMedidas() {
    const r = this.shadowRoot;
    r.getElementById("guardar-medida").onclick = async () => {
      const f = r.getElementById("form-medida");
      const d = { fecha: aServicio(f.fecha.value) };
      ["peso_kg", "talla_cm", "perimetro_cm"].forEach((k) => { if (f[k].value !== "") d[k] = parseFloat(f[k].value); });
      if (f.nota.value.trim()) d.nota = f.nota.value.trim();
      if (!d.peso_kg && !d.talla_cm && !d.perimetro_cm) { this._aviso(t("Escribe al menos peso, talla o perímetro")); return; }
      await this._accion(() => this._servicio("registrar_medida", d, true), t("Medida guardada"));
      f.reset(); f.fecha.value = aInputLocal(new Date());
      this._cargarMedidas();
    };
  }

  async _cargarMedidas() {
    try { this._medidas = (await this._servicio("listar_medidas", {}, true)).medidas; }
    catch (e) { this._aviso(`${t("Error")}: ${e.message}`); return; }
    const nac = new Date(this._cfg.nacimiento + "T00:00");
    const edad = (iso) => Math.max(0, Math.round((inicioDia(new Date(iso)) - nac) / 86400000));
    const pts = (campo) => this._medidas.filter((m) => m[campo] != null).map((m) => ({ x: edad(m.fecha), y: m[campo] }));
    const r = this.shadowRoot;
    r.getElementById("g-peso").innerHTML = linea({ puntos: pts("peso_kg"), unidad: "kg" });
    r.getElementById("g-talla").innerHTML = linea({ puntos: pts("talla_cm"), unidad: "cm" });
    const lista = r.getElementById("lista-medidas");
    lista.innerHTML = this._medidas.length ? `<ul class="lista">${this._medidas.slice().reverse().map((m) => {
      const d = new Date(m.fecha);
      return `<li class="medida">
        <span class="hora">${d.getDate()} ${MESES[d.getMonth()]}</span>
        <span class="oz">${[m.peso_kg != null ? `${num(m.peso_kg, 2)} kg` : "", m.talla_cm != null ? `${num(m.talla_cm, 1)} cm` : "",
          m.perimetro_cm != null ? `${t("PC")} ${num(m.perimetro_cm, 1)}` : ""].filter(Boolean).join(" · ")}</span>
        <span class="meta-t">${t("{n} días", { n: edad(m.fecha) })}${m.nota ? ` · ${esc(m.nota)}` : ""}</span>
        <button class="icono" data-borrar="${m.id}" aria-label="${t("Borrar")}">✕</button>
      </li>`;
    }).join("")}</ul>` : `<p class="vacio">${t("Sin medidas.")}</p>`;
    lista.querySelectorAll("[data-borrar]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm(t("¿Borrar esta medida?"))) return;
        await this._accion(() => this._servicio("borrar_medida", { id: Number(b.dataset.borrar) }, true), t("Medida borrada"));
        this._cargarMedidas();
      };
    });
  }

  // ---------- Gráficas ----------
  _htmlGraficas() {
    return `
      <div class="segmentos">
        ${[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]]
          .map(([k, e]) => `<button data-p="${k}" class="${k === this._periodo ? "activa" : ""}">${t(e)}</button>`).join("")}
      </div>
      <section class="tarjeta"><h2 id="t-oz"></h2><div id="g-oz"></div>
        <div class="leyenda"><span class="c1"></span>${TIPOS.formula} <span class="c4"></span>${TIPOS.materna} <span class="c3"></span>${t("Meta")}</div></section>
      <section class="tarjeta"><h2 id="t-tomas"></h2><div id="g-tomas"></div></section>
      <section class="tarjeta"><h2>${t("Promedio por toma")}</h2><div id="g-ozt"></div></section>
      <section class="tarjeta"><h2 id="t-bib"></h2><div id="g-bib"></div></section>
      <section class="tarjeta"><h2>${t("Biberones terminados (%)")}</h2><div id="g-term"></div></section>
      <section class="tarjeta"><h2 id="t-des"></h2><div id="g-des"></div><p class="sub" id="n-des"></p></section>
      <section class="tarjeta"><h2 id="t-ext"></h2><div id="g-ext"></div></section>
      <section class="tarjeta"><h2 id="t-pan"></h2><div id="g-pan"></div>
        <div class="leyenda"><span class="c5"></span>${t("Pipí")} <span class="c6"></span>${t("Popó")} <span class="c7"></span>${t("Ambos")}</div></section>
      <section class="tarjeta"><h2>${t("¿A qué hora come? (promedio por hora, últimos 7 días)")}</h2><div id="g-hora-oz"></div></section>
      <section class="tarjeta"><h2>${t("¿A qué hora se cambia el pañal? (promedio por hora, 7 días)")}</h2><div id="g-hora-pan"></div></section>`;
  }

  _eventosGraficas() {
    this.shadowRoot.querySelector(".segmentos").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-p]"); if (!b) return;
      this._periodo = b.dataset.p;
      this.shadowRoot.querySelectorAll(".segmentos button").forEach((x) => x.classList.toggle("activa", x === b));
      this._pintarGraficas();
    });
  }

  // Mínimo e ideal de cada día (cada día con el peso que tenía); en semanas/meses, las metas actuales
  _metasGrafica(grupos, meta) {
    const ref = this._st("referencia_ahora"), a = ref && ref.attributes;
    if (!a || a.meta_minimo === undefined) return { meta: meta ? aUnidad(meta) : null };
    const porFecha = Object.fromEntries(((this._st("oz_hoy") || {}).attributes?.serie_diaria || [])
      .filter((d) => d.meta_minimo).map((d) => [d.fecha, d]));
    const valor = (g, k) => aUnidad((this._periodo === "dia" && porFecha[fechaISO(g.a)]?.[k]) || a[k]);
    const minimos = grupos.map((g) => valor(g, "meta_minimo")), ideales = grupos.map((g) => valor(g, "meta_ideal"));
    if (minimos.every((v, i) => v === ideales[i])) return { lineas: [{ nombre: t("meta"), valores: ideales, clase: "meta" }] };
    return { lineas: [
      { nombre: t("ideal"), valores: ideales, clase: "meta" },
      { nombre: t("mínimo"), valores: minimos, clase: "meta-min", abajo: true },
    ] };
  }

  async _pintarGraficas() {
    const hoy = inicioDia(new Date());
    const p = this._periodo;
    const grupos = [];
    if (p === "dia") for (let i = 13; i >= 0; i--) {
      const a = sumarDias(hoy, -i); grupos.push({ a, b: sumarDias(a, 1), et: i === 0 ? t("hoy") : `${DIAS[a.getDay()]} ${a.getDate()}` });
    }
    if (p === "semana") {
      const lunes = sumarDias(hoy, -((hoy.getDay() + 6) % 7));
      for (let i = 11; i >= 0; i--) { const a = sumarDias(lunes, -7 * i); grupos.push({ a, b: sumarDias(a, 7), et: `${a.getDate()} ${MESES[a.getMonth()]}` }); }
    }
    if (p === "mes") for (let i = 11; i >= 0; i--) {
      const a = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      grupos.push({ a, b: new Date(a.getFullYear(), a.getMonth() + 1, 1), et: MESES[a.getMonth()] });
    }
    let tomas = [], bibs = [], extr = [], pans = [];
    try {
      const rango = { desde: `${fechaISO(grupos[0].a)} 00:00:00`, hasta: `${fechaISO(sumarDias(hoy, 1))} 00:00:00` };
      tomas = (await this._servicio("listar_tomas", rango, true)).tomas;
      bibs = (await this._servicio("listar_biberones", rango, true)).biberones;
      extr = (await this._servicio("listar_extracciones", rango, true)).extracciones;
      pans = (await this._servicio("listar_panales", rango, true)).panales;
    } catch (e) { this._aviso(`${t("Error")}: ${e.message}`); }
    const nac = inicioDia(new Date(this._cfg.nacimiento + "T00:00"));
    const primero = tomas.length ? inicioDia(new Date(tomas[0].fin)) : hoy;
    const desdeDatos = primero > nac ? primero : nac;
    const manana = sumarDias(hoy, 1);
    const agg = grupos.map((g) => {
      const dentro = (iso) => { const d = new Date(iso); return d >= g.a && d < g.b; };
      const ts = tomas.filter((tm) => dentro(tm.fin));
      const bs = bibs.filter((b) => b.estado !== "reserva" && dentro(b.preparado));
      const cerrados = bs.filter((b) => b.estado !== "abierto");
      // Días con datos en el grupo (sin contar antes del primer registro ni el futuro)
      const ini = g.a > desdeDatos ? g.a : desdeDatos, fin = g.b < manana ? g.b : manana;
      const dias = Math.max(0, Math.round((fin - ini) / 86400000));
      const div = p === "dia" ? 1 : (dias || 1);
      const exacto = ts.filter((tm) => tm.tipo !== "materna").reduce((s, tm) => s + tm.oz_tomadas, 0);
      const resto = ts.filter((tm) => tm.tipo === "materna").reduce((s, tm) => s + tm.oz_tomadas, 0);
      const ex = extr.filter((e) => dentro(e.fin)).reduce((s, e) => s + e.oz_total, 0);
      return {
        et: g.et, exacto: exacto / div, estimado: resto / div, tomas: ts.length / div,
        ozToma: ts.length ? (exacto + resto) / ts.length : 0,
        biberones: bs.length / div,
        pct: cerrados.length ? cerrados.filter((b) => b.estado === "terminado").length / cerrados.length * 100 : 0,
        desechado: bs.reduce((s, b) => s + (b.desechado || 0), 0) / div,
        extraido: ex / div,
        pipi: pans.filter((x) => x.tipo === "pipi" && dentro(x.fin)).length / div,
        popo: pans.filter((x) => x.tipo === "popo" && dentro(x.fin)).length / div,
        ambos: pans.filter((x) => x.tipo === "ambos" && dentro(x.fin)).length / div,
      };
    });
    const meta = this._num("meta_oz_dia"), intervalo = this._num("intervalo_indicado"), ozMeta = this._num("meta_oz_toma");
    const etiquetas = agg.map((x) => x.et);
    const suf = p === "dia" ? t("por día") : t("promedio por día");
    const r = this.shadowRoot, color = "var(--primary-color)";
    const EN_OZ = ["exacto", "estimado", "ozToma", "desechado", "extraido"];
    const serie = (clave, nombre, c, op) => ({ nombre, valores: agg.map((x) => (EN_OZ.includes(clave) ? aUnidad(x[clave]) : x[clave])), color: c, opacidad: op });
    r.getElementById("t-oz").textContent = `${esMl() ? "ml" : t("Oz")} ${suf}`;
    r.getElementById("g-oz").innerHTML = barras({ etiquetas, unidad: U(), ...this._metasGrafica(grupos, meta),
      series: [serie("exacto", TIPOS.formula, color), serie("estimado", TIPOS.materna, "var(--materna-color, #e91e63)")] });
    r.getElementById("t-tomas").textContent = `${t("Tomas")} ${suf}`;
    r.getElementById("g-tomas").innerHTML = barras({ etiquetas, unidad: t("tomas"), meta: intervalo ? 24 / intervalo : null,
      series: [serie("tomas", t("tomas"), "var(--accent-color, #ff9800)")] });
    r.getElementById("g-ozt").innerHTML = barras({ etiquetas, unidad: U(), meta: ozMeta ? aUnidad(ozMeta) : null, alto: 150,
      series: [serie("ozToma", t("por toma"), "var(--success-color, #43a047)")] });
    r.getElementById("t-bib").textContent = `${t("Biberones")} ${suf}`;
    r.getElementById("g-bib").innerHTML = barras({ etiquetas, unidad: t("biberones"), alto: 150,
      series: [serie("biberones", t("biberones"), "var(--info-color, #039be5)")] });
    r.getElementById("g-term").innerHTML = barras({ etiquetas, unidad: "%", alto: 150,
      series: [serie("pct", t("terminados"), "var(--success-color, #43a047)")] });
    r.getElementById("t-des").textContent = `${t("Fórmula desechada")} (${U()} ${suf})`;
    r.getElementById("g-des").innerHTML = barras({ etiquetas, unidad: U(), alto: 150,
      series: [serie("desechado", t("desechado"), "var(--warning-color, #ff9800)")] });
    r.getElementById("t-ext").textContent = `${t("Leche extraída")} (${U()} ${suf})`;
    r.getElementById("g-ext").innerHTML = barras({ etiquetas, unidad: U(), alto: 150,
      series: [serie("extraido", t("extraída"), "var(--materna-color, #e91e63)")] });
    r.getElementById("t-pan").textContent = `${t("Pañales")} ${suf}`;
    r.getElementById("g-pan").innerHTML = barras({ etiquetas, unidad: t("pañales"), alto: 160,
      series: [serie("pipi", t("pipí"), "#29b6f6"), serie("popo", t("popó"), "#8d6e63"), serie("ambos", t("ambos"), "#ab47bc")] });
    // Distribución por hora del día (últimos 7 días completos + hoy)
    const hace7 = sumarDias(hoy, -6);
    const t7 = tomas.filter((tm) => new Date(tm.fin) >= hace7), p7 = pans.filter((x) => new Date(x.fin) >= hace7);
    const dias7 = Math.max(1, Math.min(7, Math.round((sumarDias(hoy, 1) - (desdeDatos > hace7 ? desdeDatos : hace7)) / 86400000)));
    const horas = [...Array(24).keys()];
    const porHora = (lista, f) => horas.map((h) => lista.filter((x) => new Date(x.fin).getHours() === h).reduce((s, x) => s + f(x), 0) / dias7);
    const etH = horas.map((h) => (h % 3 === 0 ? `${h}h` : ""));
    r.getElementById("g-hora-oz").innerHTML = barras({ etiquetas: etH, unidad: U(), alto: 150,
      series: [{ nombre: U(), valores: porHora(t7, (tm) => aUnidad(tm.oz_tomadas)), color: "var(--primary-color)" }] });
    r.getElementById("g-hora-pan").innerHTML = barras({ etiquetas: etH, unidad: t("pañales"), alto: 140,
      series: [{ nombre: t("pañales"), valores: porHora(p7, () => 1), color: "#8d6e63" }] });
    const totalDes = bibs.reduce((s, b) => s + (b.desechado || 0), 0);
    r.getElementById("n-des").textContent = t("Total en el periodo: {c} en {n} biberones incompletos.", { c: cant(totalDes, 1), n: bibs.filter((b) => b.estado === "incompleto").length });
  }
}

const ESTILOS = `
:host { display:block; min-height:100vh; background:var(--primary-background-color); color:var(--primary-text-color);
  font-family:var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
.barra { display:flex; align-items:center; height:56px; padding:0 8px; background:var(--app-header-background-color, var(--primary-color));
  color:var(--app-header-text-color, #fff); position:sticky; top:0; z-index:3; }
.titulo { font-size:20px; margin-left:8px; }
.titulo-edad { font-size:14px; opacity:.85; }
.selector-bebe { display:flex; gap:6px; padding:6px 12px 8px; background:var(--app-header-background-color, var(--primary-color)); overflow-x:auto; }
.selector-bebe button { border:1px solid rgba(255,255,255,.5); background:none; color:var(--app-header-text-color, #fff); border-radius:16px; padding:5px 14px; font-size:14px; white-space:nowrap; }
.selector-bebe button.activa { background:var(--app-header-text-color, #fff); color:var(--app-header-background-color, var(--primary-color)); font-weight:600; }
.tabs { display:flex; background:var(--app-header-background-color, var(--primary-color)); position:sticky; top:56px; z-index:3; }
.tabs button { flex:1; background:none; border:0; color:var(--app-header-text-color, #fff); opacity:.7; padding:12px 1px;
  font-size:12px; border-bottom:3px solid transparent; cursor:pointer; }
.tabs button.activa { opacity:1; border-bottom-color:var(--app-header-text-color, #fff); font-weight:500; }
main { max-width:760px; margin:0 auto; padding:12px 12px 80px; }
.tarjeta { background:var(--card-background-color); border-radius:var(--ha-card-border-radius, 12px); padding:14px 16px; margin-bottom:12px;
  box-shadow:var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,.15)); }
h2 { font-size:16px; font-weight:500; margin:0 0 10px; }
.kpis { display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; margin-bottom:12px; }
.kpi { background:var(--card-background-color); border-radius:12px; padding:12px; box-shadow:var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,.15)); }
.kpi.completo { grid-column:1 / -1; }
.kpi.alerta { outline:2px solid var(--error-color, #db4437); }
.etq { font-size:12px; color:var(--secondary-text-color); }
.grande-num { font-size:22px; font-weight:500; margin-top:2px; }
.num { font-size:20px; font-weight:500; margin-top:2px; } .num.sm { font-size:15px; } small { font-size:12px; color:var(--secondary-text-color); }
.sub { font-size:12px; color:var(--secondary-text-color); margin-top:2px; }
.progreso { height:10px; background:var(--divider-color); border-radius:5px; overflow:hidden; margin:8px 0 4px; }
.progreso div { height:100%; background:var(--primary-color); transition:width .3s; }
button { font:inherit; cursor:pointer; }
.grande { width:100%; padding:16px; font-size:18px; border:0; border-radius:12px; background:var(--primary-color); color:var(--text-primary-color, #fff); }
.primario, .secundario, .peligro { padding:10px 16px; border-radius:8px; border:0; font-size:15px; }
.primario { background:var(--primary-color); color:var(--text-primary-color, #fff); width:100%; margin-top:8px; }
.modal .primario { width:auto; margin:0; }
.secundario { background:none; color:var(--primary-color); border:1px solid var(--divider-color); width:100%; margin-top:10px; }
.modal .secundario { width:auto; margin:0; }
.peligro { background:none; color:var(--error-color, #db4437); border:1px solid var(--error-color, #db4437); }
details { margin-top:12px; } summary { color:var(--primary-color); cursor:pointer; padding:6px 0; }
.form { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px; }
.form .completo { grid-column:1 / -1; }
label { display:flex; flex-direction:column; font-size:12px; color:var(--secondary-text-color); gap:4px; }
input, select { font:inherit; font-size:16px; padding:9px 10px; border-radius:8px; border:1px solid var(--divider-color);
  background:var(--secondary-background-color, transparent); color:var(--primary-text-color); min-width:0; }
.navdia { display:flex; gap:8px; align-items:center; margin-bottom:12px; }
.navdia button { width:40px; height:40px; border-radius:50%; border:1px solid var(--divider-color); background:var(--card-background-color);
  color:var(--primary-text-color); font-size:22px; line-height:1; }
.navdia button:disabled { opacity:.3; } .navdia input { flex:1; }
.navdia .chip { width:auto; border-radius:20px; font-size:14px; padding:0 14px; }
.resumen-dia { display:flex; justify-content:space-around; text-align:center; padding-bottom:10px; border-bottom:1px solid var(--divider-color); }
.resumen-dia b { font-size:20px; }
.lista { list-style:none; margin:0; padding:0; }
.lista li { display:grid; grid-template-columns:56px 1fr auto; grid-template-areas:"hora oz badge" "hora meta fuente";
  gap:2px 8px; padding:10px 4px; border-bottom:1px solid var(--divider-color); cursor:pointer; align-items:center; }
.lista li.medida { grid-template-areas:"hora oz badge" "hora meta badge"; cursor:default; }
.hora { grid-area:hora; font-weight:500; font-size:16px; } .oz { grid-area:oz; font-weight:500; }
.meta-t { grid-area:meta; font-size:12px; color:var(--secondary-text-color); }
.badge { grid-area:badge; font-size:11px; padding:2px 8px; border-radius:10px; justify-self:end; }
.badge.exacto { background:rgba(67,160,71,.18); color:var(--success-color, #2e7d32); }
.badge.estimado { background:rgba(255,152,0,.2); color:var(--warning-color, #e65100); }
.badge.inferido { background:var(--divider-color); color:var(--secondary-text-color); }
.fuente { grid-area:fuente; font-size:11px; color:var(--secondary-text-color); justify-self:end; }
.icono { grid-area:badge; border:0; background:none; color:var(--secondary-text-color); font-size:16px; padding:6px; }
.vacio { color:var(--secondary-text-color); text-align:center; padding:16px 0; margin:0; }
.fondo { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:10; display:flex; align-items:flex-end; justify-content:center; }
.modal { background:var(--card-background-color); width:100%; max-width:560px; border-radius:16px 16px 0 0; padding:18px 16px 24px;
  max-height:90vh; overflow:auto; }
@media (min-width:600px) { .fondo { align-items:center; } .modal { border-radius:16px; } }
.conf { margin-top:10px; }
.botones { display:flex; gap:8px; margin-top:16px; align-items:center; } .flex { flex:1; }
.segmentos { display:flex; background:var(--card-background-color); border-radius:10px; padding:4px; margin-bottom:12px; }
.segmentos button { flex:1; border:0; background:none; padding:8px; border-radius:8px; color:var(--primary-text-color); }
.segmentos button.activa { background:var(--primary-color); color:var(--text-primary-color, #fff); }
.grafica { width:100%; height:auto; display:block; }
.fila-titulo { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.fila-titulo h2 { margin:0; }
.secundario.chico { width:auto; margin:0; padding:8px 12px; font-size:14px; }
.progreso.grande-p { height:16px; border-radius:8px; margin:12px 0 6px; }
.progreso.ref { position:relative; height:14px; border-radius:7px; }
.progreso.ref .relleno { position:absolute; left:0; top:0; }
.progreso.ref .relleno.ideal { background:var(--success-color, #43a047); }
.progreso.ref .relleno.minimo { background:var(--primary-color); }
.progreso.ref .relleno.atrasado { background:var(--warning-color, #ff9800); }
.progreso.ref .banda { position:absolute; top:0; background:var(--primary-text-color); opacity:.22; }
.progreso.ref .marca { position:absolute; top:0; width:2px; background:var(--primary-text-color); opacity:.6; }
.estado-ref { font-size:14px; font-weight:500; margin:2px 0; }
.estado-ref.atrasado { color:var(--warning-color, #e65100); }
.proximas { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 4px; }
.chip-ref { font-size:12px; padding:3px 8px; border-radius:10px; background:var(--secondary-background-color, rgba(127,127,127,.12)); }
.dias7 { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:6px; }
.dias7 .sub { margin:0; }
.punto { width:11px; height:11px; border-radius:50%; border:1.5px solid var(--divider-color); box-sizing:border-box; }
.punto.l1 { background:var(--primary-color); border-color:var(--primary-color); }
.punto.l2 { background:var(--success-color, #43a047); border-color:var(--success-color, #43a047); }
.bib-info { font-size:16px; }
.alerta-txt { color:var(--error-color, #db4437); font-size:13px; margin-top:6px; }
.pregunta { margin-top:14px; font-size:13px; }
.chip.fuerte { border-color:var(--primary-color); color:var(--primary-color); font-weight:500; }
.check { flex-direction:row; align-items:center; gap:8px; font-size:14px; color:var(--primary-text-color); }
.check input { width:20px; height:20px; }
.grupo { margin-top:12px; }
.bib-cab { display:flex; align-items:center; gap:8px; padding:8px 4px; background:var(--secondary-background-color, rgba(0,0,0,.04));
  border-radius:8px; cursor:pointer; flex-wrap:wrap; }
.bib-cab .badge { justify-self:auto; }
.badge.abierto { background:rgba(3,155,229,.18); color:var(--info-color, #0277bd); }
.badge.terminado { background:rgba(67,160,71,.18); color:var(--success-color, #2e7d32); }
.badge.incompleto { background:rgba(255,152,0,.2); color:var(--warning-color, #e65100); }
.botones.mover { margin-top:8px; flex-wrap:wrap; }
.botones.mover .secundario { flex:1; }
:host { --materna-color:#e91e63; }
.nuevos { display:flex; gap:8px; margin:10px 0 4px; flex-wrap:wrap; }
.nuevos .secundario.chico { flex:1; }
.nuevos button:disabled { opacity:.5; }
.badge.materna { background:rgba(233,30,99,.15); color:var(--materna-color); }
.badge.formula { background:rgba(3,155,229,.15); color:var(--info-color, #0277bd); }
.badge.refrigerador { background:rgba(3,155,229,.15); color:var(--info-color, #0277bd); }
.badge.ambiente { background:rgba(255,152,0,.2); color:var(--warning-color, #e65100); }
.lista li.reserva { grid-template-columns:64px 1fr; grid-template-areas:"hora oz" "hora meta" "acc acc"; cursor:default; }
.lista li.reserva.caducada { opacity:.75; }
.acciones { grid-area:acc; display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.acciones .chip { padding:6px 12px; font-size:14px; min-width:0; }
.peligro-chip { color:var(--error-color, #db4437); border-color:var(--error-color, #db4437); }
.rojo { color:var(--error-color, #db4437); } .naranja { color:var(--warning-color, #e65100); }
h2.sep { margin-top:18px; }
.leyenda .c4 { background:var(--materna-color); }
.leyenda .c5 { background:#29b6f6; } .leyenda .c6 { background:#8d6e63; } .leyenda .c7 { background:#ab47bc; }
.hero { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
.hero-col { background:var(--card-background-color); border-radius:14px; padding:14px; box-shadow:var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,.15)); }
.hero-col.vencida { outline:2px solid var(--error-color, #db4437); }
.hero-col.vencida .hero-hora { color:var(--error-color, #db4437); }
.hero-hora { font-size:34px; font-weight:600; line-height:1.1; margin:4px 0; }
.chips.grandes .chip { flex:1; font-size:18px; padding:14px 8px; }
.chip.activa { background:var(--primary-color); color:var(--text-primary-color, #fff); border-color:var(--primary-color); }
.muestra { display:inline-block; width:12px; height:12px; border-radius:50%; border:1px solid var(--divider-color); margin-right:6px; vertical-align:-1px; }
.sep-etq { margin-top:12px; }
.icono.lapiz { font-size:14px; padding:2px 6px; }
.pausa { margin-top:12px; padding:10px; border:1px dashed var(--divider-color); border-radius:10px; }
.pausa.vencida { border-color:var(--error-color, #db4437); }
.opciones { display:flex; flex-direction:column; gap:8px; margin-top:12px; }
.opciones button { width:100%; margin:0; }
.sobro { margin-top:12px; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
.chip { border:1px solid var(--divider-color); background:var(--secondary-background-color, transparent); color:var(--primary-text-color);
  border-radius:20px; padding:10px 16px; font-size:16px; min-width:56px; }
.chip:active { background:var(--primary-color); color:var(--text-primary-color, #fff); }
.enlace { border:0; background:none; color:var(--secondary-text-color); margin-top:8px; padding:6px 0; }
.ayuda { font-size:11px; color:var(--secondary-text-color); }
#sugerencia p { margin:0 0 8px; }
.rejilla { stroke:var(--divider-color); stroke-width:1; }
.eje { fill:var(--secondary-text-color); font-size:11px; }
.valor { fill:var(--primary-text-color); font-size:10px; }
.meta { stroke:var(--error-color, #db4437); stroke-width:2; stroke-dasharray:6 4; }
.meta-txt { fill:var(--error-color, #db4437); font-size:11px; }
.meta-min { stroke:var(--warning-color, #ff9800); stroke-width:2; stroke-dasharray:2 4; stroke-linecap:round; }
.meta-min-txt { fill:var(--warning-color, #e65100); font-size:11px; }
.linea { fill:none; stroke:var(--primary-color); stroke-width:2.5; }
.punto { fill:var(--primary-color); }
.leyenda { display:flex; gap:6px; align-items:center; font-size:12px; color:var(--secondary-text-color); margin-top:6px; flex-wrap:wrap; }
.leyenda span { width:12px; height:12px; border-radius:3px; display:inline-block; margin-left:8px; }
.leyenda .c1 { background:var(--primary-color); } .leyenda .c2 { background:var(--primary-color); opacity:.45; }
.leyenda .c3 { background:var(--error-color, #db4437); height:3px; }
`;

// ---------- Diccionario español → inglés (las claves son los textos del código) ----------
const EN = {
  // tablas fijas
  "Fórmula": "Formula", "Materna": "Breast milk", "Mixta": "Mixed",
  "Exacto": "Exact", "Estimado": "Estimated", "Inferido": "Inferred",
  "Botón": "Button", "Alexa": "Alexa", "Notificación": "Notification", "Panel": "Panel", "Manual": "Manual", "Prueba": "Test",
  "💧 Pipí": "💧 Pee", "💩 Popó": "💩 Poop", "💧💩 Ambos": "💧💩 Both",
  "Amarillo": "Yellow", "Verde": "Green", "Café": "Brown", "Naranja": "Orange", "Negro": "Black", "Rojo": "Red",
  "Blanco / gris": "White / gray", "No sé": "Not sure",
  "Líquida": "Watery", "Grumosa": "Seedy", "Pastosa": "Pasty", "Dura": "Hard",
  // pestañas y periodos
  "Hoy": "Today", "Tomas": "Feedings", "Medidas": "Growth", "Gráficas": "Charts", "Ajustes": "Settings",
  "Día": "Day", "Semana": "Week", "Mes": "Month",
  // tiempo y edad
  "hace {t}": "{t} ago", "en {t}": "in {t}", "{n} días": "{n} days", "{s} sem{d} ({n} días)": "{s} wk{d} ({n} days)",
  "{m} meses ({s} sem)": "{m} months ({s} wk)", "hoy": "today",
  // comunes
  "meta": "goal", "Meta": "Goal", "Sin datos todavía.": "No data yet.", "Error": "Error", "Error al cargar": "Error loading",
  "Guardar": "Save", "Cancelar": "Cancel", "Borrar": "Delete", "Hora": "Time", "Tipo": "Type", "Nota": "Note", "opcional": "optional",
  "Fecha": "Date", "Color": "Color", "Consistencia": "Consistency", "Confianza": "Confidence", "de": "of",
  "{a} de {b}": "{a} of {b}", "quedan": "left", "quedan {c}": "{c} left", "Cantidad": "Amount", "Cantidad no válida": "Invalid amount",
  "Oz": "Amount", "tomas": "feedings", "biberones": "bottles", "Biberones": "Bottles", "pañales": "diapers", "Pañales": "Diapers",
  "Pipí": "Pee", "Popó": "Poop", "Ambos": "Both", "pipí": "pee", "popó": "poop", "ambos": "both",
  // Hoy
  "Registrar con otra hora…": "Log with a different time…", "Guardar toma": "Save feeding",
  "Biberón en curso": "Current bottle", "({n} en reserva)": "({n} in stash)", "(sin reserva)": "(no stash)",
  "Cambiar el tamaño de este biberón": "Change this bottle's size", "Cambiar tamaño": "Change size",
  "Primera toma {h} · 1 toma": "First feeding {h} · 1 feeding", "Primera toma {h} · {n} tomas": "First feeding {h} · {n} feedings",
  "Preparado {h} · sin tomas aún": "Prepared {h} · no feedings yet", "límite": "use by",
  "Ya pasó el límite desde su primera toma: considera preparar uno nuevo.": "It is past the limit since its first feeding: consider preparing a new one.",
  "No hay biberón abierto: la siguiente toma empieza uno de {c}.": "No open bottle: the next feeding starts a {c} one.",
  "En pausa:": "Paused:", "Ya pasó su límite ({h}): mejor tírala.": "Past its limit ({h}): better discard it.",
  "Usar antes de {h}": "Use before {h}", "lo que sobre de la actual se sumará aquí": "any excess from the current one will be added here",
  "Continuar": "Resume", "Tirar lo que queda ({c})": "Discard what is left ({c})", "¿Cuánto tomó?": "How much did baby drink?",
  "Lo que quedaba ({c})": "What was left ({c})", "Otro…": "Other…",
  "¿De cuánto es este biberón? ({u}; ya tomó {c})": "How big is this bottle? ({u}; already drank {c})",
  "No puede ser menor a lo que ya tomó ({c})": "It cannot be less than what was already drunk ({c})",
  "Este biberón ahora es de {c}": "This bottle is now {c}", "Seguimos con ese biberón": "Back to that bottle",
  "¿Tirar lo que queda de ese biberón?": "Discard what is left in that bottle?", "Biberón tirado": "Bottle discarded",
  "Tomó {c} · biberón {a}/{b}": "Drank {c} · bottle {a}/{b}", "se empezó un biberón nuevo": "a new bottle was started",
  "Biberón nuevo de {c}": "New {c} bottle", "el anterior quedó en {a}/{b}": "the previous one ended at {a}/{b}",
  "Hoy: {a} de {b} · {c} tomas · {d} biberones · {e} pañales": "Today: {a} of {b} · {c} feedings · {d} bottles · {e} diapers",
  "ideal": "ideal", "mínimo": "minimum", "por peso": "by weight", "pediatra": "pediatrician",
  "Va al ritmo de la meta": "On pace for the goal", "Va al ritmo del ideal": "On pace for the ideal",
  "Arriba del mínimo, abajo del ideal": "Above the minimum, below the ideal",
  "Va abajo de la meta ({d})": "Behind the goal ({d})", "Va abajo del mínimo ({d})": "Behind the minimum ({d})",
  "Ya cumplió la meta del día": "Daily goal reached", "Ya cumplió el ideal del día": "Daily ideal reached",
  "Ya cumplió el mínimo del día": "Daily minimum reached",
  "más de {c} (no alcanza sin forzar)": "over {c} (not reachable without forcing)",
  "Hoy: {a} · {c} tomas · {d} biberones · {e} pañales": "Today: {a} · {c} feedings · {d} bottles · {e} diapers",
  "Zona sombreada: dónde debería ir a esta hora": "Shaded zone: where intake should be by now",
  "A esta hora debería llevar {r}": "By now intake should be {r}",
  "Meta del día: {a} ({f})": "Daily goal: {a} ({f})",
  "registra su peso para tener también la referencia por peso": "log the weight to also get the weight-based reference",
  "Meta del día: mínimo {a} ({fa}) · ideal {b} ({fb})": "Daily goal: minimum {a} ({fa}) · ideal {b} ({fb})",
  "Para llegar: {a} por toma en {n} tomas": "To get there: {a} per feeding over {n} feedings",
  "Para llegar: mínimo {a} · ideal {b} por toma en {n} tomas": "To get there: minimum {a} · ideal {b} per feeding over {n} feedings",
  "Últimos {n} días": "Last {n} days", "meta {a}/{n}": "goal {a}/{n}",
  "mínimo {a}/{n} · ideal {b}/{n}": "minimum {a}/{n} · ideal {b}/{n}",
  "{p}% de la meta": "{p}% of goal", "Ritmo (últimas 24 h)": "Rate (last 24 h)", "Por toma (7 d)": "Per feeding (7 d)",
  "{n} tomas/día · cada {h} h": "{n} feedings/day · every {h} h", "Pañales hoy": "Diapers today",
  "{n}/día (7 d) · cada {h} h": "{n}/day (7 d) · every {h} h", "Biberones terminados (7 d)": "Bottles finished (7 d)",
  "desechado": "wasted", "Edad": "Age", "Peso · Talla": "Weight · Length",
  "Última toma": "Last feeding", "Sin registros": "No records", "sin registros": "no records", "Siguiente toma": "Next feeding", "ya toca": "due now",
  // pañales
  "Pañal": "Diaper", "último": "last", "Último pipí": "Last pee", "Pañal registrado:": "Diaper logged:",
  "este color conviene comentarlo con el pediatra": "this color is worth mentioning to the pediatrician",
  "¿Cómo fue la popó?": "What was the poop like?", "Elige color y consistencia (o \"No sé\")": "Choose color and consistency (or \"Not sure\")",
  "Nuevo pañal": "New diaper", "Pañal de las {h}": "Diaper at {h}",
  "Para popó elige color y consistencia (o \"No sé\")": "For poop choose color and consistency (or \"Not sure\")",
  "Pañal agregado": "Diaper added", "Pañal actualizado": "Diaper updated", "¿Borrar este pañal?": "Delete this diaper?", "Pañal borrado": "Diaper deleted",
  "Toma guardada": "Feeding saved",
  // formulario de toma
  "Tomó": "Drank", "Es de un biberón nuevo": "It is from a new bottle", "Indica la hora": "Enter the time", "Indica cuánto tomó": "Enter how much was drunk",
  // Tomas
  "En curso": "Current", "Terminado": "Finished", "Incompleto": "Incomplete", "Día anterior": "Previous day", "Día siguiente": "Next day",
  "se desecharon {c}": "{c} wasted", "Sin biberón": "No bottle", "Sin tomas este día.": "No feedings this day.",
  "+ Agregar toma a este día": "+ Add feeding to this day", "Pañales del día": "Diapers of the day", "Sin pañales este día.": "No diapers this day.",
  "+ Agregar pañal a este día": "+ Add diaper to this day", "Nueva toma": "New feeding", "Toma de las {h}": "Feeding at {h}",
  "Registrada por": "Logged by", "Mover a biberón nuevo": "Move to a new bottle", "Unir al biberón anterior": "Join the previous bottle",
  "Toma agregada": "Feeding added", "Toma actualizada": "Feeding updated", "¿Borrar la toma de las {h} ({c})?": "Delete the feeding at {h} ({c})?",
  "Toma borrada": "Feeding deleted", "Movida (con las siguientes del mismo biberón) a un biberón nuevo": "Moved (with the following ones from the same bottle) to a new bottle",
  "Unida al biberón anterior": "Joined the previous bottle",
  "Biberón de las {h}": "Bottle at {h}", "{a} de {b} en 1 toma": "{a} of {b} in 1 feeding", "{a} de {b} en {n} tomas": "{a} of {b} in {n} feedings",
  "Tamaño": "Size", "Cerrar (desechar {c})": "Close (discard {c})", "Reabrir": "Reopen", "Biberón actualizado": "Bottle updated",
  "Biberón cerrado": "Bottle closed", "Biberón reabierto": "Bottle reopened",
  // Ajustes
  "Biberón e indicación del pediatra": "Bottle and pediatrician's advice", "Oz por biberón": "Bottle size", "(se guarda en oz)": "(stored in oz)",
  "Tamaño de cada biberón nuevo.": "Size of each new bottle.", "Fórmula empezada: límite (h)": "Started formula: limit (h)",
  "Después de esto se sugiere preparar otro.": "After this, preparing a new one is suggested.", "Materna empezada: límite (h)": "Started breast milk: limit (h)",
  "Materna a temp. ambiente (h)": "Breast milk at room temp. (h)", "Materna en refrigerador (días)": "Breast milk in the fridge (days)",
  "Meta oz por toma": "Goal per feeding (oz)", "Cada cuántas horas": "Every how many hours", "Guardar ajustes": "Save settings",
  "Lo que dicen los últimos 7 días": "What the last 7 days say",
  "Meta diaria: {c} ({n} tomas al día). El recordatorio sonará {h} h después de cada toma.": "Daily goal: {c} ({n} feedings a day). The reminder will fire {h} h after each feeding.",
  "Sin cambios": "No changes", "Ajustes guardados": "Settings saved", "Todavía no hay suficientes registros.": "Not enough records yet.",
  "Toma en promedio <b>{c}</b> por toma, unas <b>{n}</b> veces al día.": "Drinks on average <b>{c}</b> per feeding, about <b>{n}</b> times a day.",
  "Terminó el <b>{p}%</b> de sus biberones; se desecharon <b>{c}</b> de fórmula.": "Finished <b>{p}%</b> of bottles; <b>{c}</b> of formula was wasted.",
  "Muchos biberones quedan incompletos: podrían preparar menos (≈{c}) para desperdiciar menos.": "Many bottles are left unfinished: you could prepare less (≈{c}) to waste less.",
  "Se termina casi todos sus biberones: buen dato para comentar con el pediatra por si conviene aumentar.": "Finishes almost every bottle: worth mentioning to the pediatrician in case an increase is appropriate.",
  "Come en tomas pequeñas ({c} vs meta {m}): es normal que coma más seguido.": "Eats in small feedings ({c} vs goal {m}): it is normal to eat more often.",
  "Son referencias de tus registros; cualquier cambio de cantidad, consúltalo con su pediatra.": "These are references from your records; check any change in amount with your pediatrician.",
  // Materna
  "Reserva": "Stash", "＋ Guardar biberón de leche materna": "＋ Save breast milk bottle", "Dónde": "Where", "Refrigerador": "Fridge",
  "Temperatura ambiente": "Room temperature", "Se hizo a las": "Made at", "Guardar en reserva": "Save to stash", "Registrar extracción": "Log pumping session",
  "Terminó a las": "Ended at", "Izquierdo": "Left", "Derecho": "Right", "Duración (min)": "Duration (min)", "Dónde se guarda": "Where it is stored",
  "Guardar en biberones de reserva": "Save as stash bottles", "Repartir en biberones (opcional)": "Split into bottles (optional)",
  "ej. 2 + 1.5  (vacío = un biberón con todo)": "e.g. 2 + 1.5  (empty = one bottle with everything)", "Guardar extracción": "Save pumping session",
  "Extracciones recientes": "Recent pumping sessions", "En reserva": "In stash", "1 biberón": "1 bottle", "{n} biberones": "{n} bottles",
  "1 caducado": "1 expired", "{n} caducados": "{n} expired", "Próxima caducidad": "Next expiry", "Extraído hoy": "Pumped today",
  "promedio {c}/día (7 d)": "average {c}/day (7 d)", "Tomó hoy": "Drank today", "{a} materna · {b} fórmula": "{a} breast milk · {b} formula",
  "{p}% materna · desechada 7 d: {c}": "{p}% breast milk · wasted 7 d: {c}", "Ambiente": "Room temp.", "{c} vigentes": "{c} usable",
  "Caducó": "Expired", "Caduca": "Expires", "la más antigua": "the oldest", "Usar": "Use", "A ambiente": "To room temp.", "Al refri": "To fridge",
  "Desechar": "Discard", "No hay leche materna en reserva.": "No breast milk in the stash.", "Movido": "Moved",
  "¿Desechar este biberón de leche materna?": "Discard this breast milk bottle?", "Desechado": "Discarded", "izq": "L", "der": "R",
  "Sin extracciones en los últimos 3 días.": "No pumping sessions in the last 3 days.",
  "¿Borrar esta extracción? También se quitan sus biberones de reserva sin usar.": "Delete this pumping session? Its unused stash bottles are removed too.",
  "Extracción borrada": "Pumping session deleted", "Indica la cantidad": "Enter the amount", "Guardado en reserva": "Saved to stash",
  "Indica la cantidad de al menos un lado": "Enter the amount for at least one side", "Extracción de {c}": "Pumped {c}",
  "{n} biberón(es) a la reserva": "{n} bottle(s) to the stash",
  "Hay un biberón de {tipo} en curso ({a} de {b}). ¿Qué hacemos con él?": "There is a {tipo} bottle in progress ({a} of {b}). What should we do with it?",
  "Materna primero y guardar el actual para después": "Breast milk first, keep the current one for later", "Tirar el actual ({c})": "Discard the current one ({c})",
  "Biberón en curso: leche materna {c}": "Current bottle: breast milk {c}",
  "No es de la reserva": "Not from the stash", "¿Qué biberón de leche materna de la reserva se usó?": "Which breast milk stash bottle was used?", "el anterior quedó en pausa": "the previous one is paused",
  "el anterior se tiró": "the previous one was discarded",
  // Medidas
  "Nueva medida": "New measurement", "Peso (kg)": "Weight (kg)", "Talla (cm)": "Length (cm)", "Perímetro cefálico (cm)": "Head circumference (cm)",
  "p. ej. cita pediatra": "e.g. pediatrician visit", "Guardar medida": "Save measurement", "Peso (kg) por edad": "Weight (kg) by age",
  "Talla (cm) por edad": "Length (cm) by age", "Historial": "History", "Escribe al menos peso, talla o perímetro": "Enter at least weight, length or head circumference",
  "Medida guardada": "Measurement saved", "PC": "HC", "Sin medidas.": "No measurements.", "¿Borrar esta medida?": "Delete this measurement?",
  "Medida borrada": "Measurement deleted",
  // Gráficas
  "Promedio por toma": "Average per feeding", "Biberones terminados (%)": "Bottles finished (%)",
  "¿A qué hora come? (promedio por hora, últimos 7 días)": "When does baby eat? (average per hour, last 7 days)",
  "¿A qué hora se cambia el pañal? (promedio por hora, 7 días)": "When are diapers changed? (average per hour, 7 days)",
  "por día": "per day", "promedio por día": "average per day", "por toma": "per feeding", "terminados": "finished",
  "Fórmula desechada": "Formula wasted", "Leche extraída": "Pumped milk", "extraída": "pumped",
  "Total en el periodo: {c} en {n} biberones incompletos.": "Total in the period: {c} in {n} incomplete bottles.",
};

customElements.define("bebe-panel", BebePanel);
