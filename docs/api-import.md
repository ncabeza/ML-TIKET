# API de importación de tickets

Este documento resume los endpoints principales expuestos por `apps/api` para orquestar el flujo de importación. Todos los ejemplos usan JSON y devuelven códigos consistentes: `400` para validaciones, `404` para recursos inexistentes y `500` para errores internos.

## Crear un job de importación
`POST /api/import/jobs`

```json
{
  "project_id": "project-1",
  "created_by": "user-1",
  "mode": "POST_SERVICE",
  "upload": {
    "filename": "ejemplo.xlsx",
    "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "size": 1024,
    "storageKey": "uploads/tmp/ejemplo.xlsx"
  }
}
```

**Respuesta 201**

```json
{
  "_id": "job-uuid",
  "status": "PENDING",
  "project_id": "project-1",
  "created_by": "user-1",
  "mode": "POST_SERVICE",
  "upload": { "filename": "ejemplo.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "size": 1024, "storageKey": "uploads/tmp/ejemplo.xlsx" },
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

## Solicitar preview (solo lectura)
`POST /api/import/jobs/:id/preview`

- Llama a `orchestratePreview` y retorna el payload con sugerencias/artefactos.
- `404` si el job no existe.

```json
{
  "job": { "_id": "job-uuid", "status": "PREVIEW_READY", "project_id": "project-1", "created_by": "user-1", "mode": "POST_SERVICE", "upload": { "filename": "ejemplo.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "size": 1024, "storageKey": "uploads/tmp/ejemplo.xlsx" }, "created_at": "2024-01-01T00:00:00.000Z", "updated_at": "2024-01-01T00:00:00.000Z" },
  "artifact": { "_id": "art-1", "job_id": "job-uuid", "struct_tree": [], "detected_tables": [], "anchors": [], "formula_index": [], "format_groups": [], "compressed_representation": { "anchorHash": "", "formulaFingerprint": "", "formatClusters": {} } },
  "classifications": [],
  "templateSuggestion": { "suggestions": [], "proposeNewTemplate": false, "rationale": "coincidencia directa", "technicianSummary": "sin cambios" },
  "missingness": { "profile": { "signal": "MCAR", "confidence": 0.9, "imputation_permitted": true }, "notes": [] },
  "technicianAssignment": { "matches": [], "policy": "REVIEW", "notes": [] }
}
```

## Confirmar plantilla/version
`POST /api/import/jobs/:id/confirm-template`

```json
{
  "strongMatch": { "template_id": "tpl-1", "template_version_id": "v1", "score": 0.94 },
  "suggestions": [],
  "proposeNewTemplate": false,
  "rationale": "Coincide con plantilla existente",
  "technicianSummary": "Asignar al técnico A",
  "nextSteps": ["Revisar columnas calculadas"]
}
```

- Devuelve la decisión registrada.
- El payload debe ser coherente: no se acepta `proposeNewTemplate=true` junto con `strongMatch`.

## Ejecutar importación
`POST /api/import/jobs/:id/run`

- Llama a `orchestrateRun` y retorna el resultado (ej. `queued`, resumen de tickets, etc.).
- Requiere que el job exista (`404` de lo contrario).

## Consultar un job
`GET /api/import/jobs/:id`

- Devuelve el estado actual del job o `404` si no existe.

## Errores de validación
Ejemplo de respuesta `400` por payload inválido:

```json
{
  "error": "Invalid payload",
  "details": [
    { "code": "invalid_type", "path": ["upload", "filename"], "message": "Required" }
  ]
}
```

Estos ejemplos están alineados con las rutas registradas en `apps/api/src/server.ts` y se cubren en las pruebas e2e con Supertest.
