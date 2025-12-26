import { PreviewPayload } from "@shared/types";

export const mockPreview: PreviewPayload = {
  job: {
    _id: "job-demo",
    project_id: "avant",
    created_by: "demo-user",
    mode: "POST_SERVICE",
    status: "PREVIEW_READY",
    upload: {
      filename: "demo.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 42_000,
      storageKey: "demo/demo.xlsx",
    },
    structural_artifact_id: "art-001",
    column_mapping: {},
    template_resolution: undefined,
    ml_insights: undefined,
    stats: {
      detected_rows: 42,
      detected_tables: 1,
      columns: 5,
      estimated_tickets: 40,
    },
    errors_ref: undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  artifact: {
    _id: "art-001",
    job_id: "job-demo",
    struct_tree: [
      {
        id: "sheet-1",
        label: "Incidencias",
        depth: 0,
        range: { start: "A1", end: "E30" },
        children: [
          {
            id: "header-row",
            label: "Encabezado",
            depth: 1,
            range: { start: "A1", end: "E1" },
          },
          {
            id: "data-body",
            label: "Datos",
            depth: 1,
            range: { start: "A2", end: "E30" },
          },
        ],
      },
    ],
    detected_tables: [
      {
        id: "table-1",
        headerRange: { start: "A1", end: "E1" },
        dataRange: { start: "A2", end: "E30" },
        columns: [
          { name: "Cliente", range: { start: "A1", end: "A30" } },
          { name: "Dirección", range: { start: "B1", end: "B30" } },
          { name: "Fecha Visita", range: { start: "C1", end: "C30" } },
          { name: "Tecnico", range: { start: "D1", end: "D30" } },
          { name: "POS", range: { start: "E1", end: "E30" } },
        ],
      },
    ],
    anchors: [{ label: "titulo-hoja", cell: "A1" }],
    formula_index: [],
    format_groups: [],
    compressed_representation: {
      anchorHash: "hash-demo",
      formulaFingerprint: "fingerprint-1",
      formatClusters: {},
    },
  },
  classifications: [
    { column: "Cliente", type: "text", confidence: 0.92, evidence: ["nombre cliente"] },
    { column: "Dirección", type: "address", confidence: 0.88, evidence: ["calle"] },
    { column: "Fecha Visita", type: "date", confidence: 0.9, evidence: ["AAAA-MM-DD"] },
    { column: "Tecnico", type: "text", confidence: 0.66, evidence: ["operario"] },
    { column: "POS", type: "number", confidence: 0.72, evidence: ["sucursal"] },
  ],
  templateSuggestion: {
    strongMatch: {
      template_id: "ticket-maintenance",
      template_version_id: "v2",
      score: 0.82,
    },
    suggestions: [
      { template_id: "ticket-maintenance", template_version_id: "v2", score: 0.82 },
      { template_id: "ticket-general", template_version_id: "v1", score: 0.68 },
    ],
    proposeNewTemplate: false,
    rationale: "Coincidencia alta con incidencias de mantenimiento de POS.",
    repeatUploadHint: {
      fingerprint: "demo-123",
      confirmedDateColumns: ["Fecha Visita"],
      requiredPrompts: [],
      templateExistsOnPlatform: true,
      note: "Si los datos vienen del mismo proveedor, puedes reutilizar la plantilla.",
    },
    technicianSummary: "Plantilla recomendada por similitud en columnas y notas previas.",
    nextSteps: ["Confirma la plantilla", "Valida columnas obligatorias"],
  },
  missingness: {
    profile: {
      signal: "MAR",
      confidence: 0.77,
      imputation_permitted: true,
      blockers: [],
    },
    notes: ["Datos completos en el 95% de filas."],
  },
  technicianAssignment: {
    identityField: "Tecnico",
    matches: [
      {
        document: "Incidencias",
        technician_id: "tech-123",
        technician_name: "Ana Chávez",
        confidence: 0.76,
        rationale: "Historial similar en zona norte.",
      },
    ],
    policy: "AUTO_ASSIGN",
    notes: ["Revisar coincidencia baja de POS"],
  },
  posDetection: {
    column: "POS",
    confidence: 0.84,
    sample_values: ["1234", "5678"],
    normalized_samples: ["POS-1234", "POS-5678"],
    missing_required: false,
    warnings: [],
  },
  geolocation: {
    address_column: "Dirección",
    latitude_column: undefined,
    longitude_column: undefined,
    confidence: 0.8,
    ok: true,
    issues: ["Se sugiere validar coordenadas en caso de incidencias."],
  },
  ticketTitleHint: {
    template: "Visita POS {{POS}} - {{Cliente}}",
    rationale: "Título basado en historial de cargas similares.",
  },
};
