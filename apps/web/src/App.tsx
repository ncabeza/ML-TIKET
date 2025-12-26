import React from "react";
import { ImportCanvas } from "./ImportCanvas";
import { mockPreview } from "./mockPreview";
import type { ImportMode, PreviewPayload } from "@shared/types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const App: React.FC = () => {
  const [preview, setPreview] = React.useState<PreviewPayload | undefined>();
  const [selectedMode, setSelectedMode] = React.useState<ImportMode | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3800);
  };

  const handleUpload = async (file: File) => {
    showToast(`Archivo recibido: ${file.name}. Cargando preview de ejemplo...`);
    await wait(300);

    setPreview({
      ...mockPreview,
      job: {
        ...mockPreview.job,
        upload: {
          ...mockPreview.job.upload,
          filename: file.name,
          size: file.size,
          mimeType: file.type || mockPreview.job.upload.mimeType,
        },
      },
    });
  };

  const handleSelectMode = (mode: ImportMode) => {
    setSelectedMode(mode);
    showToast(
      mode === "POST_SERVICE"
        ? "Modo post servicio: ideal para incidencias con POS conocido"
        : "Modo alta masiva: pensado para plantillas con miles de filas",
    );
  };

  const handleConfirmTemplate = async () => {
    await wait(200);
    showToast("Plantilla confirmada, pasa a la validación final.");
  };

  const handleRun = async () => {
    await wait(200);
    showToast("Importación lanzada en background (simulación).");
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>Import Playground</h1>
        <p>
          Sube un Excel o usa el preview de ejemplo para probar el flujo del canvas sin
          depender de servicios externos.
        </p>
        <p className="helper">
          El mapeo asistido usa el objeto <code>PreviewPayload</code> y replica los pasos que
          sigue el orquestador real.
        </p>
      </header>

      <div className="panel">
        <h2>Acciones rápidas</h2>
        <div className="actions">
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            📂 Subir Excel propio
          </label>
          <button type="button" className="secondary" onClick={() => setPreview(mockPreview)}>
            🎯 Usar preview de ejemplo
          </button>
          <button type="button" className="secondary" onClick={() => setPreview(undefined)}>
            ♻️ Reiniciar flujo
          </button>
        </div>
        <p className="helper">
          Si tienes el API levantada, conecta los handlers de <code>ImportCanvas</code> para
          llamar a tus endpoints reales. Aquí devolvemos datos de ejemplo para que puedas
          iterar el diseño rápido.
        </p>
        {toast && <p className="toast">{toast}</p>}
      </div>

      <div className="panel">
        <ImportCanvas
          preview={preview}
          onUpload={handleUpload}
          onSelectMode={handleSelectMode}
          onConfirmTemplate={handleConfirmTemplate}
          onRun={handleRun}
        />
      </div>

      {preview && (
        <div className="panel">
          <h2>Estado actual</h2>
          <ul>
            <li>
              Modo seleccionado: <strong>{selectedMode ?? "no definido"}</strong>
            </li>
            <li>Archivo: {preview.job.upload.filename}</li>
            <li>
              Filas detectadas: {preview.job.stats?.detected_rows ?? 0} | Columnas: {" "}
              {preview.artifact.detected_tables[0]?.columns.length ?? 0}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
