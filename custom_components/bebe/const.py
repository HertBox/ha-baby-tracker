"""Constantes de la integración Bebé."""

DOMAIN = "bebe"
DB_FILENAME = "bebe.db"
# Archivo de base de datos de cada bebé (una entrada por bebé); el primero usa bebe.db
CONF_DB = "db"

CONF_NOMBRE = "nombre"
CONF_FECHA_NACIMIENTO = "fecha_nacimiento"
CONF_OZ_DEFAULT = "oz_default"
CONF_TIPO_DEFAULT = "tipo_default"
CONF_SEXO = "sexo"
# Popó "normal" esperada; se preselecciona y se usa si no se indica (editable en Configurar)
CONF_COLOR_POPO = "color_popo_default"
CONF_CONSISTENCIA_POPO = "consistencia_popo_default"
COLOR_POPO_DEFAULT = "amarillo"
CONSISTENCIA_POPO_DEFAULT = "pastosa"
SEXOS = ["nino", "nina", "sin_especificar"]
NOMBRE_PROYECTO = "Baby Tracker"
# Unidad para mostrar y capturar cantidades (internamente todo se guarda en oz)
CONF_UNIDAD = "unidad"
UNIDADES = ["oz", "ml"]

TIPOS = ["formula", "materna", "mixta"]
CONFIANZAS = ["exacto", "estimado", "inferido"]

ML_POR_OZ = 29.5735
# Referencia general por peso (solo informativa): ~150 ml/kg/día, tope ~32 oz/día.
ML_POR_KG_DIA = 150
OZ_DIA_MAX = 32

# Indicación del pediatra (ajustable desde la UI con entidades number)
META_OZ_TOMA_DEFAULT = 3.0
INTERVALO_INDICADO_DEFAULT_H = 3.0
# Tiempo desde la primera toma tras el cual se sugiere preparar otro biberón
LIMITE_BIBERON_DEFAULT_H = 1.5
# Leche materna (guía general CDC; ajustable desde la UI): desde la primera toma y por guardado
LIMITE_MATERNA_DEFAULT_H = 2.0
CADUCIDAD_AMBIENTE_DEFAULT_H = 4.0
CADUCIDAD_REFRI_DEFAULT_DIAS = 4.0
UBICACIONES = ["ambiente", "refrigerador"]
# Una toma con hora a menos de esto de "ahora" se considera en vivo
VENTANA_EN_VIVO_MIN = 5
# Una hora hasta 5 min en el futuro se tolera (relojes desfasados); más allá se rechaza.
TOLERANCIA_FUTURO_MIN = 5

TIPOS_PANAL = ["pipi", "popo", "ambos"]
COLORES_POPO = ["amarillo", "verde", "cafe", "naranja", "negro", "rojo", "blanco", "no_se"]
CONSISTENCIAS_POPO = ["liquida", "grumosa", "pastosa", "dura", "no_se"]

EVENTO_TOMA = "bebe_toma_registrada"
EVENTO_MEDIDA = "bebe_medida_registrada"
