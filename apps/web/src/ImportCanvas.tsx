import React from "react";
import { ImportMode, PreviewPayload } from "@shared/types";

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

  const steps: Record<Step, string> = {
    upload: "Upload Excel",
    mode: "Selección tipo de carga",
    structure: "Preview estructural",
    mapping: "Mapeo asistido",
    template: "Resolución de plantilla",
    validation: "Validación final",
    run: "Ejecución en background",
  };

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
