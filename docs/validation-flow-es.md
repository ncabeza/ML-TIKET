# Flujo de validación en 10 niveles

Este documento resume el flujo de validación propuesto para la importación de tickets a partir de archivos Excel. El principio rector es simple: **si hay ambigüedad, el proceso se bloquea antes de crear un solo ticket**.

## 1. Nivel 1 – Validación de archivo (entrada)
- **Cuándo ocurre:** inmediatamente al subir el Excel.
- **Qué se valida:** formato `.xlsx`, tamaño permitido, legibilidad de hojas y corrupción del archivo.
- **Acciones:**
  | Tipo               | Ejemplo        | Acción |
  | ------------------ | -------------- | ------ |
  | Archivo inválido   | Excel dañado   | ❌ Bloquea |
  | Hoja vacía         | Sin datos      | ❌ Bloquea |
  | Formato no soportado | CSV mal formado | ❌ Bloquea |
- **Resultado:** no se avanza hasta subir un archivo válido.

## 2. Nivel 2 – Errores estructurales (parseo inteligente)
- **Qué detecta:** celdas combinadas incoherentes, encabezados sin relación con datos, tablas rotas o superpuestas, columnas desplazadas.
- **Rol del ML:** reconstruye jerarquías, detecta estructura latente y asigna _confidence_ estructural.
- **Acciones:**
  | Tipo                   | Ejemplo                          | Acción |
  | ---------------------- | -------------------------------- | ------ |
  | Estructura ambigua     | Doble encabezado sin jerarquía   | ⚠️ Revisión |
  | Tabla incompleta       | Encabezado sin datos             | ❌ Bloquea |
  | Baja confianza estructural | < 70%                        | ❌ Bloquea |
- **Resultado:** el sistema bloquea si no entiende la estructura.

## 3. Nivel 3 – Errores de mapeo (columnas → sistema)
- **Qué se valida:** columnas obligatorias (cliente, dirección, fecha, etc.), tipos de datos correctos, duplicados estructurales y coincidencia con catálogos reales.
- **Acciones:**
  | Tipo              | Ejemplo                 | Acción |
  | ----------------- | ----------------------- | ------ |
  | Columna faltante  | No existe "Dirección"  | ❌ Bloquea |
  | Tipo inválido     | Fecha como texto        | ⚠️ Revisión |
  | Dato fuera de rango | Voltaje negativo      | ❌ Bloquea |
- **Resultado:** el usuario ve qué columna falla y por qué.

## 4. Nivel 4 – Errores de referencia (reglas duras)
- **Qué se valida:** existencia del cliente, asociación correcta de dirección, técnico válido y plantilla permitida por proyecto.
- **Acciones:**
  | Tipo                  | Ejemplo                               | Acción |
  | --------------------- | ------------------------------------- | ------ |
  | Cliente inexistente   | "Empresa X" no registrada            | ❌ Bloquea |
  | Dirección mal asociada| Dirección no pertenece al cliente     | ❌ Bloquea |
  | Técnico no válido     | Email no registrado                   | ⚠️ Revisión |
- **Resultado:** sin referencias válidas, no hay importación.

## 5. Nivel 5 – Errores de plantilla (formularios)
- **Qué controla:** existencia de plantilla compatible, compatibilidad semántica, versionado y campos obligatorios.
- **Escenarios:**
  | Caso                        | Acción |
  | --------------------------- | ------ |
  | Plantilla existente compatible | ✅ Se reutiliza |
  | Plantilla similar           | ⚠️ Revisión |
  | No existe plantilla         | 🧠 Se propone nueva |
  | Plantilla incompatible      | ❌ Bloquea |
- **Regla de oro:** nunca se crea una plantilla sin confirmación humana.

## 6. Nivel 6 – Errores por datos faltantes (ML + reglas)
- **Análisis de faltantes:** distingue MCAR (imputable), MAR (imputable con _warning_) y MNAR (no imputable).
- **Acciones:**
  | Tipo  | Ejemplo                  | Acción |
  | ----- | ------------------------ | ------ |
  | MCAR  | Observación vacía        | ✅ Imputa |
  | MAR   | Teléfono según cliente   | ⚠️ Revisión |
  | MNAR  | Resultado faltante       | ❌ Bloquea |
- **Resultado:** el sistema protege reportes y decisiones.

## 7. Nivel 7 – Errores por fila (row-level)
- **Qué hace:** valida cada fila individualmente.
- **Estados posibles:**
  | Estado  | Significado                 |
  | ------- | --------------------------- |
  | OK      | Lista para crear ticket     |
  | WARNING | Revisión sugerida           |
  | ERROR   | Ticket bloqueado            |
- **Importante:** filas con `ERROR` no se crean; el resto puede avanzar (importación parcial segura).

## 8. Nivel 8 – Preview obligatorio (control humano)
- **Antes de ejecutar:** muestra resumen total, número de tickets OK, _warnings_ y errores, y permite descargar un Excel de errores.
- **Condiciones para ejecutar:** el botón **Ejecutar** solo se habilita si no hay errores críticos y el usuario confirma.

## 9. Nivel 9 – Ejecución controlada (background)
- **Durante la ejecución:** procesamiento por lotes, idempotencia (sin tickets duplicados) y logs por ticket.
- **Fallos en ejecución:**
  | Caso           | Acción        |
  | -------------- | ------------- |
  | Timeout parcial| Reintento     |
  | Error puntual  | Se omite fila |
  | Falla crítica  | Se detiene job |
- **Principio:** nada queda "a medias".

## 10. Nivel 10 – Post-importación (auditoría)
- **Disponibles:** estado final del job, tickets creados y fallidos, archivo de errores y trazabilidad completa.

## Resumen ejecutivo
- El sistema detecta errores en 10 niveles distintos antes de crear un solo ticket.
- Si algo no es seguro, se bloquea.
- El resultado es una importación confiable, auditada y sin impacto negativo en reportes.
- Claves: cero errores silenciosos, control humano real y ML como asistente (no riesgo) con confianza enterprise.
