# Automatización de tickets con Machine Learning (Avant → Cibernos → Operaciones)

Este documento explica cómo el módulo de importación asistido por ML de **The Tiket** automatiza el flujo completo de tickets a partir de los Excels consolidados por Avant, manteniendo control humano y trazabilidad.

## 1. Entrada de datos (Avant)
- **Fuente:** archivo Excel consolidado por Avant, agrupado por cliente.
- **Automatización:**
  - El Excel se ingesta automáticamente en la plataforma a través del canvas de importación (apps/web) y se envía al worker de Python para _preview_ y normalización.
  - El modelo detecta filas con estructura válida, identifica columnas clave (incluido **Número de POS**) y extrae datos relevantes para cada incidencia.
- **Resultado esperado:** el **Número de POS** se reconoce y se pre-carga en el título del ticket y en los campos visibles para el técnico.

## 2. Gestión y validación (Cibernos)
- **Responsable:** Cibernos descarga el Excel y gestiona la creación de tickets conforme a SLAs.
- **Automatización:**
  - Validación ML del formato de **Número de POS**, dirección y coordenadas para geolocalización.
  - Detección de faltantes críticos (por ejemplo, POS ausente) con alertas que bloquean la creación hasta que el usuario corrija o complete el dato.
  - Reglas duras de coherencia: cliente y dirección válidos, plantillas compatibles y tipos de datos correctos antes de avanzar a _run_.
- **Resultado esperado:** cada ticket se completa automáticamente con **Número de POS** en el título y en el campo correspondiente, cumpliendo SLA y evitando ambigüedad.

## 3. Asignación y resolución (Operaciones)
- **Estado inicial:** los tickets nacen como **“Por asignar”**.
- **Automatización:**
  - El ML analiza historial de asignaciones, disponibilidad y tipo de incidencia para recomendar la mejor asignación (o autoasignar si está habilitado).
  - Se priorizan patrones de especialización (técnico con expertise en cierto equipo o cliente) y balance de carga.
- **Resultado esperado:** asignación ágil y trazable, optimizada por recomendaciones basadas en historial y capacidad del técnico.

## 4. Cierre y evidencias
- **Control:** el coordinador valida la resolución y genera el informe final.
- **Automatización:**
  - El sistema propone el formato del informe alineado al Excel original de Avant y verifica consistencia de datos antes de cerrarlo.
  - Generación automática del informe y carga en **SharePoint** como evidencia.
- **Resultado esperado:** el informe se produce y se sube automáticamente manteniendo el formato original y la trazabilidad completa del ticket.

## Principios transversales de seguridad y control
- **ML asistido, no autónomo:** cualquier acción irreversible requiere confirmación del usuario (preview → run).
- **Idempotencia y trazabilidad:** cada job de importación mantiene logs, resumen de errores y enlaces a los tickets creados.
- **Cumplimiento de SLA:** validaciones tempranas evitan tickets incompletos; las recomendaciones de asignación consideran disponibilidad y tiempos de atención.
