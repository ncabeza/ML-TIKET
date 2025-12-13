import React from "react";
import { PreviewPayload } from "@shared/types";

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

export const ImportCanvas: React.FC<ImportCanvasProps> = ({ preview }) => {
  const [step, setStep] = React.useState<Step>("upload");

  const steps: Record<Step, string> = {
    upload: "Upload Excel",
    mode: "Selección tipo de carga",
    structure: "Preview estructural",
    mapping: "Mapeo asistido",
    template: "Resolución de plantilla",
    validation: "Validación final",
    run: "Ejecución en background",
  };

  return (
    <div className="import-canvas">
      <ol>
        {Object.entries(steps).map(([key, label]) => (
          <li key={key} className={step === key ? "active" : ""}>
            {label}
          </li>
        ))}
      </ol>

      {preview && (
        <section>
          <h3>Estructura detectada</h3>
          <pre>{JSON.stringify(preview.artifact.struct_tree, null, 2)}</pre>
          <h4>Sugerencias de plantilla</h4>
          <pre>{JSON.stringify(preview.templateSuggestion, null, 2)}</pre>
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
