# Baby Tracker for Home Assistant

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/)
[![Validate](https://github.com/HertBox/ha-baby-tracker/actions/workflows/validar.yml/badge.svg)](https://github.com/HertBox/ha-baby-tracker/actions/workflows/validar.yml)

**English** · [Español](README.es.md)

Track your baby's **bottles (formula and breast milk), feedings, diapers, pumping and growth** right inside Home Assistant —
with a dedicated panel, charts, reminders and one-tap logging from a Zigbee button, your phone or your voice assistant.
Everything is stored **locally** in your Home Assistant (SQLite). No cloud, no accounts, no subscriptions.

> ⚠️ **Not medical advice.** Baby Tracker is a logging tool. Goals, limits and hints are general references;
> decisions about your baby's feeding and health belong to your pediatrician.

<!-- Screenshot: docs/img/today.png -->

## Features

- **Bottles + incremental feedings** — every feeding adds to the current bottle; start a new bottle only when you prepare one.
  Overflow automatically goes to the next bottle. Edit the size of the current bottle for special cases.
- **Breast milk** — log pumping sessions (left/right), keep a **stash** (fridge / room temperature) with expiry,
  use the oldest first, pause the formula bottle while giving breast milk and resume it later.
- **Diapers** — pee, poop or both; color and consistency for poop with your baby's "usual" preselected.
- **Today at a glance** — last and next feeding (big), current bottle, diapers, daily goal progress, rate per hour.
- **Charts** by day, week or month: amount per day (formula vs breast milk), feedings, amount per feeding, bottles,
  % finished, wasted formula, pumped milk, diapers, and *when* the baby eats / needs a change.
- **Pediatrician's plan** — amount per feeding and interval; the daily goal and the reminder follow it.
- **Growth** — weight, length and head circumference history.
- **Several babies** (twins!) — one entry per baby, a selector in the panel.
- **oz or ml**, **English or Spanish** (follows each user's Home Assistant language).
- **Blueprints** for buttons, reminders, milk expiry, notification actions and voice.

## Installation

### HACS (recommended)
1. HACS → ⋮ → **Custom repositories** → `https://github.com/HertBox/ha-baby-tracker` · type **Integration**.
2. Install **Baby Tracker** and restart Home Assistant.
3. Settings → Devices & services → **Add integration** → **Baby Tracker**. Add one entry per baby.

### Manual
Copy `custom_components/bebe` into your `config/custom_components/` folder and restart.

## Configuration

When adding a baby you set the **name, date of birth, usual bottle size and main milk type**.
Later, **Configure** lets you change name, date of birth, sex, **unit (oz/ml)** and the **usual poop color/consistency**.
The **Settings** tab in the panel holds the pediatrician's plan (amount per feeding, interval) and milk limits.

> The internal domain is `bebe` (entities and actions use it, e.g. `bebe.registrar_toma`).

## The panel

A **Baby Tracker** entry appears in the sidebar (and in the companion app):

| Tab | What you do there |
|---|---|
| **Today** | Last/next feeding, current bottle (*How much did baby drink?*), new bottle, diaper buttons, KPIs |
| **Feedings** | Day view grouped by bottle; edit, delete, move feedings; diapers of the day |
| **Breast milk** | Stash with expiry, save milk, log pumping sessions |
| **Growth** | Weight / length / head circumference and their charts |
| **Charts** | Day / week / month charts |
| **Settings** | Bottle size, pediatrician's plan, milk limits, hints from the last 7 days |

<!-- Screenshots: docs/img/feedings.png · docs/img/charts.png · docs/img/milk.png -->

## Blueprints

Import the ones you need (they work with **any** button, phone and language):

| Blueprint | What it does | |
|---|---|---|
| **Button press adds to the bottle** | Each press adds e.g. 0.5 oz; presses close together = one feeding; one summary notification | [![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2FHertBox%2Fha-baby-tracker%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fbebe%2Fboton_toque.yaml) |
| **Button hold starts a new bottle** | Long press → new bottle of the usual size | [![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2FHertBox%2Fha-baby-tracker%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fbebe%2Fboton_mantener.yaml) |
| **Feeding reminder** | When the next feeding is due and nothing was logged, asks on your phones; answer with the amount and/or real time | [![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2FHertBox%2Fha-baby-tracker%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fbebe%2Frecordatorio.yaml) |
| **Breast milk about to expire** | Warns before the soonest stash bottle expires: Use now / Move to fridge / Discard | [![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2FHertBox%2Fha-baby-tracker%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fbebe%2Fleche_por_caducar.yaml) |
| **Notification buttons** | **Required** by the others: Undo, Edit amount, It was a new bottle, reminder answers, stash actions | [![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2FHertBox%2Fha-baby-tracker%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fbebe%2Facciones.yaml) |
| **Voice via to-do list + AI** *(optional)* | For assistants that add items to a list (e.g. Alexa lists): an AI Task entity interprets "drank one ounce" | [![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2FHertBox%2Fha-baby-tracker%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fbebe%2Fvoz_lista.yaml) |

Reminder answers accept text such as `1.5`, `20:15 1.5`, `40 min ago`, `new 2`
(Spanish too: `hace 40 min`, `nuevo 2`). Amounts are in the baby's unit.

## Actions (services)

All actions accept an optional `bebe` field (entry id or baby name) — required only with more than one baby.

| Action | Purpose |
|---|---|
| `bebe.registrar_toma` | Log a feeding (`oz_tomadas`, or `oz_sobrantes: 0` = finished what was left; `nuevo_biberon`, `fin`, `tipo`…) |
| `bebe.corregir_toma` · `bebe.borrar_toma` · `bebe.restaurar_toma` | Edit / move (`mover: nuevo/anterior`), delete, restore a feeding |
| `bebe.nuevo_biberon` · `bebe.cerrar_biberon` · `bebe.reanudar_biberon` · `bebe.corregir_biberon` · `bebe.borrar_biberon` | Bottles |
| `bebe.guardar_leche` · `bebe.usar_reserva` · `bebe.mover_reserva` · `bebe.descartar_reserva` | Breast milk stash |
| `bebe.registrar_extraccion` · `bebe.borrar_extraccion` | Pumping sessions |
| `bebe.registrar_panal` · `bebe.corregir_panal` · `bebe.borrar_panal` | Diapers |
| `bebe.registrar_medida` · `bebe.borrar_medida` | Growth measurements |
| `bebe.listar_*` | Read data (return a response) |

Every response includes `bebe`, `nombre` and `unidad`, handy for your own notifications.

## Sensors

Per baby: last / next feeding, amount today, feedings today, last 24 h, 7-day average, interval, daily goal, goal progress,
rate per hour, current bottle remaining / use-by, amount per feeding, feedings per day, bottles today, % finished,
wasted formula, breast milk / formula today, pumped today / average, stash and next expiry, last diaper / pee / poop,
diapers today / per day, time between diapers, weight, length and age. Plus `number` entities for the settings.

## Data & backups

Each baby's data lives in `config/bebe.db` (additional babies: `config/bebe_<id>.db`) and is included in Home Assistant backups.
Before any database upgrade a copy is saved as `<file>.antes-vN`. Removing a baby keeps its file.

## Limitations

- Charts are simple SVG; growth percentiles (WHO curves) are planned.
- The REST API shows validation errors as HTTP 500 (a Home Assistant behavior); the panel and automations show the proper message.

## Contributing

Issues and pull requests are welcome. The code and comments are in Spanish; translations live in
`custom_components/bebe/translations/` and in the `EN` dictionary at the end of `www/bebe-panel.js`.

## License

[MIT](LICENSE)
