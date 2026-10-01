// Panel "Bebé" para Home Assistant: registro y edición de tomas, medidas y gráficas.
// Web component sin dependencias; usa las variables de tema de HA (claro/oscuro).

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
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function relativo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  const t = h ? `${h} h ${pad(m)} min` : `${m} min`;
  return min >= 0 ? `hace ${t}` : `en ${t}`;
}

function edadTexto(dias) {
  if (dias === null || dias === undefined || isNaN(dias)) return "—";
  dias = Number(dias);
  if (dias < 14) return `${dias} días`;
  const sem = Math.floor(dias / 7), d = dias % 7;
  if (dias < 90) return `${sem} sem${d ? ` ${d} d` : ""} (${dias} días)`;
  const meses = Math.floor(dias / 30.44);
  return `${meses} meses (${sem} sem)`;
}

// Gráfica de barras SVG; series apiladas; línea de meta opcional.
function barras({ etiquetas, series, meta, unidad, alto = 180 }) {
  const W = 640, H = alto, izq = 34, abajo = 26, arriba = 12;
  const n = etiquetas.length || 1;
  const totales = etiquetas.map((_, i) => series.reduce((s, se) => s + (se.valores[i] || 0), 0));
  const max = Math.max(1, meta || 0, ...totales) * 1.12;
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
  if (meta) {
    svg += `<line x1="${izq}" x2="${W - 4}" y1="${y(meta)}" y2="${y(meta)}" class="meta"/>`
         + `<text x="${W - 6}" y="${y(meta) - 4}" class="meta-txt" text-anchor="end">meta ${num(meta, 1)}</text>`;
  }
  return svg + "</svg>";
}

