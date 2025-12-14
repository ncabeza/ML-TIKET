# API de importación

Este documento resume los puntos de entrada expuestos por el API de importación y cómo interactúan con el flujo de validación descrito en `validation-flow-es.md`.

## Prefijo base

Todas las rutas se exponen bajo `/api/import`.

## Crear un job

`POST /api/import/jobs`

```json
{
  "project_id": "proy-123",
  "created_by": "usuario@acme.com",
  "mode": "POST_SERVICE",
  "upload": {
    "filename": "tickets.xlsx",
    "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "size": 2048,
    "storageKey": "uploads/tickets.xlsx"
  }
}
```

- Respuesta: `201 Created` con el job almacenado en memoria.
- Errores: `400` si falta algún campo requerido.

## Preview del job

`POST /api/import/jobs/:id/preview`

- Ejecuta la orquestación de preview (detección de estructura, clasificación de columnas y sugerencias de plantilla).
- Respuesta: `200 OK` con `artifact`, `classifications`, `missingness`, `templateSuggestion` y `technicianAssignment`.
- Errores: `404` si el `id` no existe, `500` ante fallas inesperadas.

## Confirmar plantilla

`POST /api/import/jobs/:id/confirm-template`

```json
{
  "strongMatch": {
    "template_id": "tmpl-001",
    "template_version_id": "v1",
    "score": 0.92
  },
  "suggestions": [],
  "proposeNewTemplate": false,
  "rationale": "Coincidencia directa con la plantilla de post-servicio",
  "technicianSummary": "Se asignará automáticamente según políticas vigentes"
}
```

- Respuesta: `200 OK` con la decisión almacenada y el job pasando a `READY_TO_RUN`.
- Errores: `400` si el payload es inválido o ambiguo; `404` si el job no existe.

## Ejecutar importación

`POST /api/import/jobs/:id/run`

- Requiere que la plantilla haya sido confirmada.
- Respuesta: `200 OK` con el resultado de la ejecución del worker. El estado del job avanza a `RUNNING` y luego a `COMPLETED` o `FAILED` según los resultados de validación dura.
- Errores: `404` si el job no existe, `500` para fallos inesperados.

## Consultar estado del job

`GET /api/import/jobs/:id`

- Respuesta: `200 OK` con el job en su estado actual.
- Errores: `404` si el job no existe.

## Notas de validación

- Se valida la estructura de los payloads con `zod` y se devuelven mensajes de detalle cuando faltan campos.
- Los códigos de error se limitan a `400` (payloads inválidos), `404` (recursos inexistentes) y `500` (errores inesperados) para mantener consistencia.
