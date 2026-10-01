# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado semántico (MAYOR.MENOR.PARCHE).
Mientras la versión sea 0.x, puede haber cambios incompatibles entre versiones menores.

## [0.5.0] - sin publicar
### Agregado
- Leche materna desde la reserva: "＋ Materna" en Hoy pregunta qué biberón de la reserva usar (primero el que caduca antes)
  cuando hay más de uno. Al registrar una toma de materna con biberón nuevo, o al cambiar un biberón a materna, el panel
  pregunta de cuál de la reserva salió y la descuenta (o "No es de la reserva").
- `registrar_toma` acepta `reserva_id` y `pausar_actual`; `corregir_biberon` acepta `reserva_id`.
### Cambiado
- El tipo de una toma es siempre el de su biberón (`tipo` en `registrar_toma` solo decide el de un biberón nuevo);
  al cambiar el tipo de un biberón, sus tomas cambian también.
### Corregido
- Un biberón de materna creado a mano no descontaba la reserva (la leche quedaba ahí y luego contaba como desechada).

## [0.4.0] - sin publicar
### Agregado
- Varios bebés por instalación: una entrada por bebé, cada uno con su base de datos, sensores y ajustes.
  Las acciones aceptan el campo `bebe` (id de la entrada o nombre); con un solo bebé es opcional.
  El panel muestra un selector cuando hay más de un bebé (recuerda el último elegido en cada dispositivo).
- Copia automática de la base antes de cada migración de esquema (`<base>.antes-vN`).
- Los biberones creados automáticamente usan el tipo de leche principal del bebé.
- Inglés: integración (formularios, sensores, acciones) y panel completo; el panel usa el idioma del usuario de Home Assistant.
- Mensajes de error traducibles (sección `exceptions` en `translations/*.json`).
- Blueprints (inglés/español): botón – toque suma al biberón; botón – mantener = biberón nuevo; recordatorio de toma con respuesta
  desde la notificación; leche materna por caducar; botones de las notificaciones (deshacer, corregir, mover, respuestas);
  voz vía lista de tareas + IA (opcional). Funcionan con varios bebés y con oz o ml.
- Las respuestas de las acciones incluyen `bebe`, `nombre` y `unidad`; los sensores principales exponen `bebe_id`, `nombre` y `unidad`.
### Corregido
- El encabezado del panel podía trabarse al cambiar de bebé (recursión al actualizar la edad).
### Compatibilidad
- Instalaciones existentes siguen usando `bebe.db`; sus entidades, acciones y automatizaciones no cambian.

## [0.3.0] - 2026-09-30
### Agregado
- Pañales: pipí, popó o ambos; color y consistencia para popó con valores habituales configurables.
- Pantalla "Hoy" con última y siguiente toma destacadas; edición del tamaño del biberón en curso.
- Métricas de ritmo (oz/h), distribución por hora del día y pañales por tipo.
- Biberones en pausa: dar leche materna y continuar después con la fórmula.
- Leche materna: extracciones, reserva (refrigerador / ambiente) con caducidad y avisos.
- Opción "Configurar": nombre, fecha de nacimiento, sexo, unidad (oz/ml) y popó habitual.
- Nombre del proyecto: Baby Tracker.

## [0.2.0] - 2026-09-29
### Agregado
- Modelo de biberones con tomas incrementales (cada toma suma al biberón en curso).
- Panel en la barra lateral: Hoy, Tomas, Medidas, Gráficas y Ajustes.
- Meta diaria según la indicación del pediatra (oz por toma e intervalo).

## [0.1.0] - 2026-09-28
### Agregado
- Integración inicial: registro de tomas y medidas en SQLite, sensores de KPIs.