// Gráfica de línea SVG (x numérico = días de edad).
function linea({ puntos, unidad, alto = 170 }) {
  if (puntos.length === 0) return `<p class="vacio">Sin datos todavía.</p>`;
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
    svg += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="4" class="punto"><title>Día ${p.x}: ${num(p.y, 2)} ${unidad}</title></circle>`
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
    this._actualizarEdad();
  }
  set narrow(n) { this._narrow = n; if (this._menu) this._menu.narrow = n; }
  set hass(h) {
    this._hass = h;
    if (this._menu) this._menu.hass = h;
    const te = this.shadowRoot && this.shadowRoot.getElementById("titulo-edad");
    if (te) { const d = this._val("edad"); te.textContent = d !== null ? `· ${edadTexto(d)}` : ""; }
    if (!this._listo) { this._listo = true; this._montar(); return; }
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
    catch (e) { this._aviso(`Error: ${e.message || e}`); throw e; }
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
          .map(([k, t]) => `<button data-tab="${k}" class="${k === this._tab ? "activa" : ""}">${t}</button>`).join("")}
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
          <summary>Registrar con otra hora…</summary>
          ${this._formToma({ fin: aInputLocal(new Date()), oz_tomadas: "", tipo: "formula" }, "nueva", true)}
          <button class="primario" id="guardar-nueva">Guardar toma</button>
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
      <div class="fila-titulo"><h2>Biberón en curso ${b ? `<span class="badge ${b.tipo || "formula"}">${TIPOS[b.tipo] || "Fórmula"}</span>` : ""}</h2></div>
      <div class="nuevos">
        <button class="secundario chico" id="nuevo-bib">＋ Fórmula ${cant(ozDef, 1)}</button>
        <button class="secundario chico" id="nuevo-materna" ${reservaN ? "" : "disabled"}>＋ Materna${reservaN ? ` (${reservaN} en reserva)` : " (sin reserva)"}</button>
      </div>
      ${b ? `
        <div class="progreso grande-p"><div style="width:${Math.min(100, b.consumido / b.oz * 100)}%"></div></div>
        <div class="bib-info"><b>${cantN(b.consumido, 2)} de ${cant(b.oz, 2)}</b>
          <button class="icono lapiz" id="editar-oz" title="Cambiar el tamaño de este biberón" aria-label="Cambiar tamaño">✏️</button>
          · quedan <b>${cant(b.restante, 2)}</b></div>
        <div class="sub">${b.primera_toma ? `Primera toma ${hora(b.primera_toma)} · ${b.n_tomas} toma${b.n_tomas === 1 ? "" : "s"}` : `Preparado ${hora(b.preparado)} · sin tomas aún`}
          ${b.vence ? ` · límite ${hora(b.vence)}` : ""}</div>
        ${b.vencido ? `<div class="alerta-txt">⚠️ Ya pasó el límite desde su primera toma: considera preparar uno nuevo.</div>` : ""}`
      : `<div class="sub">No hay biberón abierto: la siguiente toma empieza uno de ${cant(ozDef, 1)}.</div>`}
      ${(b && b.en_pausa ? b.en_pausa : []).map((p) => `
        <div class="pausa ${p.vencido ? "vencida" : ""}">
          <div><b>En pausa:</b> ${TIPOS[p.tipo] || p.tipo} · ${cantN(p.consumido, 2)} de ${cant(p.oz, 2)}
            <div class="sub">${p.vencido ? `<span class="rojo">Ya pasó su límite (${hora(p.vence)}): mejor tírala.</span>` : p.vence ? `Usar antes de ${hora(p.vence)}` : ""}
              · lo que sobre de la actual se sumará aquí</div></div>
          <div class="acciones">
            <button class="chip" data-reanudar="${p.id}" ${p.vencido ? "disabled" : ""}>Continuar</button>
            <button class="chip peligro-chip" data-tirar="${p.id}">Tirar lo que queda (${cant(p.restante, 2)})</button>
          </div>
        </div>`).join("")}
      <div class="etq pregunta">¿Cuánto tomó?</div>
      <div class="chips" id="chips-toma">
        ${chips.map(([v, t]) => `<button class="chip" data-oz="${v}">${esMl() ? cant(v) : `${t} oz`}</button>`).join("")}
        <button class="chip fuerte" data-oz="resto">Lo que quedaba (${cant(quedan, 2)})</button>
        <button class="chip" data-oz="otro">Otro…</button>
      </div>`;
    el.querySelector("#nuevo-bib").onclick = () => this._nuevoBiberon();
    const lapiz = el.querySelector("#editar-oz");
    if (lapiz) lapiz.onclick = async () => {
      // Solo este biberón (caso especial); las oz por defecto de Ajustes no cambian
      const v = prompt(`¿De cuánto es este biberón? (${U()}; ya tomó ${cant(b.consumido, 2)})`, cantN(b.oz, 2));
      if (v === null) return;
      const oz = aOz(parseFloat(v.replace(",", ".")));
      if (!(oz > 0 && oz <= 12)) { this._aviso("Cantidad no válida"); return; }
      if (oz < b.consumido) { this._aviso(`No puede ser menor a lo que ya tomó (${cant(b.consumido, 2)})`); return; }
      await this._accion(() => this._servicio("corregir_biberon", { id: b.id, oz }, true), `Este biberón ahora es de ${cant(oz, 2)}`);
    };
    el.querySelector("#nuevo-materna").onclick = () => this._usarReserva(null);
    el.querySelectorAll("[data-reanudar]").forEach((x) => x.onclick = async () => {
      await this._accion(() => this._servicio("reanudar_biberon", { id: Number(x.dataset.reanudar) }, true), "Seguimos con ese biberón");
    });
    el.querySelectorAll("[data-tirar]").forEach((x) => x.onclick = async () => {
      if (!confirm("¿Tirar lo que queda de ese biberón?")) return;
      await this._accion(() => this._servicio("cerrar_biberon", { id: Number(x.dataset.tirar) }, true), "Biberón tirado");
    });
    el.querySelector("#chips-toma").onclick = async (e) => {
      const bt = e.target.closest("button[data-oz]"); if (!bt) return;
      if (bt.dataset.oz === "otro") {
        const v = prompt(`¿Cuánto tomó? (${U()})`, "");
        if (v === null) return;
        const oz = aOz(parseFloat(v.replace(",", ".")));
        if (!(oz > 0 && oz <= 12)) { this._aviso("Cantidad no válida"); return; }
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
      this._aviso(`Tomó ${cant(r.oz_registradas, 2)} · biberón ${num(b.consumido, 2)}/${num(b.oz, 2)}`
        + (r.biberon_nuevo && r.anterior ? " · se empezó un biberón nuevo" : ""));
    } finally { botones.forEach((x) => { x.disabled = false; }); }
  }

  async _nuevoBiberon() {
    // El tamaño sale de Ajustes (oz por biberón); el anterior queda incompleto
    const r = await this._accion(() => this._servicio("nuevo_biberon", {}, true));
    const a = r.anterior;
    this._aviso(`Biberón nuevo de ${cant(r.biberon.oz, 1)}`
      + (a && a.estado === "incompleto" ? ` · el anterior quedó en ${cantN(a.consumido, 2)}/${cant(a.oz, 2)}` : ""));
  }

  _pintarResumen() {
    this._pintarHero();
    this._pintarBiberon();
    this._pintarPanal();
    const k = this.shadowRoot.getElementById("kpis"); if (!k) return;
    const ozHoy = this._num("oz_hoy") ?? 0, meta = this._num("meta_oz_dia");
    const avance = meta ? Math.min(100, Math.round(ozHoy / meta * 100)) : 0;
    const pct = this._num("pct_terminados"), ritmo = this._num("ritmo_oz_hora");
    const ph = this._st("panales_hoy"), t = ph ? ph.attributes : {};
    k.innerHTML = `
      <div class="kpi completo">
        <div class="etq">Hoy: ${cantN(ozHoy, 1)} de ${cant(meta, 1)} · ${this._val("tomas_hoy") ?? 0} tomas · ${this._val("biberones_hoy") ?? 0} biberones · ${this._val("panales_hoy") ?? 0} pañales</div>
        <div class="progreso"><div style="width:${avance}%"></div></div>
        <div class="sub">${avance}% de la meta · ${Math.round(ozHoy * ML_POR_OZ)} ml</div>
      </div>
      <div class="kpi"><div class="etq">Ritmo (últimas 24 h)</div><div class="num">${cantN(ritmo, 2)} <small>${U()}/h</small></div>
        <div class="sub">meta ${meta ? cant(meta / 24, 2) : "—"}/h</div></div>
      <div class="kpi"><div class="etq">Oz por toma (7 d)</div><div class="num">${cantN(this._num("oz_por_toma"), 2)} <small>${U()}</small></div>
        <div class="sub">${num(this._num("tomas_por_dia"), 1)} tomas/día · cada ${num(this._num("intervalo"), 1)} h</div></div>
      <div class="kpi"><div class="etq">Pañales hoy</div><div class="num sm">💧 ${t.pipi ?? 0} · 💩 ${t.popo ?? 0} · ambos ${t.ambos ?? 0}</div>
        <div class="sub">${num(this._num("panales_por_dia"), 1)}/día (7 d) · cada ${num(this._num("intervalo_panales"), 1)} h</div></div>
      <div class="kpi"><div class="etq">Biberones terminados (7 d)</div><div class="num">${pct === null ? "—" : `${pct}<small>%</small>`}</div>
        <div class="sub">desechado ${cant(this._num("desechado_7d"), 1)}</div></div>
      <div class="kpi"><div class="etq">Edad</div><div class="num sm">${edadTexto(this._val("edad"))}</div></div>
      <div class="kpi"><div class="etq">Peso · Talla</div><div class="num sm">${num(this._num("peso"), 2)} kg · ${num(this._num("talla"), 1)} cm</div></div>`;
  }

  // Lo más importante: última toma y siguiente
  _pintarHero() {
    const el = this.shadowRoot.getElementById("hero"); if (!el) return;
    const ultima = this._st("ultima_toma"), prox = this._val("proxima_toma");
    const u = ultima && !["unknown", "unavailable"].includes(ultima.state) ? ultima : null;
    const vencida = prox && new Date(prox) < new Date();
    el.innerHTML = `
      <div class="hero-col">
        <div class="etq">Última toma</div>
        <div class="hero-hora">${u ? hora(u.state) : "—"}</div>
        <div class="sub">${u ? `${relativo(u.state)} · ${cant(u.attributes.oz_tomadas, 2)}` : "Sin registros"}</div>
      </div>
      <div class="hero-col ${vencida ? "vencida" : ""}">
        <div class="etq">Siguiente toma</div>
        <div class="hero-hora">${prox ? hora(prox) : "—"}</div>
        <div class="sub">${prox ? (vencida ? `ya toca · ${relativo(prox)}` : relativo(prox)) : ""}</div>
      </div>`;
  }

  // ---------- Pañales ----------
  _pintarPanal() {
    const el = this.shadowRoot.getElementById("panal"); if (!el) return;
    const u = this._st("ultimo_panal"), pipi = this._val("ultimo_pipi");
    const ok = u && !["unknown", "unavailable"].includes(u.state);
    const a = ok ? u.attributes : {};
    el.innerHTML = `
      <div class="fila-titulo"><h2>🧷 Pañal</h2>
        <span class="sub">${ok ? `último ${hora(u.state)} (${relativo(u.state)}) · ${TIPOS_PANAL[a.tipo] || ""}${a.color ? ` · ${NOMBRE_COLOR[a.color] || a.color}` : ""}` : "sin registros"}</span></div>
      ${pipi ? `<div class="sub">Último pipí ${relativo(pipi)}</div>` : ""}
      <div class="chips grandes" id="chips-panal">
        <button class="chip" data-p="pipi">💧 Pipí</button>
        <button class="chip" data-p="popo">💩 Popó</button>
        <button class="chip" data-p="ambos">💧💩 Ambos</button>
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
    this._aviso(`Pañal registrado: ${TIPOS_PANAL[p.tipo]}${p.color ? ` · ${NOMBRE_COLOR[p.color]}` : ""}${this._avisoColor(p.color)}`);
    return p;
  }

  _avisoColor(color) {
    const dias = this._num("edad") ?? 99;
    if (color === "rojo" || color === "blanco" || (color === "negro" && dias > 5)) {
      return " — este color conviene comentarlo con el pediatra";
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
        <h2>¿Cómo fue la popó?</h2>
        <div class="etq">Color</div>
        <div class="chips" id="op-color">${COLORES.map(([k, t, c]) =>
          `<button class="chip ${sel.color === k ? "activa" : ""}" data-c="${k}"><span class="muestra" style="background:${c}"></span>${t}</button>`).join("")}</div>
        <div class="etq sep-etq">Consistencia</div>
        <div class="chips" id="op-cons">${CONSISTENCIAS.map(([k, t]) =>
          `<button class="chip ${sel.consistencia === k ? "activa" : ""}" data-k="${k}">${t}</button>`).join("")}</div>
        <div class="botones"><span class="flex"></span>
          <button class="secundario" id="cancelar">Cancelar</button>
          <button class="primario" id="ok-popo">Guardar</button></div>`);
      const marcar = (cont, attr, val) => cont.querySelectorAll("button").forEach((x) => x.classList.toggle("activa", x.dataset[attr] === val));
      dlg.querySelector("#op-color").onclick = (e) => { const b = e.target.closest("[data-c]"); if (!b) return; sel.color = b.dataset.c; marcar(dlg.querySelector("#op-color"), "c", sel.color); };
      dlg.querySelector("#op-cons").onclick = (e) => { const b = e.target.closest("[data-k]"); if (!b) return; sel.consistencia = b.dataset.k; marcar(dlg.querySelector("#op-cons"), "k", sel.consistencia); };
      dlg.querySelector("#ok-popo").onclick = () => {
        if (!sel.color || !sel.consistencia) { this._aviso("Elige color y consistencia (o \"No sé\")"); return; }
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
      <h2>${nuevo ? "Nuevo pañal" : `Pañal de las ${hora(p.fin)}`}</h2>
      <form class="form" id="form-panal" onsubmit="return false">
        <label class="completo">Hora<input type="datetime-local" name="fin" value="${datos.fin}"></label>
        <label class="completo">Tipo<select name="tipo">${Object.entries(TIPOS_PANAL).map(([k, v]) => `<option value="${k}" ${k === datos.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Color<select name="color"><option value="">—</option>${COLORES.map(([k, t]) => `<option value="${k}" ${k === datos.color ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label>Consistencia<select name="consistencia"><option value="">—</option>${CONSISTENCIAS.map(([k, t]) => `<option value="${k}" ${k === datos.consistencia ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="completo">Nota<input type="text" name="nota" value="${esc(datos.nota || "")}"></label>
      </form>
      <div class="botones">${nuevo ? "" : `<button class="peligro" id="borrar-panal">Borrar</button>`}<span class="flex"></span>
        <button class="secundario" id="cancelar">Cancelar</button><button class="primario" id="guardar-panal">Guardar</button></div>`);
    const listo = () => { cerrar(); if (this._tab === "tomas") this._cargarTomas(); };
    dlg.querySelector("#guardar-panal").onclick = async () => {
      const f = dlg.querySelector("#form-panal");
      const d = { fin: aServicio(f.fin.value), tipo: f.tipo.value };
      if (d.tipo !== "pipi") {
        if (!f.color.value || !f.consistencia.value) { this._aviso("Para popó elige color y consistencia (o \"No sé\")"); return; }
        d.color = f.color.value; d.consistencia = f.consistencia.value;
      }
      if (f.nota.value.trim()) d.nota = f.nota.value.trim();
      if (nuevo) await this._accion(() => this._servicio("registrar_panal", { ...d, fuente: "app" }, true), "Pañal agregado" + this._avisoColor(d.color));
      else await this._accion(() => this._servicio("corregir_panal", { id: p.id, ...d }, true), "Pañal actualizado" + this._avisoColor(d.color));
      listo();
    };
    const b = dlg.querySelector("#borrar-panal");
    if (b) b.onclick = async () => {
      if (!confirm("¿Borrar este pañal?")) return;
      await this._accion(() => this._servicio("borrar_panal", { id: p.id }, true), "Pañal borrado");
      listo();
    };
  }

  _eventosHoy() {
    const r = this.shadowRoot;
    r.getElementById("guardar-nueva").addEventListener("click", async () => {
      const f = r.getElementById("form-nueva");
      const datos = this._leerForm(f, true);
      if (!datos) return;
      await this._accion(() => this._servicio("registrar_toma", { ...datos, fuente: "app" }, true), "Toma guardada");
      r.getElementById("detalle").open = false;
    });
  }

  // ---------- Formulario de toma ----------
  _formToma(t, id, conNuevo = false) {
    return `<form class="form" id="form-${id}" onsubmit="return false">
      <label class="completo">Hora<input type="datetime-local" name="fin" value="${t.fin}" required></label>
      <label>Tomó (${U()})<input type="number" name="oz_tomadas" step="${PASO()}" min="${PASO()}" max="${MAXC()}" inputmode="decimal" value="${t.oz_tomadas === "" || t.oz_tomadas == null ? "" : cantN(t.oz_tomadas, 2)}" required></label>
      <label>Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === t.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="completo">Nota<input type="text" name="nota" value="${esc(t.nota || "")}" placeholder="opcional"></label>
      ${conNuevo ? `<label class="check completo"><input type="checkbox" name="nuevo_biberon"> Es de un biberón nuevo</label>` : ""}
    </form>`;
  }

  _leerForm(f, conNuevo = false) {
    if (!f.fin.value) { this._aviso("Indica la hora"); return null; }
    const oz = aOz(parseFloat(String(f.oz_tomadas.value).replace(",", ".")));
    if (!(oz > 0 && oz <= 12)) { this._aviso("Indica cuánto tomó"); return null; }
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
    } catch (e) { this._aviso(`Error al cargar: ${e.message}`); }
    this._tomasDia = tomas;
    this._bibs = Object.fromEntries(biberones.map((b) => [b.id, b]));
    const grupos = [];
    tomas.forEach((t) => {
      let g = grupos.find((x) => x.id === (t.biberon_id || 0));
      if (!g) { g = { id: t.biberon_id || 0, b: this._bibs[t.biberon_id], tomas: [] }; grupos.push(g); }
      g.tomas.push(t);
    });
    const total = tomas.reduce((s, t) => s + t.oz_tomadas, 0);
    const meta = this._num("meta_oz_dia");
    const esHoy = fechaISO(this._dia) === fechaISO(new Date());
    const ESTADO = { abierto: "En curso", terminado: "Terminado", incompleto: "Incompleto" };
    cont.innerHTML = `
      <div class="navdia">
        <button id="prev" aria-label="Día anterior">‹</button>
        <input type="date" id="fecha" value="${fechaISO(this._dia)}" max="${fechaISO(new Date())}">
        <button id="next" aria-label="Día siguiente" ${esHoy ? "disabled" : ""}>›</button>
        ${esHoy ? "" : `<button id="hoy" class="chip">Hoy</button>`}
      </div>
      <section class="tarjeta">
        <div class="resumen-dia">
          <div><b>${num(total, 1)}</b> oz${meta ? ` de ${num(meta, 1)}` : ""}</div>
          <div><b>${tomas.length}</b> tomas</div>
          <div><b>${grupos.filter((g) => g.id).length}</b> biberones</div>
        </div>
        ${grupos.length ? grupos.slice().reverse().map((g) => `
          <div class="grupo">
            ${g.b ? `<div class="bib-cab" data-bib="${g.b.id}">
                <span>🍼 <b>${cantN(g.b.consumido, 2)} / ${cant(g.b.oz, 2)}</b> ${TIPOS[g.b.tipo] || ""}</span>
                <span class="badge ${g.b.estado}">${ESTADO[g.b.estado] || g.b.estado}</span>
                <span class="sub">${g.b.estado === "incompleto" ? `se desecharon ${cant(g.b.desechado, 2)}` : g.b.estado === "abierto" ? `quedan ${cant(g.b.restante, 2)}` : ""}</span>
              </div>` : `<div class="bib-cab"><span class="sub">Sin biberón</span></div>`}
            <ul class="lista">${g.tomas.slice().reverse().map((t) => `
              <li data-id="${t.id}">
                <span class="hora">${hora(t.fin)}</span>
                <span class="oz">${cant(t.oz_tomadas, 2)}</span>
                <span class="meta-t">${TIPOS[t.tipo] || t.tipo}${t.nota ? ` · ${esc(t.nota)}` : ""}</span>
                <span class="badge ${t.confianza}">${CONFIANZAS[t.confianza] || t.confianza}</span>
                <span class="fuente">${FUENTES[t.fuente] || esc(t.fuente || "")}</span>
              </li>`).join("")}</ul>
          </div>`).join("") : `<p class="vacio">Sin tomas este día.</p>`}
        <button class="secundario" id="agregar">+ Agregar toma a este día</button>
      </section>
      <section class="tarjeta">
        <div class="fila-titulo"><h2>🧷 Pañales del día</h2><span class="sub">${panales.length} · 💧 ${panales.filter((x) => x.tipo === "pipi").length} · 💩 ${panales.filter((x) => x.tipo === "popo").length} · ambos ${panales.filter((x) => x.tipo === "ambos").length}</span></div>
        ${panales.length ? `<ul class="lista">${panales.slice().reverse().map((x) => `
          <li data-panal="${x.id}">
            <span class="hora">${hora(x.fin)}</span>
            <span class="oz">${TIPOS_PANAL[x.tipo] || x.tipo}</span>
            <span class="meta-t">${x.color ? `${NOMBRE_COLOR[x.color] || x.color} · ${NOMBRE_CONS[x.consistencia] || x.consistencia || ""}` : ""}${x.nota ? ` · ${esc(x.nota)}` : ""}</span>
            <span class="fuente">${esc(x.registrado_por || "")}</span>
          </li>`).join("")}</ul>` : `<p class="vacio">Sin pañales este día.</p>`}
        <button class="secundario" id="agregar-panal">+ Agregar pañal a este día</button>
      </section>`;
    const $ = (id) => cont.querySelector(`#${id}`);
    $("prev").onclick = () => { this._dia = sumarDias(this._dia, -1); this._cargarTomas(); };
    if (!esHoy) {
      $("next").onclick = () => { this._dia = sumarDias(this._dia, 1); this._cargarTomas(); };
      $("hoy").onclick = () => { this._dia = inicioDia(new Date()); this._cargarTomas(); };
    }
    $("fecha").onchange = (e) => { if (e.target.value) { this._dia = inicioDia(new Date(e.target.value + "T00:00")); this._cargarTomas(); } };
    cont.querySelectorAll("li[data-id]").forEach((li) => {
      li.onclick = () => this._editarToma(this._tomasDia.find((t) => t.id === Number(li.dataset.id)));
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

  _editarToma(t, base) {
    const nueva = !t;
    const datos = nueva
      ? { fin: aInputLocal(base), oz_tomadas: "", tipo: "formula" }
      : { ...t, fin: aInputLocal(new Date(t.fin)) };
    const { dlg, cerrar } = this._modal(`
      <h2>${nueva ? "Nueva toma" : `Toma de las ${hora(t.fin)}`}</h2>
      ${this._formToma(datos, "edit", nueva)}
      ${nueva ? "" : `<label class="conf">Confianza<select id="confianza">${Object.entries(CONFIANZAS)
        .map(([k, v]) => `<option value="${k}" ${k === t.confianza ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <p class="sub">Registrada por ${esc(t.registrado_por || "—")} · ${FUENTES[t.fuente] || esc(t.fuente || "")}</p>
      <div class="botones mover">
        <button class="secundario" id="mover-nuevo">Mover a biberón nuevo</button>
        <button class="secundario" id="mover-anterior">Unir al biberón anterior</button>
      </div>`}
      <div class="botones">
        ${nueva ? "" : `<button class="peligro" id="borrar">Borrar</button>`}
        <span class="flex"></span>
        <button class="secundario" id="cancelar">Cancelar</button>
        <button class="primario" id="guardar">Guardar</button>
      </div>`);
    const f = dlg.querySelector("#form-edit");
    const conf = dlg.querySelector("#confianza");
    if (conf) f.addEventListener("input", (e) => { if (e.target.name === "oz_tomadas") conf.value = "exacto"; });
    const listo = (msg) => (async () => { cerrar(); this._cargarTomas(); if (msg) this._aviso(msg); })();
    dlg.querySelector("#guardar").onclick = async () => {
      const d = this._leerForm(f, nueva); if (!d) return;
      if (nueva) {
        await this._accion(() => this._servicio("registrar_toma", { ...d, fuente: "app" }, true), "Toma agregada");
      } else {
        d.confianza = conf.value;
        if (!d.nota) d.nota = "";
        await this._accion(() => this._servicio("corregir_toma", { id: t.id, ...d }, true), "Toma actualizada");
      }
      listo();
    };
    if (nueva) return;
    dlg.querySelector("#borrar").onclick = async () => {
      if (!confirm(`¿Borrar la toma de las ${hora(t.fin)} (${cant(t.oz_tomadas, 2)})?`)) return;
      await this._accion(() => this._servicio("borrar_toma", { id: t.id }, true), "Toma borrada");
      listo();
    };
    dlg.querySelector("#mover-nuevo").onclick = async () => {
      await this._accion(() => this._servicio("corregir_toma", { id: t.id, mover: "nuevo" }, true),
        "Movida (con las siguientes del mismo biberón) a un biberón nuevo");
      listo();
    };
    dlg.querySelector("#mover-anterior").onclick = async () => {
      await this._accion(() => this._servicio("corregir_toma", { id: t.id, mover: "anterior" }, true), "Unida al biberón anterior");
      listo();
    };
  }

  _editarBiberon(b) {
    if (!b) return;
    const { dlg, cerrar } = this._modal(`
      <h2>Biberón de las ${hora(b.preparado)}</h2>
      <p class="sub">${cantN(b.consumido, 2)} de ${cant(b.oz, 2)} en ${b.n_tomas} toma${b.n_tomas === 1 ? "" : "s"}
        ${b.primera_toma ? ` · ${hora(b.primera_toma)}–${hora(b.ultima_toma)}` : ""}</p>
      <form class="form" id="form-bib" onsubmit="return false">
        <label>Tamaño (${U()})<input type="number" name="oz" step="${PASO()}" min="${PASO()}" max="${MAXC()}" inputmode="decimal" value="${cantN(b.oz, 2)}"></label>
        <label>Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === b.tipo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="completo">Nota<input type="text" name="nota" value="${esc(b.nota || "")}"></label>
      </form>
      <div class="botones">
        ${b.estado === "abierto" ? `<button class="peligro" id="cerrar-bib">Cerrar (desechar ${cant(b.restante, 2)})</button>` : ""}
        ${b.estado === "incompleto" ? `<button class="secundario" id="reabrir-bib">Reabrir</button>` : ""}
        <span class="flex"></span>
        <button class="secundario" id="cancelar">Cancelar</button>
        <button class="primario" id="guardar-bib">Guardar</button>
      </div>`);
    const listo = () => { cerrar(); this._cargarTomas(); };
    dlg.querySelector("#guardar-bib").onclick = async () => {
      const f = dlg.querySelector("#form-bib");
      const oz = aOz(parseFloat(f.oz.value));
      await this._accion(() => this._servicio("corregir_biberon",
        { id: b.id, oz, tipo: f.tipo.value, nota: f.nota.value.trim() }, true), "Biberón actualizado");
      listo();
    };
    const c = dlg.querySelector("#cerrar-bib");
    if (c) c.onclick = async () => { await this._accion(() => this._servicio("cerrar_biberon", { id: b.id }, true), "Biberón cerrado"); listo(); };
    const ro = dlg.querySelector("#reabrir-bib");
    if (ro) ro.onclick = async () => { await this._accion(() => this._servicio("corregir_biberon", { id: b.id, reabrir: true }, true), "Biberón reabierto"); listo(); };
  }

  // ---------- Ajustes ----------
  _htmlAjustes() {
    const v = (k) => this._num(k) ?? "";
    return `
      <section class="tarjeta">
        <h2>Biberón e indicación del pediatra</h2>
        <form class="form" id="form-ajustes" onsubmit="return false">
          <label>Oz por biberón <small>(se guarda en oz)</small>
            <input type="number" name="oz_por_biberon" step="0.5" min="0.5" max="10" inputmode="decimal" value="${v("oz_por_biberon")}">
            <span class="ayuda">Tamaño de cada biberón nuevo.</span></label>
          <label>Fórmula empezada: límite (h)
            <input type="number" name="limite_biberon" step="0.25" min="0.5" max="4" inputmode="decimal" value="${v("limite_biberon")}">
            <span class="ayuda">Después de esto se sugiere preparar otro.</span></label>
          <label>Materna empezada: límite (h)
            <input type="number" name="limite_materna" step="0.25" min="0.5" max="4" inputmode="decimal" value="${v("limite_materna")}"></label>
          <label>Materna a temp. ambiente (h)
            <input type="number" name="caducidad_ambiente" step="0.5" min="0.5" max="8" inputmode="decimal" value="${v("caducidad_ambiente")}"></label>
          <label>Materna en refrigerador (días)
            <input type="number" name="caducidad_refri" step="0.5" min="0.5" max="8" inputmode="decimal" value="${v("caducidad_refri")}"></label>
          <label>Meta oz por toma
            <input type="number" name="meta_oz_toma" step="0.5" min="0.5" max="10" inputmode="decimal" value="${v("meta_oz_toma")}"></label>
          <label>Cada cuántas horas
            <input type="number" name="intervalo_indicado" step="0.5" min="1" max="6" inputmode="decimal" value="${v("intervalo_indicado")}"></label>
        </form>
        <p class="sub" id="prevista"></p>
        <button class="primario" id="guardar-ajustes">Guardar ajustes</button>
      </section>
      <section class="tarjeta"><h2>Lo que dicen los últimos 7 días</h2><div id="sugerencia" class="sub"></div></section>`;
  }

  _eventosAjustes() {
    const f = this.shadowRoot.getElementById("form-ajustes");
    const prev = () => {
      const m = parseFloat(f.meta_oz_toma.value), i = parseFloat(f.intervalo_indicado.value);
      this.shadowRoot.getElementById("prevista").textContent = (m && i)
        ? `Meta diaria: ${cant(m * 24 / i, 1)} (${num(24 / i, 1)} tomas al día). El recordatorio sonará ${num(i, 1)} h después de cada toma.`
        : "";
    };
    f.addEventListener("input", prev); prev();
    this.shadowRoot.getElementById("guardar-ajustes").onclick = async () => {
      const cambios = ["oz_por_biberon", "limite_biberon", "limite_materna", "caducidad_ambiente", "caducidad_refri",
        "meta_oz_toma", "intervalo_indicado"]
        .filter((k) => f[k].value !== "" && Number(f[k].value) !== this._num(k));
      if (!cambios.length) { this._aviso("Sin cambios"); return; }
      await this._accion(async () => {
        for (const k of cambios) {
          await this._hass.callService("number", "set_value", { entity_id: this._cfg.entidades[k], value: Number(f[k].value) });
        }
      }, "Ajustes guardados");
    };
    this._pintarSugerencia();
  }

  _pintarSugerencia() {
    const el = this.shadowRoot.getElementById("sugerencia"); if (!el) return;
    const ozToma = this._num("oz_por_toma"), porDia = this._num("tomas_por_dia"), pct = this._num("pct_terminados");
    const desechado = this._num("desechado_7d"), ozBib = this._num("oz_por_biberon"), meta = this._num("meta_oz_toma");
    if (ozToma === null) { el.textContent = "Todavía no hay suficientes registros."; return; }
    const lineas = [`Toma en promedio <b>${cant(ozToma, 2)}</b> por toma, unas <b>${num(porDia, 1)}</b> veces al día.`];
    if (pct !== null) lineas.push(`Terminó el <b>${pct}%</b> de sus biberones; se desecharon <b>${cant(desechado, 1)}</b> de fórmula.`);
    if (pct !== null && pct < 50 && ozBib) lineas.push(`Muchos biberones quedan incompletos: podrían preparar menos (≈${cant(Math.max(0.5, ozBib - 0.5), 1)}) para desperdiciar menos.`);
    if (pct !== null && pct >= 80) lineas.push("Se termina casi todos sus biberones: buen dato para comentar con el pediatra por si conviene aumentar.");
    if (meta && ozToma < meta * 0.6) lineas.push(`Come en tomas pequeñas (${cant(ozToma, 2)} vs meta ${num(meta, 1)}): es normal que coma más seguido.`);
    el.innerHTML = lineas.map((l) => `<p>${l}</p>`).join("")
      + `<p class="ayuda">Son referencias de tus registros; cualquier cambio de cantidad, consúltalo con su pediatra.</p>`;
  }

  // ---------- Leche materna: reserva y extracciones ----------
  _htmlMaterna() {
    return `
      <section class="kpis" id="kpis-materna"></section>
      <section class="tarjeta">
        <div class="fila-titulo"><h2>Reserva</h2><span class="sub" id="reserva-total"></span></div>
        <div id="reserva"></div>
        <details id="det-guardar">
          <summary>＋ Guardar biberón de leche materna</summary>
          <form class="form" id="form-guardar" onsubmit="return false">
            <label>Cantidad (${U()})<input type="number" name="oz" step="${PASO()}" min="${PASO()}" max="${MAXC()}" inputmode="decimal" required></label>
            <label>Dónde<select name="ubicacion"><option value="refrigerador">Refrigerador</option><option value="ambiente">Temperatura ambiente</option></select></label>
            <label class="completo">Se hizo a las<input type="datetime-local" name="hecho" value="${aInputLocal(new Date())}"></label>
          </form>
          <button class="primario" id="btn-guardar">Guardar en reserva</button>
        </details>
      </section>
      <section class="tarjeta">
        <h2>Registrar extracción</h2>
        <form class="form" id="form-ext" onsubmit="return false">
          <label class="completo">Terminó a las<input type="datetime-local" name="fin" value="${aInputLocal(new Date())}"></label>
          <label>Izquierdo (${U()})<input type="number" name="oz_izq" step="${PASO()}" min="0" max="${MAXC()}" inputmode="decimal"></label>
          <label>Derecho (${U()})<input type="number" name="oz_der" step="${PASO()}" min="0" max="${MAXC()}" inputmode="decimal"></label>
          <label>Duración (min)<input type="number" name="duracion_min" step="1" min="0" max="180" inputmode="numeric"></label>
          <label>Dónde se guarda<select name="ubicacion"><option value="refrigerador">Refrigerador</option><option value="ambiente">Temperatura ambiente</option></select></label>
          <label class="check completo"><input type="checkbox" name="guardar" checked> Guardar en biberones de reserva</label>
          <label class="completo">Repartir en biberones (opcional)<input type="text" name="reparto" placeholder="ej. 2 + 1.5  (vacío = un biberón con todo)"></label>
        </form>
        <button class="primario" id="btn-ext">Guardar extracción</button>
        <h2 class="sep">Extracciones recientes</h2>
        <div id="extracciones"></div>
      </section>`;
  }

  _pintarKpisMaterna() {
    const k = this.shadowRoot.getElementById("kpis-materna"); if (!k) return;
    const s = this._st("reserva_oz"), cad = this._val("reserva_caduca");
    const vig = s ? s.attributes.vigentes : 0, caducados = s ? s.attributes.caducados : 0;
    const mh = this._num("materna_hoy") ?? 0, fh = this._num("formula_hoy") ?? 0;
    k.innerHTML = `
      <div class="kpi"><div class="etq">En reserva</div><div class="num">${cantN(this._num("reserva_oz"), 1)} <small>${U()}</small></div>
        <div class="sub">${vig} biberón${vig === 1 ? "" : "es"}${caducados ? ` · <span class="rojo">${caducados} caducado${caducados === 1 ? "" : "s"}</span>` : ""}</div></div>
      <div class="kpi"><div class="etq">Próxima caducidad</div><div class="num sm">${cad ? `${hora(cad)}` : "—"}</div>
        <div class="sub">${cad ? relativo(cad) : ""}</div></div>
      <div class="kpi"><div class="etq">Extraído hoy</div><div class="num">${cantN(this._num("extraido_hoy"), 1)} <small>${U()}</small></div>
        <div class="sub">promedio ${cant(this._num("extraido_dia"), 1)}/día (7 d)</div></div>
      <div class="kpi"><div class="etq">Tomó hoy</div><div class="num sm">${num(mh, 1)} materna · ${num(fh, 1)} fórmula</div>
        <div class="sub">${mh + fh ? Math.round(mh / (mh + fh) * 100) : 0}% materna · desechada 7 d: ${cant(this._num("materna_desechada_7d"), 1)}</div></div>`;
  }

  async _cargarMaterna() {
    this._pintarKpisMaterna();
    const hoy = inicioDia(new Date());
    let reservas = [], ext = [];
    try {
      reservas = (await this._servicio("listar_reservas", {}, true)).reservas;
      ext = (await this._servicio("listar_extracciones",
        { desde: `${fechaISO(sumarDias(hoy, -2))} 00:00:00`, hasta: `${fechaISO(sumarDias(hoy, 1))} 00:00:00` }, true)).extracciones;
    } catch (e) { this._aviso(`Error al cargar: ${e.message}`); }
    const r = this.shadowRoot;
    const LUGAR = { refrigerador: "Refrigerador", ambiente: "Ambiente" };
    const total = reservas.filter((b) => !b.caducado).reduce((s, b) => s + b.oz, 0);
    r.getElementById("reserva-total").textContent = reservas.length ? `${cant(total, 1)} vigentes` : "";
    r.getElementById("reserva").innerHTML = reservas.length ? `<ul class="lista">${reservas.map((b, i) => {
      const d = new Date(b.hecho || b.preparado);
      const pronto = b.caduca && !b.caducado && (new Date(b.caduca) - Date.now()) < 6 * 3600 * 1000;
      return `<li class="reserva ${b.caducado ? "caducada" : ""}">
        <span class="hora">${cant(b.oz, 2)}</span>
        <span class="oz">${d.getDate()} ${MESES[d.getMonth()]} ${hora(b.hecho || b.preparado)} · <span class="badge ${b.ubicacion}">${LUGAR[b.ubicacion] || "—"}</span></span>
        <span class="meta-t ${b.caducado ? "rojo" : pronto ? "naranja" : ""}">${b.caducado ? `Caducó ${relativo(b.caduca)}` : b.caduca ? `Caduca ${relativo(b.caduca)}` : ""}${i === 0 && !b.caducado ? " · la más antigua" : ""}</span>
        <span class="acciones">
          <button class="chip" data-usar="${b.id}" ${b.caducado ? "disabled" : ""}>Usar</button>
          <button class="chip" data-mover="${b.id}" data-a="${b.ubicacion === "refrigerador" ? "ambiente" : "refrigerador"}">${b.ubicacion === "refrigerador" ? "A ambiente" : "Al refri"}</button>
          <button class="chip peligro-chip" data-descartar="${b.id}">Desechar</button>
        </span>
      </li>`;
    }).join("")}</ul>` : `<p class="vacio">No hay leche materna en reserva.</p>`;
    r.querySelectorAll("[data-usar]").forEach((b) => b.onclick = () => this._usarReserva(Number(b.dataset.usar)));
    r.querySelectorAll("[data-mover]").forEach((b) => b.onclick = async () => {
      await this._accion(() => this._servicio("mover_reserva", { id: Number(b.dataset.mover), ubicacion: b.dataset.a }, true), "Movido");
      this._cargarMaterna();
    });
    r.querySelectorAll("[data-descartar]").forEach((b) => b.onclick = async () => {
      if (!confirm("¿Desechar este biberón de leche materna?")) return;
      await this._accion(() => this._servicio("descartar_reserva", { id: Number(b.dataset.descartar) }, true), "Desechado");
      this._cargarMaterna();
    });
    r.getElementById("extracciones").innerHTML = ext.length ? `<ul class="lista">${ext.slice().reverse().map((e) => {
      const d = new Date(e.fin);
      return `<li class="medida">
        <span class="hora">${hora(e.fin)}</span>
        <span class="oz">${cant(e.oz_total, 2)}</span>
        <span class="meta-t">${DIAS[d.getDay()]} ${d.getDate()} · izq ${num(e.oz_izq, 2)} · der ${num(e.oz_der, 2)}${e.duracion_min ? ` · ${num(e.duracion_min, 0)} min` : ""}</span>
        <button class="icono" data-borrar-ext="${e.id}" aria-label="Borrar">✕</button>
      </li>`;
    }).join("")}</ul>` : `<p class="vacio">Sin extracciones en los últimos 3 días.</p>`;
    r.querySelectorAll("[data-borrar-ext]").forEach((b) => b.onclick = async () => {
      if (!confirm("¿Borrar esta extracción? También se quitan sus biberones de reserva sin usar.")) return;
      await this._accion(() => this._servicio("borrar_extraccion", { id: Number(b.dataset.borrarExt) }, true), "Extracción borrada");
      this._cargarMaterna();
    });
  }

  _eventosMaterna() {
    const r = this.shadowRoot;
    r.getElementById("btn-guardar").onclick = async () => {
      const f = r.getElementById("form-guardar");
      const oz = aOz(parseFloat(String(f.oz.value).replace(",", ".")));
      if (!(oz > 0)) { this._aviso("Indica la cantidad"); return; }
      await this._accion(() => this._servicio("guardar_leche",
        { oz, ubicacion: f.ubicacion.value, hecho: aServicio(f.hecho.value) }, true), "Guardado en reserva");
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
      if (!d.oz_izq && !d.oz_der) { this._aviso("Indica las oz de al menos un lado"); return; }
      const reparto = (f.reparto.value.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0).map(aOz);
      if (reparto.length) d.biberones = reparto;
      const res = await this._accion(() => this._servicio("registrar_extraccion", d, true));
      this._aviso(`Extracción de ${cant(res.oz_total, 2)}` + (res.biberones.length ? ` · ${res.biberones.length} biberón(es) a la reserva` : ""));
      f.oz_izq.value = ""; f.oz_der.value = ""; f.duracion_min.value = ""; f.reparto.value = "";
      f.fin.value = aInputLocal(new Date());
      this._cargarMaterna();
    };
  }

  async _usarReserva(id) {
    const b = this._biberon();
    let pausar = true;
    if (b && b.restante > 0) {
      pausar = await this._elegir(
        `Hay un biberón de ${TIPOS[b.tipo] || "fórmula"} en curso (${cantN(b.consumido, 2)} de ${cant(b.oz, 2)}). ¿Qué hacemos con él?`,
        [["pausa", "Materna primero y guardar el actual para después", "primario"],
         ["tirar", `Tirar el actual (${cant(b.restante, 2)})`, "peligro"]]);
      if (pausar === null) return;
      pausar = pausar === "pausa";
    }
    const r = await this._accion(() => this._servicio("usar_reserva", { ...(id ? { id } : {}), pausar_actual: pausar }, true));
    this._aviso(`Biberón en curso: leche materna ${cant(r.biberon.oz, 2)}` + (b && b.restante > 0 ? (pausar ? " · el anterior quedó en pausa" : " · el anterior se tiró") : ""));
    if (this._tab === "materna") this._cargarMaterna();
  }

  // Diálogo con opciones; devuelve la clave elegida o null si se cancela
  _elegir(texto, opciones) {
    return new Promise((resolver) => {
      const { dlg, cerrar } = this._modal(`
        <p>${esc(texto)}</p>
        <div class="opciones">${opciones.map(([k, t, c]) => `<button class="${c}" data-op="${k}">${esc(t)}</button>`).join("")}
          <button class="secundario" id="cancelar">Cancelar</button></div>`);
      dlg.querySelectorAll("[data-op]").forEach((x) => x.onclick = () => { cerrar(); resolver(x.dataset.op); });
      dlg.querySelector("#cancelar").onclick = () => { cerrar(); resolver(null); };
      dlg.querySelector(".fondo").addEventListener("click", (e) => { if (e.target.classList.contains("fondo")) resolver(null); });
    });
  }


  // ---------- Medidas ----------
  _htmlMedidas() {
    return `
      <section class="tarjeta">
        <h2>Nueva medida</h2>
        <form class="form" id="form-medida" onsubmit="return false">
          <label class="completo">Fecha<input type="datetime-local" name="fecha" value="${aInputLocal(new Date())}"></label>
          <label>Peso (kg)<input type="number" name="peso_kg" step="0.01" min="0.5" max="30" inputmode="decimal"></label>
          <label>Talla (cm)<input type="number" name="talla_cm" step="0.1" min="20" max="130" inputmode="decimal"></label>
          <label>Perímetro cefálico (cm)<input type="number" name="perimetro_cm" step="0.1" min="20" max="60" inputmode="decimal"></label>
          <label>Nota<input type="text" name="nota" placeholder="p. ej. cita pediatra"></label>
        </form>
        <button class="primario" id="guardar-medida">Guardar medida</button>
      </section>
      <section class="tarjeta"><h2>Peso (kg) por edad</h2><div id="g-peso"></div></section>
      <section class="tarjeta"><h2>Talla (cm) por edad</h2><div id="g-talla"></div></section>
      <section class="tarjeta"><h2>Historial</h2><div id="lista-medidas"></div></section>`;
  }

  _eventosMedidas() {
    const r = this.shadowRoot;
    r.getElementById("guardar-medida").onclick = async () => {
      const f = r.getElementById("form-medida");
      const d = { fecha: aServicio(f.fecha.value) };
      ["peso_kg", "talla_cm", "perimetro_cm"].forEach((k) => { if (f[k].value !== "") d[k] = parseFloat(f[k].value); });
      if (f.nota.value.trim()) d.nota = f.nota.value.trim();
      if (!d.peso_kg && !d.talla_cm && !d.perimetro_cm) { this._aviso("Escribe al menos peso, talla o perímetro"); return; }
      await this._accion(() => this._servicio("registrar_medida", d, true), "Medida guardada");
      f.reset(); f.fecha.value = aInputLocal(new Date());
      this._cargarMedidas();
    };
  }

  async _cargarMedidas() {
    try { this._medidas = (await this._servicio("listar_medidas", {}, true)).medidas; }
    catch (e) { this._aviso(`Error: ${e.message}`); return; }
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
          m.perimetro_cm != null ? `PC ${num(m.perimetro_cm, 1)}` : ""].filter(Boolean).join(" · ")}</span>
        <span class="meta-t">${edad(m.fecha)} días${m.nota ? ` · ${esc(m.nota)}` : ""}</span>
        <button class="icono" data-borrar="${m.id}" aria-label="Borrar">✕</button>
      </li>`;
    }).join("")}</ul>` : `<p class="vacio">Sin medidas.</p>`;
    lista.querySelectorAll("[data-borrar]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("¿Borrar esta medida?")) return;
        await this._accion(() => this._servicio("borrar_medida", { id: Number(b.dataset.borrar) }, true), "Medida borrada");
        this._cargarMedidas();
      };
    });
  }

  // ---------- Gráficas ----------
  _htmlGraficas() {
    return `
      <div class="segmentos">
        ${[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]]
          .map(([k, t]) => `<button data-p="${k}" class="${k === this._periodo ? "activa" : ""}">${t}</button>`).join("")}
      </div>
      <section class="tarjeta"><h2 id="t-oz"></h2><div id="g-oz"></div>
        <div class="leyenda"><span class="c1"></span>Fórmula <span class="c4"></span>Materna <span class="c3"></span>Meta</div></section>
      <section class="tarjeta"><h2 id="t-tomas"></h2><div id="g-tomas"></div></section>
      <section class="tarjeta"><h2>Promedio por toma</h2><div id="g-ozt"></div></section>
      <section class="tarjeta"><h2 id="t-bib"></h2><div id="g-bib"></div></section>
      <section class="tarjeta"><h2>Biberones terminados (%)</h2><div id="g-term"></div></section>
      <section class="tarjeta"><h2 id="t-des"></h2><div id="g-des"></div><p class="sub" id="n-des"></p></section>
      <section class="tarjeta"><h2 id="t-ext"></h2><div id="g-ext"></div></section>
      <section class="tarjeta"><h2 id="t-pan"></h2><div id="g-pan"></div>
        <div class="leyenda"><span class="c5"></span>Pipí <span class="c6"></span>Popó <span class="c7"></span>Ambos</div></section>
      <section class="tarjeta"><h2>¿A qué hora come? (promedio por hora, últimos 7 días)</h2><div id="g-hora-oz"></div></section>
      <section class="tarjeta"><h2>¿A qué hora se cambia el pañal? (promedio por hora, 7 días)</h2><div id="g-hora-pan"></div></section>`;
  }

  _eventosGraficas() {
    this.shadowRoot.querySelector(".segmentos").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-p]"); if (!b) return;
      this._periodo = b.dataset.p;
      this.shadowRoot.querySelectorAll(".segmentos button").forEach((x) => x.classList.toggle("activa", x === b));
      this._pintarGraficas();
    });
  }

  async _pintarGraficas() {
    const hoy = inicioDia(new Date());
    const p = this._periodo;
    const grupos = [];
    if (p === "dia") for (let i = 13; i >= 0; i--) {
      const a = sumarDias(hoy, -i); grupos.push({ a, b: sumarDias(a, 1), et: i === 0 ? "hoy" : `${DIAS[a.getDay()]} ${a.getDate()}` });
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
    } catch (e) { this._aviso(`Error: ${e.message}`); }
    const nac = inicioDia(new Date(this._cfg.nacimiento + "T00:00"));
    const primero = tomas.length ? inicioDia(new Date(tomas[0].fin)) : hoy;
    const desdeDatos = primero > nac ? primero : nac;
    const manana = sumarDias(hoy, 1);
    const agg = grupos.map((g) => {
      const dentro = (iso) => { const d = new Date(iso); return d >= g.a && d < g.b; };
      const ts = tomas.filter((t) => dentro(t.fin));
      const bs = bibs.filter((b) => b.estado !== "reserva" && dentro(b.preparado));
      const cerrados = bs.filter((b) => b.estado !== "abierto");
      // Días con datos en el grupo (sin contar antes del primer registro ni el futuro)
      const ini = g.a > desdeDatos ? g.a : desdeDatos, fin = g.b < manana ? g.b : manana;
      const dias = Math.max(0, Math.round((fin - ini) / 86400000));
      const div = p === "dia" ? 1 : (dias || 1);
      const exacto = ts.filter((t) => t.tipo !== "materna").reduce((s, t) => s + t.oz_tomadas, 0);
      const resto = ts.filter((t) => t.tipo === "materna").reduce((s, t) => s + t.oz_tomadas, 0);
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
    const suf = p === "dia" ? "por día" : "promedio por día";
    const r = this.shadowRoot, color = "var(--primary-color)";
    const EN_OZ = ["exacto", "estimado", "ozToma", "desechado", "extraido"];
    const serie = (clave, nombre, c, op) => ({ nombre, valores: agg.map((x) => (EN_OZ.includes(clave) ? aUnidad(x[clave]) : x[clave])), color: c, opacidad: op });
    r.getElementById("t-oz").textContent = `${esMl() ? "ml" : "Oz"} ${suf}`;
    r.getElementById("g-oz").innerHTML = barras({ etiquetas, unidad: U(), meta: meta ? aUnidad(meta) : null,
      series: [serie("exacto", "fórmula", color), serie("estimado", "materna", "var(--materna-color, #e91e63)")] });
    r.getElementById("t-tomas").textContent = `Tomas ${suf}`;
    r.getElementById("g-tomas").innerHTML = barras({ etiquetas, unidad: "tomas", meta: intervalo ? 24 / intervalo : null,
      series: [serie("tomas", "tomas", "var(--accent-color, #ff9800)")] });
    r.getElementById("g-ozt").innerHTML = barras({ etiquetas, unidad: U(), meta: ozMeta ? aUnidad(ozMeta) : null, alto: 150,
      series: [serie("ozToma", "oz/toma", "var(--success-color, #43a047)")] });
    r.getElementById("t-bib").textContent = `Biberones ${suf}`;
    r.getElementById("g-bib").innerHTML = barras({ etiquetas, unidad: "biberones", alto: 150,
      series: [serie("biberones", "biberones", "var(--info-color, #039be5)")] });
    r.getElementById("g-term").innerHTML = barras({ etiquetas, unidad: "%", alto: 150,
      series: [serie("pct", "terminados", "var(--success-color, #43a047)")] });
    r.getElementById("t-des").textContent = `Fórmula desechada (${U()} ${suf})`;
    r.getElementById("g-des").innerHTML = barras({ etiquetas, unidad: U(), alto: 150,
      series: [serie("desechado", "desechado", "var(--warning-color, #ff9800)")] });
    r.getElementById("t-ext").textContent = `Leche extraída (${U()} ${suf})`;
    r.getElementById("g-ext").innerHTML = barras({ etiquetas, unidad: U(), alto: 150,
      series: [serie("extraido", "extraída", "var(--materna-color, #e91e63)")] });
    r.getElementById("t-pan").textContent = `Pañales ${suf}`;
    r.getElementById("g-pan").innerHTML = barras({ etiquetas, unidad: "pañales", alto: 160,
      series: [serie("pipi", "pipí", "#29b6f6"), serie("popo", "popó", "#8d6e63"), serie("ambos", "ambos", "#ab47bc")] });
    // Distribución por hora del día (últimos 7 días completos + hoy)
    const hace7 = sumarDias(hoy, -6);
    const t7 = tomas.filter((t) => new Date(t.fin) >= hace7), p7 = pans.filter((x) => new Date(x.fin) >= hace7);
    const dias7 = Math.max(1, Math.min(7, Math.round((sumarDias(hoy, 1) - (desdeDatos > hace7 ? desdeDatos : hace7)) / 86400000)));
    const horas = [...Array(24).keys()];
    const porHora = (lista, f) => horas.map((h) => lista.filter((x) => new Date(x.fin).getHours() === h).reduce((s, x) => s + f(x), 0) / dias7);
    const etH = horas.map((h) => (h % 3 === 0 ? `${h}h` : ""));
    r.getElementById("g-hora-oz").innerHTML = barras({ etiquetas: etH, unidad: U(), alto: 150,
      series: [{ nombre: U(), valores: porHora(t7, (t) => aUnidad(t.oz_tomadas)), color: "var(--primary-color)" }] });
    r.getElementById("g-hora-pan").innerHTML = barras({ etiquetas: etH, unidad: "pañales", alto: 140,
      series: [{ nombre: "pañales", valores: porHora(p7, () => 1), color: "#8d6e63" }] });
    const totalDes = bibs.reduce((s, b) => s + (b.desechado || 0), 0);
    r.getElementById("n-des").textContent = `Total en el periodo: ${cant(totalDes, 1)} en ${bibs.filter((b) => b.estado === "incompleto").length} biberones incompletos.`;
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
.linea { fill:none; stroke:var(--primary-color); stroke-width:2.5; }
.punto { fill:var(--primary-color); }
.leyenda { display:flex; gap:6px; align-items:center; font-size:12px; color:var(--secondary-text-color); margin-top:6px; flex-wrap:wrap; }
.leyenda span { width:12px; height:12px; border-radius:3px; display:inline-block; margin-left:8px; }
.leyenda .c1 { background:var(--primary-color); } .leyenda .c2 { background:var(--primary-color); opacity:.45; }
.leyenda .c3 { background:var(--error-color, #db4437); height:3px; }
`;

customElements.define("bebe-panel", BebePanel);
