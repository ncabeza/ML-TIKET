import React from "react";
import { FieldType, ImportMode, PreviewPayload } from "@shared/types";

type RequiredField = {
  id: string;
  label: string;
  required: boolean;
  hint?: string;
  synonyms?: string[];
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();

const REQUIRED_FIELDS: RequiredField[] = [
  {
    id: "cliente",
    label: "Cliente",
    required: true,
    hint: "Campo primario para validar el proyecto.",
    synonyms: [
      "client",
      "cliente final",
      "razon social",
      "empresa",
      "compania",
      "customer",
      "account",
    ],
  },
  {
    id: "direccion",
    label: "Dirección",
    required: true,
    hint: "Necesario para asociar el ticket a la ubicación correcta.",
    synonyms: [
      "address",
      "ubicacion",
      "ubicación",
      "domicilio",
      "calle",
      "dir",
      "localidad",
      "direccion cliente",
    ],
  },
  {
    id: "fecha_visita",
    label: "Fecha de visita",
    required: true,
    hint: "Formato ISO recomendado (AAAA-MM-DD).",
    synonyms: [
      "fecha",
      "visit date",
      "fecha programada",
      "fecha agendada",
      "programacion",
      "fecha cita",
      "schedule date",
    ],
  },
  {
    id: "tecnico",
    label: "Técnico asignado",
    required: false,
    hint: "Ayuda a auto-asignar el ticket si hay coincidencia.",
    synonyms: [
      "tecnico",
      "technician",
      "ingeniero",
      "responsable",
      "operario",
      "asignado",
    ],
  },
];

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string; helper: string }[] = [
  { value: "text", label: "Texto", helper: "Para descripciones, nombres y cadenas." },
  {
    value: "date",
    label: "Fecha",
    helper: "Formato ISO recomendado (AAAA-MM-DD) para evitar ambigüedad.",
  },
  { value: "number", label: "Número", helper: "Cantidades, conteos o importes." },
  { value: "boolean", label: "Booleano", helper: "Valores de sí/no o estados binarios." },
  { value: "address", label: "Dirección", helper: "Ubicaciones físicas o geográficas." },
  { value: "photo", label: "Foto", helper: "Columnas que referencian imágenes o URLs." },
  { value: "select", label: "Selección", helper: "Opciones únicas de catálogo controlado." },
  { value: "multiselect", label: "Selección múltiple", helper: "Listas separadas por coma." },
];

type Step =
  | "upload"
  | "mode"
  | "structure"
  | "mapping"
  | "template"
  | "validation"
  | "run";

export interface ImportCanvasProps {
  preview?: PreviewPayload;
  onUpload(file: File): Promise<void>;
  onSelectMode(mode: "POST_SERVICE" | "MASS_CREATE"): void;
  onConfirmTemplate(): Promise<void>;
  onRun(): Promise<void>;
}

export const ImportCanvas: React.FC<ImportCanvasProps> = ({
  preview,
  onUpload,
  onSelectMode,
  onConfirmTemplate,
  onRun,
}) => {
  const [step, setStep] = React.useState<Step>("upload");
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedMode, setSelectedMode] = React.useState<ImportMode | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [columnMapping, setColumnMapping] = React.useState<Record<string, string | null>>({});
  const [fieldTypeMapping, setFieldTypeMapping] = React.useState<Record<string, FieldType | "">>(
    {},
  );

  const steps: Record<Step, string> = {
    upload: "Upload Excel",
    mode: "Selección tipo de carga",
    structure: "Preview estructural",
    mapping: "Mapeo asistido",
    template: "Resolución de plantilla",
    validation: "Validación final",
    run: "Ejecución en background",
  };

  const requiredFields = React.useMemo(() => REQUIRED_FIELDS, []);

  const fieldKeywords = React.useMemo(() => {
    const keywords: Record<string, string[]> = {};
    requiredFields.forEach((field) => {
      keywords[field.id] = [field.label, ...(field.synonyms ?? [])].map(
        normalizeText,
      );
    });
    return keywords;
  }, [requiredFields]);

  const availableColumns = React.useMemo(() => {
    if (!preview) return [] as string[];
    const detected = preview.artifact.detected_tables.flatMap((table) =>
      table.columns.map((col) => col.name),
    );
    return Array.from(new Set(detected));
  }, [preview]);

  const normalizedColumns = React.useMemo(
    () => availableColumns.map((col) => ({ original: col, normalized: normalizeText(col) })),
    [availableColumns],
  );

  const orderedSteps: Step[] = [
    "upload",
    "mode",
    "structure",
    "mapping",
    "template",
    "validation",
    "run",
  ];

  React.useEffect(() => {
    if (preview && (step === "upload" || step === "mode")) {
      setStep("structure");
    }
  }, [preview, step]);

  React.useEffect(() => {
    if (!preview) return;

    setColumnMapping((current) => {
      const next = { ...current };

      requiredFields.forEach((field) => {
        if (next[field.id]) return;
        const guess = normalizedColumns.find(({ normalized }) =>
          fieldKeywords[field.id].some((keyword) => normalized.includes(keyword)),
        );
        next[field.id] = guess?.original ?? null;
      });

      return next;
    });
  }, [fieldKeywords, normalizedColumns, preview, requiredFields]);

  React.useEffect(() => {
    if (!preview) return;

    setFieldTypeMapping((current) => {
      const next = { ...current };

      requiredFields.forEach((field) => {
        const mappedColumn = columnMapping[field.id];
        if (!mappedColumn || next[field.id]) return;

        const classification = preview.classifications.find(
          (item) => item.column.toLowerCase() === mappedColumn.toLowerCase(),
        );

        if (classification) {
          next[field.id] = classification.type;
        }
      });

      return next;
    });
  }, [columnMapping, preview, requiredFields]);

  const handleUpload: React.ChangeEventHandler<HTMLInputElement> = async (
    event,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    try {
      await onUpload(file);
      setStep("mode");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo archivo");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMode = (mode: ImportMode) => {
    setSelectedMode(mode);
    onSelectMode(mode);
    setStep("structure");
  };

  const handleConfirmTemplate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onConfirmTemplate();
      setStep("validation");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo confirmar la plantilla",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRun = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onRun();
      setStep("run");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ejecutar");
    } finally {
      setIsLoading(false);
    }
  };

  const goToStep = (target: Step) => {
    if (orderedSteps.includes(target)) {
      setStep(target);
    }
  };

  const missingRequired = requiredFields.filter(
    (field) => field.required && !columnMapping[field.id],
  );

  const requiredTypeGaps = requiredFields.filter(
    (field) => field.required && columnMapping[field.id] && !fieldTypeMapping[field.id],
  );

  const canProceedToTemplate =
    missingRequired.length === 0 && requiredTypeGaps.length === 0;

  const handleMappingChange = (fieldId: string, value: string) => {
    setColumnMapping((current) => ({
      ...current,
      [fieldId]: value === "__no_match__" ? null : value,
    }));
  };

  const handleFieldTypeChange = (fieldId: string, value: FieldType | "") => {
    setFieldTypeMapping((current) => ({
      ...current,
      [fieldId]: value,
    }));
  };

  return (
    <div className="import-canvas">
      <ol>
        {Object.entries(steps).map(([key, label]) => (
          <li
            key={key}
            className={step === key ? "active" : ""}
            onClick={() => goToStep(key as Step)}
          >
            {label}
          </li>
        ))}
      </ol>

      <section>
        {step === "upload" && (
          <div>
            <label>
              Subir Excel
              <input type="file" accept=".xlsx,.xls" onChange={handleUpload} />
            </label>
            {isLoading && <p>Cargando archivo...</p>}
          </div>
        )}

        {step === "mode" && (
          <div>
            <p>Selecciona el tipo de carga:</p>
            <div className="mode-buttons">
              <button
                type="button"
                className={selectedMode === "POST_SERVICE" ? "active" : ""}
                onClick={() => handleSelectMode("POST_SERVICE")}
              >
                Post Service
              </button>
              <button
                type="button"
                className={selectedMode === "MASS_CREATE" ? "active" : ""}
                onClick={() => handleSelectMode("MASS_CREATE")}
              >
                Carga Masiva
              </button>
            </div>
          </div>
        )}

        {step === "structure" && preview && (
          <div>
            <p>Revisa la estructura detectada y continúa al mapeo asistido.</p>
            <button type="button" onClick={() => setStep("mapping")}>Ir a mapeo</button>
          </div>
        )}

        {step === "mapping" && (
          <div className="mapping-grid">
            <div>
              <h3>Campos obligatorios sin match</h3>
              <p>
                Detectamos {missingRequired.length} campo(s) sin coincidencia directa en tu Excel.
                Alinea cada campo con una columna o marca que requiere tratamiento manual.
              </p>
              <ul>
                {missingRequired.map((field) => (
                  <li key={field.id} className="missing-pill">
                    {field.label} — {field.hint}
                  </li>
                ))}
              </ul>
              {missingRequired.length === 0 && (
                <p className="success">Todos los campos críticos tienen un candidato de mapeo.</p>
              )}
            </div>

            <div>
              <h4>Mapeo asistido</h4>
              <div className="mapping-table">
                {requiredFields.map((field) => (
                  <div key={field.id} className="mapping-row">
                    <div>
                      <strong>{field.label}</strong>
                      <p className="hint">{field.hint}</p>
                    </div>
                    <div className="mapping-controls">
                      <select
                        value={columnMapping[field.id] ?? ""}
                        onChange={(event) => handleMappingChange(field.id, event.target.value)}
                      >
                        <option value="">Selecciona columna</option>
                        {availableColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                        <option value="__no_match__">No existe en el Excel</option>
                      </select>

                      <select
                        value={fieldTypeMapping[field.id] ?? ""}
                        onChange={(event) =>
                          handleFieldTypeChange(field.id, event.target.value as FieldType | "")
                        }
                      >
                        <option value="">Tipo de campo</option>
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <small className="hint subtle">
                      {FIELD_TYPE_OPTIONS.find((option) => option.value === fieldTypeMapping[field.id])
                        ?.helper || "Elige el tipo para validar formato y transformaciones."}
                    </small>
                  </div>
                ))}
              </div>
              <div className="mapping-actions">
                <p>
                  Si decides continuar con campos sin match, el sistema bloqueará la ejecución
                  hasta resolverlos o habilitar imputación manual.
                </p>
                {requiredTypeGaps.length > 0 && (
                  <p className="warning">
                    Define el tipo de dato para cada campo obligatorio antes de continuar.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setStep("template")}
                  disabled={!canProceedToTemplate}
                >
                  Continuar a plantilla
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "template" && (
          <div>
            <p>
              Confirma la plantilla antes de enviar a validación final. Esta acción
              persiste la decisión del técnico.
            </p>
            <button type="button" onClick={handleConfirmTemplate} disabled={isLoading}>
              Confirmar plantilla
            </button>
          </div>
        )}

        {step === "validation" && (
          <div>
            <p>Todo listo. Ejecuta la importación en background.</p>
            <button type="button" onClick={handleRun} disabled={isLoading}>
              Ejecutar importación
            </button>
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      {preview && (
        <section>
          <h3>Estructura detectada</h3>
          <pre>{JSON.stringify(preview.artifact.struct_tree, null, 2)}</pre>
          <h4>Sugerencias de plantilla</h4>
          <p>{preview.templateSuggestion.technicianSummary}</p>
          {preview.templateSuggestion.strongMatch ? (
            <p>
              Coincidencia principal: {preview.templateSuggestion.strongMatch.template_id}
              {" "}(v{preview.templateSuggestion.strongMatch.template_version_id}) con
              {" "}
              {(preview.templateSuggestion.strongMatch.score * 100).toFixed(0)}% de similitud.
            </p>
          ) : (
            <p>Sin coincidencia fuerte: se sugiere evaluar una nueva plantilla.</p>
          )}
          {preview.templateSuggestion.nextSteps?.length ? (
            <div>
              <strong>Próximos pasos sugeridos para el técnico:</strong>
              <ul>
                {preview.templateSuggestion.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details>
            <summary>Ver detalle crudo</summary>
            <pre>{JSON.stringify(preview.templateSuggestion, null, 2)}</pre>
          </details>
          <h4>Tipos de campo</h4>
          <pre>{JSON.stringify(preview.classifications, null, 2)}</pre>
          <h4>Perfil de faltantes</h4>
          <pre>{JSON.stringify(preview.missingness, null, 2)}</pre>
          <h4>Asignación de técnicos por documento</h4>
          <pre>{JSON.stringify(preview.technicianAssignment, null, 2)}</pre>
        </section>
      )}
    </div>
  );
};
